import UIKit
import WebKit
import UserNotifications

/// 全螢幕 WKWebView 殼層：載入 bundle 內 `web/index.html`（folder reference），
/// 注入 `window.__BeckonStarsIOS` 快照，並掛上 `beckonStars` message handler。
///
/// 對應規格：ios/BRIDGE.md §1（WebView 設定對照表）。
final class WebViewController: UIViewController, WKNavigationDelegate {

    /// 與 web 核心 `#FFF9F2` 一致的背景色，first paint 前先鋪底避免白閃。
    static let appBackgroundColor = UIColor(
        red: 255.0 / 255.0,
        green: 249.0 / 255.0,
        blue: 242.0 / 255.0,
        alpha: 1.0
    )

    /// v1 支援的橋接方法（platform.js 以 `Platform.supports()` 讀取此清單）。
    ///
    /// 刻意不含 `startGoogleSignIn` / `clearGoogleCredentialState` /
    /// `downloadAndInstallUpdate` — v1 不支援，web 端會優雅降級（見 ios/README.md）。
    static let supportedBridgeMethods: [String] = [
        "getVersionCode",
        "getNotificationPermission",
        "requestNotificationPermission",
        "showLocalNotification",
        "playRewardHaptic",
        "startVoiceRecording",
        "finishVoiceRecording",
        "transcribeReceivedVoice",
        "saveImageToGallery",
        "shareAIImage",
    ]

    private let bridge = NativeBridge()
    private var webView: WKWebView?

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        overrideUserInterfaceStyle = .light
        view.backgroundColor = Self.appBackgroundColor
        bridge.hostViewController = self

        // 先非同步查詢通知授權狀態，再建 WebView，讓 document-start 快照
        // 一開始就帶著真實的 notificationPermission（BRIDGE.md §2.1）。
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            let permission = BridgeNotificationPermission.string(for: settings.authorizationStatus)
            DispatchQueue.main.async {
                self?.setUpWebView(initialNotificationPermission: permission)
            }
        }
    }

    // MARK: - WebView setup

    private var versionCode: Int {
        let raw = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
        return Int(raw ?? "") ?? 0
    }

    /// 產生 document-start 注入腳本：`window.__BeckonStarsIOS = {...}`。
    /// platform.js 依賴這份快照做同步讀值（versionCode / notificationPermission / supports）。
    private func snapshotScriptSource(notificationPermission: String) -> String {
        let snapshot: [String: Any] = [
            "versionCode": versionCode,
            "notificationPermission": notificationPermission,
            "supports": Self.supportedBridgeMethods,
        ]
        var json = "{\"versionCode\":0,\"notificationPermission\":\"default\",\"supports\":[]}"
        if let data = try? JSONSerialization.data(withJSONObject: snapshot),
           let encoded = String(data: data, encoding: .utf8) {
            json = encoded
        }
        return "window.__BeckonStarsIOS = \(json);"
    }

    private func setUpWebView(initialNotificationPermission: String) {
        guard webView == nil else { return }

        let userContentController = WKUserContentController()
        userContentController.add(bridge, name: "beckonStars")
        userContentController.addUserScript(
            WKUserScript(
                source: snapshotScriptSource(notificationPermission: initialNotificationPermission),
                injectionTime: .atDocumentStart,
                forMainFrameOnly: true
            )
        )

        let configuration = WKWebViewConfiguration()
        configuration.userContentController = userContentController
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        // 語音訊息以 <audio>/Audio() 播放，避免要求全螢幕播放或額外手勢。
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = Self.appBackgroundColor
        webView.scrollView.backgroundColor = Self.appBackgroundColor
        webView.scrollView.bounces = false
        webView.scrollView.showsVerticalScrollIndicator = false
        // index.html 使用 viewport-fit=cover 並自行處理 env(safe-area-inset-*)，
        // 這裡不再讓 UIKit 疊加 content inset。
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.navigationDelegate = self
        webView.overrideUserInterfaceStyle = .light

        view.addSubview(webView)
        self.webView = webView
        bridge.webView = webView

        loadWebApp(into: webView)
    }

    private func loadWebApp(into webView: WKWebView) {
        // web 資源以 folder reference 打包，bundle 內路徑為 web/index.html。
        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") else {
            NSLog("[BeckonStars] 找不到 bundle 內的 web/index.html，請確認 Xcode 專案的 web folder reference。")
            return
        }
        let webDirectoryURL = indexURL.deletingLastPathComponent()
        // 以 web/ 目錄為 read-access root，file:// 頁面才能載入 css/js/vendor 子資源。
        webView.loadFileURL(indexURL, allowingReadAccessTo: webDirectoryURL)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.isFileURL {
            decisionHandler(.allow)
            return
        }
        if navigationAction.targetFrame?.isMainFrame != false,
           let scheme = url.scheme?.lowercased(),
           scheme == "http" || scheme == "https" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }
}
