import { Layer } from './Layer.js';
import { CircleBrush } from './CircleBrush.js';
import { W, H } from './config.js';
import { createTexture, createMRTFramebuffer, createProgram, FULLSCREEN_QUAD_VS } from './GLUtils.js';
import { WORLD_SIM_FS, WORLD_DISPLAY_FS, WORLD_GEN_FS } from './shaders.js';

export class WorldLayer extends Layer {
    constructor() {
        super('World Physics');
        
        // 4个纹理，每个4通道，总共16个通道的数据
        this.TEXTURE_COUNT = 4;
        
        // 笔刷
        this.brush = new CircleBrush();
        
        // 生成参数
        this.genSeed = Math.random() * 100;
        this.genScale = 3.0;
        this.useTargetMode = false;
        this.targetValue = 0.5;
        
        // 笔刷状态
        this.brushPos = { x: 0, y: 0 };
        this.isBrushing = false;
        this.brushMode = 1; // 1=Add, -1=Sub
        this.brushTarget = 0; // 0=Height, 1=Temperature, 2=Humidity, 3=Cloud
        
        // 全局环境参数
        this.globalWind = { x: 1.0, y: 0.2 }; 
        
        // 物理模拟参数
        this.simParams = {
            // 云
            cloudDecay: 0.999,      // 消散速度 (越大越持久)
            rainThreshold: 0.9,     // 降雨阈值
            evaporation: 0.01,      // 蒸发速率
            condensation: 0.005,    // 凝结速率
            // 温度
            tempDiffusion: 0.01,    // 热扩散
            tempInertia: 0.995,     // 热惯性 (越大越难回归环境温度)
            // 风
            thermalWind: 0.5,        // 温差风强度
            // 水
            waterFlow: 0.2,         // 水流速度
            waterEvap: 0.0001       // 水自然蒸发
        };
        
        // 可视化开关
        this.showHeight = true;
        this.showTemp = false;
        this.showCloud = true;
        this.showWind = false;
        this.showHillshade = true;
        this.showWater = true; // 默认显示水
        
        this.initGpu();
    }

