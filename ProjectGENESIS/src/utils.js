import { CANVAS_W, CANVAS_H } from './config.js';

export function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.top = '0';
    canvas.style.left = '0';
    document.getElementById('layers').appendChild(canvas);
    return canvas;
}

