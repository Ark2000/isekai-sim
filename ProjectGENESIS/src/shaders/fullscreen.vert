#version 300 es
/**
 * Fullscreen Quad Vertex Shader
 * Used for all post-processing and simulation passes
 */

in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
