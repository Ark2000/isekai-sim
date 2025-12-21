/**
 * World Visualization Shader
 * Composites multiple layers (Terrain, Water, Temp, Clouds, Wind) for rendering.
 */
export const WORLD_DISPLAY_FS = /* glsl */ `#version 300 es
precision mediump float;
in vec2 v_uv;

uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;
uniform sampler2D u_tex3;

uniform bool u_showHeight;
uniform bool u_showTemp;
uniform bool u_showCloud;
uniform bool u_showWind; 
uniform bool u_showHillshade; 
uniform bool u_showWater;

out vec4 outColor;

vec3 colorInterpolate(vec3 c1, vec3 c2, float v1, float v2, float value) {
    return mix(c1, c2, (value - v1) / (v2 - v1));
}

vec3 getTerrainColor(float value) {
    return vec3(value);
}

vec3 heatMap(float v) {
    return mix(vec3(0,0,1), vec3(1,0,0), v);
}
    
void main() {
    vec4 d0 = texture(u_tex0, v_uv);
    vec4 d1 = texture(u_tex1, v_uv);
    vec4 d2 = texture(u_tex2, v_uv);
    vec4 d3 = texture(u_tex3, v_uv);
    
    vec3 finalColor = vec3(0.0);
    
    if (u_showHeight) {
        float h = d0.r;
        finalColor = getTerrainColor(h);
        
        if (u_showHillshade) {
            vec2 pixelSize = 1.0 / vec2(textureSize(u_tex0, 0));
            float hL = texture(u_tex0, v_uv + vec2(-pixelSize.x, 0)).r;
            float hR = texture(u_tex0, v_uv + vec2(pixelSize.x, 0)).r;
            float hD = texture(u_tex0, v_uv + vec2(0, -pixelSize.y)).r;
            float hU = texture(u_tex0, v_uv + vec2(0, pixelSize.y)).r;
            vec3 normal = normalize(vec3(hL - hR, hD - hU, 0.05));
            vec3 lightDir = normalize(vec3(-1.0, 1.0, 1.0));
            float lighting = 0.6 + 0.4 * max(dot(normal, lightDir), 0.0);
            finalColor *= lighting;
        }
    }
    
    if (u_showWater) {
        float waterDepth = d3.r;
        if (waterDepth > 0.0001) {
            // 使用更自然的深浅水混合
            vec3 deepWater = vec3(0.05, 0.15, 0.45);
            vec3 shallowWater = vec3(0.4, 0.7, 1.0);
            vec3 waterColor = mix(shallowWater, deepWater, smoothstep(0.0, 0.4, waterDepth));
            
            // 使用更平滑的 Alpha 过渡，消除颗粒感
            float alpha = smoothstep(0.0, 0.08, waterDepth) * 0.75;
            finalColor = mix(finalColor, waterColor, alpha);
        }
    }
    
    if (u_showTemp) {
        vec3 tempColor = heatMap(d1.r);
        finalColor = u_showHeight ? mix(finalColor, tempColor, 0.5) : tempColor;
    }
    
    if (u_showCloud) {
        float cloud = d2.b;
        float shadow = smoothstep(0.2, 0.9, texture(u_tex2, v_uv + vec2(-0.01, 0.01)).b) * 0.5;
        if (u_showHeight || u_showTemp) finalColor = mix(finalColor, vec3(0.0), shadow);
        finalColor = mix(finalColor, vec3(1.0), smoothstep(0.1, 0.8, cloud) * 0.8);
    }

    if (u_showWind) {
        vec3 windColor = vec3(0.5) + vec3(d2.rg.x, d2.rg.y, 0.0) * 20.0;
        finalColor = (u_showHeight || u_showTemp || u_showCloud) ? mix(finalColor, windColor, 0.4) : windColor;
    }
    
    outColor = vec4(finalColor, 1.0);
}
`;