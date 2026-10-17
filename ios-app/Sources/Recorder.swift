import ReplayKit
import AVFoundation
import Photos

/// «تسجيل»: records what you see in Madar (both eyes, with the app's sound) and saves it to Photos.
final class Recorder {
    var onEvent: (([String: Any]) -> Void)?
    private var writer: AVAssetWriter?
    private var video: AVAssetWriterInput?
    private var audio: AVAssetWriterInput?
    private var started = false
    private var url: URL?
    private let queue = DispatchQueue(label: "madar.recorder")
    var isRecording: Bool { RPScreenRecorder.shared().isRecording }

    func start() {
        guard !isRecording else { return }
        let rec = RPScreenRecorder.shared()
        rec.isMicrophoneEnabled = false
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("madar-\(Int(Date().timeIntervalSince1970)).mp4")
        url = u; started = false; writer = nil; video = nil; audio = nil
        rec.startCapture(handler: { [weak self] sample, type, error in
            guard let self, error == nil, CMSampleBufferDataIsReady(sample) else { return }
            self.queue.sync { self.append(sample, type: type, to: u) }
        }, completionHandler: { [weak self] error in
            DispatchQueue.main.async {
                if let error { self?.onEvent?(["state": "error", "message": error.localizedDescription]) }
                else { self?.onEvent?(["state": "started"]) }
            }
        })
    }

    private func append(_ s: CMSampleBuffer, type: RPSampleBufferType, to u: URL) {
        if writer == nil {
            guard type == .video, let fmt = CMSampleBufferGetFormatDescription(s) else { return }
            let dim = CMVideoFormatDescriptionGetDimensions(fmt)
            guard let w = try? AVAssetWriter(outputURL: u, fileType: .mp4) else { return }
            let v = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.hevc, AVVideoWidthKey: Int(dim.width), AVVideoHeightKey: Int(dim.height),
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 12_000_000],
            ])
            v.expectsMediaDataInRealTime = true
            let a = AVAssetWriterInput(mediaType: .audio, outputSettings: [
                AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 2, AVSampleRateKey: 44_100, AVEncoderBitRateKey: 128_000,
            ])
            a.expectsMediaDataInRealTime = true
            if w.canAdd(v) { w.add(v) }
            if w.canAdd(a) { w.add(a) }
            writer = w; video = v; audio = a
        }
        guard let w = writer else { return }
        if !started {
            guard type == .video else { return }
            w.startWriting()
            w.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(s))
            started = true
        }
        switch type {
        case .video: if video?.isReadyForMoreMediaData == true { video?.append(s) }
        case .audioApp: if audio?.isReadyForMoreMediaData == true { audio?.append(s) }
        default: break
        }
    }

    func stop() {
        RPScreenRecorder.shared().stopCapture { [weak self] _ in
            guard let self else { return }
            self.queue.async {
                guard let w = self.writer, self.started, let u = self.url else {
                    DispatchQueue.main.async { self.onEvent?(["state": "error", "message": "لا يوجد تسجيل"]) }
                    return
                }
                self.video?.markAsFinished(); self.audio?.markAsFinished()
                w.finishWriting {
                    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                        guard status == .authorized || status == .limited else {
                            DispatchQueue.main.async { self.onEvent?(["state": "error", "message": "اسمح لمدار بإضافة الصور"]) }
                            return
                        }
                        PHPhotoLibrary.shared().performChanges({
                            PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: u)
                        }) { ok, err in
                            try? FileManager.default.removeItem(at: u)
                            DispatchQueue.main.async { self.onEvent?(ok ? ["state": "saved"] : ["state": "error", "message": err?.localizedDescription ?? ""]) }
                        }
                    }
                }
            }
        }
    }
}
