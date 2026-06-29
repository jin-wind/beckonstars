# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

星喚 Beckon Stars is a family calendar/chat/memory Android app. The APK is a native Android WebView shell that loads a mostly self-contained HTML/JS app from Android assets and talks to a self-hosted Node API server.

Main moving parts:

- `android/app/src/main/assets/index.html` contains the web UI, app state, rendering, localStorage persistence, and API polling logic. It is currently the main application source.
- `android/app/src/main/java/hk/beckonstars/app/MainActivity.java` is the Android shell. It loads `file:///android_asset/index.html`, exposes `window.BeckonStarsAndroid`, and bridges notification permission, local notifications, camera/file chooser, voice recording, and native speech recognition back into JavaScript callbacks.
- `scripts/local-api-server.js` is a dependency-light Node HTTP server. It stores data in `data/server-db.json`, handles auth, family membership, messages, memories, almanac data, AI summaries, speech-to-text, and monthly summary video generation.
- `android/app/build.gradle` defines the APK build and a `syncWebAssets` `Copy` task wired into `preBuild`. That task copies root-level `index.html`, `manifest.webmanifest`, `sw.js`, and `icons/icon.svg` into `android/app/src/main/assets` if those root files exist. In this checkout the tracked app HTML is under Android assets, so be careful not to introduce root web files that unintentionally overwrite asset edits during Gradle builds.

## Common commands

### Install dependencies

```powershell
npm install
```

Use Node 18+ for local development: `scripts/local-api-server.js` uses global `fetch`.

### Run the API server

```powershell
npm run api-server
```

Defaults:

- Host/port: `0.0.0.0:8787`
- Database: `data/server-db.json`
- Health check: `Invoke-RestMethod http://127.0.0.1:8787/api/health`

Useful PowerShell overrides:

```powershell
$env:API_PORT = "8788"
$env:API_DB_PATH = "$PWD\data\dev-server-db.json"
$env:JWT_SECRET = "dev-fixed-secret"
npm run api-server
```

### Build the Android APK

From repository root on Windows:

```powershell
.\android\gradlew.bat -p android assembleDebug
```

Or from `android/`:

```powershell
.\gradlew.bat assembleDebug
```

Output:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

Install and launch on a connected device/emulator:

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n hk.beckonstars.app/.MainActivity
```

Clean/rebuild if Gradle state is stale:

```powershell
.\android\gradlew.bat -p android clean assembleDebug
```

### Tests and focused checks

There is no configured `npm test` script, lint script, or unit test runner in `package.json`.

Available focused scripts/checks:

```powershell
node scripts\test-azure-stt-v4.js                 # creates silent WAV and checks Azure STT endpoint
node scripts\test-azure-stt-v4.js path\to.wav    # checks Azure STT with a supplied WAV
node scripts\fix-db.js data\server-db.json       # validates/repairs a JSON DB file, backing up corrupt input
```

Azure STT checks require environment variables such as:

```powershell
$env:AZURE_STT_KEY = "..."
$env:AZURE_STT_REGION = "eastasia"
$env:AZURE_STT_LANGUAGE = "zh-HK"
```

For API changes, a practical smoke check is: start `npm run api-server`, call `/api/health`, then exercise the changed endpoint with `Invoke-RestMethod` or the APK/web UI.

## Server architecture notes

`scripts/local-api-server.js` uses Node's built-in `http` module rather than Express. Routing is a sequence of method/path checks inside one `http.createServer` callback.

Important server behavior:

- Environment config is read at startup. See `.env.example` and `API-SETUP.md` for the supported Azure/OpenRouter variables.
- `JWT_SECRET` defaults to a new random value on every process start. Set a fixed value for any environment where users should stay logged in across restarts.
- JSON storage is initialized and written through `ensureDb()`, `readDb()`, and `writeDb()`. `writeDb()` serializes writes through an in-process promise lock and renames a temp file over `API_DB_PATH`.
- The DB schema is informal. Current top-level keys include `families`, plus auth-related `users` and `usersByEmail` once users register.
- Family routes are under `/api/families/:familyId/...`; messages and memories are append-only arrays trimmed to recent limits.
- Audio transcription prefers Azure Speech-to-Text when `AZURE_STT_KEY` is configured, then falls back to the older OpenAI-compatible LLM audio route. Non-WAV input is converted with `ffmpeg`, so voice features and summary videos depend on `ffmpeg` being installed on the server host.
- Text summaries prefer OpenRouter when `OPENROUTER_API_KEY` is configured, then fall back to `LLM_SUMMARY_ENDPOINT` or the OpenAI-compatible `/chat/completions` configuration.
- `/videos/...` serves generated summary videos from `data/videos`.

Key endpoints currently implemented:

- `GET /api/health`
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/google`, `GET /api/auth/me`, `PUT /api/auth/profile`, `PUT /api/auth/password`
- `GET /api/almanac`
- `POST /api/summarize`
- `POST /api/families/:familyId/connect`
- `GET|POST /api/families/:familyId/messages`
- `POST /api/families/:familyId/messages/:messageId/transcribe|transcript|summarize`
- `GET|POST /api/families/:familyId/memories`
- `POST /api/families/:familyId/summary-video`

