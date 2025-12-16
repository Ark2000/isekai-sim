// WorldLayer 相关的 Shader 代码

// 物理模拟核心 Shader (Uber Shader)
export const WORLD_SIM_FS = `#version 300 es
precision highp float;

in vec2 v_uv;

// 4个输入纹理 (上一帧的状态)
uniform sampler2D u_tex0; // Terrain: R=Height
uniform sampler2D u_tex1; // Atmosphere: R=Temp
uniform sampler2D u_tex2;
uniform sampler2D u_tex3;

// 笔刷 Uniforms
uniform vec2 u_brushPos;       // UV coordinates (0-1)
uniform float u_brushRadius;   // UV size
uniform float u_brushValue;    // 强度
uniform float u_brushMode;     // 1.0 or -1.0
uniform int u_isBrushing;      // bool
uniform float u_brushDisturbance; // 随机扰动 (0-1)
uniform float u_time;          // 时间种子

uniform bool u_useTargetMode;  // 是否使用目标值模式
uniform float u_targetValue;   // 目标值
uniform int u_targetLayer;     // 0=Height(d0.r), 1=Temp(d1.r)

// 全局风向参数 (从 CPU 传入)
uniform vec2 u_globalWind; 

// 物理参数 Uniforms
uniform float u_cloudDecay;      // 0.999
uniform float u_rainThreshold;   // 0.9
uniform float u_evaporation;     // 0.01
uniform float u_condensation;    // 0.005
uniform float u_tempDiffusion;   // 0.01
uniform float u_tempInertia;     // 0.995
uniform float u_thermalWind;     // 0.5
uniform float u_waterFlow;       // 0.2
uniform float u_waterEvap;       // 0.0001

// 4个输出目标
layout(location = 0) out vec4 out_tex0;
layout(location = 1) out vec4 out_tex1;
layout(location = 2) out vec4 out_tex2;
layout(location = 3) out vec4 out_tex3;

// 简单的伪随机函数
float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// ---------------------------------------------
// Simplex Noise 2D (复制自 World Gen)
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
  m = m*m ;
  m = m*m ;
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
// ---------------------------------------------

void main() {
    // 读取上一帧数据
    vec4 d0 = texture(u_tex0, v_uv);
    vec4 d1 = texture(u_tex1, v_uv);
    vec4 d2 = texture(u_tex2, v_uv); // R=WindX, G=WindY, B=Cloud, A=Vapor
    vec4 d3 = texture(u_tex3, v_uv); // R=Water Depth

    // --- 0. 全局物理参数 ---
    vec2 pixelSize = 1.0 / vec2(textureSize(u_tex0, 0));
    
    // --- 0.5 水流模拟 (Water Flow) - 守恒版本 ---
    float land = d0.r;
    float water = d3.r;
    
    if (water > 0.0001 || true) { // 总是计算，包括接收流入
        // 计算当前点的总高度 (Terrain + Water)
        float h = land + water;
        
        // 采样周围 4 个点
        vec4 nLand;
        nLand.x = texture(u_tex0, v_uv + vec2(-pixelSize.x, 0)).r;
        nLand.y = texture(u_tex0, v_uv + vec2(pixelSize.x, 0)).r;
        nLand.z = texture(u_tex0, v_uv + vec2(0, -pixelSize.y)).r;
        nLand.w = texture(u_tex0, v_uv + vec2(0, pixelSize.y)).r;
        
        vec4 nWater;
        nWater.x = texture(u_tex3, v_uv + vec2(-pixelSize.x, 0)).r;
        nWater.y = texture(u_tex3, v_uv + vec2(pixelSize.x, 0)).r;
        nWater.z = texture(u_tex3, v_uv + vec2(0, -pixelSize.y)).r;
        nWater.w = texture(u_tex3, v_uv + vec2(0, pixelSize.y)).r;
        
        // 邻居总高度
        vec4 nH = nLand + nWater;
        
        // 简化的守恒流动模型：
        // 对每个邻居，如果它的水位比我高，我们就"交换"一部分水
        // 交换量 = (他的水位 - 我的水位) * 系数
        float flowChange = 0.0;
        
        // 左
        float deltaH_L = (nH.x - h);
        flowChange += deltaH_L * u_waterFlow * 0.25;
        
        // 右
        float deltaH_R = (nH.y - h);
        flowChange += deltaH_R * u_waterFlow * 0.25;
        
        // 下
        float deltaH_D = (nH.z - h);
        flowChange += deltaH_D * u_waterFlow * 0.25;
        
        // 上
        float deltaH_U = (nH.w - h);
        flowChange += deltaH_U * u_waterFlow * 0.25;
        
        // 更新水量
        water += flowChange;
    }
    
    // 蒸发
    water = max(0.0, water - u_waterEvap);
    
    d3.r = clamp(water, 0.0, 10.0);


    // --- 1. 风场计算 (Tex2.RG) ---
    // 基础风: 向东吹 (1.0, 0.0)
    vec2 wind = u_globalWind * 0.001;
    
    // 噪声扰动风
    float noiseWindAngle = snoise(v_uv * 3.0 + u_time * 0.1) * 3.14;
    vec2 randomWind = vec2(cos(noiseWindAngle), sin(noiseWindAngle)) * 0.1;
    
    // 地形阻挡/导向 (简单的梯度计算)
    float hL = texture(u_tex0, v_uv + vec2(-pixelSize.x, 0)).r;
    float hR = texture(u_tex0, v_uv + vec2(pixelSize.x, 0)).r;
    float hD = texture(u_tex0, v_uv + vec2(0, -pixelSize.y)).r;
    float hU = texture(u_tex0, v_uv + vec2(0, pixelSize.y)).r;
    vec2 gradient = vec2(hR - hL, hU - hD);
    
    // 风倾向于绕过高山，或者沿坡度吹
    wind += randomWind;
    wind -= gradient * 0.5; // 简单的阻挡效应
    
    // --- 1.1 温差风与温度扩散 ---
    // 采样周围温度
    float tL = texture(u_tex1, v_uv + vec2(-pixelSize.x, 0)).r;
    float tR = texture(u_tex1, v_uv + vec2(pixelSize.x, 0)).r;
    float tD = texture(u_tex1, v_uv + vec2(0, -pixelSize.y)).r;
    float tU = texture(u_tex1, v_uv + vec2(0, pixelSize.y)).r;
    
    // A. 计算温差风
    // 地面热 -> 空气上升 -> 地面形成低压 -> 风吹向热的地方
    vec2 tempGrad = vec2(tR - tL, tU - tD);
    wind += tempGrad * u_thermalWind; // 风向热源加速

    d2.rg = mix(d2.rg, wind, 0.1); // 惯性更新
    
    
    // --- 2. 物质平流 (Advection) - 随风飘动 ---
    // 逆向追踪：我是谁？我从哪里来？
    // 当前点的物质，应该等于 "上风处" 那个点的物质
    vec2 velocity = d2.rg;
    vec2 oldPos = v_uv - velocity * pixelSize * 1.0; // 1.0 是速度因子
    
    // 2.1 云和平流
    vec4 oldD2 = texture(u_tex2, oldPos);
    float cloud = oldD2.b;
    float vapor = oldD2.a;

    // 2.2 温度平流
    // 既然我们已经算出了上风口的位置 oldPos，直接去那里取温度就行
    float temp = texture(u_tex1, oldPos).r;
    
    // B. 计算温度扩散 (复用上面的采样值是不准确的，因为那是当前位置的邻居，而我们现在是在算平流后的温度)
    // 但为了性能和代码简洁，并且因为平流偏移量很小，我们可以近似认为扩散是发生在平流之后的局部
    // 或者我们重新采样当前点的邻居做扩散，再叠加到平流后的结果上？
    // 最正确的做法：
    // Advection 负责搬运，Diffusion 负责原地扩散。
    // 这里我们简单处理：对当前平流过来的 temp 进行一次平滑
    // 为了避免重定义，我们这里不再重新定义 tL, tR 等，而是直接使用 temp
    // 其实更好的扩散是在平流前做，或者独立一步。
    
    // 简单处理：对当前平流过来的 temp 进行一次平滑
    // 为了避免重定义，我们这里不再重新定义 tL, tR 等，而是直接使用 temp
    float avgLocalTemp = (tL + tR + tD + tU) * 0.25;
    
    // 最终温度 = 平流来的温度 * (1-diffusion) + 本地平均温度 * diffusion (模拟扩散)
    temp = mix(temp, avgLocalTemp, u_tempDiffusion);
    
    
    // --- 3. 云的生消与水循环 (Life Cycle & Water Cycle) ---
    // float temp = d1.r; // 此时 temp 已经在上面通过平流更新了，不需要再读 d1.r
    float height = d0.r;
    
    // 3.1 蒸发 (Evaporation): 水面(高度低 或 有水)且温度高的地方产生水汽
    float evaporation = 0.0;
    
    // A. 海洋蒸发（低地 + 没有额外水层）
    if (height < 0.2 && water < 0.01) {
        evaporation = max(0.0, temp - 0.3) * u_evaporation;
    }
    
    // B. 湖泊/河流/积水蒸发（有水层的地方）
    if (water > 0.001) {
        // 水面蒸发，温度越高蒸发越快
        float waterEvapRate = u_evaporation * 2.0; // 水面蒸发是海洋的2倍（更浅更容易蒸发）
        evaporation += max(0.0, temp - 0.2) * waterEvapRate;
        
        // 同时，水面蒸发会减少水量（除了产生水汽，也有"蒸发损失"）
        water = max(0.0, water - u_waterEvap);
    }
    
    vapor += evaporation;
    
    // 3.2 凝结 (Condensation): 水汽 -> 云
    // 温度低或者是迎风坡(上升气流)容易凝结
    // 简单的上升气流判定：风撞墙了(wind dot gradient < 0)
    float uplift = max(0.0, -dot(velocity, gradient)); 
    float condensationRate = 0.0;
    
    if (vapor > 0.1) {
        // 基本凝结（温度越低越快）
        float tempFactor = 1.0 - temp; // 温度越低（temp接近0），系数越大
        condensationRate += u_condensation * tempFactor;
        // 地形抬升凝结
        condensationRate += uplift * 0.05;
    }
    
    // 限制凝结量
    float condensed = min(vapor, condensationRate);
    vapor -= condensed;
    cloud += condensed;
    
    // 3.3 降雨 (Precipitation) - 关键：降雨形成地面水！
    // 云太厚会下雨，雨水落到地面增加水量
    float rain = 0.0;
    if (cloud > u_rainThreshold) {
        rain = (cloud - u_rainThreshold) * 0.05;
        cloud -= rain;
        
        // 雨水落到地面，增加水深！
        water += rain * 0.5; // 0.5 是转换系数（云密度 -> 水深）
    }
    
    cloud *= u_cloudDecay; // 自然衰减
    
    d2.b = clamp(cloud, 0.0, 1.0);
    d2.a = clamp(vapor, 0.0, 1.0);
    
    // 更新水深（之前只在流动部分更新，现在降雨也会增加）
    d3.r = clamp(water, 0.0, 10.0);
    
    d2.b = clamp(cloud, 0.0, 1.0);
    d2.a = clamp(vapor, 0.0, 1.0);
    
    // --- 4. 笔刷交互逻辑 ---
    if (u_isBrushing > 0) {
        // 计算当前像素到笔刷中心的距离（考虑环绕边界）
        // 在环面拓扑中，距离计算需要考虑"绕一圈"可能更近
        vec2 delta = v_uv - u_brushPos;
        
        // 如果差值超过 0.5，说明绕过边界更近
        if (delta.x > 0.5) delta.x -= 1.0;
        if (delta.x < -0.5) delta.x += 1.0;
        if (delta.y > 0.5) delta.y -= 1.0;
        if (delta.y < -0.5) delta.y += 1.0;
        
        float dist = length(delta);
        
        if (dist < u_brushRadius) {
            // 简单的圆形笔刷衰减
            float strength = smoothstep(u_brushRadius, u_brushRadius * 0.1, dist);
            
            // 应用随机扰动
            if (u_brushDisturbance > 0.0) {
                // 使用坐标+时间作为随机种子，确保每次点击都不一样
                float noise = (hash(v_uv * 100.0 + u_time) - 0.5) * u_brushDisturbance * 0.1; 
                strength = clamp(strength + noise, 0.0, 1.0);
            }

            // 修改高度 (d0.r) 或 温度 (d1.r)
            float delta = strength * u_brushValue * 0.1 * u_brushMode; // 0.1是速度因子
            
            float currentVal;
            
            // 根据目标层选择当前值
            if (u_targetLayer == 1) {
                currentVal = temp; // 使用平流后的温度，而不是 d1.r
            } else if (u_targetLayer == 2) {
                currentVal = d2.b; // Cloud (Tex2.B)
            } else if (u_targetLayer == 4) {
                currentVal = d3.r; // Water (Tex3.R)
            } else {
                currentVal = d0.r;
            }
            
            float newVal = currentVal;
            
            if (u_useTargetMode) {
                // 目标模式：逼近 u_targetValue
                if (u_brushMode > 0.0) {
                    // Add
                    if (currentVal < u_targetValue) {
                        newVal = min(u_targetValue, currentVal + delta);
                    }
                } else {
                    // Sub
                    if (currentVal > u_targetValue) {
                        newVal = max(u_targetValue, currentVal + delta);
                    }
                }
            } else {
                // 普通模式
                newVal = clamp(currentVal + delta, 0.0, 1.0);
            }
            
            // 写回对应通道
            if (u_targetLayer == 1) {
                d1.r = newVal;
                temp = newVal; // 关键：同步更新 temp，防止被后续的物理逻辑覆盖
            } else if (u_targetLayer == 2) {
                d2.b = newVal;
            } else if (u_targetLayer == 4) {
                d3.r = newVal; // Water
            } else {
                d0.r = newVal;
            }
        }
    }

    // --- 2. 简单的物理模拟测试 ---
    // 只有在非绘制温度时才启用自动温度平衡？或者让笔刷压倒物理模拟？
    // 这里我们做一个简单的互斥：如果正在画温度，就暂时减弱物理模拟的影响
    float physicsWeight = (u_isBrushing > 0 && u_targetLayer == 1) ? 0.0 : 0.01;
    
    // 比如：高度越高，温度越低
    float baseTemp = 0.5 + 0.5 * sin(v_uv.y * 3.14159); // 纬度影响
    float heightFactor = d0.r;
    
    // 更新 d1.r (温度)
    // 混合逻辑： (平流后的温度) <-> (环境平衡温度)
    // physicsWeight 决定了回归环境温度的速度。如果太快，平流效果就不明显。
    // 我们稍微减小 physicsWeight 让风的影响更持久
    float targetTemp = baseTemp - heightFactor * 0.5;
    
    // 如果正在画笔刷，就暂时不回归环境，完全听笔刷的 (physicsWeight = 0)
    // 否则以 (1.0 - inertia) 的速度回归环境
    float w = (u_isBrushing > 0 && u_targetLayer == 1) ? 0.0 : (1.0 - u_tempInertia);
    
    d1.r = mix(temp, targetTemp, w);

    // 输出结果
    out_tex0 = d0;
    out_tex1 = d1;
    out_tex2 = d2;
    out_tex3 = d3;
}
`;

