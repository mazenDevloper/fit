import UIKit
import WebKit

/// Madar's web interface in a transparent WKWebView, with a two-way bridge:
///  - the page calls `MadarIOS.send(cmd, data)` (window.webkit.messageHandlers.madar),
///  - native calls `window.__madarEvent(name, payload)` and a few fast paths (__madarPose…).
/// The Madar bridge script is injected into every frame, so any website opened in a Madar window
/// can be clicked, scrolled, typed into, curved and shown in 360° — no proxy server needed.
final class WebHost: UIView, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    static let appURL = URL(string: "https://mazendevloper.github.io/fit/?ios=1")!
    let webView: WKWebView
    private weak var controller: MainViewController?
    private lazy var h2cSource: String = Self.resource("html2canvas.min", "js") ?? ""

    init(frame: CGRect, controller: MainViewController) {
        self.controller = controller
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.allowsAirPlayForMediaPlayback = true
        config.allowsPictureInPictureMediaPlayback = false
        config.preferences.isElementFullscreenEnabled = false
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.websiteDataStore = .default()
        let ucc = WKUserContentController()
        if let boot = Self.resource("bootstrap", "js") {
            ucc.addUserScript(WKUserScript(source: boot, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        if let bridge = Self.resource("madar-bridge", "js") {
            // Every frame; the script itself does nothing in the top page or outside Madar's windows.
            ucc.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentEnd, forMainFrameOnly: false))
        }
        config.userContentController = ucc
        webView = WKWebView(frame: frame, configuration: config)
        super.init(frame: frame)
        ucc.add(WeakHandler(self), name: "madar")
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        webView.navigationDelegate = self
        webView.uiDelegate = self
        addSubview(webView)
        webView.load(URLRequest(url: Self.appURL, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 20))
    }

    required init?(coder: NSCoder) { fatalError() }

    static func resource(_ name: String, _ ext: String) -> String? {
        guard let u = Bundle.main.url(forResource: name, withExtension: ext) else { return nil }
        return try? String(contentsOf: u, encoding: .utf8)
    }

    // MARK: native → page

    func js(_ code: String, done: (() -> Void)? = nil) {
        let run = { self.webView.evaluateJavaScript(code) { _, _ in done?() } }
        if Thread.isMainThread { run() } else { DispatchQueue.main.async(execute: run) }
    }

    func emit(_ name: String, _ payload: Any) {
        guard JSONSerialization.isValidJSONObject(["p": payload]),
              let data = try? JSONSerialization.data(withJSONObject: ["p": payload]),
              let s = String(data: data, encoding: .utf8) else { return }
        js("window.__madarEvent&&__madarEvent(\(Self.jsString(name)),(\(s)).p)")
    }

    static func jsString(_ s: String) -> String {
        let d = try? JSONSerialization.data(withJSONObject: [s])
        let a = d.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(a.dropFirst().dropLast())
    }

    /// html2canvas is only needed by a page that is drawn as a picture (curved / 360°); send it on request.
    func injectHtml2Canvas(into frame: WKFrameInfo) {
        guard !h2cSource.isEmpty else { return }
        webView.evaluateJavaScript(h2cSource + ";0", in: frame, in: .page) { _ in }
    }

    // MARK: page → native

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else { return }
        let data = body["data"] as? [String: Any] ?? [:]
        controller?.handle(cmd, data, frame: message.frameInfo)
    }

    // MARK: navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // The app page stays; a site trying to replace it opens in a Madar window instead.
        if action.targetFrame?.isMainFrame == true, let u = action.request.url, u.host != Self.appURL.host, u.scheme?.hasPrefix("http") == true {
            emit("openUrl", ["url": u.absoluteString])
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    // window.open / target=_blank → a new Madar window
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = action.request.url { emit("openUrl", ["url": u.absoluteString]) }
        return nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { retryLater() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { retryLater() }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS reclaimed the page (memory): bring it back where it was.
        webView.reload()
    }
    private func retryLater() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, self.webView.url == nil || self.webView.isLoading == false else { return }
            if self.webView.url == nil { self.webView.load(URLRequest(url: Self.appURL, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 20)) }
        }
    }

    // Camera / microphone requests from pages (calls, mirrors) are allowed: Madar asks the system once.
    func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }
}

/// WKUserContentController keeps a strong reference to its handlers.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ t: WKScriptMessageHandler) { target = t }
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(ucc, didReceive: message)
    }
}