## Android/WebView architecture notes

`MainActivity.java` is intentionally thin and delegates UI to the HTML app. It is responsible for Android-only capabilities that browser JavaScript cannot reliably do inside a packaged WebView:

- WebView setup with JavaScript, DOM storage, file access, mixed-content compatibility, and the `BeckonStarsAndroid` JS interface.
- Runtime permissions for notifications and microphone.
- File chooser and camera capture via `FileProvider` (`android/app/src/main/res/xml/file_paths.xml`).
- Native voice recording to temporary `.m4a`, base64 data URL handoff to JavaScript, and speech recognition callbacks.
- Local notifications using the `beckon_stars_default` notification channel.

The manifest allows cleartext traffic because the configured self-hosted API uses HTTP. If moving to HTTPS-only production, review `android:usesCleartextTraffic` and the hard-coded API base.

## Front-end architecture notes

The HTML app uses inline JavaScript rather than a bundler/framework. State is held in the global `state` object and rendering is string-template driven through `render()` and helper render functions.

Important front-end behavior:

- `selfHostedApiBase` in `android/app/src/main/assets/index.html` is the server URL used by the APK/web app. Current value is a hard-coded remote HTTP server.
- `serverApi()` adds JSON headers and the JWT bearer token from `state.authToken`.
- Auth state and app state are persisted in localStorage under keys such as `beckon-stars-auth-token`, `beckon-stars-user`, and `beckon-stars-demo-state-v1`.
- Google login is APK-native only: Android Credential Manager returns a Google ID token to the HTML app through `BeckonStarsAndroid`, then the backend verifies it at `POST /api/auth/google` before issuing the app JWT.
- `subscribeFamilyMessages()` and `subscribeFamilyMemories()` poll the server every 3s and 5s respectively; there is no websocket layer.
- PWA install and push-notification paths are disabled or stubbed in APK contexts; Android notification behavior goes through `BeckonStarsAndroid`.
- Chat rendering has incremental refresh logic (`refreshVisibleContent()`) to avoid full chat rerenders while polling.

When changing front-end behavior, prefer following the existing single-file pattern unless the task explicitly includes a refactor. Verify changes in the APK path, not just a browser, when touching Android bridge interactions.

### Voice recording for memories (added 2026-06-22)

Memory voice recording reuses the existing `window.BeckonStarsAndroid.startVoiceRecording()` / `finishVoiceRecording()` / `handleAndroidVoiceRecording()` infrastructure used for chat voice messages.

**Key implementation details:**

- **State flags**: `state.recordingForMemory` (routing flag) and `state.isRecordingMemory` (UI state) distinguish memory recording from chat recording.
- **Data fields**: Android callback returns `recording.audio` (base64 data URL) or `recording.audioUrl` (media API URL). Check both fields, NOT `recording.dataUrl`.
- **Media upload**: In server mode, voice recordings are uploaded to `/api/media/upload` before saving the memory (like photos). This prevents 400 errors from large base64 payloads in POST body.
- **UI performance**: Avoid calling `render()` immediately after recording state changes. Use `setTimeout(() => render(), 50-100)` to reduce UI jumps and stuttering during Android's recording lifecycle.
- **Three UI states**: 
  1. Not recording: purple "開始錄音" button
  2. Recording: red pulsing "停止錄音" button with "正在錄製中..." text
  3. Completed: preview card showing duration with delete button
- **Modal lifecycle**: Reset `state.isRecordingMemory`, `state.recordingForMemory`, `state.pendingMemoryAudio`, and `state.pendingMemoryAudioDuration` when closing the addMemory modal.
- **Callback routing**: The `handleAndroidVoiceRecording` callback checks `state.recordingForMemory` first and returns early for memory recordings, preventing interference with chat voice message logic.

**Common pitfalls:**

- ❌ Don't use `showMessage()` after recording completion in a modal context - it overwrites `state.showModal` and closes the current modal.
- ❌ Don't check only `recording.dataUrl` - use `recording.audio || recording.audioUrl`.
- ❌ Don't send base64 audio directly to server - upload via media API first (server mode).
- ❌ Don't call `render()` synchronously during recording transitions - causes UI jumps.

## CI/release

GitHub Actions builds debug APKs with JDK 17:

