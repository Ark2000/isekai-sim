import { CELL_SIZE, CANVAS_W, CANVAS_H } from './config.js';

export function createBrush() {
    const brush = {
        value: 0.5,
        radius: 16,
        disturbance: 0.8
    };
    
    function renderPreview(ctx, x, y) {
        const centerX = Math.floor(x / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;
        const centerY = Math.floor(y / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, brush.radius * CELL_SIZE, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, brush.radius * CELL_SIZE - 1, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    function setupGUI(guiFolder) {
        const folder = guiFolder.addFolder({ title: 'Brush', expanded: true });
        folder.addBinding(brush, 'value', { 
            min: 0, max: 1, step: 0.01, label: 'Value',
            hint: 'Strength or target value of the brush effect.'
        });
        folder.addBinding(brush, 'radius', { 
            min: 1, max: 32, step: 1, label: 'Radius',
            hint: 'Size of the brush area.'
        });
        folder.addBinding(brush, 'disturbance', { 
            min: 0, max: 1, step: 0.01, label: 'Random',
            hint: 'Randomness/noise applied to the brush stroke.'
        });
    }
    
    return {
        get value() { return brush.value; },
        set value(v) { brush.value = v; },
        get radius() { return brush.radius; },
        set radius(v) { brush.radius = v; },
        get disturbance() { return brush.disturbance; },
        set disturbance(v) { brush.disturbance = v; },
        getWidth: () => brush.radius * 2,
        getHeight: () => brush.radius * 2,
        renderPreview,
        setupGUI
    };
}

