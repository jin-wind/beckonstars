# GitHub Actions Android 構建故障排除

## 常見問題

### 1. `./gradlew: No such file or directory`

**原因**: 工作流無法找到 gradlew 文件

**解决方案**:
- ✅ 已在工作流中添加 `chmod +x android/gradlew` 步驟
- ✅ 使用 `working-directory: ./android` 確保正確的工作目錄
- 確保 `android/gradlew` 文件在 Git 中被正確追蹤

### 2. `Android Gradle plugin requires Java 17 to run`

**原因**: 系統 Java 版本低於 17

**解决方案**:
- 🔴 本地開發: 需要手動安裝 Java 17+
  ```bash
  # macOS
  brew install java17
  
  # Ubuntu
  sudo apt-get install openjdk-17-jdk
  
  # Windows - 使用 Chocolatey
  choco install openjdk17
  ```

- 🟢 GitHub Actions: 已在工作流中配置 JDK 17
  ```yaml
  - name: Set up JDK 17
    uses: actions/setup-java@v4
    with:
      java-version: '17'
      distribution: 'temurin'
  ```

### 3. `Failed to apply plugin 'com.android.application'`

**原因**: Android Gradle Plugin 版本或依賴問題

**解决方案**:
```bash
cd android
./gradlew clean
./gradlew --refresh-dependencies assembleDebug
```

### 4. Build 超時或記憶體不足

**原因**: GitHub Actions 默認內存可能不夠

**臨時解决方案**:
在工作流中增加內存限制：
```yaml
- name: Build Debug APK
  env:
    GRADLE_OPTS: "-Xmx2048m"
  run: cd android && ./gradlew assembleDebug
```

## 本機構建指南

### 快速構建

```bash
# 使用提供的構建腳本
chmod +x build-apk.sh
./build-apk.sh
```

### 手動構建

```bash
# 進入 Android 目錄
cd android

# 清理之前的構建
./gradlew clean

# 構建 Debug APK
./gradlew assembleDebug

# 輸出 APK 位置
# android/app/build/outputs/apk/debug/app-debug.apk
```

### 指定 Java 版本

如果系統有多個 Java 版本：

```bash
# Linux/macOS
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd android && ./gradlew assembleDebug

# Windows PowerShell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
cd android; .\gradlew assembleDebug
```

## GitHub Actions 故障排除

### 查看構建日誌

1. 前往 [GitHub Actions](../../actions)
2. 點擊最新的工作流運行
3. 展開 `Build Debug APK` 步驟查看詳細日誌

### 強制重新運行

1. 前往失敗的工作流運行
2. 點擊 `Re-run failed jobs` 或 `Re-run all jobs`

### 手動觸發構建

```bash
# 通過 GitHub CLI
gh workflow run android-build.yml --ref main

# 或透過 GitHub 網頁界面
# Actions → Android Build → Run workflow
```

## 驗證構建

### 檢查 APK 簽署

```bash
jarsigner -verify -verbose android/app/build/outputs/apk/debug/app-debug.apk
```

### 安裝到設備

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 測試應用

```bash
adb shell am start -n hk.beckonstars.app/.MainActivity
```

## 優化構建速度

### 1. 啟用 Gradle 守護程序
```bash
cd android && ./gradlew --daemon assembleDebug
```

### 2. 並行構建
在 `gradle.properties` 中添加：
```properties
org.gradle.parallel=true
org.gradle.workers.max=4
```

### 3. 離線構建（如果依賴已緩存）
```bash
cd android && ./gradlew --offline assembleDebug
```

## 相關資源

- [Android Gradle Plugin Release Notes](https://developer.android.com/studio/releases/gradle-plugin)
- [Gradle 官方文檔](https://docs.gradle.org/)
- [GitHub Actions 文檔](https://docs.github.com/en/actions)