// ... (前面的 WORLD_SIM_FS 代码保持不变)

// ... (前面的 WORLD_SIM_FS 代码保持不变)

// 地形生成 Shader
export const WORLD_GEN_FS = `#version 300 es
precision highp float;

in vec2 v_uv;
uniform float u_seed;
uniform vec2 u_offset;
uniform float u_scale;

layout(location = 0) out vec4 out_tex0;
layout(location = 1) out vec4 out_tex1;
layout(location = 2) out vec4 out_tex2;
layout(location = 3) out vec4 out_tex3;

// --- Simplex Noise 2D (by Stefan Gustavson) ---
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
  m = m*m ;
  m = m*m ;
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
// ---------------------------------------------

// 标准的分形布朗运动 (FBM)
float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    
    // 叠加 6 层噪声
    for (int i = 0; i < 6; i++) {
        value += amplitude * snoise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    // 生成高度图
    vec2 pos = (v_uv + u_offset) * u_scale;
    
    // 生成两个不同尺度的噪声，叠加出更有趣的地形
    float n1 = fbm(pos + u_seed);
    float n2 = fbm(pos * 0.5 - u_seed);
    
    // 归一化到 0-1 并增加对比度
    float height = (n1 + n2 * 0.5) * 0.5 + 0.5;
    height = pow(height, 1.2);
    
    height = clamp(height, 0.0, 1.0);

    // 初始温度：随纬度变化 + 随机噪声
    float temp = 0.5 + 0.5 * sin(v_uv.y * 3.14159);
    temp += snoise(pos * 2.0) * 0.1;
    temp = clamp(temp, 0.0, 1.0);

    out_tex0 = vec4(height, 0.0, 0.0, 0.0);
    out_tex1 = vec4(temp, 0.0, 0.0, 0.0);
    out_tex2 = vec4(0.0);
    out_tex3 = vec4(0.0);
}
`;

