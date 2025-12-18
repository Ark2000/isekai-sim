export function createFPSDisplay() {
    const history = [];
    let currentFPS = 0;
    let targetFPS = 60;
    let lastFrameTime = 0;
    
    function update(deltaTime) {
        const fps = 1000 / deltaTime;
        history.push(fps);
        if (history.length > 60) history.shift();
        
        currentFPS = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
        lastFrameTime = deltaTime;
    }
    
    return {
        get currentFPS() { return currentFPS; },
        get targetFPS() { return targetFPS; },
        set targetFPS(v) { targetFPS = v; },
        get frameTime() { return lastFrameTime; },
        update
    };
}
