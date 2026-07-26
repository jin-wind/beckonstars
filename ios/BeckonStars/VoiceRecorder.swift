import Foundation
import AVFoundation
import Speech

/// 語音錄製與語音轉寫（BRIDGE.md §2.7–§2.9、§5、§6）。
///
/// 錄音規格對齊 Android MediaRecorder：AAC / MPEG-4 (.m4a) / 44.1kHz / 單聲道 / 64kbps。
/// 轉寫用 SFSpeechRecognizer（zh-HK）；與 Android 不同，iOS 可直接對檔案轉寫
/// （SFSpeechURLRecognitionRequest），不需要「播放給麥克風聽」的迂迴做法。
///
/// 所有公開方法內部都會轉到主執行緒執行；回呼 JS 一律經由 `evaluateJavaScript` 閉包。
final class VoiceRecorder: NSObject {

    /// 由 NativeBridge 設定；在主執行緒上對 WKWebView 執行一段 JS。
    var evaluateJavaScript: ((String) -> Void)?

    private static let speechLocale = Locale(identifier: "zh-HK")

    private var audioRecorder: AVAudioRecorder?
    private var recordingStartedAt: Date?
    private var currentRecordingURL: URL?
    private var activeRecognitionTask: SFSpeechRecognitionTask?
    private var recordingRequestID: UInt = 0
    private var activeTranscriptionCancel: (() -> Void)?

    // MARK: - 錄音（§2.7 / §2.8）

    func startVoiceRecording() {
        // Invalidate any older permission callback before requesting again.
        recordingRequestID &+= 1
        let requestID = recordingRequestID
        // 注意：AVAudioSession.requestRecordPermission 在 iOS 17 標記 deprecated
        //（改為 AVAudioApplication），但在部署目標 iOS 15 上仍是正確且可用的 API。
        AVAudioSession.sharedInstance().requestRecordPermission { [weak self] granted in
            DispatchQueue.main.async {
                guard let self = self, self.recordingRequestID == requestID else { return }
                guard granted else {
                    self.postVoiceError("請在系統設定中允許麥克風權限。")
                    return
                }
                // 提前索取語音辨識授權，讓 finish 時的檔案轉寫可以直接進行。
                SFSpeechRecognizer.requestAuthorization { _ in }
                guard self.recordingRequestID == requestID else { return }
                self.beginRecording()
            }
        }
    }

