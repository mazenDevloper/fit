import XCTest
import simd

final class MadarMathTests: XCTestCase {

    private func lens() -> MadarMath.Lens {
        var L = MadarMath.Lens()
        L.sep = 70; L.vOff = 0; L.vSkew = 0; L.s2l = 40; L.k1 = 0.22; L.k2 = 0.10; L.px = 6.3; L.tanMax = 1.4
        L.camTan = SIMD2(0.69, 0.52)
        return L
    }

    /// The native passthrough must land exactly where the web renderer puts the camera picture
    /// (expected values computed with js/render.js's formulas).
    func testPassthroughMatchesWebRenderer() {
        let size = SIMD2<Float>(932, 430)
        let cases: [(SIMD2<Float>, SIMD2<Float>)] = [
            (SIMD2(245.5, 215), SIMD2(0.5, 0.5)),            // left lens centre → picture centre
            (SIMD2(300, 120), SIMD2(0.663789, 0.121159)),
            (SIMD2(700, 300), SIMD2(0.539869, 0.833092)),
        ]
        for (p, want) in cases {
            let s = MadarMath.passthroughSample(screen: p, size: size, lens: lens())
            XCTAssertEqual(s.uv.x, want.x, accuracy: 1e-4, "x at \(p)")
            XCTAssertEqual(s.uv.y, want.y, accuracy: 1e-4, "y at \(p)")
            XCTAssertEqual(s.k, 1, accuracy: 1e-4)
        }
    }

    func testSeamBetweenEyesIsBlack() {
        let s = MadarMath.passthroughSample(screen: SIMD2(466, 215), size: SIMD2(932, 430), lens: lens())
        XCTAssertEqual(s.k, 0, accuracy: 1e-4)
    }

    func testLensFromJSON() {
        let L = MadarMath.Lens(json: ["sbs": false, "sep": 70, "k1": 0.3, "tx": 0.8, "ty": 0.6, "show": false])
        XCTAssertFalse(L.sbs); XCTAssertFalse(L.show)
        XCTAssertEqual(L.sep, 70); XCTAssertEqual(L.k1, 0.3, accuracy: 1e-6)
        XCTAssertEqual(L.camTan.x, 0.8, accuracy: 1e-6)
    }

    func testCamTanFromIntrinsics() {
        let t = MadarMath.camTan(fx: 1400, fy: 1400, width: 1920, height: 1440)
        XCTAssertEqual(t.x, 960.0 / 1400, accuracy: 1e-6)
        XCTAssertEqual(t.y, 720.0 / 1400, accuracy: 1e-6)
    }

    func testHeadPoseIdentityAndFlip() {
        var m = matrix_identity_float4x4
        m.columns.3 = SIMD4(0.1, 1.5, -0.2, 1)
        let a = MadarMath.headPose(camera: m, landscapeLeft: false)
        XCTAssertEqual(a.q.angle, 0, accuracy: 1e-5)
        XCTAssertEqual(a.p, SIMD3(0.1, 1.5, -0.2))
        // Landscape-left: same forward direction, turned half a turn around it.
        let b = MadarMath.headPose(camera: m, landscapeLeft: true)
        let fwd = b.q.act(SIMD3<Float>(0, 0, -1)), up = b.q.act(SIMD3<Float>(0, 1, 0))
        XCTAssertEqual(fwd.z, -1, accuracy: 1e-5)
        XCTAssertEqual(up.y, -1, accuracy: 1e-5)
    }

    func testVisionPointsToImage() {
        let a = MadarMath.visionToImage(0.25, 0.75, landscapeLeft: false)
        XCTAssertEqual(a.x, 0.25, accuracy: 1e-6); XCTAssertEqual(a.y, 0.25, accuracy: 1e-6)
        let b = MadarMath.visionToImage(0.25, 0.75, landscapeLeft: true)
        XCTAssertEqual(b.x, 0.75, accuracy: 1e-6); XCTAssertEqual(b.y, 0.75, accuracy: 1e-6)
    }

    func testCoolingGetsLighterWhenHot() {
        XCTAssertGreaterThan(MadarMath.coolingFor(thermal: 0).fps, MadarMath.coolingFor(thermal: 2).fps)
        XCTAssertLessThan(MadarMath.coolingFor(thermal: 0).handsEveryMs, MadarMath.coolingFor(thermal: 3).handsEveryMs)
    }
}
