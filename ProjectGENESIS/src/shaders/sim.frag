#version 300 es
/**
 * World Simulation Shader (Multi-Pass SWE + Atmosphere)
 * Pass 0: Velocity Integration (Pressure gradient -> Velocity update)
 * Pass 1: Height Integration (Velocity field -> Water depth update)
 * Pass 2: Erosion & Sediment Transport
 * Pass 3: Atmosphere (Wind, Cloud, Temperature)
 */
precision highp float;

in vec2 v_uv;

// Include shared noise functions
#include "common/noise.glsl"

// 4 Input Textures (Previous frame state)
uniform sampler2D u_tex0; // Terrain: R=Height
uniform sampler2D u_tex1; // Atmosphere: R=Temp
uniform sampler2D u_tex2; // R=WindX, G=WindY, B=Cloud, A=Vapor
uniform sampler2D u_tex3; // R=Water Depth, G=Sediment, B=VelocityX, A=VelocityY

// Pass control
uniform int u_simPass; // 0=Velocity, 1=Height, 2=Erosion, 3=Atmosphere

// Brush Uniforms
uniform vec2 u_brushPos;
uniform float u_brushRadius;
uniform float u_brushValue;
uniform float u_brushMode;
uniform int u_isBrushing;
uniform float u_brushDisturbance;
uniform float u_time;

uniform bool u_useTargetMode;
uniform float u_targetValue;
uniform int u_targetLayer;

// Global Wind
uniform vec2 u_globalWind; 

uniform int u_WaterSimMode; // 0=SWE, 1=VPM

// Physics Parameters (SWE)
uniform float u_gravity; // g = 10.0 in reference
uniform float u_gridSize; // cell size in meters = 5.0
uniform float u_deltaTime; // time step = 1.0
uniform float u_dampingAlpha; // velocity clamping = 0.5
uniform float u_dampingBeta; // overshooting reduction = 2.0
uniform float u_waterSpeedMultiplier; // global water speed control
uniform float u_waterDamping; // velocity damping (friction-like energy loss)

// Original physics parameters
uniform float u_cloudDecay;
uniform float u_rainThreshold;
uniform float u_evaporation;
uniform float u_condensation;
uniform float u_tempDiffusion;
uniform float u_tempInertia;
uniform float u_thermalWind;
uniform float u_waterEvap;

// 4 Output Targets
layout(location = 0) out vec4 out_tex0;
layout(location = 1) out vec4 out_tex1;
layout(location = 2) out vec4 out_tex2;
layout(location = 3) out vec4 out_tex3;

// ===== Constants =====
#define EPS 0.0001

