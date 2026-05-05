# 星喚 APK 版本

這個專案現在多了一個 `android/` Android WebView APK 版本。它會把現有 `index.html` 打包到 APK 裡，所以畫面和互動 UI 會沿用原本的網頁版本。

## Build

```powershell
cd android
.\gradlew.bat assembleDebug
```

輸出：

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## 安裝到手機

```powershell
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n hk.beckonstars.app/.MainActivity
```

## 現況

- UI 保持原本 `index.html`。
- APK 以 Android WebView 載入本地 assets。
- APK 目前會連到自架 API：`http://beckonstars.pppjj.dpdns.org`。
- PWA 安裝流程在 APK 中會自動停用。
- 通知按鈕已接到 Android 原生通知權限和本機通知橋接。
