import { CANVAS_W, CANVAS_H } from './config.js';

export function createViewport(container) {
    const STORAGE_KEY = 'genesis_viewport';
    
    // 尝试加载持久化状态
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    
    let scale = savedState?.scale ?? 1.0;
    let panX = savedState?.panX ?? (window.innerWidth - CANVAS_W) / 2;
    let panY = savedState?.panY ?? (window.innerHeight - CANVAS_H) / 2;
    
    function saveState() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ scale, panX, panY }));
    }
    
    function updateTransform() {
        container.style.transformOrigin = '0 0';
        container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        saveState();
    }
    
    // 初始化时应用一次变换
    updateTransform();
    
    function zoom(delta, mouseX, mouseY) {
        const zoomSensitivity = 0.001;
        const zoomFactor = Math.exp(-delta * zoomSensitivity);
        const oldScale = scale;
        scale = Math.max(0.1, Math.min(10, scale * zoomFactor));
        
        // 保持鼠标指向的坐标不变
        panX = mouseX - (mouseX - panX) * (scale / oldScale);
        panY = mouseY - (mouseY - panY) * (scale / oldScale);
        updateTransform();
    }
    
    function pan(dx, dy) {
        panX += dx;
        panY += dy;
        updateTransform();
    }
    
    function screenToWorld(screenX, screenY, canvasRect) {
        return {
            x: (screenX - canvasRect.left) / scale,
            y: (screenY - canvasRect.top) / scale
        };
    }
    
    function reset() {
        scale = 1.0;
        panX = (window.innerWidth - CANVAS_W) / 2;
        panY = (window.innerHeight - CANVAS_H) / 2;
        updateTransform();
    }
    
    return {
        get scale() { return scale; },
        get panX() { return panX; },
        get panY() { return panY; },
        zoom,
        pan,
        reset,
        screenToWorld,
        updateTransform
    };
}

