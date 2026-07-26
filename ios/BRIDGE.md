# iOS WKWebView Shell Parity Spec

Source: `android/app/src/main/java/hk/beckonstars/app/MainActivity.java` (1235 lines), cross-checked against `android/app/src/main/assets/index.html` JS call sites, `AndroidManifest.xml`, and `strings.xml`.

## 1. WebView configuration to replicate

| Android setting | Value | WKWebView equivalent |
|---|---|---|
| `setJavaScriptEnabled(true)` | on | default enabled |
| `setDomStorageEnabled(true)` | on | default enabled (localStorage works) |
| `setDatabaseEnabled(true)` | on | n/a (WebSQL deprecated) |
| `setLoadWithOverviewMode` / `setUseWideViewPort` | on | n/a, viewport meta controls this |
| `setAllowFileAccess`, `setAllowContentAccess` | true | needed to load bundled asset HTML |
| `setAllowFileAccessFromFileURLs` / `setAllowUniversalAccessFromFileURLs` | **true** | iOS: use `WKWebView loadFileURL:allowingReadAccessToURL:` with the app bundle resource directory as the read-access root, so `file://` page can XHR/fetch other bundled files. There is no direct "universal access from file URLs" toggle in WKWebView — allowing read access to the containing directory plus the app's own scheme is the practical equivalent. If the JS ever does cross-origin `fetch` to remote HTTP from a `file://` page, iOS's WKWebView is generally permissive for this already, but test it (App Transport Security is the more likely blocker — see below).
| `setMixedContentMode(COMPATIBILITY_MODE)` | since API 21 | Equivalent problem is **App Transport Security (ATS)**. The Android manifest sets `android:usesCleartextTraffic="true"` because the API is plain HTTP. On iOS you must add an ATS exception in Info.plist for the API host (`NSAppTransportSecurity` / `NSExceptionDomains` with `NSExceptionAllowsInsecureHTTPLoads: true`, or `NSAllowsArbitraryLoads: true`) or the API calls will silently fail.
| `setForceDark(OFF)` (API 29+) | dark mode off | Set `webView.overrideUserInterfaceStyle = .light` (or leave to app's own CSS - the HTML sets its own background) |
| `webView.setBackgroundColor(255,248,240)` | cream background | Set `webView.backgroundColor` / `webView.scrollView.backgroundColor` to `UIColor(red:255/255, green:248/255, blue:240/255, alpha:1)` before first paint to avoid a white flash |
| `setOverScrollMode(NEVER)` | disable Android overscroll glow | `webView.scrollView.bounces = false` |
| `setVerticalScrollBarEnabled(false)` | hide scrollbar | `webView.scrollView.showsVerticalScrollIndicator = false` |
| `webView.loadUrl("file:///android_asset/index.html")` | load bundled HTML | Bundle the same `index.html` (and any assets it references) into the iOS app bundle (e.g. `Resources/web/index.html`) and `loadFileURL:allowingReadAccessToURL:` pointed at that directory |
| No custom user agent set | default WebView UA | Leave default WKWebView UA unless JS does UA sniffing (grep shows none observed for Android-specific UA strings — only `isAndroidApk()` which checks `window.BeckonStarsAndroid` presence, not UA) |
| `WebViewClient()` (default, no override) | standard nav handling | Default `WKNavigationDelegate` behavior is fine; no special interception needed except keeping navigation inside the WKWebView for the same origin |

**Bridge injection**: `webView.addJavascriptInterface(new AndroidBridge(), "BeckonStarsAndroid")` — on iOS, implement via `WKScriptMessageHandler` + `window.webkit.messageHandlers.*`, but the JS in `index.html` calls a synchronous-looking object `window.BeckonStarsAndroid.methodName(...)`. Since WKWebView message handlers are inherently async (`postMessage`), you must inject a JS shim (via `WKUserScript`, `.atDocumentStart`) that defines `window.BeckonStarsAndroid = { ... }` with methods that forward to `webkit.messageHandlers.<name>.postMessage(...)`. Pay special attention to methods the JS treats as **returning a value synchronously**:
- `getNotificationPermission()` → returns `"granted"/"default"`
- `requestNotificationPermission()` → returns boolean
- `getVersionCode()` → returns int

Since WKWebView can't return synchronous values from native to JS, the shim must fake this (e.g. cache last known permission state in JS-side storage and update it via a callback, or use a synchronous XHR-based bridge trick, or restructure these three call sites to be promise-based — note this is a *behavior difference* the iOS shell will need to reconcile, since `index.html` code currently does `const granted = window.BeckonStarsAndroid.requestNotificationPermission();` synchronously at line ~1685 and `getVersionCode()` synchronously at line ~1043). This is the single biggest architectural mismatch between Android's `@JavascriptInterface` model and WKWebView's async `postMessage` model.

## 2. Full `@JavascriptInterface` method contract (`AndroidBridge` inner class)

### 2.1 `String getNotificationPermission()`
- Params: none.
- Native behavior: returns `"granted"` if `Build.VERSION.SDK_INT < 33` or `POST_NOTIFICATIONS` permission granted; else `"default"`.
- Return value only (no JS callback fired). JS reads this synchronously.
- iOS equivalent: `UNUserNotificationCenter.current().getNotificationSettings` (async) — reports `.authorized`/`.provisional` → `"granted"`, else `"default"`/`"denied"`.

### 2.2 `boolean requestNotificationPermission()`
- Params: none.
- Native behavior: if already granted, returns `true` immediately, no permission dialog. If API ≥ 33 and not granted, calls `requestPermissions([POST_NOTIFICATIONS], REQUEST_POST_NOTIFICATIONS)` on UI thread and returns `false` immediately (the grant/deny result arrives later, asynchronously, via a different path — see below).
- **Async result delivery**: `onRequestPermissionsResult` for `REQUEST_POST_NOTIFICATIONS` computes `permission = "granted"|"denied"` and calls:
  ```js
  window.setAndroidNotificationPermission && window.setAndroidNotificationPermission('granted'|'denied')
  ```
  Note: this is a **different function name** (`setAndroidNotificationPermission`, not a `handleAndroid*` callback) and a different value space (`"granted"`/`"denied"`, not `"default"`).
- iOS: request via `UNUserNotificationCenter.current().requestAuthorization(options:completionHandler:)`; on completion call `window.setAndroidNotificationPermission('granted')` or `'denied'` (keep the same JS-facing function name for compatibility even though it says "Android").

### 2.3 `void showLocalNotification(String title, String body)`
- Params: `title` (String), `body` (String).
- Native: runs on UI thread, calls `showNotification(title, body)` which — if `hasNotificationPermission()` — builds a `Notification` on channel `beckon_stars_default` (importance `IMPORTANCE_DEFAULT`, description "星喚 App 通知"), icon `R.drawable.ic_launcher`, `setContentTitle(title)`, `setContentText(body)`, `setAutoCancel(true)`, and calls `manager.notify((int) System.currentTimeMillis(), builder.build())` — i.e. **a new notification ID every time based on current time**, so notifications never replace/stack-collapse each other; each call always shows a new banner.
- No JS callback (fire-and-forget).
- iOS: use `UNMutableNotificationContent` with `title`/`body`, `UNNotificationRequest` with a unique identifier (e.g. UUID or timestamp string) and a trigger with a very short/near-immediate delay (`UNTimeIntervalNotificationTrigger` with tiny interval, since local notifications must have some trigger), added via `UNUserNotificationCenter.current().add(...)`. Only show if authorization status permits (mirror `hasNotificationPermission()` gating).

### 2.4 `void playRewardHaptic()`
- Params: none.
- Native: checks `Vibrator` service has a vibrator; API ≥ 26 uses `VibrationEffect.createWaveform(timings=[0,35,45,70], amplitudes=[0,110,0,180], repeat=-1)`; older API uses `vibrate(long[]{0,35,45,70}, -1)`. This is a short double-tap-style haptic pattern: wait 0ms, buzz 35ms @ amplitude 110/255, pause 45ms, buzz 70ms @ amplitude 180/255.
- No JS callback.
- iOS: use `UIImpactFeedbackGenerator` or `CHHapticEngine` custom pattern to approximate: two impulses, second stronger than the first, with the same relative timing (35ms then a 45ms gap then 70ms). A close approximation: `UIImpactFeedbackGenerator(style: .light).impactOccurred()` immediately, then after ~80ms `UIImpactFeedbackGenerator(style: .medium).impactOccurred()`. For a closer amplitude/duration match use Core Haptics (`CHHapticEvent` array with `.hapticTransient` events at time 0 and time ~0.08s, intensities scaled to 110/255≈0.43 and 180/255≈0.71).

### 2.5 `void startGoogleSignIn()`
- Params: none.
- Native: runs on UI thread → `startGoogleSignInInternal()`.
  - Checks `credentialManager != null`, else calls `postGoogleError("Google 登入暫時不可用，請稍後再試。")`.
  - Checks `hasConfiguredGoogleClientId()` — `R.string.google_web_client_id` must be non-empty, end with `.apps.googleusercontent.com`, and not start with `"your-"`. Current value: `747682384006-7inn73tbprlcv10cv831koabfispr89l.apps.googleusercontent.com`. Else calls `postGoogleError("Google 登入尚未設定 Web Client ID。")`.
  - Builds `GetGoogleIdOption` with `setFilterByAuthorizedAccounts(false)`, `setServerClientId(serverClientId)` (the **web** client ID, used as OAuth audience), `setAutoSelectEnabled(true)`.
  - Calls Android Credential Manager `getCredentialAsync`.
  - **On success** (`onResult`): `handleGoogleCredentialResult` — if credential is a `CustomCredential` of type `GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL`, parses via `GoogleIdTokenCredential.createFrom(data)`, extracts `idToken`. If non-empty → `postGoogleCredential(idToken)`. Otherwise → `postGoogleError("未能取得 Google 登入資料，請再試一次。")`.
  - **On failure** (`onError`): logs and calls `postGoogleError("Google 登入取消或失敗，請再試一次。")`.
- **JS callbacks**:
  - Success: `window.handleAndroidGoogleCredential && window.handleAndroidGoogleCredential(idToken)` — `idToken` is a **raw JSON-escaped string** (the Google ID token JWT), passed via `JSONObject.quote(idToken)` so it arrives as a proper JS string literal argument.
  - Failure: `window.handleAndroidGoogleError && window.handleAndroidGoogleError(message)` — `message` is a Traditional-Chinese human-readable error string, JSON-quoted.
  - The JS-side handler (`android/app/src/main/assets/index.html` ~line 1286-1296) takes the ID token and sends it to the backend `POST /api/auth/google` for verification.
- iOS: use `GIDSignIn` (Google Sign-In SDK for iOS) or native `ASAuthorizationController` w/ Sign in with Apple is NOT the same — must use Google's iOS SDK with the **iOS OAuth client ID** (separate from the Android/Web one, but the ID token audience should still validate against the **web** client ID server-side, matching current backend verification — coordinate the iOS client ID's "audience"/verified party (`azp`) expectations with backend `/api/auth/google` code). On success call `window.handleAndroidGoogleCredential(idToken)`; on cancel/failure call `window.handleAndroidGoogleError(message)`. Keep the exact same JS function names for zero front-end changes.

