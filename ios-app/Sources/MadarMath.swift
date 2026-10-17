// Pure math shared by the app and its unit tests: no UIKit/ARKit types here, so every formula can be
// checked on the simulator (lens distortion parity with the web renderer, pose conversion, hand joints).
import Foundation
import simd

enum MadarMath {

    // MARK: Lens / passthrough parameters (sent by the web app, same meaning as js/render.js uniforms)

    struct Lens: Equatable {
        var sbs = true            // side-by-side headset view, false = one full-screen view
        var sep: Float = 70       // mm between lens centres
        var vOff: Float = 0       // mm vertical offset
        var vSkew: Float = 0      // mm vertical difference between the eyes
        var s2l: Float = 40       // screen-to-lens mm
        var k1: Float = 0.22
        var k2: Float = 0.10
        var px: Float = 6.3       // CSS points per mm on this screen
        var tanMax: Float = 1.4
        var camTan = SIMD2<Float>(0.69, 0.52)   // half extents (tan) of the camera picture as drawn
        var mono = SIMD2<Float>(1, 0.56)        // mono view half extents (tan)
        var bright: Float = 1
        var show = true           // false in virtual environments (the web scene covers everything)

        init() {}

        init(json d: [String: Any]) {
            func f(_ k: String, _ def: Float) -> Float { (d[k] as? NSNumber)?.floatValue ?? def }
            sbs = (d["sbs"] as? Bool) ?? true
            sep = f("sep", 70); vOff = f("vOff", 0); vSkew = f("vSkew", 0); s2l = f("s2l", 40)
            k1 = f("k1", 0.22); k2 = f("k2", 0.10); px = f("px", 6.3); tanMax = f("tanMax", 1.4)
            camTan = SIMD2(f("tx", 0.69), f("ty", 0.52))
            mono = SIMD2(f("mx", 1), f("my", 0.56))
            bright = f("bright", 1)
            show = (d["show"] as? Bool) ?? true
        }
    }

    /// For a point on the screen (in points, origin top-left), the camera image coordinate (0…1, y down)
    /// shown there, and how visible it is (0 outside the lens / picture). Same maths as DIST_FRAG + BG_FRAG.
    static func passthroughSample(screen p: SIMD2<Float>, size: SIMD2<Float>, lens L: Lens) -> (uv: SIMD2<Float>, k: Float, inPicture: Bool) {
        var tanP: SIMD2<Float>
        var k: Float = 1
        if L.sbs {
            let halfW = size.x * 0.5
            let right = p.x >= halfW
            // y up, like the GL fragment coordinates the web renderer uses
            let py = size.y - p.y
            let c = SIMD2<Float>(halfW + (right ? 1 : -1) * L.sep * 0.5 * L.px,
                                 size.y * 0.5 + (L.vOff + (right ? 0.5 : -0.5) * L.vSkew) * L.px)
            let o = (SIMD2(p.x, py) - c) / L.px / L.s2l
            let r2 = simd_dot(o, o)
            let d = o * (1 + L.k1 * r2 + L.k2 * r2 * r2)
            let uv = 0.5 + d / (2 * L.tanMax)
            let e = simd_min(uv, 1 - uv)
            k = smoothstep(0, 0.025, min(e.x, e.y)) * smoothstep(0, 2, abs(p.x - halfW))
            tanP = d
        } else {
            let n = SIMD2(p.x / size.x, 1 - p.y / size.y)      // 0…1, y up
            tanP = (n * 2 - 1) * L.mono
        }
        // Camera picture: centred, half extents camTan, y down in the image.
        let img = SIMD2(0.5 + tanP.x / (2 * L.camTan.x), 0.5 - tanP.y / (2 * L.camTan.y))
        let inside = img.x >= 0 && img.x <= 1 && img.y >= 0 && img.y <= 1
        return (img, k, inside)
    }

    static func smoothstep(_ a: Float, _ b: Float, _ x: Float) -> Float {
        let t = max(0, min(1, (x - a) / (b - a)))
        return t * t * (3 - 2 * t)
    }

    // MARK: Camera field of view from ARKit intrinsics

    /// Half extents (tan) of the camera picture: (width/2)/fx, (height/2)/fy.
    static func camTan(fx: Float, fy: Float, width: Float, height: Float) -> SIMD2<Float> {
        SIMD2(width * 0.5 / fx, height * 0.5 / fy)
    }

    // MARK: Head pose

    /// ARKit's camera transform → the head pose the web app uses (x right, y up, looking down -z).
    /// ARKit's camera axes match a phone held in landscape-right; in landscape-left the view is the
    /// same camera turned half a turn around its viewing axis.
    static func headPose(camera m: simd_float4x4, landscapeLeft: Bool) -> (q: simd_quatf, p: SIMD3<Float>) {
        var q = simd_quatf(m)
        if landscapeLeft { q = q * simd_quatf(angle: .pi, axis: SIMD3(0, 0, 1)) }
        let p = SIMD3(m.columns.3.x, m.columns.3.y, m.columns.3.z)
        return (simd_normalize(q), p)
    }

    // MARK: Hand joints (Apple Vision → MediaPipe order used by the web app)

    static let handJointCount = 21

    /// Vision's normalised point (origin bottom-left) → image coordinates of the picture as shown (0…1, y down).
    static func visionToImage(_ x: Float, _ y: Float, landscapeLeft: Bool) -> SIMD2<Float> {
        let p = SIMD2(x, 1 - y)
        return landscapeLeft ? SIMD2(1 - p.x, 1 - p.y) : p
    }

    // MARK: Thermal

    /// 0 nominal, 1 fair, 2 serious, 3 critical (ProcessInfo.ThermalState raw values).
    static func coolingFor(thermal level: Int) -> (fps: Int, handsEveryMs: Int) {
        switch level {
        case 3: return (24, 120)
        case 2: return (30, 90)
        case 1: return (30, 60)
        default: return (60, 45)
        }
    }
}