// 可视化 Shader
export const WORLD_DISPLAY_FS = `#version 300 es
// ... (后面代码保持不变)
// ... (后面代码保持不变)
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

// 简单的颜色插值函数
vec3 colorInterpolate(vec3 c1, vec3 c2, float v1, float v2, float value) {
    return mix(c1, c2, (value - v1) / (v2 - v1));
}

vec3 getTerrainColor(float value) {
    vec3 c1 = vec3(0.233, 0.289, 0.580);
    vec3 c2 = vec3(0.255, 0.322, 0.639);
    vec3 c3 = vec3(0.282, 0.357, 0.710);
    vec3 c4 = vec3(0.329, 0.416, 0.831);
    vec3 c5 = vec3(0.843, 0.792, 0.702);
    vec3 c6 = vec3(0.686, 0.706, 0.369);
    vec3 c7 = vec3(0.471, 0.537, 0.290);
    vec3 c8 = vec3(0.396, 0.290, 0.275);
    vec3 c9 = vec3(0.325, 0.263, 0.231);

    float v1 = 0.000;
    float v2 = 0.141;
    float v3 = 0.241;
    float v4 = 0.394;
    float v5 = 0.519;
    float v6 = 0.568;
    float v7 = 0.649;
    float v8 = 0.772;
    float v9 = 1.000;

    vec3 color = vec3(0.0);
    if (value <= v2) color = colorInterpolate(c1, c2, v1, v2, value);
    else if (value <= v3) color = colorInterpolate(c2, c3, v2, v3, value);
    else if (value <= v4) color = colorInterpolate(c3, c4, v3, v4, value);
    else if (value <= v5) color = colorInterpolate(c4, c5, v4, v5, value);
    else if (value <= v6) color = colorInterpolate(c5, c6, v5, v6, value);
    else if (value <= v7) color = colorInterpolate(c6, c7, v6, v7, value);
    else if (value <= v8) color = colorInterpolate(c7, c8, v7, v8, value);
    else color = colorInterpolate(c8, c9, v8, v9, value);
    
    return color;
}

// 简单的颜色映射函数
vec3 heatMap(float v) {
    return mix(vec3(0,0,1), vec3(1,0,0), v);
}
    
    void main() {
    vec4 d0 = texture(u_tex0, v_uv); // Terrain
    vec4 d1 = texture(u_tex1, v_uv); // Atmos
    vec4 d2 = texture(u_tex2, v_uv); // Wind/Cloud
    vec4 d3 = texture(u_tex3, v_uv); // Tex3.r = Cloud (new logic)
    
    vec3 finalColor = vec3(0.0);
    
    // 1. 地形层 (Base Layer)
    if (u_showHeight) {
        float h = d0.r;
        finalColor = getTerrainColor(h);
        
        // --- 地形阴影 (Hillshade) 计算 ---
        if (u_showHillshade) {
            vec2 pixelSize = 1.0 / vec2(textureSize(u_tex0, 0));
            
            // 采样周围高度计算坡度
            float hL = texture(u_tex0, v_uv + vec2(-pixelSize.x, 0)).r;
            float hR = texture(u_tex0, v_uv + vec2(pixelSize.x, 0)).r;
            float hD = texture(u_tex0, v_uv + vec2(0, -pixelSize.y)).r;
            float hU = texture(u_tex0, v_uv + vec2(0, pixelSize.y)).r;
            
            // 计算法线向量 (Normal Vector)
            // 这里的 0.05 是地形夸张系数，越小地形越陡峭立体
            vec3 normal = normalize(vec3(hL - hR, hD - hU, 0.05));
            
            // 定义光照方向 (从左上角射入)
            vec3 lightDir = normalize(vec3(-1.0, 1.0, 1.0));
            
            // 计算漫反射光照 (N dot L)
            float diff = max(dot(normal, lightDir), 0.0);
            
            // 混合环境光和漫反射光 (0.6是环境光，保证背光面不全黑)
            float lighting = 0.6 + 0.4 * diff;
            
            finalColor *= lighting;
        }
    }
    
    // 1.5 水层 (Water Layer) - 必须在阴影之后，云层之前
    if (u_showWater) {
        float waterDepth = d3.r;
        
        if (waterDepth > 0.001) {
            // 水的颜色 (深蓝 -> 浅蓝)
            vec3 deepWater = vec3(0.1, 0.2, 0.5);
            vec3 shallowWater = vec3(0.2, 0.5, 0.8);
            
            // 根据深度混合颜色 (0.2 为深度因子)
            float depthFactor = smoothstep(0.0, 0.2, waterDepth);
            vec3 waterColor = mix(shallowWater, deepWater, depthFactor);
            
            // 混合水色和底色
            // 浅水透明，深水不透明
            float alpha = smoothstep(0.0, 0.1, waterDepth) * 0.8; 
            
            finalColor = mix(finalColor, waterColor, alpha);
        }
    }
    
    // 2. 温度层 (Overlay)
    if (u_showTemp) {
        vec3 tempColor = heatMap(d1.r);
        if (u_showHeight) {
            // 如果已有地形，半透明叠加
            finalColor = mix(finalColor, tempColor, 0.5);
        } else {
            // 否则作为底色
            finalColor = tempColor;
        }
    }
    
    // 3. 云层 (Overlay)
    // 云量存储在 d2.b (Tex2.B)
    if (u_showCloud) {
        float cloud = d2.b;
        float cloudAlpha = smoothstep(0.1, 0.8, cloud);
        vec3 cloudColor = vec3(1.0); // 白云
        
        // 简单的阴影效果 (偏移采样)
        float shadow = texture(u_tex2, v_uv + vec2(-0.01, 0.01)).b;
        shadow = smoothstep(0.2, 0.9, shadow) * 0.5;
        
        // 只有在有底图时才应用阴影
        if (u_showHeight || u_showTemp) {
            finalColor = mix(finalColor, vec3(0.0), shadow);
        }
        
        // 叠加云层
        finalColor = mix(finalColor, cloudColor, cloudAlpha * 0.8);
    }

    // 4. 风场 (Overlay) - 矢量色彩编码
    if (u_showWind) {
        vec2 wind = d2.rg;
        // 可视化: 0.5是中点(静止), >0.5正向, <0.5负向
        // 放大风速以便观察
        vec3 windColor = vec3(0.5) + vec3(wind.x, wind.y, 0.0) * 20.0;
        
        // 如果有底图，用叠加模式
        if (u_showHeight || u_showTemp || u_showCloud) {
             finalColor = mix(finalColor, windColor, 0.4); // 40%透明度叠加
        } else {
             finalColor = windColor;
        }
    }
    
    outColor = vec4(finalColor, 1.0);
}
`;
