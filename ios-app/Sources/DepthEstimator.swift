import UIKit
import Vision
import CoreML
import Accelerate

/// 2D → spatial photo: Depth Anything V2 (Core ML, on the Neural Engine) guesses how far every part of a
/// photo is; Madar turns the photo into a relief so each eye sees real depth.
enum DepthEstimator {
    enum Failure: Error { case noModel, noResult }

    private static var model: VNCoreMLModel? = {
        guard let url = Bundle.main.url(forResource: "DepthAnythingV2SmallF16", withExtension: "mlmodelc") else { return nil }
        let cfg = MLModelConfiguration(); cfg.computeUnits = .all
        guard let m = try? MLModel(contentsOf: url, configuration: cfg) else { return nil }
        return try? VNCoreMLModel(for: m)
    }()

    static var available: Bool { model != nil }

    /// Depth map as an 8-bit grey PNG (bright = near), the photo's aspect.
    static func depthPNG(for image: CGImage, orientation: CGImagePropertyOrientation) throws -> Data {
        guard let model else { throw Failure.noModel }
        let req = VNCoreMLRequest(model: model)
        req.imageCropAndScaleOption = .scaleFill
        try VNImageRequestHandler(cgImage: image, orientation: orientation).perform([req])
        var values: [Float] = [], w = 0, h = 0
        if let px = (req.results?.first as? VNPixelBufferObservation)?.pixelBuffer {
            (values, w, h) = read(px)
        } else if let arr = (req.results?.first as? VNCoreMLFeatureValueObservation)?.featureValue.multiArrayValue {
            let shape = arr.shape.map { $0.intValue }
            h = shape.count >= 2 ? shape[shape.count - 2] : 1; w = shape.last ?? 1
            values = (0..<(w * h)).map { arr[$0].floatValue }
        }
        guard w > 1, h > 1, !values.isEmpty else { throw Failure.noResult }
        let lo = values.min() ?? 0, hi = values.max() ?? 1, span = max(1e-6, hi - lo)
        var bytes = values.map { UInt8(max(0, min(255, ($0 - lo) / span * 255))) }
        guard let provider = CGDataProvider(data: Data(bytes: &bytes, count: bytes.count) as CFData),
              let cg = CGImage(width: w, height: h, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: w,
                               space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0),
                               provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { throw Failure.noResult }
        // Vision already turned the photo upright before the model saw it, so the map is upright too.
        guard let png = UIImage(cgImage: cg).pngData() else { throw Failure.noResult }
        return png
    }

    private static func read(_ px: CVPixelBuffer) -> ([Float], Int, Int) {
        CVPixelBufferLockBaseAddress(px, .readOnly); defer { CVPixelBufferUnlockBaseAddress(px, .readOnly) }
        let w = CVPixelBufferGetWidth(px), h = CVPixelBufferGetHeight(px), row = CVPixelBufferGetBytesPerRow(px)
        guard let base = CVPixelBufferGetBaseAddress(px) else { return ([], 0, 0) }
        var out = [Float](repeating: 0, count: w * h)
        switch CVPixelBufferGetPixelFormatType(px) {
        case kCVPixelFormatType_OneComponent16Half, kCVPixelFormatType_DepthFloat16, kCVPixelFormatType_DisparityFloat16:
            for y in 0..<h {
                let p = (base + y * row).assumingMemoryBound(to: UInt16.self)
                for x in 0..<w { out[y * w + x] = Float(Float16(bitPattern: p[x])) }
            }
        case kCVPixelFormatType_OneComponent32Float, kCVPixelFormatType_DepthFloat32, kCVPixelFormatType_DisparityFloat32:
            for y in 0..<h {
                let p = (base + y * row).assumingMemoryBound(to: Float.self)
                for x in 0..<w { out[y * w + x] = p[x] }
            }
        default:
            for y in 0..<h {
                let p = (base + y * row).assumingMemoryBound(to: UInt8.self)
                for x in 0..<w { out[y * w + x] = Float(p[x]) }
            }
        }
        return (out, w, h)
    }
}

extension UIImage.Orientation {
    init(_ o: CGImagePropertyOrientation) {
        switch o {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        }
    }
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
