import { CELL_SIZE } from './config.js';

export function createInputHandler(canvas, viewport, worldLayer) {
    let mx = 0, my = 0;
    let isDrawing = false;
    let isAdditive = true;
    let isPanning = false;
    let isSpacePressed = false;
    let lastMouseX = 0, lastMouseY = 0;
    
    function getGrid(x) {
        return Math.floor(x / CELL_SIZE);
    }
    
    function handleMouseDown(e) {
        if (e.target.closest('.tp-dfwv')) return;
        
        if (e.button === 1 || (e.button === 0 && isSpacePressed)) {
            isPanning = true;
            canvas.style.cursor = 'grabbing';
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
        }
        
        if (e.target !== canvas) return;
        
        isDrawing = true;
        isAdditive = e.button !== 2;
    }
    
    function handleMouseMove(e) {
        if (isPanning) {
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            viewport.pan(dx, dy);
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            return;
        }
        
        const rect = canvas.getBoundingClientRect();
        const world = viewport.screenToWorld(e.clientX, e.clientY, rect);
        mx = world.x;
        my = world.y;
    }
    
    function handleMouseUp() {
        if (isPanning) {
            isPanning = false;
            canvas.style.cursor = isSpacePressed ? 'grab' : 'default';
        }
        isDrawing = false;
    }
    
    function handleWheel(e) {
        e.preventDefault();
        viewport.zoom(e.deltaY, e.clientX, e.clientY);
    }
    
    function handleKeyDown(e) {
        if (e.code === 'Space' && !e.repeat) {
            isSpacePressed = true;
            canvas.style.cursor = 'grab';
        }
    }
    
    function handleKeyUp(e) {
        if (e.code === 'Space') {
            isSpacePressed = false;
            canvas.style.cursor = 'default';
            if (isPanning) isPanning = false;
        }
    }
    
    // 注册事件
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    return {
        get mx() { return mx; },
        get my() { return my; },
        get isDrawing() { return isDrawing; },
        get isAdditive() { return isAdditive; },
        
        applyBrush() {
            if (isDrawing) {
                const centerX = getGrid(mx) - worldLayer.brush.getWidth() / 2;
                const centerY = getGrid(my) - worldLayer.brush.getHeight() / 2;
                worldLayer.applyBrush(centerX, centerY, isAdditive);
            }
        }
    };
}

