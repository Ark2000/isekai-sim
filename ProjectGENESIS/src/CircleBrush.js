/**
 * CircleBrush 类
 * 
 * 这是一个用于在图层上进行圆形绘制的画笔工具。
 * 
 * @class
 */
import { CELL_SIZE, CANVAS_W, CANVAS_H } from './config.js';

export class CircleBrush {
    constructor() {
        /** @type {number} 画笔强度 (0-1) */
        this.value = 0.5;
        
        /** @type {number} 画笔半径 (像素格子数) */
        this.radius = 16;
        
        /** @type {number} 随机扰动强度 (0-1) */
        this.disturbance = 0.8;
        
        /** @type {number[][]} 画笔的像素矩阵数据 */
        this.drawData = null;

        /** @type {{value: number, radius: number, disturbance: number} | null} 参数缓存 */
        this.paramCopy = null;

        this.updateDrawData();
    }

    /**
     * 设置 GUI 控制面板
     * @param {any} guiFolder - Tweakpane 的文件夹对象
     */
    setupGUI(guiFolder) {
        this.guiFolder = guiFolder.addFolder({ title: 'CircleBrush'});
        this.guiFolder.expanded = true;
        this.guiFolder.addBinding(this, 'value', { min: 0, max: 1, step: 0.01 , label: 'val'});
        this.guiFolder.addBinding(this, 'radius', { min: 1, max: 32, step: 1 , label: 'radius'});
        this.guiFolder.addBinding(this, 'disturbance', { min: 0, max: 1, step: 0.01 , label: 'rand'});
    }

    /**
     * 获取当前的绘制数据
     * @returns {number[][]} 二维数组，表示画笔形状和强度
     */
    getDrawData() { return this.drawData; }

    /** @returns {number} 画笔总宽度 */
    getWidth() { return this.radius * 2; }

    /** @returns {number} 画笔总高度 */
    getHeight() { return this.radius * 2; }

    /**
     * 更新绘制数据
     * 根据当前的 value, radius, disturbance 重新计算 drawData
     */
    updateDrawData() {
        // check if need to update
        if (this.paramCopy) {
            if (this.paramCopy.value == this.value && this.paramCopy.radius == this.radius && this.paramCopy.disturbance == this.disturbance) {
                return;
            }
        }

        console.log('updateDrawData');

        this.drawData = Array(this.radius * 2).fill(0).map(() => Array(this.radius * 2).fill(0));
        const radiusSquared = this.radius * this.radius;
        for (let y = 0; y < this.radius * 2; y++) {
            for (let x = 0; x < this.radius * 2; x++) {
                const distanceSquared = (x - this.radius) * (x - this.radius) + (y - this.radius) * (y - this.radius);
                let drawValue = Math.min(1, Math.max(0, 1 - distanceSquared / radiusSquared)) * this.value;
                if (drawValue == 0) continue;
                drawValue *= 0.1;
                if (this.disturbance > 0) {
                    const noise = (Math.random() - 0.5) * this.disturbance * 0.01;
                    drawValue += noise;
                    drawValue = Math.min(1, Math.max(0, drawValue));
                }
                this.drawData[y][x] = drawValue;
            }
        }

        this.paramCopy = {
            value: this.value,
            radius: this.radius,
            disturbance: this.disturbance,
        }
    }

    /**
     * 在预览画布上绘制画笔轮廓
     * @param {CanvasRenderingContext2D} ctx - 目标画布上下文
     * @param {number} x - 鼠标世界坐标 x
     * @param {number} y - 鼠标世界坐标 y
     */
    renderBrushPreview(ctx, x, y) {
        const centerX = Math.floor(x / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;
        const centerY = Math.floor(y / CELL_SIZE) * CELL_SIZE + CELL_SIZE / 2;
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        // 绘制外圈
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.radius * CELL_SIZE, 0, Math.PI * 2);
        ctx.stroke();
        // 绘制内圈
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.radius * CELL_SIZE - 1, 0, Math.PI * 2);
        ctx.stroke();
    }
}

