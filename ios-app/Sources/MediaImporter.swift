import UIKit
import PhotosUI
import AVFoundation
import CoreImage
import VideoToolbox
import UniformTypeIdentifiers

/// Photos & videos from the iPhone's library into Madar. Spatial videos (recorded in 3D by the iPhone)
/// are converted to side-by-side so each eye gets its own picture in the headset.
final class MediaImporter: NSObject, PHPickerViewControllerDelegate {
    private weak var host: MainViewController?
    private var spatialOnly = false
    private var depthMode = false

    init(host: MainViewController) { self.host = host }

    func pick(spatial: Bool, depth: Bool = false) {
        spatialOnly = spatial; depthMode = depth
        var c = PHPickerConfiguration(photoLibrary: .shared())
        c.selectionLimit = spatial || depth ? 1 : 0
        c.filter = spatial ? .videos : depth ? .images : .any(of: [.images, .videos])
        c.preferredAssetRepresentationMode = .current   // no re-encoding: originals, fast
        let p = PHPickerViewController(configuration: c)
        p.delegate = self
        p.modalPresentationStyle = .formSheet
        host?.present(p, animated: true)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let web = host?.web else { return }
        if results.isEmpty { web.emit("files", ["state": "cancel"]); return }
        web.emit("files", ["state": "loading", "count": results.count])
        Task { await self.load(results) }
    }

    private func load(_ results: [PHPickerResult]) async {
        for r in results {
            let p = r.itemProvider
            let isVideo = p.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
            let type = isVideo ? UTType.movie : UTType.image
            guard let url = await copyFile(p, type: type) else { continue }
            var file = url, name = url.lastPathComponent
            if depthMode, !isVideo {
                await MainActor.run { host?.web.emit("files", ["state": "depth"]) }
                if let png = await Self.depth(url) {
                    await MainActor.run { host?.web.emit("depth", ["name": name, "png": png.base64EncodedString()]) }
                } else {
                    await MainActor.run { host?.web.emit("files", ["state": "noDepth"]) }
                }
            }
            if isVideo, await Self.isSpatial(url) {
                await MainActor.run { host?.web.emit("files", ["state": "converting", "name": name]) }
                if let sbs = try? await SpatialConverter.convert(url) {
                    file = sbs; name = (name as NSString).deletingPathExtension + " SBS.mp4"
                }
            } else if spatialOnly {
                await MainActor.run { host?.web.emit("files", ["state": "notSpatial", "name": name]) }
            }
            await host?.web.sendFile(file, name: name, mime: isVideo ? "video/mp4" : (UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "image/jpeg"))
            try? FileManager.default.removeItem(at: url)
            if file != url { try? FileManager.default.removeItem(at: file) }
        }
        await MainActor.run { host?.web.emit("files", ["state": "done"]) }
    }

    private func copyFile(_ p: NSItemProvider, type: UTType) async -> URL? {
        await withCheckedContinuation { cont in
            p.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                guard let url else { cont.resume(returning: nil); return }
                let dst = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-" + url.lastPathComponent)
                do { try FileManager.default.copyItem(at: url, to: dst); cont.resume(returning: dst) } catch { cont.resume(returning: nil) }
            }
        }
    }

    static func depth(_ url: URL) async -> Data? {
        await Task.detached(priority: .userInitiated) {
            guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let img = CGImageSourceCreateThumbnailAtIndex(src, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                                                         kCGImageSourceThumbnailMaxPixelSize: 1024] as CFDictionary) else { return nil }
            // The thumbnail is created without applying the photo's rotation: tell Vision.
            let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
            let raw = (props?[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
            return try? DepthEstimator.depthPNG(for: img, orientation: CGImagePropertyOrientation(rawValue: raw) ?? .up)
        }.value
    }

    static func isSpatial(_ url: URL) async -> Bool {
        let asset = AVURLAsset(url: url)
        let tracks = (try? await asset.loadTracks(withMediaCharacteristic: .containsStereoMultiviewVideo)) ?? []
        return !tracks.isEmpty
    }
}

/// MV-HEVC (iPhone spatial video) → a normal side-by-side HEVC video (left eye | right eye).
enum SpatialConverter {
    enum Failure: Error { case noVideo, reader, writer }

    static func convert(_ src: URL) async throws -> URL {
        let asset = AVURLAsset(url: src)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw Failure.noVideo }
        let size = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        let fps = try await track.load(.nominalFrameRate)
        let w = Int(abs(size.width)), h = Int(abs(size.height))

