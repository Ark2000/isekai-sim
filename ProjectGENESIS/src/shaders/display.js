/**
 * World Visualization Shader (Enhanced with SWE reference rendering)
 * Beautiful water rendering inspired by Shadertoy SWE implementation
 */
export const WORLD_DISPLAY_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;

uniform sampler2D u_tex0; // Terrain
uniform sampler2D u_tex1; // Temperature
uniform sampler2D u_tex2; // Wind/Cloud
uniform sampler2D u_tex3; // Water

uniform bool u_showHeight;
uniform bool u_showTemp;
uniform bool u_showCloud;
uniform bool u_showWind; 
uniform bool u_showHillshade; 
uniform bool u_showWater;

out vec4 outColor;

// Gamma correction (from reference)
#define Gamma(v) pow(v, vec3(2.2))
#define DeGamma(v) pow(v, vec3(1.0/2.2))

// Beautiful colors (inspired by reference)
const vec3 vWaterFogColor = Gamma(vec3(0.9, 0.4, 0.3)) * 16.0;
const vec3 vFoamColor = Gamma(vec3(0.9, 0.9, 0.85));
const vec3 vSkyColor = Gamma(vec3(0.01, 0.4, 0.8));
const vec3 vSunColor = Gamma(vec3(1.0, 0.8, 0.5));
const vec3 vTerrainColor0 = Gamma(vec3(1.0, 0.88, 0.7) * 0.8);
const vec3 vTerrainColor1 = Gamma(vec3(0.9, 0.9, 0.8) * 0.9);
const vec3 vLightDir = normalize(vec3(0.0, 0.21, -1.0));
const vec3 vLookDir = vec3(0.0, 0.0, -1.0);
const float g_fGridSizeInMeter = 5.0;

vec3 heatMap(float v) {
    return mix(vec3(0,0,1), vec3(1,0,0), v);
}

vec3 renderWater(vec2 uv, vec4 d0, vec4 d3, vec2 pixelSize, vec3 terrainColor) {
    float terrainHeight = d0.r;
    float waterDepth = d3.r;
    
    // Sample neighbors for normal calculation
    vec4 vTexL = texture(u_tex3, uv + vec2(-pixelSize.x, 0));
    vec4 vTexR = texture(u_tex3, uv + vec2(pixelSize.x, 0));
    vec4 vTexT = texture(u_tex3, uv + vec2(0, -pixelSize.y));
    vec4 vTexB = texture(u_tex3, uv + vec2(0, pixelSize.y));
    
    vec4 landL = texture(u_tex0, uv + vec2(-pixelSize.x, 0));
    vec4 landR = texture(u_tex0, uv + vec2(pixelSize.x, 0));
    vec4 landT = texture(u_tex0, uv + vec2(0, -pixelSize.y));
    vec4 landB = texture(u_tex0, uv + vec2(0, pixelSize.y));
    
    // Total surface height = terrain + water
    float hC = waterDepth + terrainHeight;
    float hL = vTexL.r + landL.r;
    float hR = vTexR.r + landR.r;
    float hT = vTexT.r + landT.r;
    float hB = vTexB.r + landB.r;
    
    // Calculate water surface normal (key for reflections/refractions)
    vec3 vNormal = vec3((hR - hL) * g_fGridSizeInMeter, (hB - hT) * g_fGridSizeInMeter, 2.0);
    vNormal = normalize(vNormal);
    
    // Refraction: distort terrain UV based on water surface normal
    vec2 vRefractUV = uv - vNormal.xy * waterDepth * 6.0;
    
    // Use the passed-in terrain color (which is already grayscale)
    vec3 vTerrainColor = terrainColor;
    
    // Apply depth-based darkening to terrain
    float fMaxZ = max(max(max(waterDepth, vTexL.r), vTexR.r), max(vTexT.r, vTexB.r));
    vTerrainColor *= 1.0 - min(1.0, fMaxZ * 80.0) * 0.2;
    
    // Water fog (volumetric effect in deep water)
    vec4 vTexCRefract = texture(u_tex3, vRefractUV);
    vec3 vFog = 1.0 - exp(-vTexCRefract.rrr / (vNormal.z * 0.9999) * vWaterFogColor);
    vec3 vRefract = vTerrainColor * (1.0 - vFog);
    
    // Sky reflection (Fresnel-like effect)
    vec3 vReflect = pow((1.0 - pow(vNormal.z * 0.9999999, 100.0)), 0.4) * 1.1 * vSkyColor;
    
    // Specular highlights (sun reflection)
    vec3 vHalfVec = normalize(vLookDir + vLightDir);
    float fHdotN = max(0.0, dot(-vHalfVec, vNormal));
    vReflect += pow(fHdotN, 1200.0) * 20.0 * vSunColor; // Sharp highlight
    vReflect += pow(fHdotN, 180.0) * 0.5 * vSkyColor;   // Soft glow
    
    // Reduce reflection for very shallow water (prevents permanent reflective layers)
    // When water depth is below 0.001m, gradually fade out reflections
    float minWaterDepth = 0.001;
    float reflectionFade = smoothstep(0.0, minWaterDepth, waterDepth);
    vReflect *= reflectionFade;
    
    // Lighting on water surface
    float fLight = pow(max(dot(vNormal, -vLightDir), 0.0), 10.0);
    
    // Foam in shallow water
    float fMinZ = min(min(min(waterDepth, vTexL.r), vTexR.r), min(vTexT.r, vTexB.r));
    float fFoam = max(0.0, 1.0 - fMinZ * 8.0) * 0.3;
    
    // Combine refraction (underwater) + reflection (surface)
    vec3 vWater = mix(vRefract * fLight + vReflect, vFoamColor, fFoam);
    
    // Alpha blending with terrain
    float fAlpha = min(1.0, waterDepth * 130.0);
    vec3 vOut = mix(vTerrainColor * fLight, vWater, fAlpha);
    
    return vOut;
}
    
void main() {
    vec4 d0 = texture(u_tex0, v_uv);
    vec4 d1 = texture(u_tex1, v_uv);
    vec4 d2 = texture(u_tex2, v_uv);
    vec4 d3 = texture(u_tex3, v_uv);
    
    vec2 pixelSize = 1.0 / vec2(textureSize(u_tex0, 0));
    
    vec3 finalColor = vec3(0.0);
    
    if (u_showHeight) {
        float h = d0.r;
        
        // 简单策略：直接显示，但clamp到可见范围
        // 这样生成的地形（0-1）看起来正常
        // 笔刷堆高的部分（>1）会显示为白色
        // 负高度（<0）会显示为黑色
        finalColor = vec3(clamp(h, 0.0, 1.0));
        
        if (u_showHillshade) {
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
    
    // Enhanced water rendering (from reference)
    // Pass the grayscale terrain color to water rendering
    // Only render water above minimum depth threshold (prevents permanent reflective layers)
    if (u_showWater && d3.r > 0.001) {
        finalColor = renderWater(v_uv, d0, d3, pixelSize, finalColor);
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
    
    // Gamma correction for more realistic colors
    outColor = vec4(DeGamma(finalColor), 1.0);
}
`;