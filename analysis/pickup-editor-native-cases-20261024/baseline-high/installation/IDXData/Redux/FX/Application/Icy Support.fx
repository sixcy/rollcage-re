//********************************************************************************
//
// Support for an icy screen filter.
//
// Original author: Rob Baker.
// Current maintainer: Rob Baker.
//
//********************************************************************************


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float IceDistortion = 0.0;
float MaxIceDistortion = 0.125;


float2 IcyOffset(float2 textureCoord, sampler2D normalMap, float amount)
{
	float2 distortion = float2(0.0, 0.0);

	if (amount > 0.0)
	{
		float4 normal = tex2D(normalMap, textureCoord);
		
		distortion.x = (normal.x - 0.5f) * amount;
		distortion.y = (normal.y - 0.5f) * amount;
	}

	return distortion;
}
