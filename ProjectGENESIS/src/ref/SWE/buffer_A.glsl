
// Velocity Advection

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    ivec2 tc = ivec2(fragCoord);    
    vec4 vTexC = texelFetch(iChannel0,tc,0);    

    vec2 uv = fragCoord/iResolution.xy;
    //vec2 vOffset = vTexC.xy/iResolution.xy * g_fAdvectSpeed * g_fElapsedTimeInSec / g_fGridSizeInMeter;
    float dt = -g_fAdvectSpeed * g_fElapsedTimeInSec / g_fGridSizeInMeter;
    vec2 v1 = vTexC.xy;
    vec2 v2 = textureLod(iChannel0, uv - ( 0.5 * v1 * dt ) / iResolution.xy, 0.0 ).xy;
    vec2 v3 = textureLod(iChannel0, uv - ( 0.5 * v2 * dt ) / iResolution.xy, 0.0 ).xy;
    vec2 v4 = textureLod(iChannel0, uv - ( v3 * dt ) / iResolution.xy, 0.0 ).xy;
    vec2 v = (1.0 * v1 + 2.0 * v2 + 2.0 * v3 + 1.0 * v4) / 6.0;
    
    
    vec4 vTex = textureLod(iChannel0,uv + ( v * dt ) / iResolution.xy,0.0);

    fragColor = vTexC;
}