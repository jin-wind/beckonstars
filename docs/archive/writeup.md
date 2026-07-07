# 星喚 (Beckon Stars) — 技術方案與開發記錄

## 項目概述

星喚是一個面向家庭的日曆、聊天與回憶同步 Android App。採用 **Android WebView + 自託管 Node.js API** 的架構，前端為單一 `index.html` 文件，後端為 `scripts/local-api-server.js`，數據以 JSON 文件持久化。

## 整體架構

```
┌───────────────────────────────────────────────────┐
│              Android APK (WebView)                │
│  ┌─────────────────────────────────────────────┐  │
│  │  index.html (單頁應用)                      │  │
│  │  - Tailwind CSS 樣式                        │  │
│  │  - 原生 JS 狀態管理 + 觸控手勢               │  │
│  │  - Font Awesome 圖標                        │  │
│  └─────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────┤
│              Self-Hosted API Server               │
│         Node.js HTTP (localhost:8787)             │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ REST API     │  │ ffmpeg 影片生成           │  │
│  │ (CRUD)       │  │ (幻燈片 + 淡入淡出)      │  │
│  └──────────────┘  └──────────────────────────┘  │
├───────────────────────────────────────────────────┤
│         LLM API (fufu.iqach.top)                 │
│  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ 語音轉文字    │  │ 文字摘要                  │  │
│  │ (mimo-v2-omni)│  │ (mimo-v2.5)              │  │
│  └──────────────┘  └──────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

## 核心技術選型

| 層級 | 技術 | 原因 |
|------|------|------|
| 前端 | WebView + 單頁 HTML | 快速迭代，免原生 UI 開發 |
| 樣式 | Tailwind CSS | 原子化 CSS，高效原型 |
| 後端 | Node.js HTTP 模組 | 輕量、免框架依賴 |
| 存儲 | JSON 文件 | 開發階段簡單直接 |
| 影片 | ffmpeg CLI | 成熟穩定的多媒體處理 |
| AI 語音 | mimo-v2-omni | 支援音訊輸入的多模態模型 |
| AI 摘要 | mimo-v2.5 | 文本摘要能力 |
| 部署 | adb + gradlew | 本地開發快速部署 |

---

## 開發過程中遇到的難題與解決方案

### 1. 從 Firebase Web PWA 遷移到純 Android 自託管方案

**背景**：項目最初採用 Firebase + Web PWA 方案，使用 Cloudflare 代理域名指向 Firebase Functions 後端。

**問題**：Android WebView 中無法接收 Firebase Cloud Messaging (FCM) 推送通知。Web Push API 依賴 Service Worker，而 WebView 對 Service Worker 的支援不完整，導致消息推送完全失效。

**決策**：放棄 Firebase 方案，改為自託管 Node.js API 伺服器 + Android 原生推送。

**遷移過程**：
1. 移除 Firebase 依賴（`firebase.json`、`functions/` 目錄等）
2. 建立 `scripts/local-api-server.js` 自託管 API，數據存於 `data/server-db.json`
3. APK 直接連接自託管伺服器，透過輪詢或其他機制同步消息
4. Cloudflare 代理因端口限制（僅轉發 80/443）無法使用 8787 端口，最終改用外網 IP 直連

**教訓**：WebView 環境下的推送通知是個坑。如需在 Android WebView 中實現推送，應優先考慮原生 Android 通道（如 Firebase Admin SDK + 原生 FCM）或自託管的長輪詢/WebSocket 方案，而非依賴 Web Push API。

---

### 2. AI 語音轉譯模型不匹配

**問題**：App 中錄音後的 AI 轉譯功能回傳 400 錯誤：`"Not supported model mimo-v2.5-omni"`。

**排查過程**：
1. 初始使用 `mimo-v2.5` 模型 → 返回 520 錯誤（HTML 錯誤頁），因為該模型不支援音訊輸入
2. 改用 `mimo-v2.5-omni` → 返回 400 模型不存在
3. 呼叫 `/v1/models` 端點列出所有可用模型

**解決**：發現正確的模型名稱是 `mimo-v2-omni`（不含 `.5`），修正後正常運作。

**教訓**：API 模型名稱容易混淆，應先查詢可用模型列表再使用。

---

### 3. 日曆切換閃爍問題

**問題**：切換日期或月份時，整個 App 閃爍一下。

**根因**：每次切換都呼叫 `render()` 重建整個 DOM，導致短暫白屏。

**解決**：引入 `updateCalendarContent()` 函數，只替換日曆容器的 innerHTML，不重建整個 App DOM。同時在 `requestAnimationFrame` 中恢復滾動位置和焦點。

---

### 4. 日曆滑動中途跳頁

**問題**：手指滑動到一半時，內容突然跳到另一個月/日，沒有跟手動畫。

**根因**：`render()` 在動畫完成前就被呼叫，替換了正在動畫中的 DOM 元素。

**解決**：採用「預渲染 + 動畫替換」策略：
1. 先生成新頁面的 HTML 字串
2. 創建新頁面 DOM 元素
3. 同時對舊頁面和新頁面執行 CSS 動畫（tearOut/tearIn）
4. 動畫結束後才更新 `state` 並執行 `render()`

```javascript
function doCalendarTransition(oldPage, container, dir, newHtml, onDone) {
    const newPage = document.createElement('div');
    newPage.innerHTML = newHtml;
    // 舊頁面 tearOut 動畫 + 新頁面 tearIn 動畫
    // 動畫結束後呼叫 onDone
}
```

---

### 5. 手撕日曆 vs 月曆的滑動行為差異

**問題**：用戶要求「手撕日曆模式左右滑動切換日期，月曆模式左右滑動切換月份」，但初始實現中兩者都是切換月份。

**解決**：分離兩個導航函數：
- `navigateCalendarSwipe(dir)`：根據當前模式決定行為
  - 手撕模式 → 切換日期（day +/- 1）
  - 月曆模式 → 切換月份
- `navigateCalendarMonth(dir)`：箭頭按鈕固定切換月份

觸控監聽器中根據當前模式呼叫對應函數。

---

### 6. 日曆底部圓點指示器誤導

**問題**：手撕日曆底部有一排小圓點，看起來像是頁面指示器，但實際功能是選擇日期。

**解決**：直接移除圓點 DOM 和相關事件綁定，簡化 UI。

---

### 7. 白屏崩潰（孤立代碼）

**問題**：編輯 `index.html` 後 App 打開即白屏。

**根因**：編輯過程中產生了孤立的 JavaScript 代碼塊（約 40 行），脫離了任何函數體，在瀏覽器解析時直接報錯。

**解決**：定位並刪除孤立代碼塊。這類問題在單文件大代碼庫中特別容易發生。

---

### 8. ffmpeg 影片生成的圖片處理

**問題**：用戶上傳的照片尺寸不一，直接拼接會導致影片比例異常。

**解決**：ffmpeg 濾鏡鏈中統一處理：
```
scale=720:1280:force_original_aspect_ratio=decrease,
pad=720:1280:(ow-iw)/2:(oh-ih)/2,
setsar=1,fps=30,format=yuv420p
```
- 等比縮放至 720x1280 內
- 黑色填充剩餘區域
- 強制 30fps + yuv420p 編碼格式（兼容性最佳）

---

### 9. 原生視頻控件風格不匹配

**問題**：`<video controls>` 使用 Android WebView 原生播放控件，與 App 整體設計風格不協調，且不會自動播放。

**解決**：完全自訂視頻播放器 UI：
- 隱藏原生控件（移除 `controls` 屬性）
- 自訂 play/pause 按鈕（居中大圓形 + Font Awesome 圖標）
- 底部漸層遮罩上的自訂進度條
- 時間顯示
- 點擊視頻任意位置 toggle 播放/暫停
- 播放後 2.5 秒自動隱藏覆蓋層
- 透過 `requestAnimationFrame` 中的 `initVideoPlayer()` 在 DOM 渲染後初始化事件綁定

---

### 10. WebView Cleartext 流量限制

**問題**：Android 9+ 預設禁止明文 HTTP 連接。

**解決**：在 `AndroidManifest.xml` 中設定 `android:usesCleartextTraffic="true"`，允許 HTTP 通訊。

---

### 11. Android 包名與 Activity 啟動

**問題**：使用 `com.example.starapp/.MainActivity` 啟動 App 失敗。

**原因**：`build.gradle.kts` 中定義的 `applicationId` 是 `hk.beckonstars.app`，而非 `com.example.starapp`。

**解決**：改用正確的完整類名：
```bash
adb shell am start -n hk.beckonstars.app/.MainActivity
```

---

## 關鍵實現細節

### 日曆手勢系統

```javascript
// 觸控流程
touchstart → 記錄起始位置和時間
touchmove  → 計算位移，決定方向鎖定
touchend   → 超過閾值 → 執行切換；不足 → 回彈
```

- 水平位移 > 30px 且 > 垂直位移 → 鎖定水平方向
- 手撕模式：位移 → 動畫偏移量（跟手）
- 月曆模式：位移 → 半透明預覽跟隨

### 影片生成流程

```
1. 從 DB 讀取當月帶 img 的回憶
2. 逐一下載/解碼 base64 圖片到臨時目錄
3. ffmpeg 命令：
   - 每張圖片循環 3 秒
   - xfade 淡入淡出轉場（0.5 秒）
   - 輸出 720x1280 H.264 MP4
4. 回傳影片 URL
5. 清理臨時文件
```

### App 狀態管理

採用簡單的全局 `state` 對象 + `render()` 函數模式：
- `state` 儲存所有 UI 狀態
- `render()` 根據 state 生成 HTML 並插入 DOM
- 事件處理透過 `data-action` 屬性委託
- 局部更新避免全量重繪（`updateCalendarContent()`）

---

## 部署流程

```bash
# 1. 重啟伺服器（載入新代碼）
cd D:/Code/星喚
taskkill //F //PID <old_pid>
node scripts/local-api-server.js &

# 2. 構建 APK
cd android
./gradlew.bat assembleDebug

# 3. 安裝到手機
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 4. 啟動 App
adb shell am start -n hk.beckonstars.app/.MainActivity
```

---

## 待辦與改進方向

- [ ] HTTPS 代理（Nginx/Caddy + Let's Encrypt）
- [ ] 背景音樂（影片生成加入 BGM）
- [ ] 正式數據庫替換 JSON 文件
- [ ] 身份驗證機制
- [ ] 推送通知
- [ ] 離線模式支援
