// Uniform 设置辅助函数

export function setSimUniforms(gl, program, params) {
    const { brush, brushPos, brushMode, isBrushing, useTargetMode, targetValue, 
            globalWind, simParams, brushTarget, TEXTURE_COUNT, textures } = params;
    
    // 纹理
    for(let i = 0; i < TEXTURE_COUNT; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, textures.read[i]);
        gl.uniform1i(gl.getUniformLocation(program, `u_tex${i}`), i);
    }
    
    // 笔刷
    gl.uniform2f(gl.getUniformLocation(program, 'u_brushPos'), brushPos.x, 1.0 - brushPos.y);
    gl.uniform1f(gl.getUniformLocation(program, 'u_brushRadius'), brush.radius / 256); // W = 256
    gl.uniform1f(gl.getUniformLocation(program, 'u_brushValue'), brush.value);
    gl.uniform1f(gl.getUniformLocation(program, 'u_brushMode'), brushMode);
    gl.uniform1i(gl.getUniformLocation(program, 'u_isBrushing'), isBrushing ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_brushDisturbance'), brush.disturbance);
    gl.uniform1f(gl.getUniformLocation(program, 'u_time'), performance.now() / 1000.0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_useTargetMode'), useTargetMode ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_targetValue'), targetValue);
    gl.uniform1i(gl.getUniformLocation(program, 'u_targetLayer'), brushTarget);
    
    // 环境
    gl.uniform2f(gl.getUniformLocation(program, 'u_globalWind'), globalWind.x, globalWind.y);
    
    // 物理参数
    gl.uniform1f(gl.getUniformLocation(program, 'u_cloudDecay'), simParams.cloudDecay);
    gl.uniform1f(gl.getUniformLocation(program, 'u_rainThreshold'), simParams.rainThreshold);
    gl.uniform1f(gl.getUniformLocation(program, 'u_evaporation'), simParams.evaporation);
    gl.uniform1f(gl.getUniformLocation(program, 'u_condensation'), simParams.condensation);
    gl.uniform1f(gl.getUniformLocation(program, 'u_tempDiffusion'), simParams.tempDiffusion);
    gl.uniform1f(gl.getUniformLocation(program, 'u_tempInertia'), simParams.tempInertia);
    gl.uniform1f(gl.getUniformLocation(program, 'u_thermalWind'), simParams.thermalWind);
    gl.uniform1f(gl.getUniformLocation(program, 'u_waterFlow'), simParams.waterFlow);
    gl.uniform1f(gl.getUniformLocation(program, 'u_waterEvap'), simParams.waterEvap);
    gl.uniform1f(gl.getUniformLocation(program, 'u_waterFriction'), simParams.waterFriction);
    gl.uniform1f(gl.getUniformLocation(program, 'u_waterSoftening'), simParams.waterSoftening);
    gl.uniform1f(gl.getUniformLocation(program, 'u_waterSmoothing'), simParams.waterSmoothing);
    gl.uniform1f(gl.getUniformLocation(program, 'u_erosionRate'), simParams.erosionRate);
    gl.uniform1f(gl.getUniformLocation(program, 'u_depositionRate'), simParams.depositionRate);
    gl.uniform1f(gl.getUniformLocation(program, 'u_erosionStrength'), simParams.erosionStrength);
    gl.uniform1f(gl.getUniformLocation(program, 'u_talusRate'), simParams.talusRate);
    gl.uniform1f(gl.getUniformLocation(program, 'u_talusThreshold'), simParams.talusThreshold);
}

export function setDisplayUniforms(gl, program, params) {
    const { TEXTURE_COUNT, textures, showHeight, showTemp, showCloud, 
            showWind, showHillshade, showWater } = params;
    
    // 纹理
    for(let i = 0; i < TEXTURE_COUNT; i++) {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, textures.read[i]);
        gl.uniform1i(gl.getUniformLocation(program, `u_tex${i}`), i);
    }
    
    // 显示开关
    gl.uniform1i(gl.getUniformLocation(program, 'u_showHeight'), showHeight ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_showTemp'), showTemp ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_showCloud'), showCloud ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_showWind'), showWind ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_showHillshade'), showHillshade ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_showWater'), showWater ? 1 : 0);
}

export function drawQuad(gl, program, quadBuffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

