import { Pane } from './gui.js';
import { CANVAS_W, CANVAS_H } from './config.js';
import { createCanvas } from './utils.js';
import { createWorldLayer } from './WorldLayer.js';
import { createViewport } from './viewport.js';
import { createFPSDisplay } from './fps.js';
import { createInputHandler } from './input.js';
import { createRenderLoop } from './render.js';

export async function createEditor() {
    const canvas = document.getElementById('terrainCanvas');
    const container = document.getElementById('layers');
    const gui = new Pane();
    const brushCanvas = createCanvas();
    
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    
    const viewport = createViewport(container);
    const fps = createFPSDisplay();
    const worldLayer = createWorldLayer();
    
    // 等待 WorldLayer 初始化完成（shader 加载等）
    await worldLayer.ready;
    
    const input = createInputHandler(canvas, viewport, worldLayer);
    const renderLoop = createRenderLoop(worldLayer, input, brushCanvas, fps, gui);
    
    // GUI 设置
    const guiFolder = gui.addFolder({ title: 'Terrain Editor' });
    
    const viewportFolder = guiFolder.addFolder({ title: 'Viewport', expanded: false });
    viewportFolder.addButton({ title: 'Reset Viewport' }).on('click', () => viewport.reset());

    const perfFolder = guiFolder.addFolder({ title: 'Performance', expanded: true });
    
    // 监控数据
    perfFolder.addBinding(fps, 'currentFPS', { readonly: true, label: 'Current FPS' });
    perfFolder.addBinding(fps, 'frameTime', { readonly: true, label: 'Frame Time', suffix: 'ms' });
    
    // 控制参数
    perfFolder.addBinding(fps, 'targetFPS', { min: 10, max: 240, step: 10, label: 'Target FPS' });
    
    worldLayer.setupGUI(guiFolder);
    
    // 启动渲染循环
    renderLoop.start();
    
    return {
        get worldLayer() { return worldLayer; },
        get currentFPS() { return fps.currentFPS; },
        get targetFPS() { return fps.targetFPS; }
    };
}
