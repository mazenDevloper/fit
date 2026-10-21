import ReplayKit
import VideoToolbox
import UserNotifications
import UIKit

/// «مدار» in the iPhone's screen-recording list: the whole iPhone screen, compressed to H.264 by the iPhone's video
/// chip, sent to the DriveCast server, which hands it to every Madar watching (laptop, tablet, another phone).
/// Same network: it appears there by itself. Another network: the code in the notification.
final class SampleHandler: RPBroadcastSampleHandler {
    private let server = "wss://studio.c-p.workers.dev/screen/send"
    private var ws: URLSessionWebSocketTask?
    private var session: VTCompressionSession?
    private var transfer: VTPixelTransferSession?
    private var pool: CVPixelBufferPool?
    private var outW: Int32 = 0, outH: Int32 = 0
    private var lastFrame: CMTime = .invalid
    private var forceKey = true
    private var sentConfig = false
    private var inFlight = 0
    private let q = DispatchQueue(label: "madar.broadcast")
    private var room = "", pin = ""

    override func broadcastStarted(withSetupInfo setupInfo: [String: NSObject]?) {
        let d = UserDefaults.standard
        room = d.string(forKey: "room") ?? {
            let r = String((0..<8).map { _ in "abcdefghjkmnpqrstuvwxyz23456789".randomElement()! })
            d.set(r, forKey: "room"); return r
        }()
        pin = String(format: "%06d", Int.random(in: 0..<1_000_000))
        connect()
        let n = UNMutableNotificationContent()
        n.title = "📱 مدار يعرض شاشتك"
        n.body = "على نفس الشبكة يظهر وحده. من شبكة أخرى اكتب الرمز: \(room)-\(pin)"
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "madar-broadcast", content: n, trigger: nil))
    }

    private func connect() {
        var c = URLComponents(string: server)!
        c.queryItems = [URLQueryItem(name: "room", value: room), URLQueryItem(name: "name", value: "آيفون"), URLQueryItem(name: "pin", value: pin)]
        let t = URLSession(configuration: .default).webSocketTask(with: c.url!)
        ws = t; sentConfig = false; forceKey = true
        t.resume()
        listen(t)
    }

    private func listen(_ t: URLSessionWebSocketTask) {
        t.receive { [weak self] r in
            guard let self, self.ws === t else { return }
            switch r {
            case .success(.string(let s)): if s == "key" { self.q.async { self.forceKey = true; self.sentConfig = false } }
            case .failure: self.q.asyncAfter(deadline: .now() + 2) { if self.ws === t { self.connect() } }; return
            default: break
            }
            self.listen(t)
        }
    }

    override func broadcastFinished() {
        ws?.cancel(with: .normalClosure, reason: nil); ws = nil
        if let s = session { VTCompressionSessionInvalidate(s) }
        session = nil
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["madar-broadcast"])
    }

    override func processSampleBuffer(_ sampleBuffer: CMSampleBuffer, with type: RPSampleBufferType) {
        guard type == .video, let px = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
        // 30 a second is plenty (the screen can give 60); and never pile up when the network is slow
        if lastFrame.isValid, CMTimeGetSeconds(pts - lastFrame) < 1.0 / 31 { return }
        if inFlight > 6 && !forceKey { return }
        lastFrame = pts
        q.sync { encode(px, pts) }
    }

    private func encode(_ src: CVPixelBuffer, _ pts: CMTime) {
        let w = CVPixelBufferGetWidth(src), h = CVPixelBufferGetHeight(src)
        // at most 1600 px on the long side: sharp text, light on the network and the 50 MB this part may use
        let k = min(1.0, 1600.0 / Double(max(w, h)))
        let ow = Int32(Double(w) * k) & ~1, oh = Int32(Double(h) * k) & ~1
        if session == nil || ow != outW || oh != outH { setup(ow, oh) }
        guard let session, let pool else { return }
        var out: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out)
        guard let out, let transfer, VTPixelTransferSessionTransferImage(transfer, from: src, to: out) == noErr else { return }
        let opts: CFDictionary? = forceKey ? [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary : nil
        forceKey = false
        VTCompressionSessionEncodeFrame(session, imageBuffer: out, presentationTimeStamp: pts, duration: .invalid, frameProperties: opts, infoFlagsOut: nil) { [weak self] status, _, sb in
            guard status == noErr, let sb, let self else { return }
            self.q.async { self.send(sb) }
        }
    }

    private func setup(_ w: Int32, _ h: Int32) {
        if let s = session { VTCompressionSessionInvalidate(s) }
        outW = w; outH = h; sentConfig = false; forceKey = true
        var s: VTCompressionSession?
        VTCompressionSessionCreate(allocator: nil, width: w, height: h, codecType: kCMVideoCodecType_H264, encoderSpecification: nil,
                                   imageBufferAttributes: nil, compressedDataAllocator: nil, outputCallback: nil, refcon: nil, compressionSessionOut: &s)
        guard let s else { return }
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_RealTime, value: kCFBooleanTrue)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_ProfileLevel, value: kVTProfileLevel_H264_Main_AutoLevel)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_AllowFrameReordering, value: kCFBooleanFalse)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_AverageBitRate, value: 4_000_000 as CFNumber)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_DataRateLimits, value: [750_000, 1] as CFArray)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_ExpectedFrameRate, value: 30 as CFNumber)
        VTSessionSetProperty(s, key: kVTCompressionPropertyKey_MaxKeyFrameInterval, value: 90 as CFNumber)
        VTCompressionSessionPrepareToEncodeFrames(s)
        session = s
        var t: VTPixelTransferSession?
        VTPixelTransferSessionCreate(allocator: nil, pixelTransferSessionOut: &t)
        transfer = t
        let attrs: [CFString: Any] = [kCVPixelBufferPixelFormatTypeKey: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
                                      kCVPixelBufferWidthKey: Int(w), kCVPixelBufferHeightKey: Int(h), kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary]
        var p: CVPixelBufferPool?
        CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &p)
        pool = p
    }

    /// [kind][8 bytes µs][data]: 0 = avcC (decoder setup), 1 = key frame, 2 = frame - lengths-prefixed NAL units
    private func send(_ sb: CMSampleBuffer) {
        guard let ws else { return }
        let atts = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[CFString: Any]]
        let key = !((atts?.first?[kCMSampleAttachmentKey_NotSync] as? Bool) ?? false)
        if key, !sentConfig, let fd = CMSampleBufferGetFormatDescription(sb),
           let ext = CMFormatDescriptionGetExtension(fd, extensionKey: kCMFormatDescriptionExtension_SampleDescriptionExtensionAtoms) as? [String: Any],
           let avcC = ext["avcC"] as? Data {
            post(0, 0, avcC, ws); sentConfig = true
        }
        if !sentConfig { return }
        guard let bb = CMSampleBufferGetDataBuffer(sb) else { return }
        var len = 0, ptr: UnsafeMutablePointer<CChar>?
        guard CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &len, dataPointerOut: &ptr) == noErr, let ptr else { return }
        let us = UInt64(max(0, CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sb)) * 1_000_000))
        post(key ? 1 : 2, us, Data(bytes: ptr, count: len), ws)
    }

    private func post(_ kind: UInt8, _ us: UInt64, _ body: Data, _ ws: URLSessionWebSocketTask) {
        var d = Data([kind]); var t = us.bigEndian
        d.append(Data(bytes: &t, count: 8)); d.append(body)
        inFlight += 1
        ws.send(.data(d)) { [weak self] _ in self?.q.async { self?.inFlight -= 1 } }
    }
}
