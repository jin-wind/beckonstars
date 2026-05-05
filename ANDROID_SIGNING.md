# Android APK 簽署指南

本文檔說明如何配置 Android 應用的簽署設置，以便構建正式版本的 APK。

## 生成密鑰庫 (Keystore)

### 步驟 1: 建立密鑰庫

運行以下命令生成密鑰庫文件：

```bash
keytool -genkey -v -keystore release.keystore -keyalg RSA -keysize 2048 -validity 10000 -alias beckon-stars
```

系統會提示你輸入：
- 密碼（建議保存在安全的地方）
- 組織名稱、位置等信息

### 步驟 2: 保存密鑰庫

將生成的 `release.keystore` 文件保存在安全位置，**不要提交到 Git**。

## 配置 Gradle 簽署

### 方法 1: 本機開發

在 `android/app/build.gradle` 中添加簽署配置：

```gradle
android {
    // ...existing config...
    
    signingConfigs {
        release {
            storeFile file('/path/to/release.keystore')
            storePassword System.getenv('KEYSTORE_PASSWORD') ?: 'your-password'
            keyAlias 'beckon-stars'
            keyPassword System.getenv('KEY_PASSWORD') ?: 'your-password'
        }
    }

    buildTypes {
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
        }
    }
}
```

然後運行：

```bash
./gradlew assembleRelease
```

### 方法 2: GitHub Actions 自動簽署

#### 產生 Base64 編碼的密鑰庫

```bash
base64 -i release.keystore -o keystore.base64
cat keystore.base64
```

#### 設置 GitHub Secrets

在 GitHub 倉庫設置中添加以下 Secrets：

1. **Settings** → **Secrets and variables** → **Actions**
2. 新增以下 Secrets：
   - `KEYSTORE_BASE64`: 密鑰庫的 Base64 編碼
   - `KEYSTORE_PASSWORD`: 密鑰庫密碼
   - `KEY_PASSWORD`: 密鑰密碼
   - `KEY_ALIAS`: `beckon-stars`

#### 更新 GitHub Actions Workflow

編輯 `.github/workflows/android-build.yml`，在 build 步驟前添加：

```yaml
- name: Decode Keystore
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: |
    echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/app/release.keystore

- name: Build Release APK
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  run: |
    cd android && ./gradlew assembleRelease \
      -Pandroid.injected.signing.store.file=app/release.keystore \
      -Pandroid.injected.signing.store.password=${{ secrets.KEYSTORE_PASSWORD }} \
      -Pandroid.injected.signing.key.alias=${{ secrets.KEY_ALIAS }} \
      -Pandroid.injected.signing.key.password=${{ secrets.KEY_PASSWORD }}
```

## 測試簽署

```bash
jarsigner -verify -verbose -certs android/app/build/outputs/apk/release/app-release.apk
```

## 常見問題

### Q: 忘記密碼？
**A**: 需要重新生成密鑰庫。刪除舊的並生成新的。

### Q: Keystore 過期？
**A**: 需要時間超過有效期後重新生成。建議設置較長的有效期（如 10000 天）。

### Q: 如何安裝已簽署的 APK？

```bash
adb install android/app/build/outputs/apk/release/app-release.apk
```

---

**安全提示**: 
- ⚠️ 切勿將 `release.keystore` 提交到版本控制系統
- ⚠️ 妥善保管密鑰庫密碼
- ⚠️ GitHub Secrets 中的敏感信息已加密
