
// Velocity Integration

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    ivec2 tc = ivec2(fragCoord);    
    vec4 vTexC = texelFetch(iChannel0,tc,0);    
    //vec4 vTexL = ( tc.x > 0 ) ?                    texelFetchOffset(iChannel0,tc, 0, ivec2(-1,0)) : vTexC*vec4(0.0,0.0,1.0,1.0);
    vec4 vTexR = ( tc.x < int(iResolution.x)-1 ) ? texelFetchOffset(iChannel0,tc, 0, ivec2(1,0)) : vTexC*vec4(0.0,0.0,1.0,1.0);
    //vec4 vTexT = ( tc.y > 0 ) ?                    texelFetchOffset(iChannel0,tc, 0, ivec2(0,-1)) : vTexC*vec4(0.0,0.0,1.0,1.0);
    vec4 vTexB = ( tc.y < int(iResolution.y)-1 ) ? texelFetchOffset(iChannel0,tc, 0, ivec2(0,1)) : vTexC*vec4(0.0,0.0,1.0,1.0);
       
    
    ////////////////////////////////////////////////////////////////
    

    float zC = vTexC.z+vTexC.w;
	//float zL = vTexL.z+vTexL.w;
	float zR = vTexR.z+vTexR.w;
	//float zT = vTexT.z+vTexT.w;
	float zB = vTexB.z+vTexB.w;

	vec2 vV;
	vV.x = -g_fG / g_fGridSizeInMeter * ( zR - zC );
	vV.y = -g_fG / g_fGridSizeInMeter * ( zB - zC );
	vTexC.xy += vV * g_fElapsedTimeInSec;
    
    // 2.1.4. Boundary Conditions

	if (	( ( vTexC.z <= EPS*g_fGridSizeInMeter ) && ( vTexC.w > zR ) ) || 
			( ( vTexR.z <= EPS*g_fGridSizeInMeter ) && ( vTexR.w > zC ) ) )
	{
		vTexC.x = 0.0;
	}

	if (	( ( vTexC.z <= EPS*g_fGridSizeInMeter ) && ( vTexC.w > zB ) ) || 
			( ( vTexB.z <= EPS*g_fGridSizeInMeter ) && ( vTexB.w > zC ) ) )
	{
		vTexC.y = 0.0;
	}
    
    // We also clamp the magnitudes
    float l = length( vTexC.xy );
	if ( l > 0.0 )
	{
		float alpha = 0.5;
		vTexC.xy /= l;
		l = min( l, g_fGridSizeInMeter / (g_fElapsedTimeInSec) * alpha );
		vTexC.xy *= l;
	}
    
    // hack blur
    /*{
        float fMinH = min( min( min( zL, zR ), min( zT, zB ) ), zC );
        float fMaxH = max( max( max( zL, zR ), max( zT, zB ) ), zC );
        float fW = clamp( ( fMaxH - fMinH )*g_fGridSizeInMeter/g_fHackBlurDepth, 0.0, 1.0 );

        float fTexLW = min( (zL-zC)*(1.0/4.0), vTexL.z );
        float fTexRW = min( (zR-zC)*(1.0/4.0), vTexR.z );
        float fTexTW = min( (zT-zC)*(1.0/4.0), vTexT.z );
        float fTexBW = min( (zB-zC)*(1.0/4.0), vTexB.z );

        float fTexAddition = fTexLW + fTexRW + fTexTW + fTexBW;
        vTexC.z += fTexAddition*0.99*fW;
    }*/
    
    // 2.1.5. Stability Enhancements
    if ( vTexC.z <= 0.0 )
    {
        vTexC.z = 0.0;
    }
    
    ////////////////////////////////////////////////////////////////


    vec2 uv = fragCoord/iResolution.xy;    
    vTexC.w = SampleDepth( iChannel1, uv, iResolution.xy );
    
    // click
    if ( iMouse.z > 0.0 )
    {
        float l = length((fragCoord-iMouse.xy)*0.001);
        l *= 20.0;
        l = clamp( 1.0 - l, 0.0, 1.0 );
        vTexC.z += 0.01 * ( cos( l * PI ) * -0.5 + 0.5 );
    }
    
    // reset
    if ( ( iFrame <= 1 ) || ( iMouse.z > 0.0 && iMouse.x < 40.0 && iMouse.y < 40.0 ) )
    {
        vTexC.xy = vec2(0.0);
        
        vTexC.z = max( 0.0 - vTexC.w, 0.0 );

        // jon a cunami.
        float l = abs( uv.x - 0.95 );
        l *= 10.0;
        l = clamp( 1.0 - l, 0.0, 1.0 );
        vTexC.z += 0.1 * ( cos( l * PI ) * -0.5 + 0.5 );
    }
    
    // jon a cunami.
    float ll = abs( uv.x - 0.95 );
    ll *= 20.0;
    ll = clamp( 1.0 - ll, 0.0, 1.0 );
    vTexC.z += 0.001 * ( cos( ll * PI ) * -0.5 + 0.5 ) * sin( iTime*1.6 ) * max( 0.0, (10.0-iTime)/10.0 );   
    
    
    fragColor = vTexC;
}