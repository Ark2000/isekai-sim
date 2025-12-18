# Project GENESIS - 调试指南

## 🛠️ 浏览器开发者工具

### 1. **Chrome DevTools** (推荐)

#### 打开方式
- `F12` 或 `Ctrl+Shift+I` (Windows/Linux)
- `Cmd+Option+I` (Mac)
- 右键页面 → "检查"

#### 常用面板

**Console（控制台）**
- 查看所有 `console.log/error/warn` 输出
- 执行 JavaScript 代码（可以直接访问 `window.terrainEditor`）
- 查看 WebGL 错误信息

**Sources（源代码）**
- 设置断点调试
- 单步执行代码
- 查看变量值
- 修改代码并热重载（需要配置）

**Performance（性能）**
- 录制性能分析
- 查看 FPS、CPU、内存使用
- 找出性能瓶颈

**Network（网络）**
- 查看资源加载情况
- 检查 Shader 文件是否正确加载

---

## 🎯 WebGL 专用调试

### 1. **WebGL Inspector 扩展**

安装 Chrome 扩展：
- [WebGL Inspector](https://chrome.google.com/webstore/detail/webgl-inspector/ogkcjmbhnfmlnjecykpadabhebimdnbi)

功能：
- 查看所有 WebGL 调用
- 检查纹理内容
- 查看 Shader 源码
- 单步调试渲染流程

### 2. **WebGL 错误检查**

项目已内置基本错误检查（`GLUtils.js`），但可以添加更详细的：

```javascript
// 在浏览器控制台执行
const gl = window.terrainEditor.layers[0].gl;

// 检查 WebGL 错误
function checkGLError(gl, label) {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
        console.error(`${label}: WebGL Error ${error}`, {
            1280: 'INVALID_ENUM',
            1281: 'INVALID_VALUE',
            1282: 'INVALID_OPERATION',
            1285: 'OUT_OF_MEMORY',
            1286: 'INVALID_FRAMEBUFFER_OPERATION'
        }[error]);
    }
}

// 在关键位置调用
checkGLError(gl, 'After render');
```

### 3. **Shader 调试技巧**

#### 查看编译错误
- 所有 Shader 编译错误会自动输出到 Console
- 错误信息包含行号和具体问题

#### 可视化 Shader 输出
在 `shaders.js` 中临时修改，输出中间值：

```glsl
// 在 WORLD_DISPLAY_FS 中
// 临时输出某个通道的值来调试
vec3 debugColor = vec3(d0.r); // 显示高度
// vec3 debugColor = vec3(d1.r); // 显示温度
// vec3 debugColor = vec3(d2.b); // 显示云
outColor = vec4(debugColor, 1.0);
```

#### 使用 ShaderToy 测试
- 复制 Shader 代码到 [ShaderToy](https://www.shadertoy.com/)
- 可以实时预览和调试

---

## 📊 性能分析

### 1. **Chrome Performance 面板**

1. 打开 DevTools → Performance
2. 点击录制按钮（圆点）
3. 操作应用 5-10 秒
4. 停止录制
5. 查看：
   - **FPS 图表**：帧率是否稳定
   - **Main 线程**：JavaScript 执行时间
   - **GPU**：渲染时间
   - **火焰图**：找出耗时最长的函数

### 2. **内置 FPS 显示**

项目左上角已显示：
- 当前 FPS
- 目标 FPS
- 每帧耗时

### 3. **内存分析**

在控制台执行：

```javascript
// 查看 WebGL 资源
const layer = window.terrainEditor.layers[0];
console.log('Textures:', layer.textures);
console.log('FBOs:', layer.fbos);
console.log('Programs:', layer.programs);

// 检查内存使用（Chrome）
performance.memory && console.log({
    used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
    total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
    limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
});
```

---

## 🐛 常见问题调试

### 1. **Shader 编译错误**

**症状**：控制台显示 "Shader compile error"

**调试步骤**：
1. 查看错误信息中的行号
2. 打开 `shaders.js` 找到对应行
3. 检查：
   - 语法错误（缺少分号、括号不匹配）
   - 变量未定义
   - 类型不匹配
   - 函数重复定义

**示例**：
```
ERROR: 0:60: 'fbm' : function already has a body
```
→ 检查是否有重复的 `fbm` 函数定义

### 2. **纹理显示异常**

**症状**：画面全黑、颜色不对、闪烁

**调试步骤**：
1. 检查纹理是否正确创建：
```javascript
const gl = window.terrainEditor.layers[0].gl;
const tex = window.terrainEditor.layers[0].textures.read[0];
gl.bindTexture(gl.TEXTURE_2D, tex);
console.log('Texture size:', gl.getTexParameter(tex, gl.TEXTURE_WIDTH));
```

2. 检查 Uniform 是否正确传递：
```javascript
// 在 WorldLayer.js 的 render() 方法中添加日志
console.log('Brush pos:', this.brushPos);
console.log('Brush radius:', this.brush.radius);
```

3. 检查 FBO 状态：
```javascript
const fbo = window.terrainEditor.layers[0].fbos.read;
gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
console.log('FBO status:', status === gl.FRAMEBUFFER_COMPLETE ? 'OK' : 'ERROR');
```

### 3. **物理模拟异常**

**症状**：温度/云/水不按预期变化

**调试步骤**：
1. 在 Shader 中输出中间值（见上方 Shader 调试）
2. 检查参数是否正确传递：
```javascript
const layer = window.terrainEditor.layers[0];
console.log('Sim params:', layer.simParams);
console.log('Global wind:', layer.globalWind);
```

3. 临时禁用某些物理效果，逐个排查

### 4. **笔刷不工作**

**症状**：点击/拖拽没有效果

**调试步骤**：
1. 检查事件监听：
```javascript
console.log('Is drawing:', window.terrainEditor.isDrawing);
console.log('Mouse pos:', window.terrainEditor.mx, window.terrainEditor.my);
```

2. 检查笔刷状态：
```javascript
const brush = window.terrainEditor.getTopLayer().brush;
console.log('Brush radius:', brush.radius);
console.log('Brush value:', brush.value);
console.log('Brush target:', window.terrainEditor.getTopLayer().brushTarget);
```

3. 检查 `isBrushing` 标志：
```javascript
console.log('Is brushing:', window.terrainEditor.getTopLayer().isBrushing);
```

---

## 🔧 实用调试工具

### 1. **在控制台访问全局对象**

```javascript
// 访问主编辑器
window.terrainEditor

// 访问 WorldLayer
window.terrainEditor.layers[0]

// 访问笔刷
window.terrainEditor.getTopLayer().brush

// 访问 WebGL 上下文
window.terrainEditor.layers[0].gl
```

### 2. **快速测试函数**

在控制台执行：

```javascript
// 重新生成地形
window.terrainEditor.layers[0].generateTerrain();

// 修改笔刷参数
const brush = window.terrainEditor.getTopLayer().brush;
brush.radius = 10;
brush.value = 0.5;

// 修改物理参数
const params = window.terrainEditor.layers[0].simParams;
params.cloudDecay = 0.999;
params.waterFlow = 0.3;

// 切换显示层
const layer = window.terrainEditor.layers[0];
layer.showHeight = true;
layer.showCloud = true;
layer.showWater = false;
```

### 3. **导出/导入状态**（需要实现）

可以添加保存/加载功能来调试：

```javascript
// 保存当前状态（需要实现）
function saveState() {
    const state = {
        textures: /* 读取纹理数据 */,
        params: window.terrainEditor.layers[0].simParams,
        // ...
    };
    localStorage.setItem('genesis_state', JSON.stringify(state));
}

// 加载状态
function loadState() {
    const state = JSON.parse(localStorage.getItem('genesis_state'));
    // 恢复状态
}
```

---

## 📝 调试最佳实践

### 1. **使用有意义的日志**

```javascript
// ❌ 不好
console.log(x);

// ✅ 好
console.log('[Brush] Applying at:', x, y, 'radius:', radius);
```

### 2. **条件日志**

```javascript
const DEBUG = true; // 或从 URL 参数读取

if (DEBUG) {
    console.log('Debug info:', data);
}
```

### 3. **性能标记**

```javascript
// 测量函数执行时间
const start = performance.now();
// ... 执行代码 ...
const end = performance.now();
console.log(`Function took ${end - start}ms`);
```

### 4. **断点调试**

在 `Sources` 面板：
- 点击行号设置断点
- 使用 `F10` 单步跳过
- 使用 `F11` 单步进入
- 使用 `F8` 继续执行
- 在右侧查看变量值

---

## 🚀 高级调试技巧

### 1. **实时修改 Shader**

虽然不能直接热重载，但可以：
1. 修改 `shaders.js`
2. 刷新页面
3. 或添加重新编译功能：

```javascript
// 在 WorldLayer.js 中添加
recompileShaders() {
    // 重新创建 programs
    this.initGpu();
}
```

### 2. **纹理内容可视化**

```javascript
// 读取纹理数据到 CPU（性能开销大，仅用于调试）
function readTexture(gl, texture, width, height) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    
    const pixels = new Float32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
    
    gl.deleteFramebuffer(fbo);
    return pixels;
}

// 使用
const layer = window.terrainEditor.layers[0];
const data = readTexture(layer.gl, layer.textures.read[0], 256, 256);
console.log('Height data sample:', data.slice(0, 10));
```

### 3. **录制和回放**

可以添加录制功能来复现 bug：

```javascript
// 记录所有用户操作
const actions = [];
window.addEventListener('mousedown', (e) => {
    actions.push({ type: 'mousedown', time: performance.now(), x: e.clientX, y: e.clientY });
});
```

---

## 📚 推荐资源

- [WebGL2 规范](https://www.khronos.org/registry/webgl/specs/latest/2.0/)
- [GLSL 参考](https://www.khronos.org/opengl/wiki/OpenGL_Shading_Language)
- [Chrome DevTools 文档](https://developer.chrome.com/docs/devtools/)
- [WebGL Inspector 使用指南](https://github.com/3Dparallax/insight)

---

## 💡 提示

1. **保持控制台打开**：很多错误会自动输出
2. **使用断点**：比 `console.log` 更高效
3. **性能分析定期做**：不要等到卡顿才分析
4. **记录常见错误**：建立自己的调试知识库

Happy Debugging! 🐛✨

