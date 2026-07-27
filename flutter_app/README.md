# Beckon Stars Flutter client

This directory contains the native Flutter client for Beckon Stars. It is a work-in-progress replacement path for the current WebView shells and currently implements a minimal text-first flow:

- Email/password login and registration
- Create or join a family
- Read and send text chat messages
- Read and create text memories
- View almanac data
- Change API endpoint and log out

The existing `web/`, `android/`, and `ios/` WebView apps remain the production path until this client reaches feature parity.

## Prerequisites

- Flutter stable with Dart SDK `>=3.5.0 <4.0.0`
- Android SDK for APK/emulator builds
- A running Beckon Stars API server

From the repository root, start the local API server when developing locally:

```powershell
npm run api-server
```

## Run locally

```powershell
cd flutter_app
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8787
```

Use `http://10.0.2.2:8787` for an Android emulator to reach an API server running on the Windows host. On a physical device, use the host machine's LAN IP address or the deployed API URL.

The app defaults to:

```text
http://144.79.170.102:8787
```

You can override it at build/run time:

```powershell
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:8787
```

You can also change the API endpoint from the app's login or settings screen.

## GitHub Actions only

If Flutter is not installed on your Windows machine, you can rely on GitHub Actions for validation. The workflow generates Android/iOS platform scaffolding in CI with:

```bash
flutter create --platforms=android,ios .
```

Then it runs analyze, tests, and a debug APK build. This keeps the repository lightweight while still proving the Flutter app can be built remotely.

## Checks

Run these before committing Flutter changes if Flutter is installed locally:

```powershell
cd flutter_app
flutter pub get
flutter analyze
flutter test
flutter build apk --debug
```

## CI artifact

The `Flutter build` GitHub Actions workflow runs analyze, tests, and a debug APK build. Its artifact is uploaded as `flutter-app-debug-apk` from:

```text
flutter_app/build/app/outputs/flutter-apk/app-debug.apk
```