// ===== Pass 0: Virtual Pipe Mode (VPM) Water Simulation =====
void pass0_waterSimulationVirtualPipeMode(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3, vec2 pixelSize) {
    float u_waterSoftening = 0.0;
    float u_waterFriction = 0.2;
    float u_waterFlow = 0.1;

    float land = d0.r;
    float water = d3.r;
    float minWater = 0.0001;
    vec2 flux = d3.ba; // 存储上一帧计算并限制好的通量 (B=Fx, A=Fy)

    vec4 n0L = texture(u_tex0, v_uv + vec2(-pixelSize.x, 0));
    vec4 n0R = texture(u_tex0, v_uv + vec2(pixelSize.x, 0));
    vec4 n0D = texture(u_tex0, v_uv + vec2(0, -pixelSize.y));
    vec4 n0U = texture(u_tex0, v_uv + vec2(0, pixelSize.y));
    vec4 nLand = vec4(n0L.r, n0R.r, n0D.r, n0U.r);

    vec4 n3L = texture(u_tex3, v_uv + vec2(-pixelSize.x, 0));
    vec4 n3R = texture(u_tex3, v_uv + vec2(pixelSize.x, 0));
    vec4 n3D = texture(u_tex3, v_uv + vec2(0, -pixelSize.y));
    vec4 n3U = texture(u_tex3, v_uv + vec2(0, pixelSize.y));
    vec4 nWater = vec4(n3L.r, n3R.r, n3D.r, n3U.r);

    // 严格质量守恒：根据上一帧的通量计算当前的流入和流出
    // 这样做能保证 A 给 B 的量，绝对等于 B 从 A 收到的量
    float outR = max(0.0, flux.x);
    float outL = max(0.0, -flux.x);
    float outU = max(0.0, flux.y);
    float outD = max(0.0, -flux.y);
    float totalOut = outR + outL + outU + outD;

    // 读取邻居上一帧存下的通量
    float inR = max(0.0, -n3R.b); // 右邻居向左流
    float inL = max(0.0, n3L.b);  // 左邻居向右流
    float inU = max(0.0, -n3U.a); // 上邻居向下流
    float inD = max(0.0, n3D.a);  // 下邻居向上流
    float totalIn = inL + inR + inU + inD;

    // 更新水量：当前水量 + 流入 - 流出
    water = max(0.0, water + totalIn - totalOut);

    // 2. 为下一帧计算新的期望通量 (Momentum + Pressure)
    float totalHeight = land + water;
    
    // 简单梯度计算：中心差分
    vec2 grad = vec2(
        (nLand.y + nWater.y) - (nLand.x + nWater.x),  // X方向：右 - 左
        (nLand.w + nWater.w) - (nLand.z + nWater.z)   // Y方向：上 - 下
    );

    // --- 改进：梯度软化 (抑制大地图上的细微波纹) ---
    float gradLen = length(grad);
    if (gradLen > 0.0) {
        grad = (grad / gradLen) * 0.432;
    }

    float frictionBase = u_waterFriction;
    float depthFriction = mix(0.4, frictionBase, smoothstep(0.0, 0.05, water)); 
    float pull = u_waterFlow * 0.4;
    
    // 计算新通量 (限制浅水处的推力)
    vec2 newFlux = flux * depthFriction - grad * pull * clamp(water * 10.0, 0.0, 1.0);

    // 3. 核心安全锁：限制通量，确保下一帧流出的水不会超过当前水量
    float nOutR = max(0.0, newFlux.x);
    float nOutL = max(0.0, -newFlux.x);
    float nOutU = max(0.0, newFlux.y);
    float nOutD = max(0.0, -newFlux.y);
    float nTotalOut = nOutR + nOutL + nOutU + nOutD;
    
    if (nTotalOut > water) {
        newFlux *= (water / (nTotalOut + 1e-7));
    }
    
    // 4. 边界处理
    if (water < minWater) {
        water = 0.0;
        newFlux = vec2(0.0);
    }
    if (water > 20.0) water = 20.0 + (water - 20.0) * 0.99;
    
    // 更新输出
    d3.r = water;
    d3.ba = newFlux;
}

