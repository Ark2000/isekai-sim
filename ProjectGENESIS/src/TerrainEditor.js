import { Pane } from 'https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.min.js';
import { CANVAS_W, CANVAS_H, CELL_SIZE } from './config.js';
import { createCanvas } from './utils.js';
import { WorldLayer } from './WorldLayer.js';

export class TerrainEditor {
    constructor() {
        this.canvas = document.getElementById('terrainCanvas');
        this.layersContainer = document.getElementById('layers');
        this.canvas.width = CANVAS_W;
        this.canvas.height = CANVAS_H;
        this.gui = new Pane();
        this.setupLayers();
        this.brushCanvas = createCanvas();
        
        // Viewport state
        this.scale = 1.0;
        this.panX = (window.innerWidth - CANVAS_W) / 2;
        this.panY = (window.innerHeight - CANVAS_H) / 2;
        this.isPanning = false;
        this.isSpacePressed = false;
        this.updateTransform();

        this.setupEventListeners();
        
        // Start simulation loop
        this.startLoop();
    }
    
    startLoop() {
        const loop = () => {
            // 在每一帧渲染前，检查是否需要应用笔刷
            if (this.isDrawing) {
                const getGrid = (x) => Math.floor(x / CELL_SIZE);
                const centerX = getGrid(this.mx) - this.getTopLayer().brush.getWidth() / 2;
                const centerY = getGrid(this.my) - this.getTopLayer().brush.getHeight() / 2;
                this.getTopLayer().applyBrush(centerX, centerY, this.isAdditive);
            }
            
            this.layers[0].render(); // Render WorldLayer
            
            // 每次渲染后重置笔刷预览，确保它跟随鼠标
            this.getTopLayer().brush.renderBrushPreview(this.brushCanvas.getContext('2d'), this.mx, this.my);
            
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    updateTransform() {
        this.layersContainer.style.transformOrigin = '0 0';
        this.layersContainer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    }

    setupLayers() {
        this.layers = [
            new WorldLayer()
        ]

        this.guiFolder = this.gui.addFolder({ title: 'Terrain Editor' });
        // Only one layer now
        this.layers[0].setupGUI(this.guiFolder);
    }

    getTopLayer() {
        for (let i = this.layers.length - 1; i >= 0; i--) {
            if (this.layers[i].alpha > 0.01) {
                return this.layers[i];
            }
        }
        return this.layers[0];
    }

    setupEventListeners() {
        this.mx = 0;
        this.my = 0;
        this.isDrawing = false;
        this.isAdditive = true;
        let lastMouseX = 0, lastMouseY = 0;

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                this.isSpacePressed = true;
                this.canvas.style.cursor = 'grab';
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                this.canvas.style.cursor = 'default';
                if (this.isPanning) {
                    this.isPanning = false;
                }
            }
        });

        window.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSensitivity = 0.001;
            
            // 使用指数缩放，这样无论当前缩放比例是多少，缩放感觉都是一致的
            const zoomFactor = Math.exp(-e.deltaY * zoomSensitivity);
            
            const oldScale = this.scale;
            let newScale = oldScale * zoomFactor;
            
            // 限制缩放范围
            newScale = Math.max(0.1, Math.min(10, newScale));

            // Calculate mouse position relative to the container (before scaling)
            // mouseX = panX + containerX * scale
            // containerX = (mouseX - panX) / scale
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            // Adjust pan to keep mouse pointing at the same coordinate
            this.panX = mouseX - (mouseX - this.panX) * (newScale / oldScale);
            this.panY = mouseY - (mouseY - this.panY) * (newScale / oldScale);
            this.scale = newScale;
            
            this.updateTransform();
            
            // Update brush preview
            const rect = this.canvas.getBoundingClientRect();
            mx = (e.clientX - rect.left) / this.scale;
            my = (e.clientY - rect.top) / this.scale;
            renderBrushPreview();
        }, { passive: false });

        this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });
        
        window.addEventListener('mousedown', (e) => {
            // Check if we are interacting with GUI
            if (e.target.closest('.tp-dfwv')) return;

            if (e.button === 1 || (e.button === 0 && this.isSpacePressed)) {
                this.isPanning = true;
                this.canvas.style.cursor = 'grabbing';
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                return;
            }

            // Only allow drawing on canvas
            if (e.target !== this.canvas) return;

            this.isDrawing = true;
            this.isAdditive = e.button !== 2;
            this.getTopLayer().brush.updateDrawData();
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                const dx = e.clientX - lastMouseX;
                const dy = e.clientY - lastMouseY;
                this.panX += dx;
                this.panY += dy;
                this.updateTransform();
                lastMouseX = e.clientX;
                lastMouseY = e.clientY;
                return;
            }

            // Update mouse coordinates for both drawing and preview
            const rect = this.canvas.getBoundingClientRect();
            this.mx = (e.clientX - rect.left) / this.scale;
            this.my = (e.clientY - rect.top) / this.scale;
        });

        window.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = this.isSpacePressed ? 'grab' : 'default';
            }
            this.isDrawing = false;
        });
    }
}

