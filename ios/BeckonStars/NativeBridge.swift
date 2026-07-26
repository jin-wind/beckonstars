import UIKit
import WebKit
import UserNotifications
import CoreHaptics
import Photos

// MARK: - 共用工具

/// 把 Swift 值安全編碼成可嵌入 evaluateJavaScript 的 JS 字面量（防注入）。
enum JSEncoding {

    /// 將字串編碼為 JS 字串字面量（含引號），採 JSON 相容轉義，
    /// 並額外處理 U+2028/U+2029（合法 JSON 但會截斷 JS 字面量）。
    static func stringLiteral(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]),
              let arrayLiteral = String(data: data, encoding: .utf8),
              arrayLiteral.count >= 2 else {
            return "\"\""
        }
        // JSONSerialization 回傳 ["..."]；去掉陣列括號即得到安全的 JS 字串字面量。
        // 額外 escape 兩個 Unicode 行分隔字元，避免舊版 JavaScript parser 把它們視為原始換行。
        return String(arrayLiteral.dropFirst().dropLast())
            .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
            .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
    }

    /// 先把物件序列化成 JSON 字串，再包成 JS 字串字面量。
    /// 對應 Android 的「payload 是需要 JSON.parse 的單一字串參數」契約（BRIDGE.md §2.8/§2.9）。
    static func jsonPayloadLiteral(_ object: [String: Any]) -> String? {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8) else {
            return nil
        }
        return stringLiteral(json)
    }
}

/// UNAuthorizationStatus → web 端使用的 'granted' | 'denied' | 'default'。
enum BridgeNotificationPermission {
    static func string(for status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral:
            return "granted"
        case .denied:
            return "denied"
        default:
            return "default"
        }
    }
}

/// 圖片下載只允許跟隨一次 HTTP redirect（對齊 Android readImageBytes 契約）。
private final class SingleRedirectSessionDelegate: NSObject, URLSessionTaskDelegate {
    private var hasFollowedRedirect = false

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        guard !hasFollowedRedirect else {
            completionHandler(nil)
            return
        }
        hasFollowedRedirect = true
        var redirectedRequest = request
        redirectedRequest.setValue("BeckonStars/1.0", forHTTPHeaderField: "User-Agent")
        completionHandler(redirectedRequest)
    }
}

// MARK: - NativeBridge

/// `window.webkit.messageHandlers.beckonStars.postMessage({ method, args })` 的原生端。
///
/// 收到 `{method, args}` 後 switch 分派；所有原生 → JS 回呼沿用歷史函數名
/// （handleAndroidVoiceRecording 等），契約見 ios/BRIDGE.md §12。
final class NativeBridge: NSObject, WKScriptMessageHandler {

    weak var webView: WKWebView?
    weak var hostViewController: UIViewController?

    private let voiceRecorder = VoiceRecorder()
    private var hapticEngine: CHHapticEngine?

    /// setMediaApiConfig 儲存值（目前 web JS 不會呼叫，為未來預留；BRIDGE.md §2.10）。
    private var mediaApiBase = ""
    private var mediaAuthToken = ""

    override init() {
        super.init()
        voiceRecorder.evaluateJavaScript = { [weak self] script in
            self?.evaluateJS(script)
        }
    }