// ===== Pass 0: Velocity Integration (Based on reference buffer_C.glsl) =====
// SWE mode function
void pass0_waterSimulationSWE(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3, vec2 pixelSize) {
    ivec2 tc = ivec2(v_uv * vec2(textureSize(u_tex0, 0)));
    
    vec4 vTexC = d3;
    vec4 vTexR = (tc.x < textureSize(u_tex0, 0).x - 1) ? 
        texelFetch(u_tex3, tc + ivec2(1, 0), 0) : vTexC * vec4(0.0, 0.0, 1.0, 1.0);
    vec4 vTexB = (tc.y < textureSize(u_tex0, 0).y - 1) ? 
        texelFetch(u_tex3, tc + ivec2(0, 1), 0) : vTexC * vec4(0.0, 0.0, 1.0, 1.0);
    
    vec4 landC = d0;
    vec4 landR = (tc.x < textureSize(u_tex0, 0).x - 1) ? 
        texelFetch(u_tex0, tc + ivec2(1, 0), 0) : landC;
    vec4 landB = (tc.y < textureSize(u_tex0, 0).y - 1) ? 
        texelFetch(u_tex0, tc + ivec2(0, 1), 0) : landC;
    
    float waterDepth = vTexC.r;
    float terrainHeight = landC.r;
    
    // Total surface height = terrain + water
    float zC = vTexC.r + landC.r; // depth + terrain
    float zR = vTexR.r + landR.r;
    float zB = vTexB.r + landB.r;
    
    // Compute velocity change from pressure gradient (gravity-driven)
    vec2 vV;
    vV.x = -u_gravity / u_gridSize * (zR - zC);
    vV.y = -u_gravity / u_gridSize * (zB - zC);
    
    // Apply global speed multiplier for safe user control
    vTexC.ba += vV * u_deltaTime * u_waterSpeedMultiplier;
    
    // Apply velocity damping (friction-like energy dissipation)
    // This prevents eternal oscillation in basins
    vTexC.ba *= u_waterDamping;
    
    // 2.1.4. Boundary Conditions (from reference)
    // Stop flow if either cell is dry and terrain is higher on dry side
    if ((vTexC.r <= EPS * u_gridSize && (landC.r + vTexC.r) > zR) || 
        (vTexR.r <= EPS * u_gridSize && (landR.r + vTexR.r) > zC)) {
        vTexC.b = 0.0; // Zero out X velocity
    }
    
    if ((vTexC.r <= EPS * u_gridSize && (landC.r + vTexC.r) > zB) || 
        (vTexB.r <= EPS * u_gridSize && (landB.r + vTexB.r) > zC)) {
        vTexC.a = 0.0; // Zero out Y velocity
    }
    
    // Clamp velocity magnitude (stability enhancement)
    float l = length(vTexC.ba);
    if (l > 0.0) {
        vTexC.ba /= l;
        l = min(l, u_gridSize / u_deltaTime * u_dampingAlpha);
        vTexC.ba *= l;
    }
    
    // Prevent negative water depth
    if (vTexC.r <= 0.0) {
        vTexC.r = 0.0;
    }
    
    d3 = vTexC;
}

// ===== Pass 1: Height Integration (Based on reference buffer_B.glsl) =====
// SWE mode function
void pass1_heightIntegrationSWE(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3, vec2 pixelSize) {
    ivec2 tc = ivec2(v_uv * vec2(textureSize(u_tex0, 0)));
    
    vec4 vTexC = d3;
    vec4 vTexL = (tc.x > 0) ? 
        texelFetch(u_tex3, tc + ivec2(-1, 0), 0) : vTexC * vec4(0.0, 0.0, 1.0, 1.0);
    vec4 vTexR = (tc.x < textureSize(u_tex0, 0).x - 1) ? 
        texelFetch(u_tex3, tc + ivec2(1, 0), 0) : vTexC * vec4(0.0, 0.0, 1.0, 1.0);
    vec4 vTexT = (tc.y > 0) ? 
        texelFetch(u_tex3, tc + ivec2(0, -1), 0) : vTexC * vec4(0.0, 0.0, 1.0, 1.0);
    vec4 vTexB = (tc.y < textureSize(u_tex0, 0).y - 1) ? 
        texelFetch(u_tex3, tc + ivec2(0, 1), 0) : vTexC * vec4(0.0, 0.0, 1.0, 1.0);
    
    // Extract velocities (stored in BA channels)
    float fxL = vTexL.b;
    float fxR = vTexC.b;
    float fyT = vTexT.a;
    float fyB = vTexC.a;
    
    // Upwind scheme: use depth from upwind direction
    float hL = (vTexL.b >= 0.0) ? vTexL.r : vTexC.r;
    float hR = (vTexC.b <= 0.0) ? vTexR.r : vTexC.r;
    float hT = (vTexT.a >= 0.0) ? vTexT.r : vTexC.r;
    float hB = (vTexC.a <= 0.0) ? vTexB.r : vTexC.r;
    
    // 2.2. Overshooting Reduction (stability enhancement from reference)
    // Fixed: Limit flux instead of modifying neighbor depths (prevents water disappearing)
    {
        float hAvgMax = u_dampingBeta * u_gridSize / (u_gravity * u_deltaTime);
        // Check if neighbors average exceeds limit
        float hNeighborAvg = (vTexL.r + vTexR.r + vTexT.r + vTexB.r) / 4.0;
        float hAdj = max(0.0, hNeighborAvg - hAvgMax);
        
        // Apply reduction to flux calculation, not neighbor depths
        // This prevents water from disappearing when brushing quickly
        if (hAdj > 0.0) {
            // Reduce the upwind depths used in flux calculation
            hL = max(0.0, hL - hAdj);
            hR = max(0.0, hR - hAdj);
            hT = max(0.0, hT - hAdj);
            hB = max(0.0, hB - hAdj);
        }
    }
    
    // Compute divergence of flux (height change rate)
    float dH = -((hR * fxR - hL * fxL) / u_gridSize + (hB * fyB - hT * fyT) / u_gridSize);
    
    // Limit maximum depth change per frame (CFL-like condition)
    // This prevents instability when brushing water too quickly
    float maxDepthChange = u_gridSize / (u_gravity * u_deltaTime) * 0.5;
    dH = clamp(dH, -maxDepthChange, maxDepthChange);
    
    vTexC.r += dH * u_deltaTime;
    
    // Fixed: Prevent negative water depth in Pass 1 (critical for stability)
    if (vTexC.r <= 0.0) {
        vTexC.r = 0.0;
    }
    
    d3 = vTexC;
}

