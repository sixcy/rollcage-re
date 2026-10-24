//********************************************************************************
//
// Perform some legacy lighting for compatibility with the old legacy shader
// and fixed function framework.
//
// Original author: Rob Baker.
// Current maintainer: Rob Baker.
//
//********************************************************************************


//********************************************************************************
// Light a vertex with 4 directional lights, an ambient light and multiply with a
// colour scalar (which often just houses the material alpha component).
//********************************************************************************

float4 LegacyLight(
	float3 vertexNormal,
	float4x4 lightDirections,
	float4 lightColour1,
	float4 lightColour2,
	float4 lightColour3,
	float4 lightColour4,
	float4 lightAmbientColour,
	float4 lightColourScalar)
{
	float4 dotProducts = saturate(mul(lightDirections, float4(normalize(vertexNormal), 1.0)));
	
	float4 finalColour = lightColour1 * dotProducts.x;
	finalColour += lightColour2 * dotProducts.y;
	finalColour += lightColour3 * dotProducts.z;
	finalColour += lightColour4 * dotProducts.w;

	finalColour += lightAmbientColour;
	finalColour *= lightColourScalar;

	return finalColour;
}


//********************************************************************************
// Light a vertex with 4 directional lights, an ambient light, the input vertex
// colour and multiply with a colour scalar (which often just houses the material
// alpha component).
//********************************************************************************

float4 LegacyLight(
	float4 vertexColour,
	float3 vertexNormal,
	float4x4 lightDirections,
	float4 lightColour1,
	float4 lightColour2,
	float4 lightColour3,
	float4 lightColour4,
	float4 lightAmbientColour,
	float4 lightColourScalar)
{
	float4 dotProducts = saturate(mul(lightDirections, float4(normalize(vertexNormal), 1.0)));
	
	float4 finalColour = lightColour1 * dotProducts.x;
	finalColour += lightColour2 * dotProducts.y;
	finalColour += lightColour3 * dotProducts.z;
	finalColour += lightColour4 * dotProducts.w;

	finalColour += lightAmbientColour;
	finalColour += vertexColour;
	finalColour *= lightColourScalar;

	return finalColour;
}
