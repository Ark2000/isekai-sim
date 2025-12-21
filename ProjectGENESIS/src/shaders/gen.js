/**
 * Terrain Generation Shader
 * Uses Simplex Noise and FBM to generate initial height and temperature maps.
 */
export const WORLD_GEN_FS = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
uniform float u_seed;
uniform vec2 u_offset;
uniform float u_scale;

layout(location = 0) out vec4 out_tex0;
layout(location = 1) out vec4 out_tex1;
layout(location = 2) out vec4 out_tex2;
layout(location = 3) out vec4 out_tex3;

// --- Simplex Noise 2D ---
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ; m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 6; i++) {
        value += amplitude * snoise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 pos = (v_uv + u_offset) * u_scale;
    float n1 = fbm(pos + u_seed);
    float n2 = fbm(pos * 0.5 - u_seed);
    
    float height = clamp(pow((n1 + n2 * 0.5) * 0.5 + 0.5, 1.2), 0.0, 1.0);

    float temp = clamp(0.5 + 0.5 * sin(v_uv.y * 3.14159) + snoise(pos * 2.0) * 0.1, 0.0, 1.0);

    out_tex0 = vec4(height, 0.0, 0.0, 0.0);
    out_tex1 = vec4(temp, 0.0, 0.0, 0.0);
    out_tex2 = vec4(0.0);
    out_tex3 = vec4(0.0);
}
`;