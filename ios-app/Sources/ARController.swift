import ARKit
import Vision
import simd

/// ARKit world tracking: the head's real position and rotation (6DoF), the room's planes (floor, walls,
/// tables, seats…), a saved world map so windows stay where you left them, and Apple Vision on the
/// camera frames for hands (Neural Engine) and people in front of you.
final class ARController: NSObject, ARSessionDelegate {
    let session = ARSession()
    private let queue = DispatchQueue(label: "madar.ar", qos: .userInteractive)
    private let vision = DispatchQueue(label: "madar.vision", qos: .userInitiated)
    private let lock = NSLock()
    private var _frame: ARFrame?
    /// Newest camera frame for the passthrough view.
    var latestFrame: ARFrame? { lock.lock(); defer { lock.unlock() }; return _frame }

    var onPose: ((simd_quatf, SIMD3<Float>, TimeInterval) -> Void)?
    var onEvent: ((String, Any) -> Void)?
    /// Set on the main thread when the interface turns (read on the AR queue).
    var landscapeLeft = false

    var handsOn = true
    var handsEveryMs = 45
    var guardOn = false
    var planesOn = true

    private var running = false
    private var handsBusy = false, guardBusy = false
    private var lastHands: TimeInterval = 0, lastGuard: TimeInterval = 0, lastPlanes: TimeInterval = 0, lastMapSave: TimeInterval = 0
    private var camSent = SIMD4<Float>(0, 0, 0, 0)
    private var lastState = ""
    private var relocalizing = false
    private var worldState = "new"
    private let handRequest: VNDetectHumanHandPoseRequest = { let r = VNDetectHumanHandPoseRequest(); r.maximumHandCount = 2; return r }()
    private let peopleRequest = VNDetectHumanRectanglesRequest()

