/**
 * Render Pipeline System
 * 提供声明式的渲染 pass 管理
 */

import { W, H } from './config.js';
import { drawQuad } from './uniforms.js';

/**
 * 渲染 Pass 基类
 */
export class RenderPass {
    /**
     * @param {string} name - Pass 名称（用于调试）
     * @param {Object} config - Pass 配置
     * @param {WebGLProgram} config.program - Shader 程序
     * @param {Function} config.setUniforms - 设置 uniform 的函数 (gl, program, context) => void
     * @param {string} config.target - 渲染目标: 'pingpong' | 'screen'
     * @param {boolean} [config.enabled=true] - 是否启用
     */
    constructor(name, config) {
        this.name = name;
        this.program = config.program;
        this.setUniforms = config.setUniforms;
        this.target = config.target || 'pingpong';
        this.enabled = config.enabled !== false;
    }
}

/**
 * 模拟 Pass - 输出到 pingpong buffer，自动 swap
 */
export class SimPass extends RenderPass {
    /**
     * @param {string} name - Pass 名称
     * @param {Object} config - Pass 配置
     * @param {number} config.passIndex - 模拟 pass 索引 (u_simPass)
     * @param {boolean} [config.applyBrush=false] - 是否在此 pass 应用笔刷
     */
    constructor(name, config) {
        super(name, { ...config, target: 'pingpong' });
        this.passIndex = config.passIndex;
        this.applyBrush = config.applyBrush || false;
    }
}

/**
 * 显示 Pass - 输出到屏幕
 */
export class DisplayPass extends RenderPass {
    constructor(name, config) {
        super(name, { ...config, target: 'screen' });
    }
}

/**
 * 渲染管线
 * 管理和执行多个渲染 pass
 */
export class RenderPipeline {
    /**
     * @param {WebGL2RenderingContext} gl - WebGL 上下文
     * @param {Object} resources - 共享资源
     * @param {WebGLBuffer} resources.quadBuffer - 全屏四边形顶点缓冲
     * @param {Object} resources.textures - 纹理对象 { read, write }
     * @param {Object} resources.fbos - 帧缓冲对象 { read, write }
     * @param {HTMLCanvasElement} resources.canvas - 画布元素
     */
    constructor(gl, resources) {
        this.gl = gl;
        this.resources = resources;
        this.passes = [];
        this.context = {}; // 每帧共享的上下文数据
    }
    
    /**
     * 添加渲染 pass
     * @param {RenderPass} pass - 渲染 pass
     * @returns {RenderPipeline} this (链式调用)
     */
    addPass(pass) {
        this.passes.push(pass);
        return this;
    }
    
    /**
     * 批量添加多个 pass
     * @param {RenderPass[]} passes - 渲染 pass 数组
     * @returns {RenderPipeline} this
     */
    addPasses(passes) {
        this.passes.push(...passes);
        return this;
    }
    
    /**
     * 根据名称获取 pass
     * @param {string} name - Pass 名称
     * @returns {RenderPass|undefined}
     */
    getPass(name) {
        return this.passes.find(p => p.name === name);
    }
    
    /**
     * 启用/禁用指定 pass
     * @param {string} name - Pass 名称
     * @param {boolean} enabled - 是否启用
     */
    setPassEnabled(name, enabled) {
        const pass = this.getPass(name);
        if (pass) {
            pass.enabled = enabled;
        }
    }
    
    /**
     * 交换 pingpong 缓冲区
     */
    swap() {
        const { textures, fbos } = this.resources;
        
        let temp = textures.read;
        textures.read = textures.write;
        textures.write = temp;
        
        temp = fbos.read;
        fbos.read = fbos.write;
        fbos.write = temp;
    }
    
    /**
     * 执行单个 pass
     * @param {RenderPass} pass - 要执行的 pass
     */
    executePass(pass) {
        const { gl, resources, context } = this;
        const { quadBuffer, fbos, canvas } = resources;
        
        // 使用程序
        gl.useProgram(pass.program);
        
        // 设置 uniforms
        if (pass.setUniforms) {
            pass.setUniforms(gl, pass.program, context);
        }
        
        // 绑定渲染目标
        if (pass.target === 'screen') {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
        } else {
            // pingpong
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbos.write);
            gl.viewport(0, 0, W, H);
        }
        
        // 绘制
        drawQuad(gl, pass.program, quadBuffer);
        
        // 如果是 pingpong 目标，交换缓冲区
        if (pass.target === 'pingpong') {
            this.swap();
        }
    }
    
    /**
     * 执行整个管线
     * @param {Object} frameContext - 当前帧的上下文数据
     */
    execute(frameContext) {
        // 更新上下文
        this.context = { ...frameContext };
        
        // 执行所有启用的 pass
        for (const pass of this.passes) {
            if (!pass.enabled) continue;
            
            // 对于 SimPass，更新 passIndex 和 applyBrush
            if (pass instanceof SimPass) {
                this.context.simPass = pass.passIndex;
                this.context.isBrushing = pass.applyBrush ? frameContext.isBrushing : false;
            }
            
            this.executePass(pass);
        }
    }
    
    /**
     * 清空所有 pass
     */
    clear() {
        this.passes = [];
    }
}

/**
 * 创建标准的世界模拟管线
 * @param {WebGL2RenderingContext} gl - WebGL 上下文
 * @param {Object} resources - 共享资源
 * @param {Object} programs - Shader 程序 { sim, display }
 * @param {Function} setSimUniforms - 模拟 uniform 设置函数
 * @param {Function} setDisplayUniforms - 显示 uniform 设置函数
 * @returns {RenderPipeline}
 */
export function createWorldPipeline(gl, resources, programs, setSimUniforms, setDisplayUniforms) {
    const pipeline = new RenderPipeline(gl, resources);
    
    // Pass 0: Velocity Integration (水模拟第一步 - 应用笔刷)
    pipeline.addPass(new SimPass('velocity', {
        program: programs.sim,
        passIndex: 0,
        applyBrush: true,
        setUniforms: (gl, prog, ctx) => setSimUniforms(gl, prog, {
            ...ctx,
            simPass: 0,
            isBrushing: ctx.isBrushing
        })
    }));
    
    // Pass 1: Height Integration (水模拟第二步)
    pipeline.addPass(new SimPass('height', {
        program: programs.sim,
        passIndex: 1,
        applyBrush: false,
        setUniforms: (gl, prog, ctx) => setSimUniforms(gl, prog, {
            ...ctx,
            simPass: 1,
            isBrushing: false
        })
    }));
    
    // Pass 2: Erosion (侵蚀 - 目前禁用)
    pipeline.addPass(new SimPass('erosion', {
        program: programs.sim,
        passIndex: 2,
        applyBrush: false,
        setUniforms: (gl, prog, ctx) => setSimUniforms(gl, prog, {
            ...ctx,
            simPass: 2,
            isBrushing: false
        })
    }));
    
    // Pass 3: Atmosphere (大气模拟)
    pipeline.addPass(new SimPass('atmosphere', {
        program: programs.sim,
        passIndex: 3,
        applyBrush: false,
        setUniforms: (gl, prog, ctx) => setSimUniforms(gl, prog, {
            ...ctx,
            simPass: 3,
            isBrushing: false
        })
    }));
    
    // Display Pass (最终显示)
    pipeline.addPass(new DisplayPass('display', {
        program: programs.display,
        setUniforms: (gl, prog, ctx) => setDisplayUniforms(gl, prog, ctx)
    }));
    
    return pipeline;
}
