export function createRenderLoop(worldLayer, input, brushCanvas, fps, gui) {
    let lastTime = performance.now();
    let lastGuiUpdateTime = 0;
    const guiUpdateInterval = 500; // GUI 监控读数每 500ms 刷新一次，避免跳动过快
    
    function loop(currentTime) {
        const deltaTime = currentTime - lastTime;
        const targetFrameTime = 1000 / fps.targetFPS;
        
        // 笔刷预览保持高频同步
        worldLayer.brush.renderPreview(
            brushCanvas.getContext('2d'),
            input.mx,
            input.my
        );
        
        // 物理模拟受帧率限制
        if (deltaTime >= targetFrameTime) {
            lastTime = currentTime - (deltaTime % targetFrameTime);
            
            input.applyBrush();
            worldLayer.render();
            fps.update(deltaTime);
            
            // 节流更新 GUI 显示（如 FPS 等监控数据）
            if (gui && currentTime - lastGuiUpdateTime > guiUpdateInterval) {
                gui.refresh();
                lastGuiUpdateTime = currentTime;
            }
        }
        
        requestAnimationFrame(loop);
    }
    
    return { start: () => requestAnimationFrame(loop) };
}