    static var mapURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("madar-world.map")
    }

    override init() {
        super.init()
        session.delegate = self
        session.delegateQueue = queue
        try? FileManager.default.createDirectory(at: Self.mapURL.deletingLastPathComponent(), withIntermediateDirectories: true)
    }

    private func configuration(map: ARWorldMap?) -> ARWorldTrackingConfiguration {
        let c = ARWorldTrackingConfiguration()
        c.worldAlignment = .gravity
        c.planeDetection = [.horizontal, .vertical]
        c.isAutoFocusEnabled = true
        c.environmentTexturing = .none
        // A light camera format: 1280-1920 wide at 30 fps is plenty for tracking and passthrough, and cooler.
        let formats = ARWorldTrackingConfiguration.supportedVideoFormats
        if let f = formats.filter({ $0.framesPerSecond == 30 && $0.imageResolution.width >= 1280 }).min(by: { $0.imageResolution.width < $1.imageResolution.width }) ?? formats.first {
            c.videoFormat = f
        }
        c.initialWorldMap = map
        return c
    }

    func start() {
        guard ARWorldTrackingConfiguration.isSupported, !running else { return }
        running = true
        var map: ARWorldMap?
        if let data = try? Data(contentsOf: Self.mapURL) {
            map = try? NSKeyedUnarchiver.unarchivedObject(ofClass: ARWorldMap.self, from: data)
        }
        relocalizing = map != nil
        session.run(configuration(map: map), options: [])
        worldState = map != nil ? "relocalizing" : "new"
        onEvent?("world", ["state": worldState])
    }

    /// The page (re)loaded: tell it everything it may have missed.
    func replay() {
        queue.async { [weak self] in
            guard let self else { return }
            self.camSent = .zero
            self.lastState = ""
            self.onEvent?("world", ["state": self.worldState])
        }
    }

    func pause() { running = false; session.pause() }

    func reset(forgetMap: Bool) {
        if forgetMap { try? FileManager.default.removeItem(at: Self.mapURL) }
        relocalizing = false
        session.run(configuration(map: nil), options: [.resetTracking, .removeExistingAnchors])
        running = true
        worldState = "new"
        onEvent?("world", ["state": worldState])
    }

    func saveWorldMap() {
        session.getCurrentWorldMap { map, _ in
            guard let map, let data = try? NSKeyedArchiver.archivedData(withRootObject: map, requiringSecureCoding: true) else { return }
            try? data.write(to: Self.mapURL, options: .atomic)
        }
    }

    // MARK: ARSessionDelegate

    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        lock.lock(); _frame = frame; lock.unlock()
        let left = landscapeLeft
        let pose = MadarMath.headPose(camera: frame.camera.transform, landscapeLeft: left)
        if case .normal = frame.camera.trackingState { onPose?(pose.q, pose.p, frame.timestamp) }
        else if case .limited = frame.camera.trackingState { onPose?(pose.q, pose.p, frame.timestamp) }

        // Field of view of the picture (true-scale passthrough).
        let K = frame.camera.intrinsics, res = frame.camera.imageResolution
        let cam = SIMD4<Float>(K[0][0], K[1][1], Float(res.width), Float(res.height))
        if simd_distance(cam, camSent) > 0.5 {
            camSent = cam
            let t = MadarMath.camTan(fx: cam.x, fy: cam.y, width: cam.z, height: cam.w)
            onEvent?("camera", ["tx": t.x, "ty": t.y, "w": cam.z, "h": cam.w])
        }
        trackingChanged(frame.camera.trackingState)

        let now = frame.timestamp
        if handsOn, !handsBusy, (now - lastHands) * 1000 >= Double(handsEveryMs) {
            lastHands = now; handsBusy = true
            let buf = frame.capturedImage
            vision.async { [weak self] in self?.detectHands(buf, left: left, t: now) }
        }
        if guardOn, !guardBusy, now - lastGuard >= 1 {
            lastGuard = now; guardBusy = true
            let buf = frame.capturedImage
            vision.async { [weak self] in self?.detectPeople(buf, left: left) }
        }
        if planesOn, now - lastPlanes >= 1 { lastPlanes = now; sendPlanes(frame.anchors) }
        if now - lastMapSave >= 30, frame.worldMappingStatus == .mapped || frame.worldMappingStatus == .extending {
            lastMapSave = now; saveWorldMap()
        }
    }

    private func trackingChanged(_ s: ARCamera.TrackingState) {
        var name = "normal"
        switch s {
        case .notAvailable: name = "unavailable"
        case .limited(let r):
            switch r {
            case .initializing: name = "initializing"
            case .relocalizing: name = "relocalizing"
            case .excessiveMotion: name = "fast"
            case .insufficientFeatures: name = "dark"
            @unknown default: name = "limited"
            }
        case .normal: name = "normal"
        }
        guard name != lastState else { return }
        if name == "normal", relocalizing { relocalizing = false; worldState = "relocalized"; onEvent?("world", ["state": worldState]) }
        lastState = name
        onEvent?("tracking", ["state": name])
    }

    func session(_ session: ARSession, didFailWithError error: Error) {
        onEvent?("tracking", ["state": "error", "message": error.localizedDescription])
        running = false
    }
    func sessionWasInterrupted(_ session: ARSession) { onEvent?("tracking", ["state": "interrupted"]) }
    func sessionInterruptionEnded(_ session: ARSession) { onEvent?("tracking", ["state": "resumed"]) }
    func sessionShouldAttemptRelocalization(_ session: ARSession) -> Bool { true }

    // MARK: Planes → the room (floor, walls, tables, seats, doors, windows, ceiling)

    private func sendPlanes(_ anchors: [ARAnchor]) {
        var list: [[String: Any]] = []
        for case let a as ARPlaneAnchor in anchors {
            let c = a.transform * SIMD4<Float>(a.center.x, a.center.y, a.center.z, 1)
            let ext = a.planeExtent
            var cls = "none"
            switch a.classification {
            case .wall: cls = "wall"
            case .floor: cls = "floor"
            case .ceiling: cls = "ceiling"
            case .table: cls = "table"
            case .seat: cls = "seat"
            case .door: cls = "door"
            case .window: cls = "window"
            default: cls = "none"
            }
            list.append(["id": a.identifier.uuidString, "cls": cls, "x": c.x, "y": c.y, "z": c.z,
                         "w": ext.width, "h": ext.height, "v": a.alignment == .vertical])
        }
        onEvent?("planes", list)
    }

    // MARK: Hands (Apple Vision, runs on the Neural Engine)

    private static let joints: [VNHumanHandPoseObservation.JointName] = [
        .wrist,
        .thumbCMC, .thumbMP, .thumbIP, .thumbTip,
        .indexMCP, .indexPIP, .indexDIP, .indexTip,
        .middleMCP, .middlePIP, .middleDIP, .middleTip,
        .ringMCP, .ringPIP, .ringDIP, .ringTip,
        .littleMCP, .littlePIP, .littleDIP, .littleTip,
    ]

    private func detectHands(_ buf: CVPixelBuffer, left: Bool, t: TimeInterval) {
        defer { handsBusy = false }
        let h = VNImageRequestHandler(cvPixelBuffer: buf, orientation: .up)
        do { try h.perform([handRequest]) } catch { return }
        var hands: [[String: Any]] = []
        for obs in handRequest.results ?? [] {
            guard let pts = try? obs.recognizedPoints(.all) else { continue }
            var flat: [Float] = []
            var ok = true
            for j in Self.joints {
                guard let p = pts[j], p.confidence > 0.25 else { ok = false; break }
                let q = MadarMath.visionToImage(Float(p.location.x), Float(p.location.y), landscapeLeft: left)
                flat.append(q.x); flat.append(q.y)
            }
            if ok { hands.append(["s": obs.confidence, "p": flat]) }
        }
        onEvent?("hands", ["t": t * 1000, "hands": hands])
    }

    // MARK: Guard: someone standing right in front of you

    private func detectPeople(_ buf: CVPixelBuffer, left: Bool) {
        defer { guardBusy = false }
        let h = VNImageRequestHandler(cvPixelBuffer: buf, orientation: .up)
        do { try h.perform([peopleRequest]) } catch { return }
        let close = (peopleRequest.results ?? []).contains { r in
            r.confidence > 0.5 && r.boundingBox.height > 0.55 && abs(r.boundingBox.midX - 0.5) < 0.3
        }
        onEvent?("people", ["close": close])
    }
}
