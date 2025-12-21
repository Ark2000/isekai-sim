import { createCanvas } from './utils.js';
import { createBrush } from './brush.js';
import { W, H } from './config.js';
import { createTexture, createMRTFramebuffer, createProgram, FULLSCREEN_QUAD_VS } from './GLUtils.js';
import { WORLD_SIM_FS, WORLD_DISPLAY_FS, WORLD_GEN_FS } from './shaders/index.js';
import { setSimUniforms, setDisplayUniforms, drawQuad } from './uniforms.js';

export function createWorldLayer() {
    const TEXTURE_COUNT = 4;
    
    // WebGL 上下文和资源
    let gl = null;
    const programs = {};
    
    // Ping-Pong 纹理机制
    const textures = { read: null, write: null };
    const fbos = { read: null, write: null };
    
    // 笔刷
    const brush = createBrush();
    
    // 生成参数
    let genSeed = Math.random() * 100;
    let genScale = 3.0;
    let useTargetMode = false;
    let targetValue = 0.5;
    
    // 笔刷状态
    const brushPos = { x: 0, y: 0 };
    let isBrushing = false;
    let brushMode = 1; // 1=Add, -1=Sub
    let brushTarget = 0; // 0=Height, 1=Temperature, 2=Cloud, 4=Water
    
    // 全局环境参数
    const globalWind = { x: 1.0, y: 0.2 };
    
    // 物理模拟参数
    const simParams = {
        // SWE Parameters (from reference implementation)
        gravity: 10.0,
        gridSize: 5.0,
        deltaTime: 1.0,
        dampingAlpha: 0.5,
        dampingBeta: 2.0,
        waterSpeedMultiplier: 1.0,  // 内部值：会被百分比转换（0.01-1.0）
        waterSpeedPercent: 100,     // UI显示：百分比（1-100）
        waterDamping: 0.98,         // ✅ 速度衰减（摩擦）：0.9=快速停止，0.99=缓慢停止，1.0=永动机
        // Original parameters
        cloudDecay: 0.999,
        rainThreshold: 0.9,
        evaporation: 0.01,
        condensation: 0.005,
        tempDiffusion: 0.01,
        tempInertia: 0.995,
        thermalWind: 0.5,
        waterEvap: 0.0001,
        // Erosion (disabled for now)
        // erosionRate: 0.001,
        // depositionRate: 0.0005,
        // erosionStrength: 0.1,
        // talusRate: 0.01,
        // talusThreshold: 0.01
    };
    
    // 可视化开关
    let showHeight = true;
    let showTemp = false;
    let showCloud = false;
    let showWind = false;
    let showHillshade = true;
    let showWater = true;
    let showPixelData = true;
    
    let canvas, quadBuffer, guiFolder;
    let pixelTooltip = null;
    let lastMouseX = -1;
    let lastMouseY = -1;
    let mouseHoverTimeout = null;
    
    function initGpu() {
        canvas = createCanvas();
        
        // 创建像素数据显示tooltip
        pixelTooltip = document.createElement('div');
        pixelTooltip.id = 'genesis-pixel-tooltip';
        pixelTooltip.style.cssText = `
            position: fixed;
            background: rgba(17, 17, 17, 0.95);
            color: #ccc;
            padding: 6px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 10px;
            pointer-events: none;
            z-index: 9999;
            border: 1px solid #666;
            line-height: 1.4;
            white-space: pre;
            display: none;
        `;
        document.body.appendChild(pixelTooltip);
        
        // 监听鼠标移动 - 绑定到主canvas（#terrainCanvas）
        const mainCanvas = document.getElementById('terrainCanvas');
        if (mainCanvas) {
            mainCanvas.addEventListener('mousemove', (e) => {
                if (!showPixelData) {
                    pixelTooltip.style.display = 'none';
                    return;
                }
                
                const rect = mainCanvas.getBoundingClientRect();
                lastMouseX = Math.floor((e.clientX - rect.left) * (W / rect.width));
                lastMouseY = Math.floor((e.clientY - rect.top) * (H / rect.height));
                
                // 翻转Y坐标（WebGL坐标系）
                lastMouseY = H - 1 - lastMouseY;
                
                // 更新tooltip位置
                pixelTooltip.style.left = (e.clientX + 15) + 'px';
                pixelTooltip.style.top = (e.clientY + 15) + 'px';
                
                // 延迟300ms显示tooltip，避免快速移动时闪烁
                if (mouseHoverTimeout) {
                    clearTimeout(mouseHoverTimeout);
                }
                mouseHoverTimeout = setTimeout(() => {
                    pixelTooltip.style.display = 'block';
                }, 300);
            });
            
            mainCanvas.addEventListener('mouseleave', () => {
                if (mouseHoverTimeout) {
                    clearTimeout(mouseHoverTimeout);
                    mouseHoverTimeout = null;
                }
                pixelTooltip.style.display = 'none';
                lastMouseX = -1;
                lastMouseY = -1;
            });
        } else {
            console.error('Main canvas (#terrainCanvas) not found!');
        }
        
        const glContext = canvas.getContext('webgl2', { premultipliedAlpha: false });
        if (!glContext) {
            console.error('WebGL 2 not supported');
            return null;
        }
        
        glContext.getExtension('EXT_color_buffer_float');
        
        quadBuffer = glContext.createBuffer();
        glContext.bindBuffer(glContext.ARRAY_BUFFER, quadBuffer);
        glContext.bufferData(glContext.ARRAY_BUFFER, new Float32Array([
            -1, -1, 1, -1, -1, 1, 1, 1
        ]), glContext.STATIC_DRAW);
        
        const createTextureGroup = () => {
            const texs = [];
            for(let i=0; i<TEXTURE_COUNT; i++) {
                texs.push(createTexture(glContext, W, H, null));
            }
            return texs;
        };
        
        textures.read = createTextureGroup();
        textures.write = createTextureGroup();
        
        fbos.read = createMRTFramebuffer(glContext, textures.read, 'Read');
        fbos.write = createMRTFramebuffer(glContext, textures.write, 'Write');
        
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, fbos.read);
        glContext.clearColor(0, 0, 0, 0);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
        glContext.bindFramebuffer(glContext.FRAMEBUFFER, fbos.write);
        glContext.clear(glContext.COLOR_BUFFER_BIT);
        
        programs.sim = createProgram(glContext, FULLSCREEN_QUAD_VS, WORLD_SIM_FS, 'WorldSim');
        programs.display = createProgram(glContext, FULLSCREEN_QUAD_VS, WORLD_DISPLAY_FS, 'WorldDisplay');
        programs.gen = createProgram(glContext, FULLSCREEN_QUAD_VS, WORLD_GEN_FS, 'WorldGen');
        
        return glContext;
    }
    
    gl = initGpu();
    
    // 初始化时自动生成地形
    if (gl) {
        generateTerrain();
    }
    
    function swap() {
        let temp = textures.read;
        textures.read = textures.write;
        textures.write = temp;
        
        temp = fbos.read;
        fbos.read = fbos.write;
        fbos.write = temp;
    }
    
    function generateTerrain() {
        gl.useProgram(programs.gen);
        gl.uniform1f(gl.getUniformLocation(programs.gen, 'u_seed'), genSeed);
        gl.uniform1f(gl.getUniformLocation(programs.gen, 'u_scale'), genScale);
        gl.uniform2f(gl.getUniformLocation(programs.gen, 'u_offset'), 0, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.write);
        gl.viewport(0, 0, W, H);
        drawQuad(gl, programs.gen, quadBuffer);
        
        swap();
        genSeed += 1.23;
    }
    
    return {
        get gl() { return gl; },
        get canvas() { return canvas; },
        get brush() { return brush; },
        get simParams() { return simParams; },
        get globalWind() { return globalWind; },
        get textures() { return textures; },
        get fbos() { return fbos; },
        get programs() { return programs; },
        get quadBuffer() { return quadBuffer; },
        
        get genSeed() { return genSeed; },
        set genSeed(v) { genSeed = v; },
        get genScale() { return genScale; },
        set genScale(v) { genScale = v; },
        get useTargetMode() { return useTargetMode; },
        set useTargetMode(v) { useTargetMode = v; },
        get targetValue() { return targetValue; },
        set targetValue(v) { targetValue = v; },
        get brushTarget() { return brushTarget; },
        set brushTarget(v) { brushTarget = v; },
        get showHeight() { return showHeight; },
        set showHeight(v) { showHeight = v; },
        get showTemp() { return showTemp; },
        set showTemp(v) { showTemp = v; },
        get showCloud() { return showCloud; },
        set showCloud(v) { showCloud = v; },
        get showWind() { return showWind; },
        set showWind(v) { showWind = v; },
        get showHillshade() { return showHillshade; },
        set showHillshade(v) { showHillshade = v; },
        get showWater() { return showWater; },
        set showWater(v) { showWater = v; },
        
        generateTerrain,
        
        updatePixelData() {
            if (!showPixelData || lastMouseX < 0 || lastMouseY < 0 || 
                lastMouseX >= W || lastMouseY >= H || !pixelTooltip) {
                return;
            }
            
            try {
                // 读取4个纹理的像素数据
                const pixelData = [];
                const tempBuffer = new Float32Array(4);
                
                // 保存当前状态
                const currentFBO = gl.getParameter(gl.FRAMEBUFFER_BINDING);
                
                // 绑定read framebuffer来读取数据
                gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.read);
                
                for (let i = 0; i < TEXTURE_COUNT; i++) {
                    gl.readBuffer(gl.COLOR_ATTACHMENT0 + i);
                    gl.readPixels(lastMouseX, lastMouseY, 1, 1, gl.RGBA, gl.FLOAT, tempBuffer);
                    pixelData.push(Array.from(tempBuffer));
                }
                
                // 恢复framebuffer状态
                gl.bindFramebuffer(gl.FRAMEBUFFER, currentFBO);
                
                // 格式化显示
                const lines = [
                    `Pos: (${lastMouseX}, ${H - 1 - lastMouseY})`,
                    ``,
                    `T0: Height=${pixelData[0][0].toFixed(3)}`,
                    ``,
                    `T1: Temp=${pixelData[1][0].toFixed(3)}`,
                    ``,
                    `T2: WindX=${pixelData[2][0].toFixed(3)}`,
                    `    WindY=${pixelData[2][1].toFixed(3)}`,
                    `    Cloud=${pixelData[2][2].toFixed(3)}`,
                    `    Vapor=${pixelData[2][3].toFixed(3)}`,
                    ``,
                    `T3: WaterDepth=${pixelData[3][0].toFixed(3)}`,
                    `    Sediment=${pixelData[3][1].toFixed(3)}`,
                    `    VelX=${pixelData[3][2].toFixed(3)}`,
                    `    VelY=${pixelData[3][3].toFixed(3)}`
                ];
                
                pixelTooltip.textContent = lines.join('\n');
            } catch (error) {
                console.error('Failed to read pixel data:', error);
            }
        },
        
        applyBrush(cx, cy, isAdditive) {
            isBrushing = true;
            brushPos.x = (cx + brush.radius) / W;
            brushPos.y = (cy + brush.radius) / H;
            brushMode = isAdditive ? 1.0 : -1.0;
        },
        
        render() {
            // Multi-Pass SWE Simulation
            // Pass 0: Velocity Integration (Pressure -> Velocity)
            gl.useProgram(programs.sim);
            setSimUniforms(gl, programs.sim, {
                brush, brushPos, brushMode, isBrushing, useTargetMode, targetValue,
                globalWind, simParams, brushTarget, TEXTURE_COUNT, textures,
                simPass: 0 // Pass 0
            });
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.write);
            gl.viewport(0, 0, W, H);
            drawQuad(gl, programs.sim, quadBuffer);
            swap();
            
            // Pass 1: Height Integration (Velocity -> Water Depth)
            gl.useProgram(programs.sim);
            setSimUniforms(gl, programs.sim, {
                brush, brushPos, brushMode, isBrushing: false, useTargetMode, targetValue,
                globalWind, simParams, brushTarget, TEXTURE_COUNT, textures,
                simPass: 1 // Pass 1
            });
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.write);
            gl.viewport(0, 0, W, H);
            drawQuad(gl, programs.sim, quadBuffer);
            swap();
            
            // Pass 2: Erosion & Sediment Transport
            gl.useProgram(programs.sim);
            setSimUniforms(gl, programs.sim, {
                brush, brushPos, brushMode, isBrushing: false, useTargetMode, targetValue,
                globalWind, simParams, brushTarget, TEXTURE_COUNT, textures,
                simPass: 2 // Pass 2
            });
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.write);
            gl.viewport(0, 0, W, H);
            drawQuad(gl, programs.sim, quadBuffer);
            swap();
            
            // Pass 3: Atmosphere (Wind, Cloud, Temperature)
            gl.useProgram(programs.sim);
            setSimUniforms(gl, programs.sim, {
                brush, brushPos, brushMode, isBrushing: false, useTargetMode, targetValue,
                globalWind, simParams, brushTarget, TEXTURE_COUNT, textures,
                simPass: 3 // Pass 3
            });
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.write);
            gl.viewport(0, 0, W, H);
            drawQuad(gl, programs.sim, quadBuffer);
            swap();
            
            isBrushing = false;
            
            // 更新像素数据显示（在切换到显示Pass之前读取）
            this.updatePixelData();
            
            // Display Pass
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.useProgram(programs.display);
            setDisplayUniforms(gl, programs.display, {
                TEXTURE_COUNT, textures, showHeight, showTemp, showCloud,
                showWind, showHillshade, showWater
            });
            drawQuad(gl, programs.display, quadBuffer);
        },
        
        setupGUI(gui) {
            guiFolder = gui.addFolder({ title: 'World Sim', expanded: true });
            
            guiFolder.addBinding({ get brushTarget() { return brushTarget; }, set brushTarget(v) { brushTarget = v; } }, 'brushTarget', {
                options: { 'Edit Terrain': 0, 'Edit Temperature': 1, 'Edit Cloud': 2, 'Edit Water': 4 },
                label: 'Tool',
                hint: 'Select the layer to modify with the brush tool.'
            });
            
            const genFolder = guiFolder.addFolder({ title: 'Generator', expanded: false });
            genFolder.addBinding({ get genScale() { return genScale; }, set genScale(v) { genScale = v; } }, 'genScale', { 
                min: 0.1, max: 10.0, label: 'Scale',
                hint: 'Scale of the terrain generation noise. Smaller values result in larger features.'
            });
            genFolder.addBinding({ get genSeed() { return genSeed; }, set genSeed(v) { genSeed = v; } }, 'genSeed', { 
                label: 'Seed',
                hint: 'Random seed for terrain generation.'
            });
            genFolder.addButton({ title: 'Generate Terrain' }).on('click', generateTerrain);
            
            brush.setupGUI(guiFolder);
            guiFolder.addBinding({ get useTargetMode() { return useTargetMode; }, set useTargetMode(v) { useTargetMode = v; } }, 'useTargetMode', { 
                label: 'Limit',
                hint: 'Enable to cap the brush effect at a specific target value.'
            });
            guiFolder.addBinding({ get targetValue() { return targetValue; }, set targetValue(v) { targetValue = v; } }, 'targetValue', { 
                min: 0, max: 1, step: 0.01, label: 'Limit Val',
                hint: 'The target value for the Limit mode.'
            });
            guiFolder.addBlade({ view: 'separator' });
            
            const envFolder = guiFolder.addFolder({ title: 'Environment', expanded: false });
            envFolder.addBinding(globalWind, 'x', { 
                min: -2.0, max: 2.0, label: 'Wind X',
                hint: 'Horizontal global wind velocity.'
            });
            envFolder.addBinding(globalWind, 'y', { 
                min: -2.0, max: 2.0, label: 'Wind Y',
                hint: 'Vertical global wind velocity.'
            });
            
            const physFolder = guiFolder.addFolder({ title: 'Physics Params', expanded: false });
            const sweFolder = physFolder.addFolder({ title: 'SWE (Shallow Water)' });
            const speedBinding = sweFolder.addBinding(simParams, 'waterSpeedPercent', { 
                min: 1, max: 100, step: 1, label: 'Water Speed %',
                hint: '🌊 Water flow speed: 100% = normal, 1% = super slow (SAFE!)'
            });
            // 监听变化，转换为内部值（1-100% → 0.01-1.0）
            speedBinding.on('change', (ev) => {
                simParams.waterSpeedMultiplier = ev.value / 100.0;
            });
            
            sweFolder.addBinding(simParams, 'waterDamping', { 
                min: 0.90, max: 1.0, step: 0.01, label: 'Water Damping',
                hint: '🛑 Friction/energy loss: 0.90=quick stop, 0.99=slow stop, 1.0=forever (SAFE!)'
            });
            
            // Advanced parameters (can cause instability if changed)
            const advancedFolder = sweFolder.addFolder({ title: '⚠️ Advanced (Danger!)', expanded: false });
            advancedFolder.addBinding(simParams, 'gravity', { 
                min: 1.0, max: 20.0, step: 0.1, label: '⚠️ Gravity',
                hint: '⚠️ WARNING: Changing this can break stability!'
            });
            advancedFolder.addBinding(simParams, 'gridSize', { 
                min: 1.0, max: 10.0, step: 0.1, label: '⚠️ Grid Size',
                hint: '⚠️ WARNING: Changing this can break stability!'
            });
            advancedFolder.addBinding(simParams, 'deltaTime', { 
                min: 0.1, max: 2.0, step: 0.1, label: '⚠️ Time Step',
                hint: '⚠️ WARNING: Changing this can break stability!'
            });
            advancedFolder.addBinding(simParams, 'dampingAlpha', { 
                min: 0.1, max: 1.0, step: 0.05, label: '⚠️ Velocity Damp',
                hint: '⚠️ WARNING: Changing this can break stability!'
            });
            advancedFolder.addBinding(simParams, 'dampingBeta', { 
                min: 1.0, max: 5.0, step: 0.1, label: '⚠️ Overshoot Damp',
                hint: '⚠️ WARNING: Changing this can break stability!'
            });
            const cloudFolder = physFolder.addFolder({ title: 'Cloud Physics' });
            cloudFolder.addBinding(simParams, 'cloudDecay', { 
                min: 0.9, max: 1.0, step: 0.0001, label: 'Decay',
                hint: 'How fast clouds dissipate over time.'
            });
            cloudFolder.addBinding(simParams, 'rainThreshold', { 
                min: 0.5, max: 1.0, label: 'Rain Thres',
                hint: 'Cloud density required to trigger rainfall.'
            });
            cloudFolder.addBinding(simParams, 'evaporation', { 
                min: 0.0, max: 0.1, step: 0.001, label: 'Evap Rate',
                hint: 'Rate at which surface water turns into clouds.'
            });
            cloudFolder.addBinding(simParams, 'condensation', { 
                min: 0.0, max: 0.1, step: 0.001, label: 'Cond Rate',
                hint: 'Rate at which atmospheric moisture turns into clouds.'
            });
            const tempFolder = physFolder.addFolder({ title: 'Thermal Physics' });
            tempFolder.addBinding(simParams, 'tempDiffusion', { 
                min: 0.0, max: 0.1, step: 0.001, label: 'Diffusion',
                hint: 'How quickly temperature spreads to neighboring areas.'
            });
            tempFolder.addBinding(simParams, 'tempInertia', { 
                min: 0.9, max: 0.999, step: 0.001, label: 'Inertia',
                hint: 'Resistance to temperature changes.'
            });
            tempFolder.addBinding(simParams, 'thermalWind', { 
                min: 0.0, max: 2.0, label: 'Thermal Wind',
                hint: 'Strength of wind generated by temperature gradients.'
            });
            const waterFolder = physFolder.addFolder({ title: 'Water Physics' });
            waterFolder.addBinding(simParams, 'waterEvap', { 
                min: 0.0, max: 0.01, step: 0.0001, label: 'Evaporation',
                hint: 'Rate of water loss to the atmosphere.'
            });
            // Erosion folder removed - disabled for now
            /*
            const erosionFolder = physFolder.addFolder({ title: 'Erosion' });
            erosionFolder.addBinding(simParams, 'erosionRate', { 
                min: 0.0, max: 0.01, step: 0.0001, label: 'Erosion Rate',
                hint: 'Rate at which flowing water picks up sediment.'
            });
            erosionFolder.addBinding(simParams, 'depositionRate', { 
                min: 0.0, max: 0.01, step: 0.0001, label: 'Deposition Rate',
                hint: 'Rate at which water drops sediment.'
            });
            erosionFolder.addBinding(simParams, 'erosionStrength', { 
                min: 0.0, max: 1.0, step: 0.01, label: 'Erosion Strength',
                hint: 'Overall impact of erosion on the terrain height.'
            });
            erosionFolder.addBinding(simParams, 'talusRate', { 
                min: 0.0, max: 0.1, step: 0.001, label: 'Talus Rate',
                hint: 'Speed of thermal erosion (dry crumbling).'
            });
            erosionFolder.addBinding(simParams, 'talusThreshold', { 
                min: 0.0, max: 0.01, step: 0.0001, label: 'Talus Thres',
                hint: 'Slope threshold for thermal erosion.'
            });
            */
            
            const viewFolder = guiFolder.addFolder({ title: 'Layers Visibility', expanded: true });
            viewFolder.addLayerToggles([
                { 
                    key: 'showHeight', 
                    label: 'Show Terrain',
                    getValue: () => showHeight,
                    setValue: (v) => { showHeight = v; }
                },
                { 
                    key: 'showHillshade', 
                    label: 'Show Hillshade',
                    getValue: () => showHillshade,
                    setValue: (v) => { showHillshade = v; }
                },
                { 
                    key: 'showWater', 
                    label: 'Show Water',
                    getValue: () => showWater,
                    setValue: (v) => { showWater = v; }
                },
                { 
                    key: 'showTemp', 
                    label: 'Show Temp',
                    getValue: () => showTemp,
                    setValue: (v) => { showTemp = v; }
                },
                { 
                    key: 'showCloud', 
                    label: 'Show Cloud',
                    getValue: () => showCloud,
                    setValue: (v) => { showCloud = v; }
                },
                { 
                    key: 'showWind', 
                    label: 'Show Wind',
                    getValue: () => showWind,
                    setValue: (v) => { showWind = v; }
                }
            ]);
            
            guiFolder.addBlade({ view: 'separator' });
            guiFolder.addBinding({ 
                get showPixelData() { return showPixelData; }, 
                set showPixelData(v) { 
                    showPixelData = v; 
                    if (!v && pixelTooltip) {
                        pixelTooltip.style.display = 'none';
                    }
                } 
            }, 'showPixelData', { 
                label: 'Pixel Data',
                hint: 'Show texture values under cursor'
            });
        }
    };
}
