// WebGL 2 辅助工具库

/**
 * 创建并编译着色器
 * @param {WebGL2RenderingContext} gl 
 * @param {number} type gl.VERTEX_SHADER | gl.FRAGMENT_SHADER
 * @param {string} source GLSL 源码
 */
export function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

/**
 * 创建 WebGL 程序
 * @param {WebGL2RenderingContext} gl 
 * @param {string} vsSource 顶点着色器源码
 * @param {string} fsSource 片元着色器源码
 */
export function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

/**
 * 创建一个用于 GPGPU 计算的浮点纹理
 * @param {WebGL2RenderingContext} gl 
 * @param {number} width 
 * @param {number} height 
 * @param {Float32Array|null} data 初始数据
 */
export function createTexture(gl, width, height, data = null) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    
    // 使用 RGBA32F 浮点纹理，支持负数和高精度
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); // 循环边界，方便风和云的模拟
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    
    return tex;
}

/**
 * 创建支持 MRT (多渲染目标) 的帧缓冲区
 * @param {WebGL2RenderingContext} gl 
 * @param {WebGLTexture[]} textures 绑定的纹理数组
 */
export function createMRTFramebuffer(gl, textures) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    
    const drawBuffers = [];
    for (let i = 0; i < textures.length; i++) {
        const attachment = gl.COLOR_ATTACHMENT0 + i;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, textures[i], 0);
        drawBuffers.push(attachment);
    }
    
    // 告诉 WebGL 我们要同时写入这些 buffers
    gl.drawBuffers(drawBuffers);
    
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error('Framebuffer not complete:', status);
    }
    
    return fbo;
}

// 通用的全屏四边形顶点着色器
export const FULLSCREEN_QUAD_VS = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
