#include <metal_stdlib>
using namespace metal;

// Same layout as PassthroughView.Uniforms.
struct Uniforms {
    float2 size; float2 camTan; float2 mono;
    float sbs; float sep; float vOff; float vSkew;
    float s2l; float k1; float k2; float px;
    float tanMax; float bright; float flip; float pad;
};

struct VOut { float4 pos [[position]]; float2 uv; };

// One triangle covering the screen; uv is 0…1 with y down (screen points / size).
vertex VOut passthroughVertex(uint vid [[vertex_id]]) {
    float2 p = float2((vid << 1) & 2, vid & 2);
    VOut o;
    o.pos = float4(p * 2.0 - 1.0, 0.0, 1.0);
    o.uv = float2(p.x, 1.0 - p.y);
    return o;
}

// Mirrors js/render.js: DIST_FRAG (lens pre-distortion, per-eye centres) + BG_FRAG (camera picture,
// soft edges). Keep in step with MadarMath.passthroughSample (unit-tested).
fragment float4 passthroughFragment(VOut in [[stage_in]],
                                    constant Uniforms& u [[buffer(0)]],
                                    texture2d<float> texY [[texture(0)]],
                                    texture2d<float> texC [[texture(1)]]) {
    float2 p = in.uv * u.size;             // points, y down
    float2 tanP;
    float k = 1.0;
    if (u.sbs > 0.5) {
        float halfW = u.size.x * 0.5;
        bool right = p.x >= halfW;
        float py = u.size.y - p.y;          // y up, like GL
        float2 c = float2(halfW + (right ? 1.0 : -1.0) * u.sep * 0.5 * u.px,
                          u.size.y * 0.5 + (u.vOff + (right ? 0.5 : -0.5) * u.vSkew) * u.px);
        float2 o = (float2(p.x, py) - c) / u.px / u.s2l;
        float r2 = dot(o, o);
        float2 d = o * (1.0 + u.k1 * r2 + u.k2 * r2 * r2);
        float2 ruv = 0.5 + d / (2.0 * u.tanMax);
        float2 e = min(ruv, 1.0 - ruv);
        k = smoothstep(0.0, 0.025, min(e.x, e.y)) * smoothstep(0.0, 2.0, abs(p.x - halfW));
        tanP = d;
    } else {
        float2 n = float2(in.uv.x, 1.0 - in.uv.y);
        tanP = (n * 2.0 - 1.0) * u.mono;
    }
    float2 img = float2(0.5 + tanP.x / (2.0 * u.camTan.x), 0.5 - tanP.y / (2.0 * u.camTan.y));
    if (u.flip > 0.5) img = 1.0 - img;
    float2 ie = min(img, 1.0 - img);
    float f = smoothstep(0.0, 0.035, min(ie.x, ie.y)) * step(0.0, min(ie.x, ie.y));
    constexpr sampler s(filter::linear, address::clamp_to_edge);
    float y = texY.sample(s, img).r;
    float2 cbcr = texC.sample(s, img).rg - 0.5;
    float3 rgb = float3(y + 1.402 * cbcr.y, y - 0.344136 * cbcr.x - 0.714136 * cbcr.y, y + 1.772 * cbcr.x);
    float3 col = mix(float3(0.02, 0.025, 0.04), clamp(rgb, 0.0, 1.0) * u.bright, f);
    return float4(col * k, 1.0);
}
