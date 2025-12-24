# SWE 浅水方程水体模拟技术文档

## 📋 目录

1. [概述](#概述)
2. [数学原理](#数学原理)
3. [数值方法](#数值方法)
4. [实现细节](#实现细节)
5. [稳定性保证](#稳定性保证)
6. [参数说明](#参数说明)

---

## 概述

本系统实现了基于**浅水方程（Shallow Water Equations, SWE）**的实时水体模拟。采用**有限差分法**在规则网格上求解SWE，使用**上风格式（Upwind Scheme）**保证质量守恒，并通过多种稳定性增强技术确保数值稳定。

**核心算法流程**：`Pass 0: 速度积分（压力梯度 → 速度更新）` → `Pass 1: 水深积分（速度场 → 水深更新）`

---

## 数学原理

### 浅水方程（Shallow Water Equations）

浅水方程描述浅层流体运动，核心假设是：**垂直方向上的速度均匀分布**。这意味着我们不需要关心水在垂直方向上的速度变化，只需要关注水平面上的流动，就像观察一个浅水池塘，水在水平方向流动，但垂直方向的速度可以忽略。

**控制方程**：

#### 质量守恒方程

$$\frac{\partial h}{\partial t} + \frac{\partial (hu)}{\partial x} + \frac{\partial (hv)}{\partial y} = 0$$

这个方程描述了**水的总量不会凭空产生或消失**。让我们逐项理解：

- **$\frac{\partial h}{\partial t}$**：水深随时间的变化率。如果这个值大于0，说明这个位置的水在增加；小于0则说明在减少。
- **$\frac{\partial (hu)}{\partial x}$**：x方向的水流通量（flux）变化。`hu`表示"水深×速度"，即单位时间内通过单位宽度的水量。如果右侧流出的水比左侧流入的多，这个偏导数就是正的，意味着水在x方向净流出。
- **$\frac{\partial (hv)}{\partial y}$**：y方向的水流通量变化，含义同上。

**整体含义**：一个位置的水深变化 = 流出的水 - 流入的水。如果流出的多，水深就减少；流入的多，水深就增加。这就像给一个水池注水，如果出水口开得大，水池水位就下降；如果进水口开得大，水位就上升。

#### 动量守恒方程（简化形式）

$$\frac{\partial u}{\partial t} = -g \frac{\partial (h+\eta)}{\partial x}, \quad \frac{\partial v}{\partial t} = -g \frac{\partial (h+\eta)}{\partial y}$$

这个方程描述了**水的速度如何变化**，本质上是牛顿第二定律（F=ma）在流体中的应用：

- **$\frac{\partial u}{\partial t}$**：x方向速度随时间的变化率，即加速度。
- **$-g \frac{\partial (h+\eta)}{\partial x}$**：驱动水流动的"力"。这里`h+η`是总高度（地形高度+水深），`g`是重力加速度（10 m/s²）。
- **负号的意义**：如果右侧的总高度比当前位置高（$\frac{\partial (h+\eta)}{\partial x} > 0$），那么加速度是负的，水会向左流；反之，如果右侧更低，水会向右流。

**直观理解**：想象一个倾斜的水槽，水总是从高处流向低处。这里的"高度"不是单纯的地形高度，而是"地形高度+水深"的总高度。即使地形是平的，如果某个位置水深更大，水也会向周围流动，直到各处的水深趋于平衡。这就像把一杯水倒在地上，水会向四周扩散，直到形成一个薄薄的水层。

**符号说明**：
- `h(x,y,t)` - 水深，单位米。这是我们要计算的主要变量，表示每个位置有多少水。
- `u(x,y,t)` - x方向速度分量，单位米/秒。正值表示向右流，负值表示向左流。
- `v(x,y,t)` - y方向速度分量，单位米/秒。正值表示向上流，负值表示向下流。
- `η(x,y)` - 地形高度（静态），单位米。这是地形本身的高度，不会随时间变化。
- `g` - 重力加速度，10.0 m/s²。这是地球表面的重力常数。
- `t` - 时间，单位秒。

**物理意义总结**：
1. **速度变化** = 重力 × 总高度梯度（地形+水深）。水从高处流向低处，压力梯度驱动流动。这就像水总是"寻找"最低点，但这里的"高度"是地形和水深的组合。
2. **水深变化** = 速度场的散度（负号表示流出）。流出时水深减少，流入时水深增加。这就像水从一个地方流到另一个地方，流出的地方水位下降，流入的地方水位上升。

---

## 数值方法

### 1. 空间离散化：有限差分法

将连续空间离散化为**规则网格**，每个网格单元存储：`h[i,j]` - 水深，`u[i,j]` - x方向速度，`v[i,j]` - y方向速度，`η[i,j]` - 地形高度（静态）。**网格参数**：分辨率256×256，网格尺寸`gridSize = 5.0`米

### 2. 时间离散化：显式欧拉法

使用**显式时间积分**，每帧更新一次。显式欧拉法是最简单的时间积分方法，它的思想是：**用当前时刻的值和变化率，直接计算下一时刻的值**。

**速度更新公式**：
$$u^{n+1} = u^n + \Delta t \cdot \left(-\frac{g}{\Delta x} \cdot (h^n + \eta)\right), \quad v^{n+1} = v^n + \Delta t \cdot \left(-\frac{g}{\Delta y} \cdot (h^n + \eta)\right)$$

这个公式的含义是：**新速度 = 旧速度 + 时间步长 × 加速度**。其中：
- `u^n`是当前时刻的速度，`u^{n+1}`是下一时刻的速度
- `$\Delta t$`是时间步长（1.0秒），表示我们每1秒更新一次状态
- `$-\frac{g}{\Delta x} \cdot (h^n + \eta)$`是加速度，来自压力梯度（总高度差除以距离）
- `$\frac{g}{\Delta x}$`可以理解为"单位距离上的重力加速度"，`$\Delta x$`是网格间距（5米）

**直观理解**：就像开车，如果前方是下坡，你会加速；如果是上坡，你会减速。这里"坡度"就是总高度的梯度，重力就是"引擎"。

**水深更新公式**：
$$h^{n+1} = h^n + \Delta t \cdot \left(-\nabla \cdot (h^n u^n)\right)$$

这个公式的含义是：**新水深 = 旧水深 + 时间步长 × 水深变化率**。其中：
- `$\nabla \cdot (h^n u^n)$`是速度场的散度，表示"单位时间内流出的水量"
- 负号表示：如果散度为正（净流出），水深减少；如果散度为负（净流入），水深增加

**直观理解**：想象一个水池，如果出水口流出的水比进水口流入的多，水位就下降；反之，水位就上升。散度就是衡量"净流出量"的指标。

**参数说明**：$\Delta t = 1.0$ 秒（每帧代表1秒的物理时间），$\Delta x = \Delta y = \text{gridSize} = 5.0$米（每个网格单元代表5米×5米的区域）。

### 3. 压力梯度计算（Pass 0）

**核心思想**：水从高处流向低处，速度变化由总高度（地形+水深）的梯度决定。这是整个模拟的"引擎"，决定了水为什么会流动。

**有限差分格式**：
```glsl
float zC = waterDepth + terrainHeight;      // 当前单元的总高度
float zR = waterDepth_R + terrainHeight_R;  // 右侧邻居的总高度
float zB = waterDepth_B + terrainHeight_B;  // 下方邻居的总高度
vec2 vV;
vV.x = -g / gridSize * (zR - zC);  // x方向压力梯度
vV.y = -g / gridSize * (zB - zC);  // y方向压力梯度
velocity += vV * deltaTime * speedMultiplier;
```

**逐步解释**：

1. **计算总高度**：`zC = waterDepth + terrainHeight`。这是关键！我们不是只看地形高度，而是看"地形+水深"的总高度。想象一个碗，即使碗底是平的，如果碗里装了很多水，水也会向碗边流动，因为碗边的总高度（地形+水深）更低。

2. **计算高度差**：`zR - zC`表示右侧邻居和当前单元的高度差。如果`zR > zC`，说明右侧更高；如果`zR < zC`，说明右侧更低。

3. **计算加速度**：`vV.x = -g / gridSize * (zR - zC)`。这里：
   - `g / gridSize`是"单位距离上的重力加速度"，`gridSize`是网格间距（5米）
   - 如果`zR > zC`（右侧更高），那么`vV.x < 0`，加速度向左，水会向左流
   - 如果`zR < zC`（右侧更低），那么`vV.x > 0`，加速度向右，水会向右流
   - 负号确保水总是从高处流向低处

4. **更新速度**：`velocity += vV * deltaTime`。这是标准的物理更新：新速度 = 旧速度 + 加速度 × 时间。

**物理意义**：这就像水在重力作用下寻找最低点。但这里的"高度"不是单纯的地形，而是地形和水深的组合。即使地形是平的，如果某个位置水深更大，水也会向周围流动，直到各处的水深趋于平衡。这就像把一杯水倒在地上，水会向四周扩散。

**实际例子**：想象一个倾斜的盘子，左边高右边低。如果你在左边倒水，水会向右流。但如果盘子是平的，你在中间倒水，水会向四周均匀扩散，因为中间的总高度（地形0 + 水深大）比四周（地形0 + 水深小）高。

### 4. 水深更新（Pass 1）

**核心思想**：水深变化由速度场的**散度**决定，使用**上风格式（Upwind Scheme）**保证质量守恒。

#### 4.1 上风格式（Upwind Scheme）

上风格式根据**速度方向**选择上游的水深值，避免数值震荡。这是保证质量守恒的关键技术。

**为什么需要上风格式？** 想象一条河流，水从左向右流。当我们计算"有多少水从左边界流入"时，我们应该用左侧的水深，而不是当前的水深。因为水是从左边流过来的，所以应该用左边的水深来计算。这就是"上风"的含义——水来的方向。

**代码实现**：
```glsl
float hL = (velocity_L.x >= 0.0) ? depth_L : depth_C;  // 左边界
float hR = (velocity_C.x <= 0.0) ? depth_R : depth_C;   // 右边界
float hT = (velocity_T.y >= 0.0) ? depth_T : depth_C;  // 上边界
float hB = (velocity_C.y <= 0.0) ? depth_B : depth_C;  // 下边界
```

**逐步解释**：

1. **左边界（hL）**：`velocity_L.x >= 0.0`表示左侧的速度向右（或为零）。如果速度向右，说明水是从左边流过来的，所以应该用`depth_L`（左侧的水深）；如果速度向左，说明水是从当前单元流向左边的，所以应该用`depth_C`（当前的水深）。

2. **右边界（hR）**：`velocity_C.x <= 0.0`表示当前的速度向左（或为零）。如果速度向左，说明水是从右边流过来的，所以应该用`depth_R`（右侧的水深）；如果速度向右，说明水是从当前单元流向右边的，所以应该用`depth_C`（当前的水深）。

**直观理解**：就像站在河边，如果水从左向右流，那么"从左边界流入的水"应该用左边的水深来计算；如果水从右向左流，那么"从右边界流入的水"应该用右边的水深来计算。这样计算出来的通量才是准确的，才能保证质量守恒。

**为什么重要？** 如果不用上风格式，而是简单地用当前单元的水深，会导致数值震荡——水会在网格之间来回震荡，而不是平滑地流动。上风格式确保了水总是从正确的方向来，从而避免了这个问题。

#### 4.2 散度计算

使用**有限体积法**计算通量的散度。散度衡量的是"单位时间内有多少水流出（或流入）这个区域"。

**通量计算**：
```glsl
float fluxX = hR * velocity_C.x - hL * velocity_L.x;  // x方向净通量
float fluxY = hB * velocity_C.y - hT * velocity_T.y;  // y方向净通量
```

**逐步解释**：

1. **`hR * velocity_C.x`**：从右边界流出的通量。`hR`是右边界的水深（由上风格式确定），`velocity_C.x`是当前单元的速度。如果速度向右（正值），水从右边界流出；如果速度向左（负值），水从右边界流入（负的流出 = 正的流入）。

2. **`hL * velocity_L.x`**：从左边界流出的通量。`hL`是左边界的水深，`velocity_L.x`是左侧单元的速度。如果速度向右（正值），水从左边界流出；如果速度向左（负值），水从左边界流入。

3. **`fluxX = hR * velocity_C.x - hL * velocity_L.x`**：x方向的净通量。这是"从右边界流出的量 - 从左边界流出的量"。如果`fluxX > 0`，说明从右边界流出的比从左边界流出的多，净效果是水向右流出；如果`fluxX < 0`，说明从左边界流出的更多，净效果是水向左流出。

4. **`fluxY`**：y方向的净通量，含义同上。

**散度计算**：
```glsl
float dH = -(fluxX + fluxY) / gridSize;  // 计算散度
depth += dH * deltaTime;  // 更新水深
```

**逐步解释**：

1. **`fluxX + fluxY`**：总的净流出量（x方向 + y方向）。如果这个值大于0，说明水在净流出；如果小于0，说明水在净流入。

2. **`/ gridSize`**：除以网格尺寸，得到"单位面积上的净流出量"（散度）。

3. **负号**：如果散度为正（净流出），水深应该减少；如果散度为负（净流入），水深应该增加。所以需要加负号。

4. **`depth += dH * deltaTime`**：更新水深。`dH`是水深变化率，乘以时间步长`deltaTime`，得到这一帧的水深变化。

**物理意义**：这就像计算一个水池的水位变化。如果出水口流出的水比进水口流入的多，水位就下降；反之，水位就上升。散度就是衡量"净流出量"的指标。

**实际例子**：想象一个网格单元，左边有水流进来，右边有水流出去。如果流出的比流入的多，这个单元的水深就会减少；如果流入的比流出的多，水深就会增加。这就是质量守恒——水不会凭空产生或消失，只会从一个地方流到另一个地方。

### 5. 过冲抑制（Overshooting Reduction）

为了防止数值震荡，引入**过冲抑制**机制。这是数值稳定性的关键保障。

**问题背景**：在某些情况下，特别是当水深变化很快时（比如用笔刷快速添加水），数值计算可能会出现"过冲"——水深变化过大，导致水在网格之间来回震荡，而不是平滑地流动。这就像用力推一个秋千，如果推得太猛，秋千会摆动得太大，甚至可能翻过去。

**解决方案**：限制邻居平均水深，防止过大的变化。

**代码实现**：
```glsl
float hNeighborAvg = (depth_L + depth_R + depth_T + depth_B) / 4.0;  // 邻居平均水深
float hAvgMax = beta * gridSize / (gravity * deltaTime);  // 最大允许平均水深
float hAdj = max(0.0, hNeighborAvg - hAvgMax);  // 超过限制的部分
if (hAdj > 0.0) {
    hL = max(0.0, hL - hAdj); hR = max(0.0, hR - hAdj);
    hT = max(0.0, hT - hAdj); hB = max(0.0, hB - hAdj);
}
```

**逐步解释**：

1. **`hNeighborAvg`**：计算四个邻居的平均水深。这代表了"周围的水有多深"。

2. **`hAvgMax`**：最大允许的平均水深。这个值基于CFL稳定性条件计算：`beta * gridSize / (gravity * deltaTime)`。其中：
   - `beta = 2.0`是过冲抑制系数，控制限制的严格程度
   - `gridSize / (gravity * deltaTime)`是基于物理参数的最大稳定值
   - 这个公式确保在一个时间步内，水的变化不会太快

3. **`hAdj`**：如果邻居平均水深超过了最大允许值，计算超出部分。

4. **调整通量**：如果`hAdj > 0`，说明邻居平均水深过大，需要减少用于计算通量的水深值（`hL, hR, hT, hB`），从而减少通量，防止过大的变化。

**物理意义**：这就像给水流加了一个"缓冲器"。如果水变化太快，缓冲器会限制变化速度，让水更平滑地流动。这不会改变物理规律，只是让数值计算更稳定。

**实际效果**：没有过冲抑制时，快速添加水可能导致水在网格之间来回震荡；有了过冲抑制，水会平滑地扩散，不会出现数值震荡。

**参数说明**：`beta = 2.0`（过冲抑制系数）。这个值越大，限制越严格，水变化越平滑，但可能过于保守；这个值越小，限制越宽松，水变化越快，但可能出现数值震荡。2.0是一个经过测试的平衡值。

---

## 实现细节

### Pass 0: 速度积分（Velocity Integration）

**文件位置**：`src/shaders/sim.js` - `pass0_velocityIntegration()`

**核心代码**：
```glsl
void pass0_velocityIntegration(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3, vec2 pixelSize) {
    ivec2 tc = ivec2(v_uv * vec2(textureSize(u_tex0, 0)));
    vec4 vTexC = d3;  // 当前单元：R=水深, BA=速度
    vec4 vTexR = texelFetch(u_tex3, tc + ivec2(1, 0), 0);  // 右侧
    vec4 vTexB = texelFetch(u_tex3, tc + ivec2(0, 1), 0);  // 下方
    vec4 landC = d0;  // 当前地形
    vec4 landR = texelFetch(u_tex0, tc + ivec2(1, 0), 0);  // 右侧地形
    vec4 landB = texelFetch(u_tex0, tc + ivec2(0, 1), 0);  // 下方地形
    
    // 计算总高度（地形 + 水深）
    float zC = vTexC.r + landC.r;
    float zR = vTexR.r + landR.r;
    float zB = vTexB.r + landB.r;
    
    // 计算压力梯度
    vec2 vV;
    vV.x = -u_gravity / u_gridSize * (zR - zC);
    vV.y = -u_gravity / u_gridSize * (zB - zC);
    
    // 更新速度（显式欧拉）
    vTexC.ba += vV * u_deltaTime * u_waterSpeedMultiplier;
    
    // 应用阻尼（能量耗散）
    vTexC.ba *= u_waterDamping;
    
    // 边界条件：干地处停止流动
    if ((vTexC.r <= EPS * u_gridSize && (landC.r + vTexC.r) > zR) || 
        (vTexR.r <= EPS * u_gridSize && (landR.r + vTexR.r) > zC)) {
        vTexC.b = 0.0;  // 停止X方向流动
    }
    if ((vTexC.r <= EPS * u_gridSize && (landC.r + vTexC.r) > zB) || 
        (vTexB.r <= EPS * u_gridSize && (landB.r + vTexB.r) > zC)) {
        vTexC.a = 0.0;  // 停止Y方向流动
    }
    
    // 速度限制（稳定性增强）
    float l = length(vTexC.ba);
    if (l > 0.0) {
        vTexC.ba /= l;
        l = min(l, u_gridSize / u_deltaTime * u_dampingAlpha);
        vTexC.ba *= l;
    }
    
    // 防止负水深
    if (vTexC.r <= 0.0) vTexC.r = 0.0;
    
    d3 = vTexC;  // 写回
}
```

**关键步骤**：1. **压力梯度计算**：基于总高度（地形+水深）的有限差分；2. **速度更新**：显式欧拉积分，应用速度倍率；3. **阻尼**：每帧乘以 `waterDamping`（0.9-1.0），模拟摩擦力；4. **边界条件**：干地（水深≈0）且地势更高时停止流动；5. **速度限制**：防止CFL条件破坏导致的数值爆炸。

### Pass 1: 水深积分（Height Integration）

**文件位置**：`src/shaders/sim.js` - `pass1_heightIntegration()`

**核心代码**：
```glsl
void pass1_heightIntegration(inout vec4 d0, inout vec4 d1, inout vec4 d2, inout vec4 d3, vec2 pixelSize) {
    ivec2 tc = ivec2(v_uv * vec2(textureSize(u_tex0, 0)));
    vec4 vTexC = d3;
    vec4 vTexL = texelFetch(u_tex3, tc + ivec2(-1, 0), 0);  // 左侧
    vec4 vTexR = texelFetch(u_tex3, tc + ivec2(1, 0), 0);   // 右侧
    vec4 vTexT = texelFetch(u_tex3, tc + ivec2(0, -1), 0);  // 上方
    vec4 vTexB = texelFetch(u_tex3, tc + ivec2(0, 1), 0);  // 下方
    
    // 提取速度（存储在BA通道）
    float fxL = vTexL.b; float fxR = vTexC.b;  // X速度
    float fyT = vTexT.a; float fyB = vTexC.a;  // Y速度
    
    // 上风格式：根据速度方向选择上游水深
    float hL = (vTexL.b >= 0.0) ? vTexL.r : vTexC.r;
    float hR = (vTexC.b <= 0.0) ? vTexR.r : vTexC.r;
    float hT = (vTexT.a >= 0.0) ? vTexT.r : vTexC.r;
    float hB = (vTexC.a <= 0.0) ? vTexB.r : vTexC.r;
    
    // 过冲抑制
    float hAvgMax = u_dampingBeta * u_gridSize / (u_gravity * u_deltaTime);
    float hNeighborAvg = (vTexL.r + vTexR.r + vTexT.r + vTexB.r) / 4.0;
    float hAdj = max(0.0, hNeighborAvg - hAvgMax);
    if (hAdj > 0.0) {
        hL = max(0.0, hL - hAdj); hR = max(0.0, hR - hAdj);
        hT = max(0.0, hT - hAdj); hB = max(0.0, hB - hAdj);
    }
    
    // 计算散度（质量守恒）
    float dH = -((hR * fxR - hL * fxL) / u_gridSize + (hB * fyB - hT * fyT) / u_gridSize);
    
    // 限制最大变化率（防止不稳定）
    float maxDepthChange = u_gridSize / (u_gravity * u_deltaTime) * 0.5;
    dH = clamp(dH, -maxDepthChange, maxDepthChange);
    
    // 更新水深
    vTexC.r += dH * u_deltaTime;
    
    // 防止负水深
    if (vTexC.r <= 0.0) vTexC.r = 0.0;
    
    d3 = vTexC;  // 写回
}
```

**关键步骤**：1. **上风格式**：根据速度方向选择上游水深，保证质量守恒；2. **散度计算**：使用有限体积法计算通量散度；3. **过冲抑制**：限制邻居平均水深，防止数值震荡；4. **变化率限制**：限制每帧最大水深变化，增强稳定性。

### 边界条件处理

**空间边界**：纹理使用 `REPEAT` 模式，实现**环面拓扑**（左边界连接到右边界，上边界连接到下边界）。

**物理边界（干地边界）**：在Pass 0中处理，如果当前单元是干地（水深≈0）且地势更高，停止流动：
```glsl
if ((vTexC.r <= EPS * u_gridSize && (landC.r + vTexC.r) > zR) || 
    (vTexR.r <= EPS * u_gridSize && (landR.r + vTexR.r) > zC)) {
    vTexC.b = 0.0;  // 停止X方向流动
}
```
**物理意义**：水不能从低处流向高处（除非有足够的水压）。

---

## 稳定性保证

### 1. CFL条件（Courant-Friedrichs-Lewy Condition）

CFL条件是显式时间积分的**稳定性必要条件**：$$\text{CFL} = \frac{\text{max\_velocity} \times \text{deltaTime}}{\text{gridSize}} < 1.0$$

**物理意义**：在一个时间步内，流体不能移动超过一个网格单元。

**本系统参数**：`gridSize = 5.0`米，`deltaTime = 1.0`秒，`max_velocity ≈ gridSize / deltaTime * alpha = 5.0 * 0.5 = 2.5` m/s，**CFL数**：$\text{CFL} = 2.5 \times 1.0 / 5.0 = 0.5 < 1.0$ ✅

### 2. 速度限制

在Pass 0中限制最大速度：
```glsl
float l = length(vTexC.ba);
if (l > 0.0) {
    vTexC.ba /= l;
    l = min(l, u_gridSize / u_deltaTime * u_dampingAlpha);
    vTexC.ba *= l;
}
```
**效果**：确保 $\text{max\_velocity} \leq \frac{\text{gridSize}}{\text{deltaTime}} \times \text{alpha}$，满足CFL条件。

### 3. 过冲抑制

在Pass 1中限制邻居平均水深：
```glsl
float hAvgMax = u_dampingBeta * u_gridSize / (u_gravity * u_deltaTime);
float hAdj = max(0.0, hNeighborAvg - hAvgMax);
```
**效果**：防止水深突然变化导致的数值震荡。

### 4. 变化率限制

在Pass 1中限制每帧最大水深变化：
```glsl
float maxDepthChange = u_gridSize / (u_gravity * u_deltaTime) * 0.5;
dH = clamp(dH, -maxDepthChange, maxDepthChange);
```
**效果**：防止笔刷快速添加水时导致的不稳定。

### 5. 负值保护

在所有Pass中防止负水深：
```glsl
if (vTexC.r <= 0.0) vTexC.r = 0.0;
```
**效果**：确保物理量始终在有效范围内。

---

## 参数说明

### 核心物理参数

| 参数 | 默认值 | 说明 | 可调性 |
|------|--------|------|--------|
| `gravity` | 10.0 | 重力加速度 (m/s²) | ⚠️ 危险 |
| `gridSize` | 5.0 | 网格单元物理尺寸 (米) | ⚠️ 危险 |
| `deltaTime` | 1.0 | 时间步长 (秒) | ⚠️ 危险 |
| `dampingAlpha` | 0.5 | 速度限制系数 | ⚠️ 危险 |
| `dampingBeta` | 2.0 | 过冲抑制系数 | ⚠️ 危险 |

**⚠️ 危险参数**：受CFL条件约束，随意修改会导致数值爆炸。

### 用户控制参数

| 参数 | 默认值 | 说明 | 可调性 |
|------|--------|------|--------|
| `waterSpeedMultiplier` | 1.0 | 速度倍率（内部） | ✅ 安全 |
| `waterSpeedPercent` | 100 | 速度百分比（UI） | ✅ 安全 |
| `waterDamping` | 0.98 | 速度阻尼 | ✅ 安全 |

**✅ 安全参数**：可以自由调整，不影响稳定性。

#### 速度倍率（Water Speed Multiplier）

**问题**：直接修改 `gravity`、`gridSize`、`deltaTime` 会破坏CFL稳定性条件。

**解决方案**：使用**百分比控制**，内部映射到安全范围：
```javascript
waterSpeedPercent: 100  // UI显示：1-100%
waterSpeedMultiplier: 1.0  // 内部值：0.01-1.0
waterSpeedMultiplier = waterSpeedPercent / 100.0;  // 映射关系
```

**实现**：`vTexC.ba += vV * u_deltaTime * u_waterSpeedMultiplier;`

**为什么安全？** ✅ 不改变物理单位（gravity, gridSize, deltaTime）；✅ 线性缩放速度，不影响稳定性条件；✅ 数值积分仍然收敛。

#### 速度阻尼（Water Damping）

**问题**：理想SWE模型完美能量守恒，水会永远震荡不停。

**解决方案**：添加**速度衰减系数**，模拟摩擦力：`vTexC.ba *= u_waterDamping;`

**参数范围**：$0.90 - 1.0$（$0.90$：快速停止，10%能量损失/帧；$0.98$：自然停止，2%能量损失/帧，推荐；$1.00$：永动机，无能量损失）

**衰减分析**（初始速度 $v_0 = 100$）：

| Damping | 10帧后 | 50帧后 | 100帧后 |
|---------|--------|--------|---------|
| $1.00$  | $100.0$ | $100.0$ | $100.0$ ❌ |
| $0.99$  | $90.4$  | $60.5$  | $36.6$ ✅ |
| $0.98$  | $81.7$  | $36.4$  | $13.3$ ✅ |
| $0.95$  | $59.9$  | $7.7$   | $0.6$ ✅ |

---

## 参考

**参考实现**：Shadertoy SWE实现（Inigo Quilez）、浅水方程理论（维基百科）

**改进与创新**：相比参考实现，本系统进行了以下改进：1. **稳定性增强**：添加速度限制、过冲抑制、变化率限制；2. **用户控制**：百分比速度控制、阻尼系统；3. **边界条件**：完善的干地边界处理。

---

*本文档详细描述了SWE浅水方程的核心算法和实现细节。*
