# 🌊 水体模拟系统完整指南

## 📋 目录

1. [多Pass SWE架构](#多pass-swe架构)
2. [高级水体渲染](#高级水体渲染)
3. [水流速度控制](#水流速度控制)
4. [水体阻尼系统](#水体阻尼系统)
5. [快速参考](#快速参考)

---

## 多Pass SWE架构

### 概述

基于 Shadertoy SWE 参考实现的高质量水体模拟，将原有的单Pass系统重构为**多Pass架构**，大幅提升稳定性和物理准确性。

### 架构变化：从单Pass到多Pass

**之前（单Pass）：**
- 所有物理过程混在一个shader中同时计算
- 通量、水位、侵蚀、大气等互相耦合
- 数值不稳定，容易出现震荡和棋盘格伪影

**现在（多Pass）：**
```
Pass 0: Velocity Integration  (压力梯度 → 速度更新)
Pass 1: Height Integration    (速度场 → 水位更新)
Pass 2: Erosion & Transport    (暂时禁用)
Pass 3: Atmosphere            (风场、云层、温度)
```

### 核心算法（来自参考实现）

#### Pass 0: 速度积分
```glsl
// 基于压力梯度计算速度变化
vV.x = -g / gridSize * (zR - zC);
vV.y = -g / gridSize * (zB - zC);
velocity += vV * deltaTime * speedMultiplier;

// 应用阻尼（能量耗散）
velocity *= damping;

// 边界条件：干地处停止流动
if (干地 && 地势更高) velocity = 0;

// 速度限制（稳定性增强）
l = min(l, gridSize / deltaTime * dampingAlpha);
```

#### Pass 1: 高度积分
```glsl
// 上风格式（Upwind Scheme）
hL = (vL.x >= 0.0) ? vL.depth : vC.depth;
hR = (vC.x <= 0.0) ? vR.depth : vC.depth;

// 过冲抑制（Overshooting Reduction）
hAvgMax = beta * gridSize / (g * deltaTime);
hAdj = max(0.0, avgNeighbor - hAvgMax);
h -= hAdj;

// 散度计算（质量守恒）
dH = -((hR * vR - hL * vL) / gridSize + ...);
depth += dH * deltaTime;
```

### SWE核心参数

| 参数 | 默认值 | 说明 | 可调性 |
|------|--------|------|--------|
| `gravity` | 10.0 | 重力加速度 (m/s²) | ⚠️ 危险 |
| `gridSize` | 5.0 | 网格单元物理尺寸 (米) | ⚠️ 危险 |
| `deltaTime` | 1.0 | 时间步长 (秒) | ⚠️ 危险 |
| `dampingAlpha` | 0.5 | 速度阻尼系数 | ⚠️ 危险 |
| `dampingBeta` | 2.0 | 过冲抑制系数 | ⚠️ 危险 |

**为什么危险？** 这些参数受 CFL 稳定性条件约束，随意修改会导致数值爆炸。

### 稳定性改进

- ✅ 严格质量守恒（通过上风格式）
- ✅ 边界条件正确处理
- ✅ 速度限制防止数值爆炸
- ✅ 过冲抑制减少震荡
- ✅ 分离式架构避免耦合

---

## 高级水体渲染

### 概述

从 Shadertoy SWE 参考实现借鉴的高质量水体渲染效果，包含折射、反射、高光、泡沫等真实感效果。

### 核心特性

#### 1. 🌊 水面法线计算
```glsl
// 基于水面总高度（地形+水深）计算法线
float hC = waterDepth + terrainHeight;
vec3 vNormal = vec3((hR - hL) * gridSize, (hB - hT) * gridSize, 2.0);
vNormal = normalize(vNormal);
```
**效果**: 动态的波纹法线，为后续效果提供基础

#### 2. 🔍 折射效果
```glsl
// 根据法线扭曲UV坐标，看到水下地形的扭曲
vec2 vRefractUV = uv - vNormal.xy * waterDepth * 6.0;
vec4 refractedTerrain = texture(u_tex0, vRefractUV);
```
**效果**: 透过水面看到扭曲的水底地形，就像真实水体

#### 3. 🌫️ 水下雾效果
```glsl
vec3 vFog = 1.0 - exp(-depth / normalZ * waterFogColor);
vec3 vRefract = terrainColor * (1.0 - vFog);
```
**效果**: 
- 深水区有温暖的橙红色雾气
- 浅水区清澈透明
- 体积雾效果增强真实感

#### 4. ☁️ 天空反射
```glsl
// Fresnel-like 效果：边缘反射强，正面反射弱
vec3 vReflect = pow((1.0 - pow(normalZ, 100.0)), 0.4) * skyColor;
```
**效果**: 水面倒映蓝色天空，视角越倾斜反射越强

#### 5. ✨ 太阳高光
```glsl
vec3 vHalfVec = normalize(lookDir + lightDir);
float fHdotN = max(0.0, dot(-vHalfVec, vNormal));
vReflect += pow(fHdotN, 1200.0) * 20.0 * sunColor;  // 锐利高光
vReflect += pow(fHdotN, 180.0) * 0.5 * skyColor;    // 柔和光晕
```
**效果**: 
- 水面上闪闪发光的太阳反射点
- 两层高光（锐利+柔和）更真实

#### 6. 🤍 浅水泡沫
```glsl
float fMinZ = min(邻居最小水深);
float fFoam = max(0.0, 1.0 - fMinZ * 8.0) * 0.3;
vec3 vWater = mix(waterColor, foamColor, fFoam);
```
**效果**: 
- 浅水区和水边出现白色泡沫
- 自动识别水陆交界处

#### 7. 🎨 Gamma 校正
```glsl
#define Gamma(v) pow(v, vec3(2.2))
#define DeGamma(v) pow(v, vec3(1.0/2.2))

// 输出时DeGamma
outColor = vec4(DeGamma(finalColor), 1.0);
```
**效果**: 更真实的颜色显示，符合人眼感知

### 精心调配的颜色

```glsl
// 水下雾气（温暖的橙红）
vWaterFogColor = Gamma(vec3(0.9, 0.4, 0.3)) * 16.0;

// 泡沫（明亮的米白色）
vFoamColor = Gamma(vec3(0.9, 0.9, 0.85));

// 天空（深蓝）
vSkyColor = Gamma(vec3(0.01, 0.4, 0.8));

// 太阳（暖黄）
vSunColor = Gamma(vec3(1.0, 0.8, 0.5));
```

### 渲染流程

```
1. 计算水面法线（基于邻域高度差）
   ↓
2. 折射：扭曲UV读取水下地形
   ↓
3. 应用水下雾效果（深度相关）
   ↓
4. 计算天空反射（Fresnel效果）
   ↓
5. 添加太阳高光（双层specular）
   ↓
6. 混合折射+反射
   ↓
7. 添加浅水泡沫
   ↓
8. 与地形Alpha混合
   ↓
9. Gamma校正输出
```

---

## 水流速度控制

### 问题：物理参数不安全

直接调整 `gravity`、`gridSize`、`deltaTime` 等物理参数会破坏 CFL 稳定性条件，导致数值爆炸。

### 解决方案：百分比控制

使用直观的 **1-100%** 百分比控制，内部映射到安全的 **0.01-1.0** 范围。

#### 参数说明

```javascript
waterSpeedPercent: 100  // UI显示: 1-100%
waterSpeedMultiplier: 1.0  // 内部值: 0.01-1.0
```

#### 映射关系

| UI显示 | 内部值 | 效果 | 用途 |
|--------|--------|------|------|
| 1% | 0.01 | 🐌 超慢动作 | 极致细节观察 |
| 10% | 0.10 | 🚶 缓慢流动 | 慢动作演示 |
| 25% | 0.25 | 🏃 轻快流动 | 平静的湖泊 |
| 50% | 0.50 | ⚡ 中速流动 | 河流 |
| 75% | 0.75 | 🌊 快速流动 | 溪流 |
| 100% | 1.00 | 🚀 标准速度 | 参考实现速度 |

#### 为什么不能超过100%？

实测证明 `waterSpeedMultiplier > 1.0` 会破坏CFL稳定性条件：
- 💥 数值爆炸
- 🌀 震荡发散
- 💀 模拟崩溃

所以100%已经是极限了！

#### 实现原理

```glsl
// 在速度更新时应用倍率
vTexC.ba += vV * u_deltaTime * u_waterSpeedMultiplier;
```

**为什么安全？**
- ✅ 不改变物理单位（gravity, gridSize, deltaTime）
- ✅ 线性缩放速度，不影响稳定性条件
- ✅ 数值积分仍然收敛
- ✅ 质量守恒依然成立

---

## 水体阻尼系统

### 问题：水永远不停

在大盆地中的水会**永远震荡不停**，就像在光滑镜面上滑动。

**现象：**
```
水池观察：
时间 0s:  水静止
时间 1s:  加了点水，开始晃动
时间 10s: 还在晃
时间 1分钟: 还在晃！
时间 ∞:  永远在晃！！！（永动机）
```

**原因：** 参考的SWE实现是理想物理模型，完美能量守恒，没有能量耗散。

### 解决方案：Water Damping

添加一个**速度衰减系数**（类似摩擦力），每帧都会损失一点能量。

#### 参数说明

```javascript
waterDamping: 0.98  // 范围: 0.90 - 1.0
```

#### 工作原理

```glsl
// 每一帧：
velocity = velocity * waterDamping;

// 效果：
0.98 → 每帧保留98%的速度，损失2%能量
0.95 → 每帧保留95%的速度，损失5%能量
0.90 → 每帧保留90%的速度，损失10%能量
1.00 → 没有能量损失（永动机）
```

#### 衰减分析

假设初始速度 v₀ = 100，经过 n 帧后的速度：

| Damping | 10帧后 | 50帧后 | 100帧后 | 200帧后 |
|---------|--------|--------|---------|---------|
| 1.00 | 100.0 | 100.0 | 100.0 | 100.0 ❌ |
| 0.99 | 90.4 | 60.5 | 36.6 | 13.4 ✅ |
| 0.98 | 81.7 | 36.4 | 13.3 | 1.8 ✅ |
| 0.95 | 59.9 | 7.7 | 0.6 | 0.0 ✅ |
| 0.90 | 34.9 | 0.5 | 0.0 | 0.0 ✅ |

#### 推荐值

| 场景 | Damping | 停止时间 | 效果 |
|------|---------|---------|------|
| 海洋/大湖 | 0.99 | 很慢 | 🌊 长时间波动 |
| 河流/池塘 | 0.98 | 中等 | 💧 自然停止（推荐）|
| 小水坑 | 0.95 | 较快 | 💦 快速平静 |
| 粘稠液体 | 0.90 | 很快 | 🍯 蜂蜜般粘稠 |

#### 实现位置

在 Pass 0 (Velocity Integration) 中：

```glsl
// 1. 计算加速度
vec2 vV = -g / gridSize * (zR - zC, zB - zC);

// 2. 更新速度
vTexC.ba += vV * deltaTime * waterSpeedMultiplier;

// 3. 应用阻尼（能量耗散）
vTexC.ba *= waterDamping;  // ← 新增！
```

#### 为什么安全？

- ✅ 0 < damping ≤ 1，不会让速度变负
- ✅ 只是乘法，计算简单
- ✅ 不会破坏质量守恒（只影响速度）
- ✅ 数值稳定（减少震荡反而更稳定）
- ✅ 物理上合理（模拟摩擦力）

---

## 快速参考

### GUI面板结构

```
Physics Params/
└── SWE (Shallow Water)/
    ├── 🌊 Water Speed % (1-100)
    │   └── 控制水流速度（100%=标准，1%=超慢）
    │
    ├── 🛑 Water Damping (0.90-1.0)
    │   └── 控制停止速度（0.98=推荐，1.0=永动机）
    │
    └── ⚠️ Advanced (Danger!)
        ├── ⚠️ Gravity
        ├── ⚠️ Grid Size
        ├── ⚠️ Time Step
        ├── ⚠️ Velocity Damp
        └── ⚠️ Overshoot Damp
```

### 推荐设置

#### 大地图模拟
```javascript
waterSpeedPercent: 100   // 标准速度
waterDamping: 0.98       // 自然停止
```

#### 平静湖泊
```javascript
waterSpeedPercent: 50    // 慢速
waterDamping: 0.98       // 自然停止
```

#### 激流瀑布
```javascript
waterSpeedPercent: 100   // 标准速度
waterDamping: 0.995      // 持续动感
```

#### 观察细节（演示）
```javascript
waterSpeedPercent: 10    // 慢动作
waterDamping: 0.99       // 持久波动
```

#### 快速测试
```javascript
waterSpeedPercent: 100   // 标准速度
waterDamping: 0.95       // 快速稳定
```

### 参数组合效果

```
高速度 + 高阻尼 (100%, 0.98)
→ 激流但会停下

高速度 + 低阻尼 (100%, 0.99)
→ 激流且持续很久

低速度 + 高阻尼 (25%, 0.95)
→ 慢流快停

低速度 + 低阻尼 (25%, 0.99)
→ 慢流慢停
```

### 常见问题解决

#### 问题1：水流太快
```
解决：降低 Water Speed %
推荐：50% 或更低
```

#### 问题2：水永远晃动不停
```
解决：降低 Water Damping
推荐：0.98 或更低
```

#### 问题3：水像糖浆一样粘稠
```
解决：提高 Water Damping
推荐：0.98 或更高
```

#### 问题4：数值爆炸
```
原因：调了 Advanced 面板的参数
解决：
1. 重新加载页面
2. 不要碰 Advanced 参数！
3. 只调 Speed % 和 Damping
```

### 技术栈总结

```
架构：        多Pass SWE (4个Pass)
物理引擎：    Shallow Water Equations
数值方法：    有限差分 + 上风格式
稳定性：      CFL条件 + 速度限制 + 过冲抑制
渲染：        折射 + 反射 + 高光 + 泡沫 + Gamma校正
用户控制：    百分比速度 + 阻尼系数
纹理格式：    RGBA32F (32位浮点)
分辨率：      256x256 (可调)
性能：        60 FPS @ 1080p (典型)
```

---

## 致谢

本系统借鉴和参考了：
- Shadertoy SWE 实现（物理算法）
- Inigo Quilez 的渲染技术（水体视觉效果）
- 大量的物理文献和数值方法论文

## 版本历史

- **v1.0** - 多Pass SWE架构
- **v1.1** - 高级水体渲染
- **v1.2** - 百分比速度控制
- **v1.3** - 水体阻尼系统（当前）

---

*打造真实、稳定、可控的水体模拟系统* 🌊

