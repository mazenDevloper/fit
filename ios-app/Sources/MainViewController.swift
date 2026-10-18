import UIKit
import ARKit
import WebKit

/// The whole app: the camera picture drawn natively (Metal, lens-matched for the headset) underneath,
/// and Madar's web interface on top with a transparent background. Native modules feed the page.
final class MainViewController: UIViewController {
    let ar = ARController()
    private(set) var passthrough: PassthroughView!
    private(set) var web: WebHost!
    let speech = SpeechController()
    let haptics = Haptics()
    let recorder = Recorder()
    lazy var media = MediaImporter(host: self)
    private var thermalObserver: NSObjectProtocol?

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    /// Home screen: portrait or landscape. Inside Madar (headset): landscape only.
    var inMR = false
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { inMR ? .landscape : .allButUpsideDown }
    func setMR(_ on: Bool) {
        guard on != inMR else { return }
        inMR = on
        setNeedsUpdateOfSupportedInterfaceOrientations()
        if on, let scene = view.window?.windowScene, !scene.interfaceOrientation.isLandscape {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .landscapeRight)) { _ in }
        }
        web.webView.scrollView.isScrollEnabled = !on
    }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        passthrough = PassthroughView(frame: view.bounds, ar: ar)
        passthrough.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(passthrough)

        web = WebHost(frame: view.bounds, controller: self)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(web)

        ar.onPose = { [weak self] q, p, t in
            self?.web.js(String(format: "window.__madarPose&&__madarPose(%.5f,%.5f,%.5f,%.5f,%.4f,%.4f,%.4f,%.1f)", q.imag.x, q.imag.y, q.imag.z, q.real, p.x, p.y, p.z, t * 1000))
        }
        ar.onEvent = { [weak self] name, payload in self?.web.emit(name, payload) }
        speech.onEvent = { [weak self] payload in self?.web.emit("speech", payload) }
        recorder.onEvent = { [weak self] payload in self?.web.emit("record", payload) }

        thermalObserver = NotificationCenter.default.addObserver(forName: ProcessInfo.thermalStateDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.sendThermal()
        }
        NotificationCenter.default.addObserver(self, selector: #selector(willResign), name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        updateOrientation()
        ar.start()
        sendThermal()
    }

    var isLandscapeLeft: Bool {
        view.window?.windowScene?.interfaceOrientation == .landscapeLeft
    }
    private func updateOrientation() {
        ar.landscapeLeft = isLandscapeLeft
        passthrough.landscapeLeft = isLandscapeLeft
    }
    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate(alongsideTransition: nil) { [weak self] _ in self?.updateOrientation() }
    }

    func sendThermal() {
        let level = ProcessInfo.processInfo.thermalState.rawValue
        let c = MadarMath.coolingFor(thermal: level)
        passthrough.thermalFps = c.fps
        ar.handsEveryMs = max(ar.handsEveryMs, c.handsEveryMs)
        web.emit("thermal", ["level": level, "fps": c.fps])
    }

    @objc private func willResign() { ar.saveWorldMap(); ar.pause() }
    @objc private func didBecomeActive() { ar.start(); sendThermal() }

    // MARK: Commands from the page (window.MadarIOS.send)

    func handle(_ cmd: String, _ d: [String: Any], frame: WKFrameInfo) {
        switch cmd {
        case "mr": setMR((d["on"] as? Bool) ?? false)
        case "lens":
            passthrough.lens = MadarMath.Lens(json: d)
            if let fps = (d["fps"] as? NSNumber)?.intValue { passthrough.wantFps = fps }
        case "hands":
            ar.handsOn = (d["on"] as? Bool) ?? true
            if let ms = (d["every"] as? NSNumber)?.intValue { ar.handsEveryMs = max(ms, MadarMath.coolingFor(thermal: ProcessInfo.processInfo.thermalState.rawValue).handsEveryMs) }
        case "guard": ar.guardOn = (d["on"] as? Bool) ?? false
        case "planes": ar.planesOn = (d["on"] as? Bool) ?? true
        case "resetWorld": ar.reset(forgetMap: (d["forget"] as? Bool) ?? true)
        case "saveWorld": ar.saveWorldMap()
        case "speechStart": speech.start(lang: d["lang"] as? String ?? "ar-SA", interim: (d["interim"] as? Bool) ?? false)
        case "speechStop": speech.stop()
        case "rumble": haptics.rumble(strength: (d["s"] as? NSNumber)?.floatValue ?? 0.6, ms: (d["ms"] as? NSNumber)?.intValue ?? 200)
        case "recordStart": recorder.start()
        case "recordStop": recorder.stop()
        case "pickDepth":
            if DepthEstimator.available { media.pick(spatial: false, depth: true) }
            else { web.emit("files", ["state": "noModel"]) }
        case "pickMedia": media.pick(spatial: (d["spatial"] as? Bool) ?? false)
        case "update": Updater.check(silent: false)
        case "h2c": web.injectHtml2Canvas(into: frame)
        case "openExternal":
            if let s = d["url"] as? String, let u = URL(string: s) { UIApplication.shared.open(u) }
        default: break
        }
    }
}