- `.github/workflows/android-build.yml` runs on pushes to `main` affecting Android/icons/workflow files, PRs to `main`, and manual dispatch. It uploads `app-debug`.
- `.github/workflows/release.yml` runs on `v*` tags or manual dispatch and uploads `app-debug.apk` to a GitHub Release. It currently builds with `assembleDebug`, not a signed release variant.

## AI 圖片生成踩坑記錄

### 背景

應用原本使用 Gemini 舊主服務器（legacy）生成圖片，後來切換到 kklt 圖片 API（`https://tupian.kklt.lol`）。切換過程中遇到了以下問題，記錄下來避免重蹈覆轍。

### 問題一：本地改了代碼但沒推到 GitHub，遠程服務器一直跑舊版

**現象**：遠程服務器啟動日誌顯示 `🖼️ AI 圖片: kklt → legacy (https://tupian.kklt.lol)`，圖片請求先打 kklt、失敗後自動回退到 Gemini。看起來切換了但其實根本沒生效。

**原因**：有人在本地 `scripts/local-api-server.js` 裡移除了 fallback 邏輯，但只改了文件沒有 `git commit` + `git push`。遠程服務器 `git pull` 拉到的還是舊版代碼（commit `ebfb57c`），裡面有完整的 `callLegacyImageApi()` 和 fallback 機制。

**教訓**：
- 改完關鍵邏輯後一定要 commit 並 push，否則遠程服務器永遠拿不到新代碼
- 推完之後遠程要 `git pull && npm start` 才能生效
- 看啟動日誌就能判斷遠程跑的是哪個版本：有 `→ legacy` 就是舊版，只有 `kklt (https://tupian.kklt.lol)` 才是新版

### 問題二：kklt API Key 失效（401）

**現象**：日誌出現 `kklt-401: {"detail":{"error":"Key 无效或已失效"}}`，然後回退到 legacy Gemini 也報 `legacy-401: {"detail":"Invalid API key"}`。兩邊都失敗，圖片完全無法生成。

**原因**：`.env` 裡的 `DRAW_API_KEY` 過期或被吊銷。kklt 那邊的 key 有時效性，過期後需要續費或換新 key。

**排查方法**：
`ash
# 查 key 狀態和餘額
curl "https://tupian.kklt.lol/api/draw/me" \
  -H "X-Draw-Key: draw-你的key"
`

**教訓**：
- kklt 的 key 不是永久的，需要定期檢查餘額和有效期
- key 配置在遠程服務器的 `.env` 裡，更新後需要重啟服務
- `DRAW_API_KEY` 只能放服務器端環境變量，絕對不能暴露到前端

### 問題三：kklt 上游服務不穩定（502）

**現象**：key 有效的情況下仍然報錯：
- `kklt-502: {"detail":{"error":"上游未返回图片结果，请稍后重试"}}`
- `kklt-502: {"detail":{"error":"/backend-api/conversation/...Encountered invalidated oauth token for user...}}`

**原因**：kklt 本身是代理服務，後面對接的是某個 LLM 的圖片生成能力。上游 LLM 的 OAuth token 被撤銷或過期時，kklt 會返回 502。這不是我們的代碼問題，是 kklt 服務端的問題。

**處理方式**：等 kklt 修復上游問題，或者聯繫 kklt 提供方切換上游模型。代碼層面不需要改動，但要做好錯誤提示，讓用戶知道是服務暫時不可用而不是自己的問題。

### 問題四：`.env.example` 裡 fallback 默認開啟

**現象**：`.env.example` 裡寫了 `AI_IMAGE_ENABLE_FALLBACK=true`，照著配的人默認就開了 fallback。

**教訓**：
- 已經改成 `AI_IMAGE_ENABLE_FALLBACK=false`，並且移除了代碼中的 fallback 邏輯
- 即使 `.env` 裡還留著 `AI_IMAGE_ENABLE_FALLBACK=true`，新代碼也不會再回退到 legacy，因為 `callLegacyImageApi()` 和相關配置變量已被徹底刪除

### 當前架構（2026-06 更新）

圖片生成只走 kklt（`https://tupian.kklt.lol`），不再有任何 fallback 到 Gemini 的機制。

相關配置項（遠程服務器 `.env`）：
`
AI_IMAGE_PROVIDER=kklt
DRAW_API_BASE_URL=https://tupian.kklt.lol
DRAW_API_KEY=draw-你的key
DRAW_IMAGE_SIZE=3:4
DRAW_IMAGE_RESOLUTION=2K
`

關鍵代碼位置：`scripts/local-api-server.js`
- `callKkltImageApi()` — 調用 kklt API 的核心函數（約第 839 行）
- `generateAiImages()` — 入口函數，直接調用 kklt，無 fallback（約第 908 行）
- `/api/ai-image/generate` — HTTP 路由處理（約第 1689 行）
- 啟動時的配置檢查和日誌輸出（約第 2592 行）
