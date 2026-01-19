#version 300 es
/**
 * Terrain Generation Shader
 * Uses Simplex Noise and FBM to generate initial height and temperature maps.
 */
precision highp float;

in vec2 v_uv;

// Include shared noise functions
#include "common/noise.glsl"

uniform float u_seed;
uniform vec2 u_offset;
uniform float u_scale;

layout(location = 0) out vec4 out_tex0;
layout(location = 1) out vec4 out_tex1;
layout(location = 2) out vec4 out_tex2;
layout(location = 3) out vec4 out_tex3;

void main() {
    vec2 pos = (v_uv + u_offset) * u_scale;
    float n1 = fbm(pos + u_seed);
    float n2 = fbm(pos * 0.5 - u_seed);
    
    // FBM 返回 -1 到 1，归一化到 0-1，然后可以扩展范围
    // 保持生成时在 0-1 范围，但允许后续编辑突破这个范围
    float normalized = (n1 + n2 * 0.5) * 0.5 + 0.5; // -1~1 → 0~1
    float height = clamp(pow(normalized, 1.2), 0.0, 1.0);
    
    // 温度保持 0-1
    float temp = clamp(0.5 + 0.5 * sin(v_uv.y * 3.14159) + snoise(pos * 2.0) * 0.1, 0.0, 1.0);

    out_tex0 = vec4(height, 0.0, 0.0, 0.0);
    out_tex1 = vec4(temp, 0.0, 0.0, 0.0);
    out_tex2 = vec4(0.0);
    out_tex3 = vec4(0.0);
}
