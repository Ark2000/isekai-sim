/**
 * World Simulation Shader (Uber Shader)
 * Handles physics: Wind, Temperature, Clouds, and Water flow.
 */
export const WORLD_SIM_FS = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;

// 4 Input Textures (Previous frame state)
uniform sampler2D u_tex0; // Terrain: R=Height
uniform sampler2D u_tex1; // Atmosphere: R=Temp
uniform sampler2D u_tex2; // R=WindX, G=WindY, B=Cloud, A=Vapor
uniform sampler2D u_tex3; // R=Water Depth, G=Sediment, B=FluxX, A=FluxY

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

// Physics Parameters
uniform float u_cloudDecay;
uniform float u_rainThreshold;
uniform float u_evaporation;
uniform float u_condensation;
uniform float u_tempDiffusion;
uniform float u_tempInertia;
uniform float u_thermalWind;
uniform float u_waterFlow;
uniform float u_waterEvap;
uniform float u_waterFriction;
uniform float u_waterSoftening;
uniform float u_waterSmoothing;
uniform float u_erosionRate;
uniform float u_depositionRate;
uniform float u_erosionStrength;
uniform float u_talusRate;
uniform float u_talusThreshold;

// 4 Output Targets
layout(location = 0) out vec4 out_tex0;
layout(location = 1) out vec4 out_tex1;
layout(location = 2) out vec4 out_tex2;
layout(location = 3) out vec4 out_tex3;

// Helper Functions
float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

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

