# 星喚 Beckon Stars iOS 原生殼層

這個目錄包含 iOS 15+ 的薄殼 App。畫面與主要業務邏輯來自專案根目錄的 `web/` 共用核心；iOS 端以 `WKWebView` 載入 bundle 內的 `web/index.html`，並透過 `window.webkit.messageHandlers.beckonStars` 提供通知、觸覺、錄音、語音辨識、圖片保存與分享等原生能力。

## 前置需求

- macOS
- Xcode 15 或以上版本
- iOS 15.0 或以上的模擬器／真機
- 真機安裝需要有效的 Apple Developer Team 與簽名設定
- 選用：XcodeGen 2.38 或以上（只在需要由 `project.yml` 重生專案時使用）

Windows 無法安裝 Xcode 或編譯 iOS App；本目錄的 Swift 原始碼與專案檔需要移到 macOS 上建置。

## 開啟與建置

從專案根目錄執行：

```bash
open ios/BeckonStars.xcodeproj
```

然後在 Xcode：

1. 選取左側的 `BeckonStars` 專案，再選取 `BeckonStars` target。
2. 在 **Signing & Capabilities** 選擇你的 Apple Developer Team。
3. 確認 Bundle Identifier 為 `hk.beckonstars.app`。若該識別碼不屬於你的 Team，開發測試時先改成你擁有的唯一識別碼。
4. 選擇 iOS 15+ 模擬器或已信任的真機。
5. 按 **Run**（Command-R）。

命令列建置（仍需在 macOS 且已安裝 Xcode）：

```bash
xcodebuild \
  -project ios/BeckonStars.xcodeproj \
  -scheme BeckonStars \
  -sdk iphonesimulator \
  -configuration Debug \
  build CODE_SIGNING_ALLOWED=NO
```

真機首次使用通知、麥克風、語音辨識、相機或相簿時，iOS 會顯示系統權限提示。相機與相簿選擇由 WKWebView 對 `<input type="file">` 的內建選擇器處理，不另寫 picker bridge。

## Web 資源

Xcode 專案以 folder reference 引用 `../web`，並在 Resources build phase 中複製整個目錄。App bundle 內必須得到：

```text
web/index.html
web/css/
web/js/
web/vendor/
web/icons/
```

`WebViewController` 以 `Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web")` 找到入口，再用 `loadFileURL(..., allowingReadAccessTo: webDirectoryURL)` 載入。若畫面空白，先在 target 的 **Build Phases > Copy Bundle Resources** 確認藍色 `web` folder reference 仍存在。

## 使用 XcodeGen 重生專案

`project.yml` 是 `project.pbxproj` 的等效定義。專案檔損壞或需要機械式重生時，可在 macOS 安裝並執行：

```bash
brew install xcodegen
cd ios
xcodegen generate
open BeckonStars.xcodeproj
```

重生後請檢查：

- Deployment Target 是 iOS 15.0。
- Swift Language Version 是 Swift 5。
- Bundle Identifier 是 `hk.beckonstars.app`。
- `BeckonStars/Info.plist` 由 `INFOPLIST_FILE` 指定，且 `Generate Info.plist File` 為 `No`。
- `web` 是 folder reference，並位於 Copy Bundle Resources；bundle 內保留 `web/` 子目錄。

## v1 原生能力與限制

v1 支援：版本碼／通知權限快照、通知授權、近即時本地通知、兩擊式觸覺回饋、AAC/M4A 錄音、zh-HK 語音轉寫、保存圖片到相簿、分享圖片／圖片連結，以及保存 media API 設定。

v1 刻意不支援：

- Google 登入：`startGoogleSignIn`、`clearGoogleCredentialState` 不在 `window.__BeckonStarsIOS.supports`。web 端會透過 `Platform.supports()` 優雅降級。
- APK 自更新：`downloadAndInstallUpdate` 不在 supports。iOS 不允許 App 自行下載並安裝更新；正式版本應由 App Store／TestFlight 發佈。

另有兩項平台限制：

- 模擬器不具備與真機相同的相機、觸覺、麥克風和語音辨識能力，這些流程需用真機驗證。
- `SFSpeechRecognizer` 的可用性受裝置、語言支援、網路與使用者權限影響；不可用時 bridge 會回傳契約哨兵值 `speech-unavailable`。

## 日後加入 Google 登入

1. 在 Google Cloud Console 建立 iOS OAuth client，Bundle ID 設為 `hk.beckonstars.app`；同時確認後端 `/api/auth/google` 接受 iOS 流程產生的 ID token audience，或使用相容的 server client ID 設定。
2. 以 Swift Package Manager 加入官方 GoogleSignIn-iOS SDK（`https://github.com/google/GoogleSignIn-iOS`）。
3. 把 Google iOS client ID 與 URL scheme 加入 `Info.plist`，並在 `AppDelegate` 處理登入 redirect URL。
4. 在 `NativeBridge` 實作 `startGoogleSignIn` 與 `clearGoogleCredentialState`。成功必須呼叫 `window.handleAndroidGoogleCredential(idToken)`；失敗呼叫 `window.handleAndroidGoogleError(message)`。
5. 將兩個方法加入 `WebViewController.supportedBridgeMethods`，真機驗證登入、取消、失敗及登出清除狀態。

正式橋接契約見 `ios/BRIDGE.md`。
