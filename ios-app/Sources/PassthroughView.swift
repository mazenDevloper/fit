import MetalKit
import ARKit

/// The camera picture under the web interface, drawn with Metal straight from ARKit's frames (no copies),
/// pre-distorted for the headset lenses with exactly the same maths as Madar's web renderer, so the
/// virtual windows (drawn by the page above) and the real room line up.
final class PassthroughView: MTKView, MTKViewDelegate {
    private weak var ar: ARController?
    private var queue: MTLCommandQueue!
    private var pipeline: MTLRenderPipelineState!
    private var cache: CVMetalTextureCache?
    var lens = MadarMath.Lens() { didSet { updateRate() } }
    var landscapeLeft = false
    var wantFps = 60 { didSet { updateRate() } }
    var thermalFps = 60 { didSet { updateRate() } }

    private struct Uniforms {
        var size: SIMD2<Float>
        var camTan: SIMD2<Float>
        var mono: SIMD2<Float>
        var sbs: Float, sep: Float, vOff: Float, vSkew: Float
        var s2l: Float, k1: Float, k2: Float, px: Float
        var tanMax: Float, bright: Float, flip: Float, pad: Float
    }

    init(frame: CGRect, ar: ARController) {
        self.ar = ar
        let dev = MTLCreateSystemDefaultDevice()!
        super.init(frame: frame, device: dev)
        colorPixelFormat = .bgra8Unorm
        framebufferOnly = true
        clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
        isOpaque = true
        delegate = self
        queue = dev.makeCommandQueue()
        CVMetalTextureCacheCreate(nil, nil, dev, nil, &cache)
        let lib = dev.makeDefaultLibrary()!
        let d = MTLRenderPipelineDescriptor()
        d.vertexFunction = lib.makeFunction(name: "passthroughVertex")
        d.fragmentFunction = lib.makeFunction(name: "passthroughFragment")
        d.colorAttachments[0].pixelFormat = colorPixelFormat
        pipeline = try! dev.makeRenderPipelineState(descriptor: d)
        updateRate()
    }

    required init(coder: NSCoder) { fatalError() }

    private func updateRate() {
        preferredFramesPerSecond = max(15, min(wantFps, thermalFps))
        // In a virtual environment the page covers everything: stop drawing the camera.
        isPaused = !lens.show
        if !lens.show { setNeedsDisplay() }
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

    private var inFlight: [CVMetalTexture] = []
    private func texture(_ buf: CVPixelBuffer, plane: Int, format: MTLPixelFormat) -> MTLTexture? {
        guard let cache else { return nil }
        let w = CVPixelBufferGetWidthOfPlane(buf, plane), h = CVPixelBufferGetHeightOfPlane(buf, plane)
        var t: CVMetalTexture?
        CVMetalTextureCacheCreateTextureFromImage(nil, cache, buf, nil, format, w, h, plane, &t)
        guard let t else { return nil }
        inFlight.append(t)   // the GPU reads it after this returns: keep it alive until the frame is done
        return CVMetalTextureGetTexture(t)
    }

    func draw(in view: MTKView) {
        guard let rpd = currentRenderPassDescriptor, let drawable = currentDrawable,
              let cmd = queue.makeCommandBuffer() else { return }
        rpd.colorAttachments[0].loadAction = .clear
        guard let enc = cmd.makeRenderCommandEncoder(descriptor: rpd) else { return }
        if lens.show, let frame = ar?.latestFrame, CVPixelBufferGetPlaneCount(frame.capturedImage) >= 2,
           let y = texture(frame.capturedImage, plane: 0, format: .r8Unorm),
           let c = texture(frame.capturedImage, plane: 1, format: .rg8Unorm) {
            let L = lens
            var u = Uniforms(size: SIMD2(Float(bounds.width), Float(bounds.height)), camTan: L.camTan, mono: L.mono,
                             sbs: L.sbs ? 1 : 0, sep: L.sep, vOff: L.vOff, vSkew: L.vSkew,
                             s2l: L.s2l, k1: L.k1, k2: L.k2, px: L.px,
                             tanMax: L.tanMax, bright: L.bright, flip: landscapeLeft ? 1 : 0, pad: 0)
            enc.setRenderPipelineState(pipeline)
            enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
            enc.setFragmentTexture(y, index: 0)
            enc.setFragmentTexture(c, index: 1)
            enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
        }
        enc.endEncoding()
        let keep = inFlight; inFlight = []
        cmd.addCompletedHandler { _ in _ = keep }
        cmd.present(drawable)
        cmd.commit()
    }
}