void main() {
    vec4 d0 = texture(u_tex0, v_uv);
    vec4 d1 = texture(u_tex1, v_uv);
    vec4 d2 = texture(u_tex2, v_uv);
    vec4 d3 = texture(u_tex3, v_uv);

    vec2 pixelSize = 1.0 / vec2(textureSize(u_tex0, 0));
    
    // --- 0.5 Dynamic Water Flow (Flux-based Mass-Conserving VPM) ---
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
    
    // 1. 严格质量守恒：根据上一帧的通量计算当前的流入和流出
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
    // 1.2 增强型人工粘性：使用更强的平滑权重来镇压棋盘格震荡
    float rawWater = max(0.0, water + totalIn - totalOut);
    float avgNeighborWater = (nWater.x + nWater.y + nWater.z + nWater.w) * 0.25;
    
    // 使用面板上的平滑系数
    water = mix(rawWater, avgNeighborWater, u_waterSmoothing);

    // 2. 为下一帧计算新的期望通量 (Momentum + Pressure)
    float totalHeight = land + water;
    
    // --- 改进：多采样梯度 (引入中心像素，彻底解决脱钩问题) ---
    vec2 grad = vec2(
        (nLand.y + nWater.y - (nLand.x + nWater.x)) * 0.25 + (nLand.y + nWater.y - totalHeight) * 0.25 + (totalHeight - (nLand.x + nWater.x)) * 0.25,
        (nLand.w + nWater.w - (nLand.z + nWater.z)) * 0.25 + (nLand.w + nWater.w - totalHeight) * 0.25 + (totalHeight - (nLand.z + nWater.z)) * 0.25
    );
    
    // --- 改进：梯度软化 (抑制大地图上的细微波纹) ---
    float gradLen = length(grad);
    if (gradLen > 0.0) {
        grad = (grad / gradLen) * pow(gradLen, u_waterSoftening);
    }

    // --- 改进：通量平滑 (速度场阻尼，进一步减少震荡) ---
    vec2 avgNeighborFlux = (n3L.ba + n3R.ba + n3D.ba + n3U.ba) * 0.25;
    vec2 smoothFlux = mix(flux, avgNeighborFlux, 0.1);

    float frictionBase = u_waterFriction;
    float depthFriction = mix(0.4, frictionBase, smoothstep(0.0, 0.05, water)); 
    float pull = u_waterFlow * 0.4;
    
    // 计算新通量 (限制浅水处的推力)
    vec2 newFlux = smoothFlux * depthFriction - grad * pull * clamp(water * 10.0, 0.0, 1.0);
    
    // --- 改进：终端速度限制 (防止极端情况下的数值抖动) ---
    float maxF = 0.1;
    float currentF = length(newFlux);
    if (currentF > maxF) newFlux = (newFlux / currentF) * maxF;
    
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
    
    float sediment = d3.g;
    
    // --- 0.6 Thermal Erosion (Talus / dry crumbling) ---
    // 让过陡峭的地形即使没有水也会自然坍塌

    float talusRate = u_talusRate * 0.01;

    float talusL = max(0.0, (n0L.r - land) - u_talusThreshold);
    float talusR = max(0.0, (n0R.r - land) - u_talusThreshold);
    float talusD = max(0.0, (n0D.r - land) - u_talusThreshold);
    float talusU = max(0.0, (n0U.r - land) - u_talusThreshold);
    float totalTalusIn = (talusL + talusR + talusD + talusU) * talusRate;
    
    float talusOutL = max(0.0, (land - n0L.r) - u_talusThreshold);
    float talusOutR = max(0.0, (land - n0R.r) - u_talusThreshold);
    float talusOutD = max(0.0, (land - n0D.r) - u_talusThreshold);
    float talusOutU = max(0.0, (land - n0U.r) - u_talusThreshold);
    float totalTalusOut = (talusOutL + talusOutR + talusOutD + talusOutU) * talusRate;
    
    land += totalTalusIn - totalTalusOut;

    // --- 0.7 Hydraulic Erosion (Enhanced Physical Model) ---
    float erosionChange = 0.0;
    float depositionChange = 0.0;
    float sedimentChange = 0.0;
    
    if (water > minWater) {
        // 1. 计算流速和坡度因子
        float velocity = length(newFlux) * 10.0;
        vec4 landHeightDiff = nLand - land;
        float slope = max(max(abs(landHeightDiff.x), abs(landHeightDiff.y)), max(abs(landHeightDiff.z), abs(landHeightDiff.w)));
        
        // 2. 计算搬运能力 (Capacity = K * Slope * Velocity * Water)
        // 引入坡度后，陡峭的河床冲刷力更强
        float sedimentCapacity = clamp(velocity * water * slope * 5.0, 0.0, 0.2);
        
        // 3. 侵蚀与沉积逻辑
        if (sediment < sedimentCapacity) {
            // 侵蚀：将地形高度转化为泥沙
            float erosionAmount = (sedimentCapacity - sediment) * u_erosionRate * u_erosionStrength;
            erosionChange = -erosionAmount;
            sedimentChange = erosionAmount;
        } else {
            // 沉积：泥沙沉淀回地形。当流速下降时，沉积速度加快（模拟三角洲形成）
            float depositionAmount = (sediment - sedimentCapacity) * u_depositionRate;
            depositionChange = depositionAmount;
            sedimentChange = -depositionAmount;
        }
    }
    
    // --- 0.8 Sediment Transport (Strictly Conserving Flux-based) ---
    // 利用我们已经算好的水流通量(Flux)来移动泥沙
    // 这能保证泥沙的总量守恒，不会像以前那样凭空产生泥沙
    float sOutR = max(0.0, newFlux.x) / (water + 1e-6);
    float sOutL = max(0.0, -newFlux.x) / (water + 1e-6);
    float sOutU = max(0.0, newFlux.y) / (water + 1e-6);
    float sOutD = max(0.0, -newFlux.y) / (water + 1e-6);
    float sedTotalOut = (sOutR + sOutL + sOutU + sOutD) * sediment;
    
    float sInL = max(0.0, n3L.b) / (n3L.r + 1e-6) * n3L.g;
    float sInR = max(0.0, -n3R.b) / (n3R.r + 1e-6) * n3R.g;
    float sInD = max(0.0, n3D.a) / (n3D.r + 1e-6) * n3D.g;
    float sInU = max(0.0, -n3U.a) / (n3U.r + 1e-6) * n3U.g;
    float sedTotalIn = sInL + sInR + sInD + sInU;

    sediment = clamp(sediment + sedimentChange + sedTotalIn - sedTotalOut, 0.0, 0.5);
    land = clamp(land + erosionChange + depositionChange, 0.0, 1.0);
    
    d0.r = land;
    d3.r = water;
    d3.g = sediment;

    // --- 1. Wind & Atmosphere ---
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
    
    // --- 3. Cloud & Water Cycle ---
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
    
    // --- 4. Brush Interaction ---
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
            float currentVal = (u_targetLayer == 1) ? temp : (u_targetLayer == 2) ? d2.b : (u_targetLayer == 4) ? d3.r : d0.r;
            float newVal;
            
            if (u_useTargetMode) {
                newVal = (u_brushMode > 0.0) ? min(u_targetValue, currentVal + dVal) : max(u_targetValue, currentVal + dVal);
            } else {
                newVal = clamp(currentVal + dVal, 0.0, 1.0);
            }
            
            if (u_targetLayer == 1) { d1.r = newVal; temp = newVal; }
            else if (u_targetLayer == 2) { d2.b = newVal; }
            else if (u_targetLayer == 4) { d3.r = newVal; }
            else { d0.r = newVal; }
        }
    }

    float w = (u_isBrushing > 0 && u_targetLayer == 1) ? 0.0 : (1.0 - u_tempInertia);
    d1.r = mix(temp, (0.5 + 0.5 * sin(v_uv.y * 3.14159)) - d0.r * 0.5, w);

    out_tex0 = d0;
    out_tex1 = d1;
    out_tex2 = d2;
    out_tex3 = d3;
}
`;