    /// 在主執行緒上執行 JS。所有回呼都必須經過這裡。
    func evaluateJS(_ script: String) {
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    // MARK: WKScriptMessageHandler

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "beckonStars",
              message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any],
              let method = body["method"] as? String else {
            return
        }
        let args = body["args"] as? [Any] ?? []
        dispatch(method: method, args: args)
    }

    private func dispatch(method: String, args: [Any]) {
        switch method {
        case "getVersionCode":
            // 同步值由 document-start 注入的 window.__BeckonStarsIOS 快照提供，這裡毋須動作。
            break
        case "getNotificationPermission":
            refreshNotificationPermissionSnapshot()
        case "requestNotificationPermission":
            requestNotificationPermission()
        case "showLocalNotification":
            showLocalNotification(title: stringArg(args, 0), body: stringArg(args, 1))
        case "playRewardHaptic":
            playRewardHaptic()
        case "startVoiceRecording":
            voiceRecorder.startVoiceRecording()
        case "finishVoiceRecording":
            voiceRecorder.finishVoiceRecording(cancelled: boolArg(args, 0))
        case "transcribeReceivedVoice":
            voiceRecorder.transcribeReceivedVoice(
                messageId: stringArg(args, 0),
                audioDataUrl: stringArg(args, 1)
            )
        case "saveImageToGallery":
            saveImageToGallery(imageUrl: stringArg(args, 0))
        case "shareAIImage":
            shareAIImage(imageUrl: stringArg(args, 0))
        case "setMediaApiConfig":
            mediaApiBase = stringArg(args, 0)
            mediaAuthToken = stringArg(args, 1)
        default:
            NSLog("[BeckonStars] 未支援的橋接方法：%@", method)
        }
    }

    private func stringArg(_ args: [Any], _ index: Int) -> String {
        guard index < args.count else { return "" }
        return args[index] as? String ?? ""
    }

    private func boolArg(_ args: [Any], _ index: Int) -> Bool {
        guard index < args.count else { return false }
        if let value = args[index] as? Bool { return value }
        if let number = args[index] as? NSNumber { return number.boolValue }
        return false
    }

    // MARK: - 通知（BRIDGE.md §2.1–§2.3, §4）

    /// 重新查詢授權狀態並更新 JS 快照（供 getNotificationPermission 的後續同步讀值）。
    private func refreshNotificationPermissionSnapshot() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            let literal = JSEncoding.stringLiteral(
                BridgeNotificationPermission.string(for: settings.authorizationStatus)
            )
            self?.evaluateJS(
                "if (window.__BeckonStarsIOS) { window.__BeckonStarsIOS.notificationPermission = \(literal); }"
            )
        }
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { [weak self] granted, _ in
            let literal = JSEncoding.stringLiteral(granted ? "granted" : "denied")
            // 更新快照 + 呼叫既有回呼（函數名沿用 Android 時代，契約如此）。
            self?.evaluateJS(
                "if (window.__BeckonStarsIOS) { window.__BeckonStarsIOS.notificationPermission = \(literal); } "
                + "window.setAndroidNotificationPermission && window.setAndroidNotificationPermission(\(literal));"
            )
        }
    }

    private func showLocalNotification(title: String, body: String) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                // 每次都用新 UUID id + 極短觸發：通知彼此堆疊、不互相取代
                //（對齊 Android 以 System.currentTimeMillis() 當通知 id 的行為）。
                let request = UNNotificationRequest(
                    identifier: UUID().uuidString,
                    content: content,
                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
                )
                center.add(request, withCompletionHandler: nil)
            default:
                break // 未授權時安靜略過，對齊 Android hasNotificationPermission() 的閘門
            }
        }
    }

    // MARK: - 觸覺回饋（BRIDGE.md §2.4）

    /// 兩擊式獎勵觸覺：t=0 強度 0.43、t=0.08s 強度 0.71
    /// （對齊 Android VibrationEffect 波形 amplitudes 110/255、180/255）。
    private func playRewardHaptic() {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if CHHapticEngine.capabilitiesForHardware().supportsHaptics, self.playCoreHapticsReward() {
                return
            }
            self.playFallbackReward()
        }
    }

    private func playCoreHapticsReward() -> Bool {
        do {
            let engine: CHHapticEngine
            if let existing = hapticEngine {
                engine = existing
            } else {
                engine = try CHHapticEngine()
                engine.resetHandler = { [weak self] in
                    self?.hapticEngine = nil
                }
                hapticEngine = engine
            }
            try engine.start()

            let events = [
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.43),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5),
                    ],
                    relativeTime: 0
                ),
                CHHapticEvent(
                    eventType: .hapticTransient,
                    parameters: [
                        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.71),
                        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.6),
                    ],
                    relativeTime: 0.08
                ),
            ]
            let pattern = try CHHapticPattern(events: events, parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
            return true
        } catch {
            hapticEngine = nil
            return false
        }
    }

    /// Core Haptics 不可用時的退路：light →（80ms 後）medium 兩擊。
    private func playFallbackReward() {
        let light = UIImpactFeedbackGenerator(style: .light)
        light.prepare()
        light.impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }

    // MARK: - 圖片保存（BRIDGE.md §2.12）

    private func saveImageToGallery(imageUrl: String) {
        let trimmed = imageUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            postImageSaveResult(success: false, message: "圖片地址無效，不能保存。")
            return
        }
        fetchImageData(from: trimmed) { [weak self] data in
            guard let self = self else { return }
            guard let data = data, !data.isEmpty else {
                self.postImageSaveResult(success: false, message: "圖片保存失敗，請稍後再試。")
                return
            }
            self.writeImageToPhotoLibrary(data)
        }
    }

    /// 取得圖片位元組：data URL 直接解碼；http(s) 下載
    /// （User-Agent: BeckonStars/1.0、自動跟隨 redirect、30s/60s timeout，對齊 Android readImageBytes）。
    private func fetchImageData(from imageUrl: String, completion: @escaping (Data?) -> Void) {
        if imageUrl.hasPrefix("data:") {
            DispatchQueue.global(qos: .userInitiated).async {
                completion(Self.decodeDataUrl(imageUrl)?.data)
            }
            return
        }
        guard let url = URL(string: imageUrl),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            completion(nil)
            return
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 60
        let session = URLSession(
            configuration: configuration,
            delegate: SingleRedirectSessionDelegate(),
            delegateQueue: nil
        )

        var request = URLRequest(url: url)
        request.setValue("BeckonStars/1.0", forHTTPHeaderField: "User-Agent")

        let task = session.dataTask(with: request) { data, response, error in
            defer { session.finishTasksAndInvalidate() }
            guard error == nil,
                  let http = response as? HTTPURLResponse,
                  (200...299).contains(http.statusCode),
                  let data = data, !data.isEmpty else {
                completion(nil)
                return
            }
            completion(data)
        }
        task.resume()
    }

    /// 解析 `data:<mime>;base64,<payload>` data URL。
    static func decodeDataUrl(_ dataUrl: String) -> (data: Data, mime: String)? {
        guard dataUrl.hasPrefix("data:"),
              let commaIndex = dataUrl.firstIndex(of: ",") else {
            return nil
        }
        let headerStart = dataUrl.index(dataUrl.startIndex, offsetBy: 5)
        let header = String(dataUrl[headerStart..<commaIndex]) // 例如 "image/png;base64"
        let payload = String(dataUrl[dataUrl.index(after: commaIndex)...])
        guard let data = Data(base64Encoded: payload, options: [.ignoreUnknownCharacters]) else {
            return nil
        }
        let mime = header.split(separator: ";").first.map(String.init) ?? ""
        return (data, mime.isEmpty ? "application/octet-stream" : mime)
    }

    static func imageExtension(forMime mime: String) -> String {
        switch mime.lowercased() {
        case "image/png":
            return "png"
        case "image/webp":
            return "webp"
        default:
            return "jpg"
        }
    }

    private func writeImageToPhotoLibrary(_ data: Data) {
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { [weak self] status in
            guard let self = self else { return }
            guard status == .authorized || status == .limited else {
                self.postImageSaveResult(success: false, message: "圖片保存失敗，請稍後再試。")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                request.addResource(with: .photo, data: data, options: nil)
            }, completionHandler: { success, _ in
                if success {
                    self.postImageSaveResult(success: true, message: "✅ 圖片已保存到手機相簿。")
                } else {
                    self.postImageSaveResult(success: false, message: "圖片保存失敗，請稍後再試。")
                }
            })
        }
    }

    /// 回呼契約：第一個參數是裸布林字面量，第二個是 JSON 編碼字串（BRIDGE.md §2.12）。
    private func postImageSaveResult(success: Bool, message: String) {
        let booleanLiteral = success ? "true" : "false"
        evaluateJS(
            "window.handleAndroidImageSaveResult && window.handleAndroidImageSaveResult(\(booleanLiteral), \(JSEncoding.stringLiteral(message)));"
        )
    }

    // MARK: - 圖片分享（BRIDGE.md §2.13）

    private func shareAIImage(imageUrl: String) {
        let trimmed = imageUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            postImageSaveResult(success: false, message: "分享失敗，請先保存圖片後再分享。")
            return
        }
        // 遠端 URL：分享連結字串（對齊 Android 的 ACTION_SEND text/plain 行為）。
        if trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://") {
            presentShareSheet(items: [trimmed])
            return
        }
        // data URL / 本地引用：解碼到暫存檔後分享圖檔本身。
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            guard let decoded = Self.decodeDataUrl(trimmed) else {
                self.postImageSaveResult(success: false, message: "分享失敗，請先保存圖片後再分享。")
                return
            }
            let fileURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("beckon-stars-share-\(UUID().uuidString)")
                .appendingPathExtension(Self.imageExtension(forMime: decoded.mime))
            do {
                try decoded.data.write(to: fileURL)
            } catch {
                self.postImageSaveResult(success: false, message: "分享失敗，請先保存圖片後再分享。")
                return
            }
            self.presentShareSheet(items: [fileURL])
        }
    }

    private func presentShareSheet(items: [Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self,
                  let presenter = self.hostViewController,
                  presenter.presentedViewController == nil else {
                self?.postImageSaveResult(success: false, message: "分享失敗，請先保存圖片後再分享。")
                return
            }
            let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
            let temporaryURLs = items.compactMap { $0 as? URL }.filter { $0.isFileURL }
            controller.completionWithItemsHandler = { _, _, _, _ in
                temporaryURLs.forEach { try? FileManager.default.removeItem(at: $0) }
            }
            // iPad / popover 錨點（iPhone 上為 sheet，設定無害）。
            if let popover = controller.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(
                    x: presenter.view.bounds.midX,
                    y: presenter.view.bounds.midY,
                    width: 1,
                    height: 1
                )
                popover.permittedArrowDirections = []
            }
            presenter.present(controller, animated: true)
            // 成功路徑不回呼 — 對齊 Android：交給系統分享面板後原生端即不再追蹤（§2.13）。
        }
    }
}