    /// 必須在主執行緒呼叫。
    private func beginRecording() {
        cancelActiveRecognitionTask()
        discardInFlightRecording()

        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true, options: [])
        } catch {
            postVoiceError("錄音啟動失敗，請確認麥克風權限。")
            return
        }

        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("beckon-stars-\(UUID().uuidString)")
            .appendingPathExtension("m4a")

        // 對齊 Android MediaRecorder 規格：AAC in MPEG-4、44.1kHz、單聲道、64kbps（BRIDGE.md §5）。
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44100.0,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 64000,
        ]

        do {
            let recorder = try AVAudioRecorder(url: fileURL, settings: settings)
            guard recorder.record() else {
                try? FileManager.default.removeItem(at: fileURL)
                postVoiceError("錄音啟動失敗，請確認麥克風權限。")
                return
            }
            audioRecorder = recorder
            currentRecordingURL = fileURL
            recordingStartedAt = Date()
        } catch {
            try? FileManager.default.removeItem(at: fileURL)
            postVoiceError("錄音啟動失敗，請確認麥克風權限。")
        }
    }

    /// 必須在主執行緒呼叫。丟棄任何進行中的錄音（不回呼 JS）。
    private func discardInFlightRecording() {
        if let recorder = audioRecorder {
            recorder.stop()
            audioRecorder = nil
        }
        if let url = currentRecordingURL {
            try? FileManager.default.removeItem(at: url)
            currentRecordingURL = nil
        }
        recordingStartedAt = nil
    }

    func finishVoiceRecording(cancelled: Bool) {
        // A finish/cancel while the microphone permission sheet is open must
        // prevent the delayed permission callback from starting an orphaned recording.
        recordingRequestID &+= 1
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let recorder = self.audioRecorder, let fileURL = self.currentRecordingURL else {
                return // 沒有進行中的錄音 → 靜默 no-op，對齊 Android
            }
            let startedAt = self.recordingStartedAt ?? Date()
            let durationMs = Int(Date().timeIntervalSince(startedAt) * 1000.0)

            recorder.stop()
            self.audioRecorder = nil
            self.currentRecordingURL = nil
            self.recordingStartedAt = nil
            try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])

            if cancelled {
                // 契約：取消時刪檔且【不】回呼 JS（BRIDGE.md §2.8）。
                try? FileManager.default.removeItem(at: fileURL)
                return
            }

            let attributes = try? FileManager.default.attributesOfItem(atPath: fileURL.path)
            let fileSize = (attributes?[.size] as? NSNumber)?.intValue ?? 0
            guard fileSize > 0 else {
                try? FileManager.default.removeItem(at: fileURL)
                self.postVoiceError("錄音失敗，請再試一次。")
                return
            }

            // 先對錄好的檔案轉寫（拿不到就空字串，整體限時約 10 秒），再組 payload 回呼。
            self.transcribeFile(at: fileURL, timeoutSeconds: 10) { [weak self] transcript, _ in
                self?.deliverFinishedRecording(fileURL: fileURL, durationMs: durationMs, transcript: transcript)
            }
        }
    }

    private func deliverFinishedRecording(fileURL: URL, durationMs: Int, transcript: String) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            defer { try? FileManager.default.removeItem(at: fileURL) }

            guard let data = try? Data(contentsOf: fileURL), !data.isEmpty else {
                self.postVoiceError("錄音失敗，請再試一次。")
                return
            }
            let dataUrl = "data:audio/mp4;base64," + data.base64EncodedString()
            // payload 單次 JSON 序列化成字串、以「單一字串參數」傳入，JS 端負責 JSON.parse。
            let payload: [String: Any] = [
                "audio": dataUrl,
                "audioMime": "audio/mp4",
                "durationMs": durationMs,
                "transcript": transcript,
            ]
            guard let literal = JSEncoding.jsonPayloadLiteral(payload) else {
                self.postVoiceError("錄音失敗，請再試一次。")
                return
            }
            self.callJS("window.handleAndroidVoiceRecording && window.handleAndroidVoiceRecording(\(literal));")
        }
    }

    // MARK: - 接收語音轉寫（§2.9）

    func transcribeReceivedVoice(messageId: String, audioDataUrl: String) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let recognizer = SFSpeechRecognizer(locale: Self.speechLocale), recognizer.isAvailable else {
                // 哨兵值須與 Android 完全一致（BRIDGE.md §2.9）。
                self.postVoiceTranscript(messageId: messageId, transcript: "", error: "speech-unavailable")
                return
            }
            SFSpeechRecognizer.requestAuthorization { [weak self] status in
                DispatchQueue.main.async {
                    guard let self = self else { return }
                    guard status == .authorized else {
                        self.postVoiceTranscript(messageId: messageId, transcript: "", error: "speech-unavailable")
                        return
                    }
                    self.runReceivedVoiceTranscription(messageId: messageId, audioDataUrl: audioDataUrl)
                }
            }
        }
    }

    /// 必須在主執行緒呼叫。
    private func runReceivedVoiceTranscription(messageId: String, audioDataUrl: String) {
        guard let data = Self.decodeAudioDataUrl(audioDataUrl), !data.isEmpty else {
            postVoiceTranscript(messageId: messageId, transcript: "", error: "decode-failed")
            return
        }
        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("beckon-stars-received-\(UUID().uuidString)")
            .appendingPathExtension("m4a")
        do {
            try data.write(to: fileURL)
        } catch {
            postVoiceTranscript(messageId: messageId, transcript: "", error: "decode-failed")
            return
        }

        cancelActiveRecognitionTask()
        transcribeFile(at: fileURL, timeoutSeconds: 30) { [weak self] transcript, error in
            try? FileManager.default.removeItem(at: fileURL)
            self?.postVoiceTranscript(messageId: messageId, transcript: transcript, error: error)
        }
    }

    /// 去掉第一個逗號（含）之前的 header，其餘做 base64 解碼（對齊 Android writeDataUrlToTempFile）。
    private static func decodeAudioDataUrl(_ dataUrl: String) -> Data? {
        let payload: String
        if let commaIndex = dataUrl.firstIndex(of: ",") {
            payload = String(dataUrl[dataUrl.index(after: commaIndex)...])
        } else {
            payload = dataUrl
        }
        return Data(base64Encoded: payload, options: [.ignoreUnknownCharacters])
    }

    // MARK: - 共用檔案轉寫

    private final class TranscriptionSession {
        var finished = false
        var latestTranscript = ""
        var errorCode = ""
        var recognizer: SFSpeechRecognizer?
        var task: SFSpeechRecognitionTask?
    }

    /// 對音檔轉寫，`completion` 保證在主執行緒被呼叫、且恰好一次；
    /// 逾時或失敗時交出目前為止的部分結果（可能為空字串）及錯誤碼。必須在主執行緒呼叫。
    private func transcribeFile(
        at url: URL,
        timeoutSeconds: TimeInterval,
        completion: @escaping (String, String) -> Void
    ) {
        guard SFSpeechRecognizer.authorizationStatus() == .authorized,
              let recognizer = SFSpeechRecognizer(locale: Self.speechLocale),
              recognizer.isAvailable else {
            DispatchQueue.main.async { completion("", "speech-unavailable") }
            return
        }

        // Only one transcription may own a callback at a time. Cancelling a
        // superseded session marks it finished so neither Speech nor its timeout
        // can deliver stale audio into a later web recording context.
        activeTranscriptionCancel?()

        let session = TranscriptionSession()
        session.recognizer = recognizer // 任務進行期間保持 recognizer 存活

        let request = SFSpeechURLRecognitionRequest(url: url)
        request.shouldReportPartialResults = true

        let cancelSession: () -> Void = { [weak self] in
            guard !session.finished else { return }
            session.finished = true
            session.task?.cancel()
            session.recognizer = nil
            session.task = nil
            if self?.activeTranscriptionCancel != nil {
                self?.activeTranscriptionCancel = nil
            }
        }
        activeTranscriptionCancel = cancelSession

        // 只在主執行緒呼叫；用 session.finished 保證 completion 恰好一次。
        let finish: () -> Void = { [weak self] in
            guard !session.finished else { return }
            session.finished = true
            session.task?.cancel()
            if let self = self,
               let activeTask = self.activeRecognitionTask,
               let sessionTask = session.task,
               activeTask === sessionTask {
                self.activeRecognitionTask = nil
            }
            let transcript = session.latestTranscript
            let errorCode = session.errorCode
            session.recognizer = nil
            session.task = nil
            self?.activeTranscriptionCancel = nil
            completion(transcript, errorCode)
        }

        session.task = recognizer.recognitionTask(with: request) { result, error in
            DispatchQueue.main.async {
                if let result = result {
                    session.latestTranscript = result.bestTranscription.formattedString
                    if result.isFinal {
                        finish()
                        return
                    }
                }
                if let error = error {
                    session.errorCode = String((error as NSError).code)
                    finish()
                }
            }
        }
        activeRecognitionTask = session.task

        DispatchQueue.main.asyncAfter(deadline: .now() + timeoutSeconds) {
            if !session.finished {
                session.errorCode = "timeout"
            }
            finish()
        }
    }

    /// 必須在主執行緒呼叫。
    private func cancelActiveRecognitionTask() {
        activeTranscriptionCancel?()
        activeTranscriptionCancel = nil
        activeRecognitionTask?.cancel()
        activeRecognitionTask = nil
    }

    // MARK: - JS 回呼

    private func callJS(_ script: String) {
        evaluateJavaScript?(script)
    }

    private func postVoiceError(_ message: String) {
        callJS("window.handleAndroidVoiceError && window.handleAndroidVoiceError(\(JSEncoding.stringLiteral(message)));")
    }

    private func postVoiceTranscript(messageId: String, transcript: String, error: String) {
        let payload: [String: Any] = [
            "messageId": messageId,
            "transcript": transcript.trimmingCharacters(in: .whitespacesAndNewlines),
            "error": error,
        ]
        guard let literal = JSEncoding.jsonPayloadLiteral(payload) else { return }
        callJS("window.handleAndroidVoiceTranscript && window.handleAndroidVoiceTranscript(\(literal));")
    }
}
