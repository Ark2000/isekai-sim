import { CANVAS_W, CANVAS_H } from './config.js';

export function createViewport(container) {
    let scale = 1.0;
    let panX = (window.innerWidth - CANVAS_W) / 2;
    let panY = (window.innerHeight - CANVAS_H) / 2;
    
    function updateTransform() {
        container.style.transformOrigin = '0 0';
        container.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    }
    
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
    
    return {
        get scale() { return scale; },
        get panX() { return panX; },
        get panY() { return panY; },
        zoom,
        pan,
        screenToWorld,
        updateTransform
    };
}