// ===== Pass 2: Erosion & Sediment Transport (DISABLED) =====
void pass2_erosion(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3, vec2 pixelSize) {
    // Erosion and sediment transport disabled for now
    // Just pass through the data unchanged
}

// ===== Pass 3: Atmosphere (Wind, Cloud, Temperature) =====
void pass3_atmosphere(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3, vec2 pixelSize) {
    // --- Wind & Atmosphere ---
    vec2 wind = u_globalWind * 0.001;
    float noiseWindAngle = snoise(v_uv * 3.0 + u_time * 0.1) * 3.14;
    wind += vec2(cos(noiseWindAngle), sin(noiseWindAngle)) * 0.1;
    
    float hL = texture(u_tex0, v_uv + vec2(-pixelSize.x, 0)).r;
    float hR = texture(u_tex0, v_uv + vec2(pixelSize.x, 0)).r;
    float hD = texture(u_tex0, v_uv + vec2(0, -pixelSize.y)).r;
    float hU = texture(u_tex0, v_uv + vec2(0, pixelSize.y)).r;
    vec2 gradient = vec2(hR - hL, hU - hD);
    wind -= gradient * 0.5;
    
    float tL = texture(u_tex1, v_uv + vec2(-pixelSize.x, 0)).r;
    float tR = texture(u_tex1, v_uv + vec2(pixelSize.x, 0)).r;
    float tD = texture(u_tex1, v_uv + vec2(0, -pixelSize.y)).r;
    float tU = texture(u_tex1, v_uv + vec2(0, pixelSize.y)).r;
    wind += vec2(tR - tL, tU - tD) * u_thermalWind;
    
    d2.rg = mix(d2.rg, wind, 0.1);
    
    // Advection
    vec2 oldPos = v_uv - d2.rg * pixelSize;
    vec4 oldD2 = texture(u_tex2, oldPos);
    float cloud = oldD2.b;
    float vapor = oldD2.a;
    float temp = texture(u_tex1, oldPos).r;
    
    temp = mix(temp, (tL + tR + tD + tU) * 0.25, u_tempDiffusion);
    
    // --- Cloud & Water Cycle ---
    float uplift = max(0.0, -dot(d2.rg, gradient)); 
    float cond = min(vapor, (u_condensation * (1.0 - temp) + uplift * 0.05));
    vapor -= cond;
    cloud += cond;
    
    if (cloud > u_rainThreshold) {
        float rain = (cloud - u_rainThreshold) * 0.05;
        cloud -= rain;
    }
    cloud *= u_cloudDecay;
    
    d2.b = clamp(cloud, 0.0, 1.0);
    d2.a = clamp(vapor, 0.0, 1.0);
    
    // Temperature reset (with inertia)
    float w = (u_isBrushing > 0 && u_targetLayer == 1) ? 0.0 : (1.0 - u_tempInertia);
    d1.r = mix(temp, (0.5 + 0.5 * sin(v_uv.y * 3.14159)) - d0.r * 0.5, w);
}

