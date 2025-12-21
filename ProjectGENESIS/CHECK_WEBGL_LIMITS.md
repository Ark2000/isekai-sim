# WebGL 2.0 纹理和数据限制指南

## 快速检测命令

在浏览器控制台运行以下命令查看你的GPU限制：

```javascript
// 运行此命令检测你的GPU限制
window.GenesisDebug.getInfo()

// 或者更详细的检测：
const gl = window.editor.worldLayer.gl;
console.table({
    'MAX_DRAW_BUFFERS (MRT数量)': gl.getParameter(gl.MAX_DRAW_BUFFERS),
    'MAX_COLOR_ATTACHMENTS': gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
    'MAX_TEXTURE_SIZE': gl.getParameter(gl.MAX_TEXTURE_SIZE),
    'MAX_TEXTURE_IMAGE_UNITS (片段着色器)': gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    'MAX_VERTEX_TEXTURE_IMAGE_UNITS': gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    'MAX_COMBINED_TEXTURE_IMAGE_UNITS': gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
});
```

## 理论限制（WebGL 2.0标准）

### 1. MRT (Multiple Render Targets) - 同时写入的纹理数量
- **最小保证**: 4 个 (gl.MAX_DRAW_BUFFERS)
- **典型值**: 8-16 个
- **你当前使用**: 4 个

**这是你最关心的限制！** 这决定了你在一个Pass中能同时输出多少张纹理。

### 2. 每张纹理的数据容量
每张纹理是 RGBA 格式，每个像素有 **4个通道**：
- 格式: `vec4 (R, G, B, A)`
- 精度: `highp float` = 32位浮点数（每通道）
- **每像素数据量**: 4 × 32bit = 128bit = 16字节

你当前的设置（512×512，4张纹理）：
```
单张纹理: 512 × 512 × 16字节 = 4MB
4张纹理总计: 16MB
Ping-Pong双缓冲: 32MB
```

### 3. 读取纹理的数量限制
- **片段着色器最小保证**: 16 个纹理单元
- **典型值**: 16-32 个
- **你当前使用**: 4 个（u_tex0 到 u_tex3）

## 实际可用容量分析

### 方案A：增加MRT数量（推荐）

**当前**: 4张纹理 × 4通道 = **16个浮点数/像素**

**如果扩展到8张**:
```javascript
const TEXTURE_COUNT = 8; // 在 WorldLayer.js 修改

// 可用数据：
8张 × 4通道 = 32个浮点数/像素
```

**理论极限**（大多数GPU）:
```
16张纹理 × 4通道 = 64个浮点数/像素
```

### 方案B：使用数据打包技巧

如果GPU只支持4张MRT，可以这样优化：

#### 1. **位打包**（降低精度）
```glsl
// 将多个低精度值打包到一个float中
// 例如：4个8位值 → 1个32位float
float pack4x8(vec4 values) {
    values = clamp(values, 0.0, 1.0) * 255.0;
    return dot(values, vec4(1.0, 256.0, 65536.0, 16777216.0));
}

vec4 unpack4x8(float packed) {
    vec4 result;
    result.a = floor(packed / 16777216.0);
    packed -= result.a * 16777216.0;
    result.b = floor(packed / 65536.0);
    packed -= result.b * 65536.0;
    result.g = floor(packed / 256.0);
    result.r = packed - result.g * 256.0;
    return result / 255.0;
}
```

通过打包，4张纹理可以存储 **64个8位值** 或 **32个16位值**。

#### 2. **范围压缩**
对于已知范围的数据（如高度0-1000米），可以标准化到0-1：
```glsl
float heightMeters = 534.7;
float normalizedHeight = heightMeters / 1000.0; // 存储
float restored = normalizedHeight * 1000.0;     // 读取
```

#### 3. **稀疏存储**
不常用的数据（如Sediment）只在需要时激活：
```glsl
if (waterDepth > 0.01) {
    // 只有有水的地方才计算泥沙
    sediment = ...
}
```

