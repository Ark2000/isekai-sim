import { vertexShaderSource, fragmentShaderSource } from './shaders.js';

export class PixelEditor {
    constructor(canvas, width = 32, height = 32) {
        this.canvas = canvas;
        this.width = width;
        this.height = height;
        this.gl = canvas.getContext('webgl');
        
        if (!this.gl) {
            alert('WebGL not supported');
            return;
        }

        // Enable Standard Derivatives extension for fwidth()
        const ext = this.gl.getExtension('OES_standard_derivatives');
        if (!ext) {
            console.warn('OES_standard_derivatives not supported. Grid lines might look aliasy.');
        }

        // Editor State
        this.pixels = new Uint8Array(width * height * 4);
        this.zoom = 10.0;
        this.pan = { x: 0, y: 0 };
        this.brushColor = [255, 0, 0, 255]; // RGBA
        this.isDrawing = false;
        this.gridEnabled = true;

        this.initGL();
        this.clearCanvas([255, 255, 255, 255]); // Start with white
        this.render();
        
        this.setupInteraction();
    }

    initGL() {
        const gl = this.gl;

        // Create Shaders
        const vertexShader = this.createShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        gl.useProgram(this.program);

        // Create Buffer (Full screen quad)
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1, -1,  1,
            -1,  1,  1, -1,  1,  1,
        ]), gl.STATIC_DRAW);

        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 1,  1, 1,  0, 0,
            0, 0,  1, 1,  1, 0,
        ]), gl.STATIC_DRAW);

        // Bind Attributes
        const positionLocation = gl.getAttribLocation(this.program, "a_position");
        const texCoordLocation = gl.getAttribLocation(this.program, "a_texCoord");

        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // Create Texture
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Critical for pixel art: NEAREST filtering
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        
        // Flip Y so that the first pixel in the array is at the top-left of the texture
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    clearCanvas(color) {
        for (let i = 0; i < this.pixels.length; i += 4) {
            this.pixels[i] = color[0];
            this.pixels[i + 1] = color[1];
            this.pixels[i + 2] = color[2];
            this.pixels[i + 3] = color[3];
        }
        this.updateTexture();
    }

    updateTexture() {
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
        this.requestRender();
    }

    // Set a single pixel (CPU side) and queue update
    setPixel(x, y, color) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        
        const idx = (y * this.width + x) * 4;
        this.pixels[idx] = color[0];
        this.pixels[idx + 1] = color[1];
        this.pixels[idx + 2] = color[2];
        this.pixels[idx + 3] = color[3];
        
        this.updateTexture();
    }

    // Convert Screen coordinates to Texture coordinates
    getTextureCoordinates(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (clientX - rect.left) / rect.width; // 0 to 1
        const y = 1.0 - (clientY - rect.top) / rect.height; // 1 to 0 (flipped)

        // Inverse the transformations done in Fragment Shader
        // uv = (st - 0.5) / zoom + 0.5 - pan
        
        // We want to find 'uv' given 'st' (x, y)
        // Note: Shader uses v_texCoord which is 0..1.
        
        const texX = (x - 0.5) / this.zoom + 0.5 - this.pan.x;
        const texY = (y - 0.5) / this.zoom + 0.5 - this.pan.y;

        // texY is in WebGL coordinates (0 at bottom, 1 at top)
        // Since we used UNPACK_FLIP_Y_WEBGL, texture coordinate (0, 1) corresponds to array index 0 (top row)
        // So we need to invert Y to get the array row index
        
        return {
            x: Math.floor(texX * this.width),
            y: Math.floor((1.0 - texY) * this.height) 
        };
    }

    setupInteraction() {
        let lastX = 0;
        let lastY = 0;
        let isPanning = false;

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || e.altKey) { // Middle click or Alt+Click to Pan
                isPanning = true;
                lastX = e.clientX;
                lastY = e.clientY;
            } else {
                this.isDrawing = true;
                this.handleDraw(e);
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDrawing = false;
            isPanning = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (isPanning) {
                const dx = (e.clientX - lastX) / this.canvas.height; // Normalize by height roughly
                const dy = -(e.clientY - lastY) / this.canvas.height;
                
                this.pan.x += dx / this.zoom; // Adjust pan speed by zoom
                this.pan.y += dy / this.zoom;
                
                lastX = e.clientX;
                lastY = e.clientY;
                this.requestRender();
            } else if (this.isDrawing) {
                this.handleDraw(e);
            }
        });

        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.001;
            this.zoom += e.deltaY * -zoomSpeed * this.zoom;
            this.zoom = Math.max(0.1, Math.min(100.0, this.zoom));
            this.requestRender();
        }, { passive: false });
    }

    handleDraw(e) {
        const coords = this.getTextureCoordinates(e.clientX, e.clientY);
        this.setPixel(coords.x, coords.y, this.brushColor);
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.requestRender();
    }

    requestRender() {
        requestAnimationFrame(() => this.render());
    }

    render() {
        const gl = this.gl;
        
        // Set Uniforms
        const resolutionLocation = gl.getUniformLocation(this.program, "u_resolution");
        const textureSizeLocation = gl.getUniformLocation(this.program, "u_textureSize");
        const zoomLocation = gl.getUniformLocation(this.program, "u_zoom");
        const panLocation = gl.getUniformLocation(this.program, "u_pan");
        const gridLocation = gl.getUniformLocation(this.program, "u_gridEnabled");

        gl.uniform2f(resolutionLocation, this.canvas.width, this.canvas.height);
        gl.uniform2f(textureSizeLocation, this.width, this.height);
        gl.uniform1f(zoomLocation, this.zoom);
        gl.uniform2f(panLocation, this.pan.x, this.pan.y);
        gl.uniform1f(gridLocation, this.gridEnabled ? 1.0 : 0.0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