    initGpu() {
        super.initGpu();
        const gl = this.gl;

        // 1. 创建两组纹理 (Read/Write) 用于 Ping-Pong
        // 每组包含 TEXTURE_COUNT 个纹理
        const createTextureGroup = () => {
            const textures = [];
            for(let i=0; i<this.TEXTURE_COUNT; i++) {
                textures.push(createTexture(gl, W, H, null));
            }
            return textures;
        };

        this.textures = {
            read: createTextureGroup(),
            write: createTextureGroup()
        };

        // 2. 创建 Framebuffers
        this.fbos = {
            read: createMRTFramebuffer(gl, this.textures.read),
            write: createMRTFramebuffer(gl, this.textures.write)
        };
        
        // 清空纹理
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.read);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.write);
        gl.clear(gl.COLOR_BUFFER_BIT);


        // --- Shaders ---

        // A. 物理模拟核心 Shader (Uber Shader)
        this.programs.sim = createProgram(gl, FULLSCREEN_QUAD_VS, WORLD_SIM_FS);

        // B. 可视化 Shader
        this.programs.display = createProgram(gl, FULLSCREEN_QUAD_VS, WORLD_DISPLAY_FS);
        
        // C. 地形生成 Shader
        this.programs.gen = createProgram(gl, FULLSCREEN_QUAD_VS, WORLD_GEN_FS);
    }

    setupGUI(gui) {
        this.guiFolder = gui.addFolder({ title: 'World Sim', expanded: true });
        
        // 1. 编辑目标选择
        this.guiFolder.addBinding(this, 'brushTarget', {
            options: {
                'Edit Terrain': 0,
                'Edit Temperature': 1,
                'Edit Cloud': 2,
                'Edit Water': 4, // 对应 Texture 3.R (Shader中特殊处理)
            },
            label: 'Tool'
        });

        // 生成器控制
        const genFolder = this.guiFolder.addFolder({ title: 'Generator', expanded: false });
        genFolder.addBinding(this, 'genScale', { min: 0.1, max: 10.0, label: 'Scale' });
        genFolder.addBinding(this, 'genSeed', { label: 'Seed' });
        genFolder.addButton({ title: 'Generate Terrain' }).on('click', () => {
            this.generateTerrain();
        });

        this.brush.setupGUI(this.guiFolder);
        
        // Target Mode GUI
        this.guiFolder.addBinding(this, 'useTargetMode', { label: 'Limit' });
        this.guiFolder.addBinding(this, 'targetValue', { min: 0, max: 1, step: 0.01, label: 'Limit Val' });
        this.guiFolder.addBlade({ view: 'separator' });

        // 环境控制
        const envFolder = this.guiFolder.addFolder({ title: 'Environment', expanded: false });
        envFolder.addBinding(this.globalWind, 'x', { min: -2.0, max: 2.0, label: 'Wind X' });
        envFolder.addBinding(this.globalWind, 'y', { min: -2.0, max: 2.0, label: 'Wind Y' });

        // 物理参数控制
        const physFolder = this.guiFolder.addFolder({ title: 'Physics Params', expanded: false });
        
        const cloudFolder = physFolder.addFolder({ title: 'Cloud Physics' });
        cloudFolder.addBinding(this.simParams, 'cloudDecay', { min: 0.9, max: 1.0, step: 0.0001, label: 'Decay' });
        cloudFolder.addBinding(this.simParams, 'rainThreshold', { min: 0.5, max: 1.0, label: 'Rain Thres' });
        cloudFolder.addBinding(this.simParams, 'evaporation', { min: 0.0, max: 0.1, step: 0.001, label: 'Evap Rate' });
        cloudFolder.addBinding(this.simParams, 'condensation', { min: 0.0, max: 0.1, step: 0.001, label: 'Cond Rate' });
        
        const tempFolder = physFolder.addFolder({ title: 'Thermal Physics' });
        tempFolder.addBinding(this.simParams, 'tempDiffusion', { min: 0.0, max: 0.1, step: 0.001, label: 'Diffusion' });
        tempFolder.addBinding(this.simParams, 'tempInertia', { min: 0.9, max: 0.999, step: 0.001, label: 'Inertia' });
        tempFolder.addBinding(this.simParams, 'thermalWind', { min: 0.0, max: 2.0, label: 'Thermal Wind' });
        
        const waterFolder = physFolder.addFolder({ title: 'Water Physics' });
        waterFolder.addBinding(this.simParams, 'waterFlow', { min: 0.0, max: 1.0, step: 0.01, label: 'Flow Rate' });
        waterFolder.addBinding(this.simParams, 'waterEvap', { min: 0.0, max: 0.01, step: 0.0001, label: 'Evaporation' });

        // 2. 显示图层开关
        const viewFolder = this.guiFolder.addFolder({ title: 'Layers Visibility', expanded: true });
        viewFolder.addBinding(this, 'showHeight', { label: 'Show Terrain' });
        viewFolder.addBinding(this, 'showHillshade', { label: 'Show Hillshade' });
        viewFolder.addBinding(this, 'showWater', { label: 'Show Water' });
        viewFolder.addBinding(this, 'showTemp', { label: 'Show Temp' });
        viewFolder.addBinding(this, 'showCloud', { label: 'Show Cloud' });
        viewFolder.addBinding(this, 'showWind', { label: 'Show Wind' });
    }

    generateTerrain() {
        const gl = this.gl;
        gl.useProgram(this.programs.gen);
        
        // 设置生成参数
        gl.uniform1f(gl.getUniformLocation(this.programs.gen, 'u_seed'), this.genSeed);
        gl.uniform1f(gl.getUniformLocation(this.programs.gen, 'u_scale'), this.genScale);
        gl.uniform2f(gl.getUniformLocation(this.programs.gen, 'u_offset'), 0, 0); // 以后可以支持平移生成
        
        // 渲染到当前 Write FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.write);
        gl.viewport(0, 0, W, H);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(this.programs.gen, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // 交换，使生成结果进入 Read Buffer 供下一帧模拟使用
        this.swap();
        
        // 每次生成后稍微改变 Seed，方便下次生成不一样的
        this.genSeed += 1.23;
    }

    applyBrush(cx, cy, isAdditive) {
        // 更新笔刷状态
        // 我们使用一个计数器或标记来确保在当前帧（或下一帧）渲染时笔刷是激活的
        this.isBrushing = true;
        this.brushPos.x = (cx + this.brush.radius) / W; // 转换为 0-1 UV 坐标
        this.brushPos.y = (cy + this.brush.radius) / H;
        this.brushMode = isAdditive ? 1.0 : -1.0;
        
        // 这一步只是为了触发渲染循环，实际不做 CPU 计算
        return true; 
    }

    render() {
        // 1. 物理模拟 Pass (Ping-Pong)
        // 读: this.textures.read -> 写: this.fbos.write
        const gl = this.gl;
        gl.useProgram(this.programs.sim);

        // 绑定输入纹理
        for(let i=0; i<this.TEXTURE_COUNT; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.read[i]);
            gl.uniform1i(gl.getUniformLocation(this.programs.sim, `u_tex${i}`), i);
        }

        // 绑定笔刷 Uniforms
        // 注意：Web中的Y轴通常是反的，或者 texture 坐标系差异，可能需要调整 u_brushPos.y
        gl.uniform2f(gl.getUniformLocation(this.programs.sim, 'u_brushPos'), this.brushPos.x, 1.0 - this.brushPos.y);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_brushRadius'), this.brush.radius / W);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_brushValue'), this.brush.value);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_brushMode'), this.brushMode);
        gl.uniform1i(gl.getUniformLocation(this.programs.sim, 'u_isBrushing'), this.isBrushing ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_brushDisturbance'), this.brush.disturbance);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_time'), performance.now() / 1000.0);
        
        gl.uniform1i(gl.getUniformLocation(this.programs.sim, 'u_useTargetMode'), this.useTargetMode ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_targetValue'), this.targetValue);
        
        // 传递全局风速
        gl.uniform2f(gl.getUniformLocation(this.programs.sim, 'u_globalWind'), this.globalWind.x, this.globalWind.y);
        
        // 传递物理模拟参数
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_cloudDecay'), this.simParams.cloudDecay);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_rainThreshold'), this.simParams.rainThreshold);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_evaporation'), this.simParams.evaporation);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_condensation'), this.simParams.condensation);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_tempDiffusion'), this.simParams.tempDiffusion);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_tempInertia'), this.simParams.tempInertia);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_thermalWind'), this.simParams.thermalWind);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_waterFlow'), this.simParams.waterFlow);
        gl.uniform1f(gl.getUniformLocation(this.programs.sim, 'u_waterEvap'), this.simParams.waterEvap);
        
        // 将当前的 viewMode 作为目标层传递给 Sim Shader (0=Height, 1=Temp)
        gl.uniform1i(gl.getUniformLocation(this.programs.sim, 'u_targetLayer'), this.brushTarget);

        // 渲染到 MRT FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.write);
        gl.viewport(0, 0, W, H);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(this.programs.sim, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // 交换读写
        this.swap();
        
        // 重置笔刷状态
        // 关键修改：我们不再简单地置为 false，而是依赖外部（applyBrush）的持续调用
        // 但为了防止笔刷“卡”在开启状态，我们需要一种机制。
        // 由于 TerrainEditor 使用 setInterval(20ms) 调用 applyBrush，而 render 是 60fps (16ms)。
        // 为了安全起见，我们可以让 isBrushing 在 render 后失效，但在 applyBrush 中重新激活。
        // 只要 setInterval 在跑，isBrushing 就会不断被置为 true。
        this.isBrushing = false;

        // 2. 显示 Pass
        // 读: this.textures.read (新的结果) -> 写: Screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.useProgram(this.programs.display);

        for(let i=0; i<this.TEXTURE_COUNT; i++) {
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.read[i]);
            gl.uniform1i(gl.getUniformLocation(this.programs.display, `u_tex${i}`), i);
        }
        
        gl.uniform1i(gl.getUniformLocation(this.programs.display, 'u_showHeight'), this.showHeight ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.programs.display, 'u_showTemp'), this.showTemp ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.programs.display, 'u_showCloud'), this.showCloud ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.programs.display, 'u_showWind'), this.showWind ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.programs.display, 'u_showHillshade'), this.showHillshade ? 1 : 0);
        gl.uniform1i(gl.getUniformLocation(this.programs.display, 'u_showWater'), this.showWater ? 1 : 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    swap() {
        let temp = this.textures.read;
        this.textures.read = this.textures.write;
        this.textures.write = temp;

        let tempFbo = this.fbos.read;
        this.fbos.read = this.fbos.write;
        this.fbos.write = tempFbo;
    }
}
