// WebGL 2 辅助工具库

// 调试模式：从 URL 参数或 localStorage 读取
const DEBUG_MODE = new URLSearchParams(window.location.search).get('debug') === '1' 
    || localStorage.getItem('genesis_debug') === 'true';

/**
 * 检查 WebGL 错误并输出
 * @param {WebGL2RenderingContext} gl 
 * @param {string} label 错误标签
 * @returns {boolean} 是否有错误
 */
export function checkGLError(gl, label = '') {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
        const errorNames = {
            1280: 'INVALID_ENUM',
            1281: 'INVALID_VALUE',
            1282: 'INVALID_OPERATION',
            1285: 'OUT_OF_MEMORY',
            1286: 'INVALID_FRAMEBUFFER_OPERATION'
        };
        console.error(`[WebGL Error${label ? ' @ ' + label : ''}]:`, errorNames[error] || error);
        return true;
    }
    return false;
}

/**
 * 创建并编译着色器
 * @param {WebGL2RenderingContext} gl 
 * @param {number} type gl.VERTEX_SHADER | gl.FRAGMENT_SHADER
 * @param {string} source GLSL 源码
 * @param {string} name Shader 名称（用于调试）
 */
export function createShader(gl, type, source, name = '') {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (DEBUG_MODE) {
        checkGLError(gl, `createShader(${name})`);
    }
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const shaderType = type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment';
        const infoLog = gl.getShaderInfoLog(shader);
        console.error(`[${shaderType} Shader${name ? ' ' + name : ''}] Compile error:`, infoLog);
        
        // 输出源码片段（错误行附近）
        const lines = source.split('\n');
        const errorMatch = infoLog.match(/ERROR:\s*(\d+):(\d+):/);
        if (errorMatch) {
            const errorLine = parseInt(errorMatch[1]) - 1;
            const start = Math.max(0, errorLine - 3);
            const end = Math.min(lines.length, errorLine + 4);
            console.error('Source around error:');
            for (let i = start; i < end; i++) {
                const marker = i === errorLine ? '>>>' : '   ';
                console.error(`${marker} ${i + 1}: ${lines[i]}`);
            }
        }
        
        gl.deleteShader(shader);
        return null;
    }
    
    if (DEBUG_MODE) {
        console.log(`[Shader] Compiled successfully: ${name || (type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment')}`);
    }
    
    return shader;
}

/**
 * 创建 WebGL 程序
 * @param {WebGL2RenderingContext} gl 
 * @param {string} vsSource 顶点着色器源码
 * @param {string} fsSource 片元着色器源码
 * @param {string} name 程序名称（用于调试）
 */
export function createProgram(gl, vsSource, fsSource, name = '') {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource, name + '_VS');
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource, name + '_FS');
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (DEBUG_MODE) {
        checkGLError(gl, `createProgram(${name})`);
    }

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(`[Program${name ? ' ' + name : ''}] Link error:`, gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    if (DEBUG_MODE) {
        console.log(`[Program] Linked successfully: ${name || 'Unnamed'}`);
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
 * @param {string} name 帧缓冲区名称（用于调试）
 */
export function createMRTFramebuffer(gl, textures, name = '') {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    
    const drawBuffers = [];
    for (let i = 0; i < textures.length; i++) {
        const attachment = gl.COLOR_ATTACHMENT0 + i;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, textures[i], 0);
        drawBuffers.push(attachment);
        
        if (DEBUG_MODE) {
            checkGLError(gl, `createMRTFramebuffer(${name}) - attach texture ${i}`);
        }
    }
    
    // 告诉 WebGL 我们要同时写入这些 buffers
    gl.drawBuffers(drawBuffers);
    
    if (DEBUG_MODE) {
        checkGLError(gl, `createMRTFramebuffer(${name}) - drawBuffers`);
    }
    
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        const statusNames = {
            36054: 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT',
            36055: 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT',
            36057: 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS',
            36061: 'FRAMEBUFFER_UNSUPPORTED'
        };
        console.error(`[Framebuffer${name ? ' ' + name : ''}] Not complete:`, statusNames[status] || status);
    } else if (DEBUG_MODE) {
        console.log(`[Framebuffer] Created successfully: ${name || 'Unnamed'} (${textures.length} attachments)`);
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
