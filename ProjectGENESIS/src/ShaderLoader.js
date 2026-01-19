/**
 * Shader 加载器
 * 支持从 .glsl 文件加载 shader，并处理 #include 指令
 */

const shaderCache = new Map();

/**
 * 加载单个 shader 文件
 * @param {string} path - shader 文件路径
 * @returns {Promise<string>} shader 源码
 */
async function fetchShader(path) {
    if (shaderCache.has(path)) {
        return shaderCache.get(path);
    }
    
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to load shader: ${path} (${response.status})`);
    }
    
    const source = await response.text();
    shaderCache.set(path, source);
    return source;
}

/**
 * 解析并处理 #include 指令
 * 支持格式: #include "path/to/file.glsl"
 * 
 * @param {string} source - shader 源码
 * @param {string} basePath - 基础路径
 * @param {Set<string>} included - 已包含的文件集合（防止循环引用）
 * @returns {Promise<string>} 处理后的源码
 */
async function processIncludes(source, basePath, included = new Set()) {
    const includeRegex = /^[ \t]*#include\s+"([^"]+)"/gm;
    const matches = [...source.matchAll(includeRegex)];
    
    if (matches.length === 0) {
        return source;
    }
    
    let result = source;
    
    for (const match of matches) {
        const [fullMatch, includePath] = match;
        
        // 计算相对路径
        const resolvedPath = resolvePath(basePath, includePath);
        
        // 防止循环引用
        if (included.has(resolvedPath)) {
            console.warn(`[ShaderLoader] Circular include detected: ${resolvedPath}`);
            result = result.replace(fullMatch, `// [Circular include skipped: ${includePath}]`);
            continue;
        }
        
        included.add(resolvedPath);
        
        try {
            let includeSource = await fetchShader(resolvedPath);
            // 递归处理嵌套的 #include
            includeSource = await processIncludes(includeSource, getDirectory(resolvedPath), included);
            result = result.replace(fullMatch, includeSource);
        } catch (error) {
            console.error(`[ShaderLoader] Failed to include: ${includePath}`, error);
            result = result.replace(fullMatch, `// [Include failed: ${includePath}]`);
        }
    }
    
    return result;
}

/**
 * 获取目录路径
 */
function getDirectory(path) {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(0, lastSlash + 1) : './';
}

/**
 * 解析相对路径
 */
function resolvePath(basePath, relativePath) {
    // 如果是绝对路径，直接返回
    if (relativePath.startsWith('/') || relativePath.startsWith('http')) {
        return relativePath;
    }
    
    // 合并路径
    const base = getDirectory(basePath);
    const parts = (base + relativePath).split('/');
    const resolved = [];
    
    for (const part of parts) {
        if (part === '..') {
            resolved.pop();
        } else if (part !== '.' && part !== '') {
            resolved.push(part);
        }
    }
    
    return resolved.join('/');
}

/**
 * 加载 shader 文件并处理所有 #include 指令
 * 
 * @param {string} path - shader 文件路径
 * @returns {Promise<string>} 完整的 shader 源码
 * 
 * @example
 * const fragSource = await loadShader('./shaders/sim.frag');
 */
export async function loadShader(path) {
    const source = await fetchShader(path);
    return processIncludes(source, path);
}

/**
 * 批量加载多个 shader
 * 
 * @param {Object.<string, string>} shaderPaths - shader 名称到路径的映射
 * @returns {Promise<Object.<string, string>>} shader 名称到源码的映射
 * 
 * @example
 * const shaders = await loadShaders({
 *     sim: './shaders/sim.frag',
 *     display: './shaders/display.frag',
 *     gen: './shaders/gen.frag',
 *     vertex: './shaders/fullscreen.vert'
 * });
 */
export async function loadShaders(shaderPaths) {
    const entries = Object.entries(shaderPaths);
    const results = await Promise.all(
        entries.map(async ([name, path]) => {
            const source = await loadShader(path);
            return [name, source];
        })
    );
    return Object.fromEntries(results);
}

/**
 * 清除 shader 缓存
 */
export function clearShaderCache() {
    shaderCache.clear();
}
