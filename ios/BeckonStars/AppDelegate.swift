import UIKit
import UserNotifications

/// 星喚 Beckon Stars — iOS 殼層入口。
///
/// 純程式化 window（無 Storyboard、無 Scene manifest），rootViewController
/// 為載入共用 web 核心的 WebViewController。
@main
final class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self

        let window = UIWindow(frame: UIScreen.main.bounds)
        // 與 web 核心一致的暖色背景（#FFF9F2），避免啟動白閃。
        window.backgroundColor = UIColor(red: 255.0 / 255.0, green: 249.0 / 255.0, blue: 242.0 / 255.0, alpha: 1.0)
        window.rootViewController = WebViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    /// App 在前景時也顯示本地通知橫幅與聲音
    /// （對齊 Android 通知在前景仍會彈出的行為，BRIDGE.md §2.3/§4）。
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