### 2.6 `void clearGoogleCredentialState()`
- Params: none.
- Native: runs on UI thread → `credentialManager.clearCredentialStateAsync(...)`. No JS callback either way (only logs success/failure).
- Called from JS at logout (index.html ~line 1424): `window.BeckonStarsAndroid?.clearGoogleCredentialState?.()`.
- iOS: call `GIDSignIn.sharedInstance.signOut()` (clears cached Google session state). No callback needed.

### 2.7 `void startVoiceRecording()`
- Params: none.
- Native: runs on UI thread.
  - If no `RECORD_AUDIO` permission: sets `pendingVoiceRecordingStart = true`; if API ≥ 23 requests `RECORD_AUDIO` permission (result handled later in `onRequestPermissionsResult`); if pre-23 (permission always granted at install) but somehow missing, calls `postVoiceError("請先允許麥克風權限。")`.
  - Else calls `startVoiceRecordingInternal()` directly:
    - Stops any in-flight received-voice transcription and any prior recording (cancelled).
    - Resets `latestTranscript=""`, `activeTranscriptionMessageId=""`.
    - Creates temp file `beckon-stars-<random>.m4a` in cache dir.
    - Configures `MediaRecorder`: `AudioSource.VOICE_RECOGNITION`, `OutputFormat.MPEG_4` (i.e. **M4A/MP4 container**), `AudioEncoder.AAC`, bitrate **64000 bps**, sample rate **44100 Hz**.
    - `prepare()` + `start()`, records `recordingStartedAt = now`.
    - Immediately also starts on-device speech recognition (`startSpeechRecognitionInternal()`) in parallel with recording, to get a live transcript concurrently with the audio capture (Android's `SpeechRecognizer`, language `zh-HK`, partial results enabled).
    - On any exception: stops recording (cancelled) and calls `postVoiceError("錄音啟動失敗，請確認麥克風權限。")`.
- No direct success callback for *start* — JS just waits for `finishVoiceRecording` to trigger the result.
- iOS audio spec to match: **AAC audio, MPEG-4/M4A container, 44.1kHz sample rate, 64kbps bitrate**. Use `AVAudioRecorder` with settings:
  ```swift
  [AVFormatIDKey: kAudioFormatMPEG4AAC,
   AVSampleRateKey: 44100,
   AVNumberOfChannelsKey: 1,
   AVEncoderBitRateKey: 64000]
  ```
  outputting a `.m4a` file. In parallel, start `SFSpeechRecognizer` (locale should map to `zh-HK` → use `Locale(identifier: "zh-HK")`, note Apple's speech framework support for zh-HK should be verified) with live/partial results enabled to build a running transcript, mirroring the concurrent-capture design.
- Permission model: request `AVAudioSession` / `AVCaptureDevice` microphone permission (`AVAudioApplication.requestRecordPermission` on iOS 17+, or `AVAudioSession.sharedInstance().requestRecordPermission` on older). If denied, call `window.handleAndroidVoiceError('請在 Android 設定中允許麥克風權限。')` (adapt Chinese wording to iOS Settings phrasing) — keep the **same JS function name** `handleAndroidVoiceError`.

### 2.8 `void finishVoiceRecording(boolean cancelled)`
- Params: `cancelled` (boolean) — JS calls this with `false` to finish-and-keep, or `true` to abort.
- Native: runs on UI thread → `stopVoiceRecordingInternal(cancelled)`:
  - Stops the speech recognizer's listening (best-effort, swallows exceptions).
  - If no active `mediaRecorder`, returns (no-op).
  - Captures `finishedFile` and elapsed `durationMs = now - recordingStartedAt`.
  - Calls `mediaRecorder.stop()` (catches exceptions and forces `cancelled = true` if stop fails), then `release()`, nulls `mediaRecorder`/`currentAudioFile`.
  - If `cancelled`: deletes the temp file, returns — **no JS callback at all when cancelled**.
  - If not cancelled but file missing/zero-length: `postVoiceError("錄音失敗，請再試一次。")`.
  - Else: schedules (after a **1200ms delay** via `mainHandler.postDelayed`) `postFinishedVoiceRecording(finishedFile, durationMs)`. The 1200ms delay exists presumably to let the speech recognizer finish emitting its final `onResults` callback (which updates `latestTranscript`) before the recording payload (which includes `transcript`) is sent to JS.
  - `postFinishedVoiceRecording`:
    - If `mediaApiBase` is empty (**note: in the current `index.html`, `setMediaApiConfig` is never actually invoked from JS**, so this native method exists but the JS never calls it — meaning `mediaApiBase` is always `""` in the current app, and the code always takes the **legacy base64 path** in practice): calls `postFinishedVoiceRecordingLegacy` — reads whole file, base64-encodes it (`Base64.NO_WRAP`), builds `data:audio/mp4;base64,<...>` data URL, and posts payload `{ audio: dataUrl, audioMime: "audio/mp4", durationMs, transcript }`.
    - If `mediaApiBase` non-empty: uploads the file via multipart POST to `<mediaApiBase>/api/media/upload` with `Authorization: Bearer <mediaAuthToken>` if set, field name `file`, filename `recording.m4a`, content-type `audio/mp4`. Expects **HTTP 201** and a JSON body `{ "mediaUrl": "..." }`. On success posts payload `{ audioUrl: mediaUrl, audioMime: "audio/mp4", durationMs, transcript }`. On any exception: `postVoiceError("錄音上傳失敗：" + error.getMessage())`.
    - Deletes the local temp file in a `finally` block either way.
- **JS callback** (success path, either variant):
  ```js
  window.handleAndroidVoiceRecording && window.handleAndroidVoiceRecording(payloadJsonString)
  ```
  Note: the payload is passed as a **JSON-quoted string of a JSON string** — i.e. `postVoiceRecording(String payloadJson)` wraps `payloadJson` (already a JSON string like `{"audio":"data:...","audioMime":"audio/mp4","durationMs":1234,"transcript":"..."}`) with `JSONObject.quote(...)` again, so the JS function receives **one JS string argument** that itself needs to be `JSON.parse`'d by JS to get the object. Confirm this matches `handleAndroidVoiceRecording` in index.html (~line 5134), which does `async payload => { ... JSON.parse(payload) ... }` presumably.
  - Two possible key shapes in the parsed object:
    - Legacy/base64: `{ audio: "data:audio/mp4;base64,<b64>", audioMime: "audio/mp4", durationMs: number, transcript: string }`
    - Media-API/uploaded: `{ audioUrl: "<url>", audioMime: "audio/mp4", durationMs: number, transcript: string }`
  - JS must check `recording.audio || recording.audioUrl` per the project's own documented pitfall in CLAUDE.md.
- **Error callback**: `window.handleAndroidVoiceError && window.handleAndroidVoiceError(message)` — `message` is a JSON-quoted Chinese string.
- iOS: after `stop()` on `AVAudioRecorder`, read the file, apply the same legacy-base64 default (since JS never configures a media API base currently) — build `data:audio/mp4;base64,<...>` and call:
  ```js
  window.handleAndroidVoiceRecording('<json-string>')
  ```
  passing the JSON payload as a single quoted JS string argument to match the double-encoding exactly, OR (safer/simpler and functionally equivalent from JS's perspective as long as it still calls `JSON.parse`) just serialize once and pass as a JS string literal — the key requirement is that `handleAndroidVoiceRecording` receives one string parameter that round-trips through `JSON.parse` to the same object shape.

### 2.9 `void transcribeReceivedVoice(String messageId, String audioDataUrl)`
- Params: `messageId` (String) — identifies which chat message's voice note is being transcribed; `audioDataUrl` (String) — a `data:audio/...;base64,...` data URL of **received** (someone else's) voice message audio, for **local on-device transcription** (used e.g. to produce a text fallback of a voice message).
- Native: runs on UI thread → `startReceivedVoiceTranscriptionInternal`:
  - If no `RECORD_AUDIO` permission (Android's on-device speech recognizer requires mic permission even to play+transcribe pre-recorded audio via the trick used here): stashes `pendingTranscriptionMessageId`/`pendingTranscriptionAudioDataUrl` and requests permission; result handled later.
  - If `SpeechRecognizer.isRecognitionAvailable(this)` is false: immediately calls `postVoiceTranscript(messageId, "", "speech-unavailable")`.
  - Else: stops any active recording/transcription, decodes the data URL to a temp `.m4a` file (`writeDataUrlToTempFile` — strips everything before the first comma, base64-decodes the rest), sets `activeTranscriptionMessageId = messageId`, and starts the speech recognizer.
  - **Clever trick**: this doesn't feed the audio bytes directly into the recognizer API (Android's on-device `SpeechRecognizer` only listens to the live microphone). Instead, once the recognizer's `onReadyForSpeech` fires, it **plays the decoded audio file out loud via `MediaPlayer`** (`playReceivedAudioForTranscription`) so the recognizer picks it up through whatever audio routing exists, effectively transcribing recorded audio by "playing it into" STT. When playback completes, after a 900ms grace period, it stops the recognizer's listening, which triggers `onResults`.
  - `onResults`/`onError` of the recognizer call `finishReceivedVoiceTranscription(transcript, errorCode)`, which stops/releases the player and recognizer, deletes the temp file, and calls `postVoiceTranscript(messageId, finalTranscript, errorCode==0 ? "" : String.valueOf(errorCode))`.
- **JS callback**:
  ```js
  window.handleAndroidVoiceTranscript && window.handleAndroidVoiceTranscript(payloadJsonString)
  ```
  Again double-JSON-encoded (a JS string that needs `JSON.parse`). Parsed shape:
  ```json
  { "messageId": "<string>", "transcript": "<trimmed string>", "error": "<string, empty if none, else an error code as string like '-1'/'-2'/'speech-unavailable' or Android SpeechRecognizer numeric error code>" }
  ```
- iOS equivalent: **no need for the play-out-loud trick** — `SFSpeechRecognizer` supports transcribing an audio file directly via `SFSpeechURLRecognitionRequest(url:)`. Decode the data URL to a temp `.m4a` file and run `SFSpeechRecognizer(locale: Locale(identifier: "zh-HK"))?.recognitionTask(with: SFSpeechURLRecognitionRequest(url: fileURL))`. On completion (final result or error) call `window.handleAndroidVoiceTranscript(jsonString)` with the same three keys. Use `"speech-unavailable"` as the error string if `SFSpeechRecognizer` is nil/unavailable/unauthorized, matching Android's sentinel value exactly so JS-side error-string checks (if any) keep working.

### 2.10 `void setMediaApiConfig(String apiBase, String authToken)`
- Params: `apiBase` (String, e.g. server base URL), `authToken` (String, bearer token).
- Native: just stores `mediaApiBase`/`mediaAuthToken` fields (null → `""`). No JS callback.
- **Important finding**: grepping `android/app/src/main/assets/index.html` for `setMediaApiConfig` / `mediaApiBase` / `MediaApi` (case-insensitive) returns **zero matches** — this method is currently **never called from JS**. It's dead/unused wiring in the current build; the app always uses the legacy base64 audio path (§2.8). Implement the iOS equivalent for parity/future-proofing but do not expect it to be exercised by current JS.
- iOS: expose a method (native handler or shim function) `setMediaApiConfig(apiBase, authToken)` storing values for later use by the upload path, mirroring the field but understand it's presently inert.

### 2.11 `void downloadAndInstallUpdate(String downloadUrl)`
- Params: `downloadUrl` (String) — typically a GitHub Releases asset URL for a new APK.
- Native: runs on UI thread → `startDownloadAndInstall`, on a background `Thread`:
  - Opens `HttpURLConnection` to `downloadUrl` with `Referer: https://github.com`, follows redirects automatically (`setInstanceFollowRedirects(true)`) but also **manually** re-resolves one `Location` redirect if response is 301/302 (defensive double-handling).
  - On HTTP 200, streams the body into `getExternalFilesDir(DIRECTORY_DOWNLOADS)/beckonstars-update.apk`.
  - On completion (main thread): for API ≥ 24, gets a `FileProvider` content URI and fires `Intent.ACTION_INSTALL_PACKAGE` with `FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK`; for older API, uses `ACTION_VIEW` with `application/vnd.android.package-archive` MIME directly on a `file://` URI.
  - No JS callback on success or failure at all (only `Log.d`/`Log.e`). JS has no way to know if the update download/install succeeded, failed, or was cancelled by the user in the system installer UI.
- **This entire flow is fundamentally inapplicable to iOS** — iOS apps cannot side-load/self-update an `.ipa` outside TestFlight/App Store/enterprise MDM distribution. For the iOS shell:
  - Either make this a no-op stub (call it, log it, do nothing) if updates are handled via TestFlight/App Store notifications instead, or
  - Implement app-update-checking that instead deep-links to the App Store product page (`itms-apps://itunes.apple.com/app/id<AppID>`) or opens a TestFlight invite link via `UIApplication.shared.open(url)`.
  - Since there's no JS callback contract to preserve here (none exists on Android either), you have full latitude — just decide what UX replaces "silently download+prompt native install dialog."

### 2.12 `void saveImageToGallery(String imageUrl)`
- Params: `imageUrl` (String) — either a remote `http(s)://` URL or a `data:image/...;base64,...` data URL of an AI-generated image.
- Native: runs on UI thread → `saveImageToGalleryInternal`:
  - Validates non-empty; else `postImageSaveResult(false, "圖片地址無效，不能保存。")`.
  - Checks `hasLegacyImageWritePermission()` — true unconditionally on API ≥ 29 (scoped storage, no permission needed) or API < 23; otherwise requires `WRITE_EXTERNAL_STORAGE`. If missing, stashes `pendingImageSaveUrl` and requests the permission (result handled later).
  - On a background thread: reads image bytes (`readImageBytes` — handles both data URLs, extracting mime from the `data:<mime>;base64,` header, and remote URLs via `HttpURLConnection` with a manual one-hop redirect follow, 30s connect / 60s read timeouts, `User-Agent: BeckonStars/1.0`), determines final mime via `guessImageMime` (prefers HTTP `Content-Type`, else sniffs `.png`/`.webp` in the URL, defaults `image/jpeg`).
  - Writes to gallery: API ≥ 29 uses `MediaStore.Images.Media` insert into `Pictures/星喚` relative path with `IS_PENDING` flag lifecycle; pre-29 writes directly to `Environment.DIRECTORY_PICTURES/星喚/<filename>` and fires `ACTION_MEDIA_SCANNER_SCAN_FILE` broadcast. Filename pattern: `beckon-stars-ai-<epochMillis>.<ext>` where ext is `png`/`webp`/`jpg` based on mime.
  - On success: `postImageSaveResult(true, "✅ 圖片已保存到手機相簿。")`.
  - On failure: `postImageSaveResult(false, "圖片保存失敗，請稍後再試。")`.
- **JS callback**:
  ```js
  window.handleAndroidImageSaveResult && window.handleAndroidImageSaveResult(success /* boolean literal, unquoted */, message /* JSON-quoted string */)
  ```
  Note `success` is emitted as a raw Java boolean concatenated into the JS expression (`true`/`false` literal), not a string.
- iOS: request `PHPhotoLibrary` add-only authorization (`.addOnly` on iOS 14+, avoids full library access), decode the data URL or download the remote URL (apply the same redirect + timeout + UA behavior for parity, `User-Agent: BeckonStars/1.0`), then `PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.creationRequestForAssetFromImage(atFileURL:) }` (or from `UIImage`/Data). On completion call `window.handleAndroidImageSaveResult(true, '✅ 圖片已保存到手機相簿。')` or `(false, '圖片保存失敗，請稍後再試。')`/`(false, '圖片地址無效，不能保存。')` matching exact Chinese strings for UI consistency. There's no iOS equivalent of a custom album name path being required — you can create/target an "星喚" custom `PHAssetCollection` to mirror the `Pictures/星喚` folder behavior, or just save to the default Camera Roll (an acceptable simplification since the JS only checks the boolean/message).

### 2.13 `void shareAIImage(String imageUrl)`
- Params: `imageUrl` (String) — remote URL or local reference to an AI-generated image.
- Native: runs on UI thread → `shareAIImageInternal`:
  - If `imageUrl` is a remote `http(s)://` URL (`isRemoteUrl`): fires a plain-text share sheet (`ACTION_SEND`, type `text/plain`, subject `"AI 生成圖片"`, text = the URL itself) — i.e. **shares the link, not the image bytes**, for remote URLs.
  - Otherwise (presumably a data URL or local path): on a background thread, downloads/decodes to a cache file (`writeImageToCacheFile` → `readImageBytes` + `imageExtensionForMime`), wraps in a `FileProvider` content URI, then on main thread fires `ACTION_SEND` with type `image/*`, `EXTRA_STREAM` = content URI, `FLAG_GRANT_READ_URI_PERMISSION`, and `ClipData` for permission grants to the target app — i.e. **shares the actual image file**.
  - On any exception during either path: `postImageSaveResult(false, "分享失敗，請先保存圖片後再分享。")` — note this reuses the **same** `handleAndroidImageSaveResult` callback as the save-to-gallery flow, so JS cannot distinguish a failed *share* from a failed *save* except by the message text/UI context at the time of invocation.
  - **No success callback on the happy path at all** — since sharing hands off to the system share sheet, native code doesn't know or report whether the user actually completed the share.
- iOS: if `imageUrl` starts with `http://`/`https://`, present `UIActivityViewController` with the URL string as the only activity item (mirrors "share the link" behavior for remote URLs). Otherwise decode/download to a temp file and present `UIActivityViewController` with a `UIImage`/file URL activity item. On failure to prepare, call `window.handleAndroidImageSaveResult(false, '分享失敗，請先保存圖片後再分享。')` (same reused callback name for parity).

### 2.14 `int getVersionCode()`
- Params: none.
- Native: returns `PackageManager.getPackageInfo(getPackageName(), 0).versionCode`, or `0` on any exception.
- No JS callback — **synchronous return value** read directly by JS: `const CURRENT_VERSION_CODE = window.BeckonStarsAndroid?.getVersionCode?.() || 0;` (index.html ~line 1043), used presumably for update-check comparisons.
- iOS: since WKWebView bridging is async, you cannot return this synchronously from a `postMessage`-based shim. Options: (a) inject the build number directly into the page at load time via a `WKUserScript` that sets `window.BeckonStarsAndroid = { getVersionCode: () => <literal-int-from-CFBundleVersion>, ... }` at document-start (cheapest, fully synchronous, recommended), or (b) restructure this one JS call site to be async if you want a live bridge round-trip instead. Given this is a static, load-time-constant value, prefer (a): read `Bundle.main.infoDictionary?["CFBundleVersion"]` and bake it into the injected shim script string before evaluating it.

## 3. File chooser / camera capture flow (`onShowFileChooser`)

- Triggered by any `<input type="file">` interaction in JS (e.g. memory photo attach).
- Sequence:
  1. If a previous `filePathCallback` is still pending, it's cancelled (`onReceiveValue(null)`) before proceeding — avoids leaking/hanging.
  2. Stores the new `filePathCallback`.
  3. If `fileChooserParams.isCaptureEnabled()` (i.e. the input has `capture` attribute) **and** `acceptsImage(...)` (accept types list is empty, or empty string, or any entry starts with `image/`) → goes straight to camera (`startCameraFileChooser()`), bypassing the normal chooser/gallery picker.
     - `startCameraFileChooser`: creates a temp JPEG file `memory-camera-<random>.jpg` in cache dir, gets a `FileProvider` content URI (authority `<applicationId>.fileprovider`), builds `Intent(ACTION_IMAGE_CAPTURE)` with `EXTRA_OUTPUT` = that URI, grants read/write URI permission flags, sets `ClipData` for the URI, and calls `startActivityForResult(cameraIntent, REQUEST_FILE_CHOOSER)`. If any exception occurs, cancels the file callback and returns `false` (chooser fails silently from JS's perspective — `<input>` just doesn't produce a file).
  4. Otherwise: builds a generic `createIntent()` from `fileChooserParams` with `CATEGORY_OPENABLE` added, and starts it for the normal system file/gallery picker. If `startActivityForResult` throws, nulls out the callback and returns `false`.
  5. `onActivityResult` for `REQUEST_FILE_CHOOSER`: if result is `RESULT_OK`, and `pendingCameraImageUri` was set (i.e. camera path was used), resolves to that single URI regardless of the `Intent data` returned (camera apps often return null data since the file was written directly to the provided URI); otherwise (gallery/file picker path) uses `WebChromeClient.FileChooserParams.parseResult(resultCode, data)` to get possibly multiple URIs. On any non-OK result, passes `null` (no files). Always resolves the stored `filePathCallback` exactly once, then clears both `filePathCallback` and `pendingCameraImageUri`.
- iOS equivalent: implement `WKUIDelegate`'s file-upload equivalent isn't standard on iOS (WKWebView doesn't natively support `<input type=file>` invoking a native picker the way Android does) — you must intercept via injected JS (observe `change`/`click` on file inputs, or use a `WKScriptMessageHandler` triggered from a custom `<input>` click handler) and present either:
  - `UIImagePickerController` (or `PHPickerViewController` for gallery, `AVCapturePhotoOutput`/`UIImagePickerController(sourceType: .camera)` for camera) when the input signals camera capture intent (mirror the `isCaptureEnabled() && acceptsImage()` check — inspect the `<input capture>` attribute and `accept` attribute via the injected JS bridge before deciding camera vs. picker).
  - After the user picks/captures, convert the resulting image to a local temp file or a data URL and feed it back into the page's file input via JS (`DataTransfer`/`FileList` polyfill, or convert your flow to directly hand the app a data URL and skip real `<input>` file objects if the JS supports both — check how `index.html` consumes the chosen file to decide the exact hand-back mechanism).
  - This is the most structurally different piece between Android and iOS (native WebView-level API support vs. custom JS-bridge orchestration) and will need the most implementation-specific engineering; the contract requirement to preserve is: **exactly one image, whether from camera or gallery, ends up available to whatever JS code currently expects the resolved file(s) from the `<input>` change event**, matching Android's guarantee that `filePathCallback.onReceiveValue` is always eventually invoked exactly once (with `null` on any failure/cancel).

## 4. Notification channel behavior

- Channel ID: `beckon_stars_default`.
- Created once at `onCreate` via `createNotificationChannel()`, only on API ≥ 26 (`Build.VERSION_CODES.O`); channel name = app name string resource, description = `"星喚 App 通知"`, importance = `IMPORTANCE_DEFAULT` (makes a sound, shows as heads-up on some OEM skins but not guaranteed banner).
- Every notification uses this channel (API ≥ 26) or a channel-less legacy `Notification.Builder` (API < 26).
- Notification content: small icon `R.drawable.ic_launcher`, title/body from JS args, `setAutoCancel(true)` (dismisses on tap).
- Notification ID = `(int) System.currentTimeMillis()` — effectively unique per call, so multiple notifications stack rather than replace.
- iOS: create one `UNNotificationCategory`/channel-equivalent isn't required (iOS doesn't have Android "channels" for local notifications in the same sense, though you can use `UNNotificationCategory` for actionable notifications if ever needed — not used here). Use `UNMutableNotificationContent` for each call with a unique `UNNotificationRequest` identifier (e.g. `UUID().uuidString` or timestamp) so notifications stack like Android's timestamp-ID scheme. Trigger with near-immediate delivery (`UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)`, since `nil` trigger reserved for certain contexts — verify with a very small positive interval to fire "now"). No auto-cancel equivalent needed; iOS notifications auto-dismiss/persist per system Notification Center behavior which is close enough.

## 5. Voice recording format & audio return to JS (recap with specifics)

- **Codec**: AAC (`MediaRecorder.AudioEncoder.AAC`).
- **Container**: MPEG-4 / `.m4a` (`MediaRecorder.OutputFormat.MPEG_4`).
- **Sample rate**: 44100 Hz.
- **Bitrate**: 64000 bps.
- **Audio source**: `VOICE_RECOGNITION` (a tuned mic source for speech, may apply AGC/noise suppression depending on device).
- **Mono/stereo**: not explicitly set on Android `MediaRecorder` (defaults to device/encoder default, typically mono for voice source) — for iOS, use `AVNumberOfChannelsKey: 1` (mono) to match typical behavior.
- **Return path to JS**: base64 `data:audio/mp4;base64,...` data URL (legacy path, currently the only path actually exercised) wrapped in a JSON payload `{audio, audioMime:"audio/mp4", durationMs, transcript}`, itself JSON-string-quoted once more, delivered via `window.handleAndroidVoiceRecording(payloadJsonString)`.
- **MIME string always reported as `"audio/mp4"`** regardless of container nuance — iOS should report the same string for JS compatibility even though `.m4a`/AAC-in-MP4 is technically `audio/mp4` or `audio/x-m4a` depending on convention; match the exact string `"audio/mp4"`.

## 6. Speech recognition flow (recap)

Two distinct uses of `SpeechRecognizer`, both configured identically (language `zh-HK`, `LANGUAGE_MODEL_FREE_FORM`, partial results on, max 3 results, prompt `"請用粵語講出要傳送給家人的訊息"`):

1. **Live recording transcript** (started in parallel with `MediaRecorder` during `startVoiceRecordingInternal`): purely for producing a `transcript` string to accompany the just-recorded audio; runs concurrently with mic capture; result captured into `latestTranscript` via `onPartialResults`/`onResults`, consumed 1200ms after `finishVoiceRecording` is called.
2. **Received-audio transcription** (`transcribeReceivedVoice`): transcribes a *pre-recorded* data-URL audio clip by writing it to a temp file, starting the recognizer, and — once `onReadyForSpeech` fires — playing that file's audio out loud via `MediaPlayer` so the recognizer "hears" it; stops listening 900ms after playback completes; result delivered via `handleAndroidVoiceTranscript`.

On iOS, use `SFSpeechRecognizer`/`SFSpeechAudioBufferRecognitionRequest` for the live case (feed the same audio tap used for `AVAudioRecorder`, or run a parallel `AVAudioEngine` tap) and `SFSpeechURLRecognitionRequest` for the received-audio case (directly point at the file, no play-out-loud hack needed — a structural simplification available on iOS). Preserve exact callback names/shapes: `handleAndroidVoiceTranscript({messageId, transcript, error})` and reuse `"speech-unavailable"` as the sentinel error string when recognition is unavailable/unauthorized.

## 7. Google Sign-In flow (recap)

- Uses **Credential Manager API** (`androidx.credentials`) with `GetGoogleIdOption` configured with `setServerClientId` = the **Web** OAuth client ID (`google_web_client_id` string resource: `747682384006-7inn73tbprlcv10cv831koabfispr89l.apps.googleusercontent.com`), `setFilterByAuthorizedAccounts(false)`, `setAutoSelectEnabled(true)`.
- The token that reaches JS is the **Google ID token (JWT)**, extracted from a `GoogleIdTokenCredential`, delivered via `window.handleAndroidGoogleCredential(idToken)`.
- Backend (`/api/auth/google`) verifies this ID token server-side — so the iOS client must produce an ID token whose audience/verification is compatible with that same backend verification logic (likely checks the token's `aud` claim against the web client ID, or accepts multiple client IDs — check `scripts/local-api-server.js`'s Google auth handler for exact audience validation rules before wiring the iOS Google Sign-In SDK, since iOS typically has its own iOS-type OAuth client ID and you need the resulting ID token's audience to still be acceptable server-side, or configure the iOS Google Sign-In SDK to also pass/request the web client ID as the "server client ID" so the ID token's audience matches, mirroring exactly what `GetGoogleIdOption.setServerClientId` does on Android).
- Errors are all funneled to `window.handleAndroidGoogleError(message)` with Chinese messages: unavailable/unconfigured client ID, cancelled/failed sign-in, or failed parse of credential.
- Logout calls `clearGoogleCredentialState()` (fire-and-forget, no callback) — iOS: `GIDSignIn.sharedInstance.signOut()`.

## 8. Media API config usage

`setMediaApiConfig(apiBase, authToken)` stores config for uploading voice recordings via `POST <apiBase>/api/media/upload` (multipart, field `file`, filename `recording.m4a`, `Content-Type: audio/mp4`, optional `Authorization: Bearer <authToken>`), expecting HTTP 201 and JSON `{mediaUrl}`. **As established in §2.10, this is currently dead code — never invoked by `index.html`.** Implement it for iOS parity/future use but do not rely on it being exercised.

## 9. Download/install update flow (recap)

Downloads an APK via HTTP(S) with manual redirect handling and a `Referer: https://github.com` header, saves to app-external Downloads dir as `beckonstars-update.apk`, then fires either `ACTION_INSTALL_PACKAGE` (API ≥ 24, via `FileProvider` content URI) or `ACTION_VIEW` on the APK MIME type (older API). **No JS callback of any kind, success or failure** — this is fire-and-forget with only `Log.d`/`Log.e` diagnostics. Not portable to iOS as a self-install mechanism (see §2.11) — the JS contract itself imposes no callback requirement, so the iOS shell has full latitude to reimplement this as an App Store/TestFlight redirect or a no-op, as long as `downloadAndInstallUpdate(url)` remains callable from JS without erroring.

## 10. Runtime permissions requested

From `AndroidManifest.xml`:
- `INTERNET`, `ACCESS_NETWORK_STATE` — always granted, no runtime prompt (iOS: no manifest equivalent needed for HTTP(S), only ATS config).
- `POST_NOTIFICATIONS` (API 33+ runtime-prompted) — iOS: `UNUserNotificationCenter` authorization request (`.alert`, `.sound`, `.badge`).
- `RECORD_AUDIO` (API 23+ runtime-prompted) — iOS: `NSMicrophoneUsageDescription` in Info.plist + `AVAudioSession`/`AVAudioApplication` record permission request.
- `VIBRATE` — normal permission, no runtime prompt; iOS haptics need no Info.plist entry.
- `WRITE_EXTERNAL_STORAGE` (maxSdkVersion 28 only — scoped storage makes it unnecessary API 29+) — iOS: `NSPhotoLibraryAddUsageDescription` in Info.plist + `PHPhotoLibrary` add-only authorization request, needed for `saveImageToGallery`.
- `REQUEST_INSTALL_PACKAGES` — for the self-update APK install flow; no iOS equivalent (App Store/TestFlight only).
- Also implicitly needed: camera access for `ACTION_IMAGE_CAPTURE` — Android doesn't declare a `CAMERA` permission in the manifest here (curiously — camera capture via `ACTION_IMAGE_CAPTURE` intent delegates to the Camera app, which needs its own permission, not the calling app's) but iOS **does** require `NSCameraUsageDescription` in Info.plist if you invoke `UIImagePickerController(sourceType: .camera)` directly, and `NSPhotoLibraryUsageDescription`/`NSPhotoLibraryAddUsageDescription` for picker/save flows respectively. Also add `NSSpeechRecognitionUsageDescription` for `SFSpeechRecognizer` authorization (no Android equivalent needed since on-device `SpeechRecognizer` doesn't require a separate manifest permission beyond `RECORD_AUDIO`).

## 11. `FileProvider` / file-paths note

Android uses a `FileProvider` (authority `<applicationId>.fileprovider`, config `res/xml/file_paths.xml`) to safely expose cache-dir files (camera photo, shared AI images) to other apps via content URIs with granted read/write permissions. iOS has no equivalent content-URI/permission-grant system — sharing/opening files from your own sandbox via `UIActivityViewController`/`UIDocumentInteractionController` works directly with local file URLs without needing a provider abstraction, so this piece of Android plumbing has no direct iOS counterpart to replicate; just ensure temp files used for camera capture / image sharing live in an app-writable temp/cache directory (e.g. `FileManager.default.temporaryDirectory`).

## 12. Summary table — every JS-visible callback function name and its exact payload

| JS function called from native | Args | Payload shape |
|---|---|---|
| `window.setAndroidNotificationPermission` | `(permission: string)` | `"granted"` \| `"denied"` |
| `window.handleAndroidGoogleCredential` | `(idToken: string)` | raw Google ID token JWT string |
| `window.handleAndroidGoogleError` | `(message: string)` | Chinese error string |
| `window.handleAndroidVoiceRecording` | `(payloadJsonString: string)` | JSON string of `{audio?, audioUrl?, audioMime:"audio/mp4", durationMs:number, transcript:string}` |
| `window.handleAndroidVoiceError` | `(message: string)` | Chinese error string |
| `window.handleAndroidVoiceTranscript` | `(payloadJsonString: string)` | JSON string of `{messageId:string, transcript:string, error:string}` |
| `window.handleAndroidImageSaveResult` | `(success: boolean, message: string)` | boolean literal + Chinese string (reused for both save-to-gallery and share failures) |
| `window.handleAndroidBackButton` (JS→native direction is reversed here — native calls into this to ask JS if it handled back) | none | returns `true`/`false` stringified, native reads it via `evaluateJavascript` result callback string comparison `"true".equals(handled)` |

All payload-carrying callbacks funnel through `window.<name> && window.<name>(...)` — always null-safety-guarded, so the iOS shim only needs to check the function exists before calling, matching the same defensive pattern already present in the web app.