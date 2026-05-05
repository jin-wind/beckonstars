#!/bin/bash

# Android Build Helper Script
# 用于本地構建 APK，確保 Java 環境正確

set -e

echo "🔍 检查构建环境..."

# 检查 Java 版本
if ! command -v java &> /dev/null; then
    echo "❌ 错误: 未找到 Java"
    echo "请安装 Java 17 或更高版本"
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | grep -oP '(?<=")\d+' | head -1)
echo "✓ Java 版本: $JAVA_VERSION"

if [ "$JAVA_VERSION" -lt 17 ]; then
    echo "⚠️  警告: 检测到 Java $JAVA_VERSION，但需要 Java 17+"
    echo "请更新 Java 或设置 JAVA_HOME 环境变量"
    echo ""
    echo "例如，在 Linux/Mac 上:"
    echo "  export JAVA_HOME=/usr/libexec/java_home -v 17"
    echo ""
    echo "或在 Windows PowerShell 上:"
    echo "  \$env:JAVA_HOME = 'C:\\Program Files\\Java\\jdk-17'"
fi

# 检查 gradlew 是否可执行
if [ ! -x "android/gradlew" ]; then
    echo "⚙️  使 gradlew 可执行..."
    chmod +x android/gradlew
fi

# 构建 Debug APK
echo ""
echo "🔨 构建 Debug APK..."
cd android
./gradlew clean assembleDebug

if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    echo ""
    echo "✅ APK 构建成功！"
    echo "📦 输出: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
    echo ""
    echo "💡 使用 adb 安装到设备:"
    echo "   adb install -r app/build/outputs/apk/debug/app-debug.apk"
else
    echo "❌ APK 构建失败"
    exit 1
fi
