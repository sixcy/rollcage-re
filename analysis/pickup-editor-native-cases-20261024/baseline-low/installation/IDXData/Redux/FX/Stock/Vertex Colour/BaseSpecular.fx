//********************************************************************************
//
// Basic effect that simply uses a base texture and is lit using the vertex
// colour and normal combined with other material parameters.
//
// This uses a standard lit base texture combined with a specular texture added on
// top to immitate surface reflection.
//
// Original author: Rob Baker.
// Current maintainer: Rob Baker.
//
//********************************************************************************


//********************************************************************************
// Shader input and output structures.
//********************************************************************************

struct VertexInput 
{
	float4 Position : POSITION;
	float4 Normal : NORMAL;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
};

struct VertexOutput 
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float4 Colour1 : COLOR1;
	float2 TexCoord0 : TEXCOORD0;
	float2 TexCoord1 : TEXCOORD1;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 ModelToClipSpace;
float4 LightAmbientColour;
float4 LightColourScalar;
float4 LightColourFactor;
float4x4 LightDirections;
float4 LightColour0;
float4 LightColour1;
float4 LightColour2;
float4 LightColour3;
float4 CameraPosition;
float4x4 TextureTransform0;
float4x4 TextureTransform1;


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;
texture Texture1;

sampler2D Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../../common/default2dsamplerstate.cg"
};

sampler2D Sampler1 = sampler_state
{
Texture = <Texture1>;
#include "../../common/default2dsamplerstate.cg"
};


//********************************************************************************
// Shader support functions.
//********************************************************************************

#include "../../common/legacylighting.cg"
#include "../../common/texturetransformation.cg"


//********************************************************************************
// Shader programs.
//********************************************************************************

VertexOutput BasicVertexShader(VertexInput input)
{
	VertexOutput output;

	output.Position = mul(ModelToClipSpace, input.Position);
	output.Colour0 = LegacyLight(input.Colour0, input.Normal, LightDirections, LightColour0, LightColour1, LightColour2, LightColour3, LightAmbientColour, LightColourScalar);
	output.TexCoord0 = TransformTextureCoordinate(input.TexCoord0, TextureTransform0);

	float4 specular = SpecularTextureCoordinate(input.Position, input.Normal, CameraPosition, TextureTransform1);
	
	output.TexCoord1 = (float2)specular;

	float4 intensity = (-specular.z * 0.5f) + 0.5f;
	
	output.Colour1 = saturate(intensity * LightColourFactor);

	return output;
}

float4 BasicPixelShader(VertexOutput input, uniform sampler2D sampler0, uniform sampler2D sampler1) : COLOR
{
	float4 texture0Texel = tex2D(sampler0, input.TexCoord0);
	float4 texture1Texel = tex2D(sampler1, input.TexCoord1);
	
	return (texture0Texel * input.Colour0) + (texture1Texel * input.Colour1);
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique BasicShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader(Sampler0, Sampler1);
	}
}

technique FixedFunction
{
	pass
	{
		VertexShader = NULL;
		PixelShader = NULL;
	}
}
