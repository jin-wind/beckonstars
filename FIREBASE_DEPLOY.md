# 星喚 Beckon Stars Firebase 部署教學

這個版本已經支援 Firebase Hosting + Anonymous Auth + Firestore 即時聊天，並加入 Android PWA + Firebase Cloud Messaging 推送通知骨架。未填 Firebase config 前，網頁會自動保留本機 demo 模式；填好 config 後，兩部手機用同一個家庭碼就可以互相收發訊息。

目前推送通知採用「免費 Firebase Hosting/Firestore + 你自己的電腦當本機推送服務器」方案，所以不用 Firebase Blaze plan，也不用部署 Cloud Functions。你的電腦只要開著 `push-worker`，它就會監聽 Firestore 新訊息並代替 Cloud Functions 發送 FCM 通知。

## 1. 建立 Firebase Project

1. 到 https://console.firebase.google.com/ 建立新 project。
2. Project 名稱可以用 `beckon-stars` 或你自己的名字。
3. Google Analytics 可以先關閉，demo 不需要。

## 2. 開啟 Authentication

1. Firebase Console 左側選 `Authentication`。
2. 按 `Get started`。
3. 到 `Sign-in method`。
4. 啟用 `Anonymous`。
5. 儲存。

## 3. 建立 Firestore Database

1. 左側選 `Firestore Database`。
2. 按 `Create database`。
3. 先選 `Start in production mode`。
4. Region 可選接近香港的地區，例如 `asia-east2`；如果沒有就選 `asia-east1` 或其他亞洲區。
5. 建立完成後，之後會用本專案的 `firestore.rules` 部署安全規則。

## 4. 取得 Web App Firebase Config

1. Firebase Console Project Overview 按 `</>` Web app。
2. App nickname 填 `beckon-stars-web`。
3. 不需要勾 Firebase Hosting，因為我們會用 CLI 部署。
4. 複製 `firebaseConfig` 內的值。
5. 打開 `index.html`，找到：

```js
const firebaseConfig = {
    apiKey: 'PASTE_YOUR_API_KEY_HERE',
    authDomain: 'PASTE_YOUR_PROJECT_ID.firebaseapp.com',
    projectId: 'PASTE_YOUR_PROJECT_ID',
    storageBucket: 'PASTE_YOUR_PROJECT_ID.appspot.com',
    messagingSenderId: 'PASTE_YOUR_MESSAGING_SENDER_ID',
    appId: 'PASTE_YOUR_APP_ID'
};
```

把 Firebase Console 給你的值貼入去。

## 5. 開啟 Android PWA 背景推送

如果你想做到其中一邊沒開網頁也收到通知，需要設定 Firebase Cloud Messaging。

1. Firebase Console 左側選 `Project settings`。
2. 打開 `Cloud Messaging` 分頁。
3. 找到 `Web Push certificates`。
4. 如果沒有 key，按 `Generate key pair`。
5. 複製產生出來的 key。
6. 打開 `index.html`，找到：

```js
const firebaseMessagingVapidKey = 'PASTE_FIREBASE_WEB_PUSH_CERTIFICATE_KEY_HERE';
```

把剛才複製的 Web Push certificate key 貼入去。

手機使用時要用 Android Chrome 打開 Hosting URL，允許通知，並加入主畫面成 PWA。之後另一部手機發訊息時，本機推送服務器會推送通知給同家庭其他成員。

## 6. 安裝 Firebase CLI

先確認有 Node.js。沒有的話安裝 LTS 版：https://nodejs.org/

在 VS Code terminal 執行：

```powershell
npm install -g firebase-tools
firebase login
```

登入你建立 Firebase project 的 Google 帳號。

## 7. 綁定 Project

在這個資料夾執行：

```powershell
firebase use --add
```

選你剛建立的 Firebase project，alias 可以填：

```text
default
```

## 8. 安裝本機推送服務器依賴

第一次啟動推送服務器前，先在專案根目錄安裝依賴：

```powershell
npm install
```

## 9. 下載 Firebase Admin Service Account Key

本機推送服務器需要 Firebase Admin 權限，才可以讀 Firestore 並發 FCM。

1. Firebase Console 左側按 `Project settings`。
2. 打開 `Service accounts` 分頁。
3. 按 `Generate new private key`。
4. 下載 JSON 檔。
5. 把檔案放到這個專案根目錄，改名為：

```text
serviceAccountKey.json
```

這個檔案是私密憑證，已經被 `.gitignore` 排除，不要上傳到 GitHub，也不要放到 Firebase Hosting。

## 10. 部署 Firestore Rules 和網站

因為現在不用 Cloud Functions，所以不要部署 `functions`：

```powershell
firebase deploy --only hosting,firestore:rules
```

完成後 terminal 會顯示 Hosting URL，例如：

```text
https://你的-project-id.web.app
```

## 11. 啟動本機推送服務器

部署網站後，在你的電腦開一個 terminal，保持它長期開著：

```powershell
npm run push-worker
```

正常會看到類似：

```text
Using service account: D:\Code\星喚\serviceAccountKey.json
Listening for new messages in project: beckon-stars
Initial Firestore snapshot loaded. New messages from now on will trigger push notifications.
```

如果你之後把專案搬到真正服務器，只要在服務器上放同一個 `serviceAccountKey.json`，安裝 Node.js 和依賴，然後同樣執行 `npm run push-worker` 即可。正式長期運行時建議用 PM2、systemd 或 Docker 讓它自動重啟。

## 12. 兩部手機測試方法

1. 手機 A 打開 Hosting URL。
2. 選其中一個身份，例如長者，完成個人資料。
3. 選 `建立新日曆`，記下 6 位家庭碼。
4. 手機 B 打開同一條 Hosting URL。
5. 選另一個身份，例如子女。
6. 選 `加入現有日曆`，輸入手機 A 的家庭碼。
7. 兩部手機進入聊天頁。
8. 任一方送訊息，另一部手機應該會即時收到。
9. 在兩部 Android 手機都按頁面右上角通知按鈕，允許通知。
10. 把其中一部手機的 PWA 關掉或切到背景。
11. 確認你的電腦 terminal 正在執行 `npm run push-worker`。
12. 另一部手機再送訊息，背景那部手機應該收到 Android 系統通知。

## Present 時可以這樣講

目前版本已部署到 Firebase Hosting，使用 Firebase Anonymous Auth 識別每部手機，Firestore 用 familyId 分隔不同家庭聊天室，並透過即時 listener 讓兩部手機同步訊息。Android PWA 會把 FCM token 存到家庭成員資料；本機 Node.js 推送服務器監聽 Firestore 新訊息後，透過 Firebase Cloud Messaging 推送給其他成員，即使另一部手機沒有開著聊天頁，也能收到系統通知。這個架構之後可以直接搬到正式服務器長期運行。

## 注意

- 這版聊天已經是真雲端同步。
- Android PWA 背景推送需要 HTTPS Hosting、通知權限、Web Push certificate key，並且本機推送服務器要正在運行。
- 如果你的電腦關機、斷網，或者 `npm run push-worker` 停止，聊天仍會即時同步，但背景推送通知不會發出。
- 回憶、積分、獎勵仍保留本機 demo 儲存；下一步可以同樣搬到 Firestore。
- 匿名登入適合 demo / prototype；正式上架建議改 Email、電話或 Google 登入。