        let reader = try AVAssetReader(asset: asset)
        let vOut = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVVideoDecompressionPropertiesKey: [kVTDecompressionPropertyKey_RequestedMVHEVCVideoLayerIDs: [0, 1] as CFArray],
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ])
        vOut.alwaysCopiesSampleData = false
        guard reader.canAdd(vOut) else { throw Failure.reader }
        reader.add(vOut)
        var aOut: AVAssetReaderTrackOutput?
        if let at = try await asset.loadTracks(withMediaType: .audio).first {
            let o = AVAssetReaderTrackOutput(track: at, outputSettings: nil)
            if reader.canAdd(o) { reader.add(o); aOut = o }
        }

        let dst = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "-sbs.mp4")
        let writer = try AVAssetWriter(outputURL: dst, fileType: .mp4)
        let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.hevc, AVVideoWidthKey: w * 2, AVVideoHeightKey: h,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 30_000_000, AVVideoExpectedSourceFrameRateKey: max(24, Int(fps))],
        ])
        vIn.expectsMediaDataInRealTime = false
        vIn.transform = transform
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vIn, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: w * 2, kCVPixelBufferHeightKey as String: h,
        ])
        guard writer.canAdd(vIn) else { throw Failure.writer }
        writer.add(vIn)
        var aIn: AVAssetWriterInput?
        if aOut != nil, let fmt = try? await asset.loadTracks(withMediaType: .audio).first?.load(.formatDescriptions).first {
            let i = AVAssetWriterInput(mediaType: .audio, outputSettings: nil, sourceFormatHint: fmt)
            if writer.canAdd(i) { writer.add(i); aIn = i }
        }
        guard reader.startReading(), writer.startWriting() else { throw Failure.reader }
        writer.startSession(atSourceTime: .zero)

        let ci = CIContext(options: [.cacheIntermediates: false])
        // Video frames.
        while let sample = vOut.copyNextSampleBuffer() {
            while !vIn.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
            guard let tagged = sample.taggedBuffers,
                  case let .pixelBuffer(left)? = tagged.first(where: { $0.tags.first(matchingCategory: .stereoView) == .stereoView(.leftEye) })?.buffer,
                  case let .pixelBuffer(right)? = tagged.first(where: { $0.tags.first(matchingCategory: .stereoView) == .stereoView(.rightEye) })?.buffer,
                  let pool = adaptor.pixelBufferPool else { continue }
            var out: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(nil, pool, &out)
            guard let out else { continue }
            let l = CIImage(cvPixelBuffer: left)
            let r = CIImage(cvPixelBuffer: right).transformed(by: CGAffineTransform(translationX: CGFloat(w), y: 0))
            ci.render(r.composited(over: l), to: out)
            adaptor.append(out, withPresentationTime: sample.presentationTimeStamp)
        }
        vIn.markAsFinished()
        // Sound, unchanged.
        if let aOut, let aIn {
            while let s = aOut.copyNextSampleBuffer() {
                while !aIn.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 2_000_000) }
                aIn.append(s)
            }
            aIn.markAsFinished()
        }
        await writer.finishWriting()
        if writer.status != .completed { throw Failure.writer }
        return dst
    }
}

extension WebHost {
    /// Hand a local file to the page in pieces (the page rebuilds it as a File and opens / imports it).
    @MainActor
    func sendFile(_ url: URL, name: String, mime: String) async {
        guard let h = try? FileHandle(forReadingFrom: url) else { return }
        defer { try? h.close() }
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
        let id = UUID().uuidString
        await jsAsync("window.__madarFileBegin&&__madarFileBegin(\(Self.jsString(id)),\(Self.jsString(name)),\(Self.jsString(mime)),\(size))")
        while true {
            let chunk = (try? h.read(upToCount: 1 << 20)) ?? nil
            guard let chunk, !chunk.isEmpty else { break }
            await jsAsync("window.__madarFileChunk&&__madarFileChunk(\(Self.jsString(id)),\"\(chunk.base64EncodedString())\")")
        }
        await jsAsync("window.__madarFileEnd&&__madarFileEnd(\(Self.jsString(id)))")
    }

    @MainActor
    func jsAsync(_ code: String) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            webView.evaluateJavaScript(code + ";0") { _, _ in c.resume() }
        }
    }
}
