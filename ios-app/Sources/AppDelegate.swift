import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = MainViewController()
        w.backgroundColor = .black
        w.makeKeyAndVisible()
        window = w
        application.isIdleTimerDisabled = true   // the headset has no touches: never let the screen sleep
        Updater.repo = "mazenDevloper/fit"; Updater.ipa = "Madar.ipa"; Updater.appName = "مدار"
        Updater.installShortcut()
        let fromShortcut = (launchOptions?[.shortcutItem] as? UIApplicationShortcutItem)?.type == "update"
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) { Updater.check(silent: !fromShortcut) }
        return true
    }

    func application(_ application: UIApplication, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {
        if shortcutItem.type == "update" { Updater.check(silent: false) }
        completionHandler(true)
    }

    func applicationWillEnterForeground(_ application: UIApplication) { Updater.check(silent: true) }

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        .allButUpsideDown   // each screen decides (home: any way; inside Madar: landscape)
    }
}
