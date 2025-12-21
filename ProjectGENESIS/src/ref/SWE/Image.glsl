const vec3 vWaterFogColor = Gamma( vec3( 0.9, 0.4, 0.3 ) ) * 16.0;
const vec3 vFoamColor = Gamma( vec3( 0.9, 0.9, 0.85 ) );
const vec3 vSkyColor = Gamma( vec3( 0.01, 0.4, 0.8 ) );
const vec3 vSunColor = Gamma( vec3( 1.0, 0.8, 0.5 ) );
const vec3 vTerrainColor0 = Gamma( vec3(1.0,0.88,0.7)*0.8 );
const vec3 vTerrainColor1 = Gamma( vec3(0.9,0.9,0.8)*0.9 );
#define vLightDir normalize( vec3( 0.0, 0.21, -1.0 ) )
const vec3 vLookDir = vec3( 0.0, 0.0, -1.0 );

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord/iResolution.xy;
    
    vec4 vTexC = textureLod(iChannel0,uv,0.0);
    
    vec4 vTexL = textureLodOffset(iChannel0,uv, 0.0, ivec2(-1,0));
    vec4 vTexR = textureLodOffset(iChannel0,uv, 0.0, ivec2(1,0));
    vec4 vTexT = textureLodOffset(iChannel0,uv, 0.0, ivec2(0,-1));
    vec4 vTexB = textureLodOffset(iChannel0,uv, 0.0, ivec2(0,1));
    
    float hC = vTexC.z+vTexC.w;
	float hL = vTexL.z+vTexL.w;
	float hR = vTexR.z+vTexR.w;
	float hT = vTexT.z+vTexT.w;
	float hB = vTexB.z+vTexB.w;
    
    float fMinZ = min( min( min( min( vTexC.z, vTexL.z ), vTexR.z ), vTexT.z ), vTexB.z );
    float fMaxZ = max( max( max( max( vTexC.z, vTexL.z ), vTexR.z ), vTexT.z ), vTexB.z );
    
    float fAlpha = min(1.0,vTexC.z*130.0);
    
    vec3 vNormal = vec3( ( hR - hL )*g_fGridSizeInMeter, ( hB - hT )*g_fGridSizeInMeter, 2.0 );
    vNormal = normalize( vNormal );
    vec2 vTerrainUV = uv;
    vec2 vRefractUV = vTerrainUV - vNormal.xy*vTexC.z*6.0;
    
    vec3 vTerrainColor = mix( vTerrainColor0, vTerrainColor1, SampleColor( iChannel1, vRefractUV, iResolution.xy ) );
    vTerrainColor *= 1.0-min(1.0,fMaxZ*80.0)*0.2;
    vec3 vRefract = vTerrainColor;
    vec4 vTexCRefract = textureLod(iChannel0,vRefractUV,0.0);
    vTexCRefract = mix( vTexC, textureLod(iChannel0,vRefractUV,0.0), min( vTexCRefract.z*1.0, 1.0 ) );
    vec3 vFog = 1.0 - exp( -vTexCRefract.zzz/(vNormal.z*0.9999)*vWaterFogColor );
    vRefract *= ( 1.0 - vFog );
    

    
    vec3 vReflect = ( pow( ( 1.0 - pow( vNormal.z*0.9999999, 100.0 ) ), 0.4 ) )* 1.1 * vSkyColor;
    //vec3 vReflect = ( 1.0-pow( ( 1.0 - pow( vNormal.z*0.9999999, 1000.0 ) ), 0.1 ) )* 0.3 * vSkyColor;
    vec3 vHalfVec = normalize( vLookDir + vLightDir );
    float fHdotN = max( 0.0, dot( -vHalfVec, vNormal ) );
    vReflect += pow( fHdotN , 1200.0 ) * 20.0 * vSunColor;
    vReflect += pow( fHdotN , 180.0 ) * 0.5 * vSkyColor;
    
    float fLight = pow( max( dot( vNormal, -vLightDir ), 0.0 ), 10.0 );    
    
    
    float fFoam = max(0.0,1.0-fMinZ*8.0)*0.3;
    
    vec3 vWater = mix( vRefract*fLight + vReflect, vFoamColor, vec3(fFoam,fFoam,fFoam) );    
    //vWater = vReflect;
    
    
    
    vec3 vOut = mix( vTerrainColor*fLight, vWater, vec3(fAlpha) );

    /*if ( iResolution.x > 1180.0 )
    {
        if ( uv.y < 0.3 ) vOut = mix( vec3(vTexC.w*0.1), vec3( vTexC.xy+0.5, 0.0 ), vec3(fAlpha) );
        vOut *= smoothstep( 0.0, 0.004, abs(uv.y-0.3) );
    }*/   
    
    //vOut = vTerrainColor;
    
    // button!
    if ( fragCoord.x < 40.0 && fragCoord.y < 40.0 ) vOut = mod( iTime, 1.0 ) < 0.5 ? vec3( 0.4, 0.2, 0.2 ) : vec3( 0.3, 0.2, 0.1 );

    
    
    fragColor = vec4( DeGamma( vOut ), 1.0 );
}