// ===== Brush Interaction (Applied in all passes) =====
void applyBrush(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3) {
    if (u_isBrushing > 0) {
        vec2 delta = v_uv - u_brushPos;
        if (delta.x > 0.5) delta.x -= 1.0;
        if (delta.x < -0.5) delta.x += 1.0;
        if (delta.y > 0.5) delta.y -= 1.0;
        if (delta.y < -0.5) delta.y += 1.0;
        
        float dist = length(delta);
        if (dist < u_brushRadius) {
            float strength = smoothstep(u_brushRadius, u_brushRadius * 0.1, dist);
            if (u_brushDisturbance > 0.0) {
                strength = clamp(strength + (hash(v_uv * 100.0 + u_time) - 0.5) * u_brushDisturbance * 0.1, 0.0, 1.0);
            }
            
            float dVal = strength * u_brushValue * 0.1 * u_brushMode;
            float currentVal = (u_targetLayer == 1) ? d1.r : (u_targetLayer == 2) ? d2.b : (u_targetLayer == 4) ? d3.r : d0.r;
            float newVal;
            
            if (u_useTargetMode) {
                newVal = (u_brushMode > 0.0) ? min(u_targetValue, currentVal + dVal) : max(u_targetValue, currentVal + dVal);
            } else {
                // 不再clamp！允许笔刷堆叠到任意高度
                newVal = currentVal + dVal;
            }
            
            if (u_targetLayer == 1) { d1.r = newVal; }
            else if (u_targetLayer == 2) { d2.b = newVal; }
            else if (u_targetLayer == 4) { d3.r = newVal; }
            else { d0.r = newVal; }
        }
    }
}

// ===== Main Function =====
void main() {
    vec4 d0 = texture(u_tex0, v_uv);
    vec4 d1 = texture(u_tex1, v_uv);
    vec4 d2 = texture(u_tex2, v_uv);
    vec4 d3 = texture(u_tex3, v_uv);
    
    vec2 pixelSize = 1.0 / vec2(textureSize(u_tex0, 0));
    
    // Execute different pass based on u_simPass
    if (u_simPass == 0) {
        if (u_WaterSimMode == 1) {
            pass0_waterSimulationVirtualPipeMode(d0, d1, d2, d3, pixelSize);
        } else {
            pass0_waterSimulationSWE(d0, d1, d2, d3, pixelSize);
        }
    } else if (u_simPass == 1) {
        if (u_WaterSimMode == 1) {
            // do nothing
        } else {
            pass1_heightIntegrationSWE(d0, d1, d2, d3, pixelSize);
        }
    } else if (u_simPass == 2) {
        // Pass 2: Erosion & Sediment Transport
        pass2_erosion(d0, d1, d2, d3, pixelSize);
    } else if (u_simPass == 3) {
        // Pass 3: Atmosphere (Wind, Cloud, Temperature)
        pass3_atmosphere(d0, d1, d2, d3, pixelSize);
    }
    
    // Apply brush interaction (works in all passes)
    applyBrush(d0, d1, d2, d3);
    
    out_tex0 = d0;
    out_tex1 = d1;
    out_tex2 = d2;
    out_tex3 = d3;
}
