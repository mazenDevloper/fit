import UIKit

/// «تحديث التطبيق»: checks the GitHub release for a newer build (build.txt = CI run number) and offers to
/// install it — through SideStore/AltStore when one is on the iPhone, otherwise by downloading the IPA.
enum Updater {
    static var repo = ""          // owner/repo
    static var ipa = ""           // asset name
    static var appName = ""
    static var current: Int { Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0") ?? 0 }
    private static var lastAuto = Date.distantPast

    static func latest() async -> (build: Int, ipa: URL, notes: String)? {
        guard let u = URL(string: "https://api.github.com/repos/\(repo)/releases/tags/ios-latest") else { return nil }
        var r = URLRequest(url: u, timeoutInterval: 15)
        r.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        guard let (d, _) = try? await URLSession.shared.data(for: r),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
              let assets = o["assets"] as? [[String: Any]] else { return nil }
        func url(_ n: String) -> URL? { (assets.first { $0["name"] as? String == n }?["browser_download_url"] as? String).flatMap(URL.init) }
        guard let ipaURL = url(ipa) else { return nil }
        var build = 0
        if let b = url("build.txt"), let (bd, _) = try? await URLSession.shared.data(from: b) {
            build = Int(String(decoding: bd, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        }
        return (build, ipaURL, (o["body"] as? String ?? "").prefix(300).description)
    }

    /// silent: only speak up when there is something new (at launch / coming back).
    @MainActor static func check(silent: Bool) {
        if silent { if Date().timeIntervalSince(lastAuto) < 6 * 3600 { return }; lastAuto = Date() }
        Task { @MainActor in
            let l = await latest()
            guard let l else { if !silent { alert("تعذّر الاتصال", "تأكد من الإنترنت ثم حاول مجدداً", []) }; return }
            if l.build <= current {
                if !silent { alert("\(appName) محدّث", "أنت على آخر نسخة (\(current))", []) }
                return
            }
            alert("نسخة جديدة \(l.build)", "عندك النسخة \(current). ثبّت الجديدة؟", [
                ("SideStore", { open("sidestore://install?url=" + enc(l.ipa)) }),
                ("AltStore", { open("altstore://install?url=" + enc(l.ipa)) }),
                ("تحميل الملف (iloader)", { UIApplication.shared.open(l.ipa) }),
            ])
        }
    }

    private static func enc(_ u: URL) -> String { u.absoluteString.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "" }
    @MainActor private static func open(_ s: String) {
        guard let u = URL(string: s) else { return }
        UIApplication.shared.open(u) { ok in if !ok { alert("غير مثبّت", "هذا المتجر غير موجود على الآيفون، اختر «تحميل الملف»", []) } }
    }

    @MainActor static func alert(_ t: String, _ m: String, _ actions: [(String, () -> Void)]) {
        let a = UIAlertController(title: t, message: m, preferredStyle: .alert)
        for (n, f) in actions { a.addAction(UIAlertAction(title: n, style: .default) { _ in f() }) }
        a.addAction(UIAlertAction(title: actions.isEmpty ? "حسناً" : "لاحقاً", style: .cancel))
        var top = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.rootViewController
            ?? UIApplication.shared.delegate?.window??.rootViewController
        while let p = top?.presentedViewController { top = p }
        top?.present(a, animated: true)
    }

    /// The «تحديث» quick action on the app icon (long-press).
    static func installShortcut() {
        UIApplication.shared.shortcutItems = [UIApplicationShortcutItem(type: "update", localizedTitle: "تحديث التطبيق",
                                                                         localizedSubtitle: nil, icon: UIApplicationShortcutIcon(systemImageName: "arrow.down.circle"))]
    }
}
