import { createCanvas } from './utils.js';
import { createProgram, createTexture, createMRTFramebuffer, FULLSCREEN_QUAD_VS } from './GLUtils.js';
import { W, H } from './config.js';

export class Layer {
    constructor(name) {
        this.name = name;
        this.alpha = 1.0;
        
        // WebGL 上下文和资源
        this.gl = null;
        this.programs = {};
        
        // Ping-Pong 纹理机制 (用于迭代计算)
        this.textures = {
            read: null,  // 当前读取的纹理 (上一帧状态)
            write: null  // 当前写入的纹理 (下一帧状态)
        };
        this.fbos = {
            read: null,
            write: null
        };
    }

    initGpu() {
        this.canvas = createCanvas();
        // 获取 WebGL 2 上下文
        this.gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false });
        if (!this.gl) {
            console.error('WebGL 2 not supported');
            return;
        }

        // 启用浮点纹理扩展
        this.gl.getExtension('EXT_color_buffer_float');

        // 创建全屏四边形缓冲区
        this.quadBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]), this.gl.STATIC_DRAW);
    }

    // 交换读写纹理 (Ping-Pong)
    swap() {
        let temp = this.textures.read;
        this.textures.read = this.textures.write;
        this.textures.write = temp;

        let tempFbo = this.fbos.read;
        this.fbos.read = this.fbos.write;
        this.fbos.write = tempFbo;
    }

    // 运行一个着色器程序进行计算
    runProgram(program, uniforms = {}) {
        const gl = this.gl;
        gl.useProgram(program);

        // 绑定顶点数据
        const positionLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        // 绑定默认输入纹理 (u_texture) 到单元 0
        const texLoc = gl.getUniformLocation(program, 'u_texture');
        if (texLoc) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.read);
            gl.uniform1i(texLoc, 0);
        }

        // 设置其他 Uniforms
        for (let name in uniforms) {
            const loc = gl.getUniformLocation(program, name);
            if (!loc) continue;
            
            const val = uniforms[name];
            if (typeof val === 'number') {
                gl.uniform1f(loc, val);
            } else if (Array.isArray(val)) {
                 if (val.length === 2) gl.uniform2fv(loc, val);
                 else if (val.length === 3) gl.uniform3fv(loc, val);
                 else if (val.length === 4) gl.uniform4fv(loc, val);
            }
        }

        // 绑定输出 Framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbos.write);
        gl.viewport(0, 0, W, H);

        // 绘制
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // 渲染到屏幕 (canvas)
    renderToScreen(program, uniforms = {}) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // 绑定到默认画布
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        
        // ... 设置 uniform 和绘制 (类似 runProgram，但输出是 null)
        gl.useProgram(program);

        const positionLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(positionLoc);
        gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

        const texLoc = gl.getUniformLocation(program, 'u_texture');
        if (texLoc) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.textures.read);
            gl.uniform1i(texLoc, 0);
        }

        for (let name in uniforms) {
            const loc = gl.getUniformLocation(program, name);
            if (loc) gl.uniform1f(loc, uniforms[name]);
        }

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    render() { }
    
    setupGUI(gui) {
        this.guiFolder = gui.addFolder({ title: this.name, expanded: true });
    }
    
    disposeGUI() {
        this.guiFolder.dispose();
    }
}