## 检查你的GPU实际限制

在控制台运行：

```javascript
const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2');

const limits = {
    'WebGL版本': gl.getParameter(gl.VERSION),
    'GPU型号': gl.getParameter(gl.RENDERER),
    
    // ⭐ 关键限制
    'MRT数量 (MAX_DRAW_BUFFERS)': gl.getParameter(gl.MAX_DRAW_BUFFERS),
    'COLOR_ATTACHMENTS': gl.getParameter(gl.MAX_COLOR_ATTACHMENTS),
    
    // 纹理限制
    '最大纹理尺寸': gl.getParameter(gl.MAX_TEXTURE_SIZE),
    '片段着色器纹理单元': gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
    '顶点着色器纹理单元': gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    '总纹理单元': gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    
    // 其他限制
    'Varying向量': gl.getParameter(gl.MAX_VARYING_VECTORS),
    '片段着色器Uniform': gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    '顶点着色器Uniform': gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
};

console.table(limits);

// 计算你的实际可用容量
const maxMRT = gl.getParameter(gl.MAX_DRAW_BUFFERS);
const maxDataPerPixel = maxMRT * 4; // 每张4通道
console.log(`\n💡 你的GPU最多支持: ${maxMRT}张纹理 × 4通道 = ${maxDataPerPixel}个float/像素`);
console.log(`当前使用: 4张纹理 × 4通道 = 16个float/像素`);
console.log(`剩余容量: ${maxMRT - 4}张纹理 × 4通道 = ${(maxMRT - 4) * 4}个float/像素`);
```

## 常见GPU的MRT限制

| GPU类型 | MAX_DRAW_BUFFERS | 可用数据/像素 |
|---------|------------------|---------------|
| 低端集成显卡 | 4 | 16 floats |
| 中端独显 (GTX 1060) | 8 | 32 floats |
| 高端独显 (RTX 3080) | 8-16 | 32-64 floats |
| 移动端GPU | 4-8 | 16-32 floats |

## 推荐策略

### 如果 MAX_DRAW_BUFFERS >= 8
```javascript
// 可以扩展到8张纹理
const TEXTURE_COUNT = 8;

// 新增纹理可以用于：
// T4: 植被 (R=草, G=树木, B=农田, A=枯萎度)
// T5: 地质 (R=岩石类型, G=土壤肥力, B=矿物, A=污染)
// T6: 生物 (R=动物密度, G=微生物, B=疾病, A=种群年龄)
// T7: 扩展 (R=魔力, G=辐射, B=时间流速, A=维度扭曲)
```

### 如果 MAX_DRAW_BUFFERS = 4（最小标准）
保持当前4张纹理，但优化数据利用：
```javascript
// 当前你的16个通道使用率：
// T0: Height (1/4 使用)
// T1: Temp (1/4 使用)
// T2: WindX, WindY, Cloud, Vapor (4/4 使用 ✅)
// T3: WaterDepth, Sediment, VelX, VelY (4/4 使用 ✅)

// 可以优化的地方：
// T0: Height, BiomeID, Fertility, Age (改为 4/4 ✅)
// T1: Temp, Pressure, Humidity, Radiation (改为 4/4 ✅)
```

## 总结

**你的答案**:
- ✅ **MRT数量**: 最少4张（WebGL2保证），通常8-16张（取决于GPU）
- ✅ **每像素数据**: 当前16个float，可扩展到32-64个float
- ✅ **瓶颈**: MRT数量（MAX_DRAW_BUFFERS），而不是纹理尺寸或精度

**建议**:
1. 先运行检测命令，看你的GPU实际支持多少MRT
2. 如果 ≥8，可以放心扩展到8张纹理
3. 如果只有4，优化现有通道的使用率（T0和T1还有空闲通道）

运行 `window.GenesisDebug.getInfo()` 查看你的实际限制！

