import { createEditor } from './editor.js';
import { checkGLError } from './GLUtils.js';
import { W, H } from './config.js';

// 全局调试工具
window.GenesisDebug = {
    checkGL() {
        if (window.editor?.worldLayer) {
            checkGLError(window.editor.worldLayer.gl, 'Manual check');
        }
    },
    
    getInfo() {
        if (!window.editor) {
            console.log('Editor not initialized');
            return;
        }
        
        const layer = window.editor.worldLayer;
        const gl = layer.gl;
        
        const info = {
            renderer: gl.getParameter(gl.RENDERER),
            vendor: gl.getParameter(gl.VENDOR),
            version: gl.getParameter(gl.VERSION),
            shaderVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
            maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            maxDrawBuffers: gl.getParameter(gl.MAX_DRAW_BUFFERS),
            currentFPS: window.editor.currentFPS,
            targetFPS: window.editor.targetFPS
        };
        
        console.table(info);
        return info;
    },
    
    readTexture(textureIndex = 0, channel = 'r') {
        const layer = window.editor.worldLayer;
        const gl = layer.gl;
        const texture = layer.textures.read[textureIndex];
        
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        
        const pixels = new Float32Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, pixels);
        gl.deleteFramebuffer(fbo);
        
        const channelIndex = { r: 0, g: 1, b: 2, a: 3 }[channel] || 0;
        const data = Array.from({ length: W * H }, (_, i) => pixels[i * 4 + channelIndex]);
        
        console.log(`Texture ${textureIndex} channel ${channel}:`, {
            min: Math.min(...data),
            max: Math.max(...data),
            avg: data.reduce((a, b) => a + b, 0) / data.length,
            sample: data.slice(0, 10)
        });
        
        return data;
    },
    
    toggleDebug() {
        const current = localStorage.getItem('genesis_debug') === 'true';
        localStorage.setItem('genesis_debug', !current);
        console.log('Debug mode:', !current, '- Refresh page to apply');
    }
};

window.onload = () => {
    window.editor = createEditor();
    
    console.log('%cProject GENESIS', 'color: #0f0; font-size: 16px; font-weight: bold;');
    console.log('Debug: GenesisDebug.getInfo() | GenesisDebug.checkGL() | GenesisDebug.readTexture()');
    console.log('Access: window.editor');
}
