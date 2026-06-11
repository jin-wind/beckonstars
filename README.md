# 星喚 Beckon Stars

一個家庭日曆、聊天與回憶同步的 **Android App**，採用自託管 API 伺服器架構。

## 📱 項目架構

```
┌─────────────────────────────────────────────────────┐
│           星喚 (Beckon Stars)                        │
│          Android APK (WebView)                       │
│  ┌─────────────────────────────────────────────────┐│
│  │  index.html as asset / Native Linking           ││
│  └─────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────┤
│              Self-Hosted API Server                 │
│           (localhost:8787 或遠端伺服器)              │
└─────────────────────────────────────────────────────┘
```

## 🚀 快速開始

### 環境準備

- **Node.js 16+**
- **Android Build Tools** (如要編譯 APK)
- **Git**

### 1. 安裝依賴

```bash
cd /workspaces/beckonstars
npm install
```

### 2. 開發模式 - 本機伺服器

啟動 API 伺服器（集成於此項目）：

```bash
npm run api-server
```

伺服器將在 `http://localhost:8787` 啟動，數據存儲在 `data/server-db.sqlite`（SQLite 數據庫）。

> **性能優化**：項目已從 JSON 文件遷移到 SQLite，API 響應速度提升 20-60 倍。如需從舊 JSON 遷移，運行：
> ```bash
> npm run migrate-to-sqlite
> ```
> 詳見 [SQLITE-MIGRATION.md](./SQLITE-MIGRATION.md)

### 3. 開始開發

修改 Android assets 中的 `index.html` 後重新構建 APK。

## 📦 構建 Android APK

### 前置要求

- Java JDK 11+
- Gradle (項目內含 `gradlew`)

### 構建步驟

```bash
cd android
./gradlew assembleDebug
```

輸出：
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### 安裝到裝置

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n hk.beckonstars.app/.MainActivity
```

## 🤖 自動化構建 (GitHub Actions)

每次推送到 `main` 分支或提交 Pull Request 時，GitHub Actions 會自動構建 APK。

### 構建觸發條件

- 推送到 `main` 分支
- Pull Request 到 `main` 分支
- 手動觸發 (Workflow Dispatch)

### 下載構建成果

1. 進入 [Actions 頁面](../../actions)
2. 選擇最新的運行記錄
3. 在 **Artifacts** 下載 `app-debug` (Debug APK)

### 標籤發佈

推送帶版本號的 Git tag 時，自動建立 GitHub Release：

```bash
git tag v1.0.0
git push origin v1.0.0
```

### 故障排除

若構建失敗，查看 [GitHub Actions 故障排除指南](GITHUB_ACTIONS_TROUBLESHOOTING.md)

## 🔌 API 伺服器配置

### 本機開發 API

編輯 `scripts/local-api-server.js`，支持的端點：

- `POST /api/families/:familyId/connect` - 連接家庭
- `POST /api/auth/google` - Google 登入 / 自動註冊
- `GET /api/families/:familyId/messages` - 獲取訊息
- `POST /api/families/:familyId/messages` - 發送訊息
- `GET /api/families/:familyId/memories` - 獲取回憶
- `POST /api/families/:familyId/memories` - 保存回憶

Google 登入只支援 Android APK 原生流程：APK 透過 Android Credential Manager 取得 Google ID token，再交給 `POST /api/auth/google` 換取本 app 的 JWT。伺服器 `.env` 的 `GOOGLE_CLIENT_ID` 必須和 APK `google_web_client_id` 使用同一個 Web OAuth Client ID。

### 遠端伺服器部署

Android APK 預設連接遠端伺服器：

```javascript
const selfHostedApiBase = 'http://144.79.170.102:8787';
```

如需修改伺服器地址，編輯 `android/app/src/main/assets/index.html` 中的配置。

## 📂 項目結構

```
├── android/                  # Android APK 源碼
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml
│   │   ├── java/hk/beckonstars/app/
│   │   │   └── MainActivity.java    # WebView 入口
│   │   ├── assets/                  # index.html、manifest、sw.js、icons
│   │   └── res/                     # 圖標和資源
│   └── build.gradle
│
├── scripts/
│   ├── local-api-server.js   # 本機 API 伺服器
│
├── icons/                    # App 圖標素材
└── package.json              # npm 依賴
```

## 🛠️ 主要依賴

- **Node.js** - 本機 API 伺服器
- **Tailwind CSS** - UI 框架

## 🔄 開發工作流程

### 本機開發

1. 修改 `android/app/src/main/assets/index.html` 或其他 UI 文件
2. 開啟 `npm run api-server` 測試 API
3. 重新構建 APK 並安裝到裝置測試

### 部署到 Android

1. 確認 assets 中的 `index.html` 為最新版本
2. 執行 `cd android && ./gradlew assembleDebug`
3. 透過 `adb install` 推送到裝置

## ⚠️ 重要注意事項

### 本機 API 伺服器

- 沒有 HTTPS
- 沒有身份驗證機制
- 數據存儲在本機 JSON 檔
- **僅用於開發/測試**

### 生產環境建議

- 使用 HTTPS 伺服器
- 啟用正式身份驗證
- 改用數據庫而非 JSON 檔
- 實施完整的 API 安全機制

## 📱 測試家庭共享功能

1. 在兩台 Android 裝置上安裝 APK（或用模擬器）
2. 輸入同一個家庭碼連接
3. 訊息應即時同步

## 🐛 故障排除

### Android APK 打包失敗

```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

### API 伺服器連線失敗

檢查防火牆是否開放 8787 端口：
```bash
netstat -an | grep 8787
```

## 📖 更多文檔

- [APK 構建指南](APK_BUILD.md) - 詳細的 APK 打包流程
- [Android 簽署指南](ANDROID_SIGNING.md) - 配置 Release APK 簽署
- [自託管伺服器部署](SELF_HOSTED_SERVER.md) - 遠端伺服器部署說明

## 📄 許可證

此項目為示範應用，請根據需要修改和部署。
