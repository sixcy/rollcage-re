//********************************************************************************
//
// Transform texture coordinates in various ways.
//
// Original author: Rob Baker.
// Current maintainer: Rob Baker.
//
//********************************************************************************


//********************************************************************************
// Multiply a 2D texture coordinate by a 4x4 matrix, and return it as 2D.
//********************************************************************************

float2 TransformTextureCoordinate(
	float2 texCoord,
	float4x4 transform)
{
	return (float2)mul(transform, float4(texCoord, 0.0f, 1.0f));
}


//********************************************************************************
// Calculate a specular texture coordinate, returning a full 3D vector, the 2D
// part of which is used as a 2D texture coordinate.
//********************************************************************************

float3 SpecularTextureCoordinate(
	float3 vertexPosition,
	float3 vertexNormal,
	float3 cameraPosition,
	float4x4 transform)
{
	float3 I = normalize(vertexPosition - cameraPosition);
	float3 R = reflect(I, normalize(vertexNormal));

	R = mul(R, (float3x3)transform);
	
	R *= float3(0.5, -0.5, 0.0);
	R += float3(0.5, 0.5, 0.0);
	
	return R;
}


//********************************************************************************
// Calculate a specular texture coordinate, returning a full 3D vector, the 2D
// part of which is used as a 2D texture coordinate.
//********************************************************************************

float3 RelativeSpecularTextureCoordinate(float3 vertexPosition, float3 vertexNormal, float3 cameraPosition, float4x4 transform)
{
	float3 I = normalize(vertexPosition - cameraPosition);
	float3 R = reflect(I, normalize(vertexNormal));

	R *= float3(0.5, -0.5, 0.0);
	R += float3(0.5, 0.5, 0.0);
	
	return R;
}


//********************************************************************************
// Calculate a reflection texture coordinate, returning a full 3D vector, the 3D
// part of which is used as a 3D texture coordinate.
//********************************************************************************

float3 ReflectionTextureCoordinate(float3 vertexPosition, float3 vertexNormal, float3 cameraPosition)
{
	float3 I = normalize(vertexPosition - cameraPosition);
	float3 R = reflect(I, normalize(vertexNormal));

	return R;
}
