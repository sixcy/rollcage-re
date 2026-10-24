//********************************************************************************
//
// Very basic effect that simply uses a single texture and is lit using the vertex
// colour and normal combined with other material parameters.
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
	float3 Normal : NORMAL;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
	float2 LightMapCoord : TEXCOORD1;
};

struct VertexOutput 
{
	float4 Position : POSITION;
	float2 TexCoord0 : TEXCOORD0;
	float2 LightMapCoord : TEXCOORD1;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 ModelToClipSpace;
float4 LightAmbientColour;
float4 LightColourScalar;
float4x4 LightDirections;
float4 LightColour0;
float4 LightColour1;
float4 LightColour2;
float4 LightColour3;
float4x4 TextureTransform0;


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;
texture Texture1;

sampler2D Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../../../common/default2dsamplerstate.fx"
};

sampler2D Sampler1 = sampler_state
{
Texture = <Texture1>;
#include "../../../common/default2dsamplerstate.fx"
};


//********************************************************************************
// Shader support functions.
//********************************************************************************

#include "../../../common/legacy lighting.fx"
#include "../../../common/texture transformation.fx"


//********************************************************************************
// Shader programs.
//********************************************************************************

VertexOutput BasicVertexShader(VertexInput input)
{
	VertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.TexCoord0 = TransformTextureCoordinate(input.TexCoord0, TextureTransform0);
	output.LightMapCoord = input.LightMapCoord;

	return output;
}

float4 BasicPixelShader(VertexOutput input, uniform sampler2D sampler0, uniform sampler2D sampler1) : COLOR
{
	float4 texture0Texel = tex2D(sampler0, input.TexCoord0);
	float4 lightMapTexel = tex2D(sampler1, input.LightMapCoord);
	
	lightMapTexel.w = 1.0;
	
	return texture0Texel * lightMapTexel * LightColourScalar;
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
