//********************************************************************************
//
// Very basic effect that simply uses a single texture and is lit using the vertex
// normal combined with other material parameters.
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
	float2 TexCoord0 : TEXCOORD0;
};

struct BasicVertexOutput
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
};

struct AdvancedVertexOutput
{
	float4 Position : POSITION;
	float2 TexCoord0 : TEXCOORD0;
	float3 Normal : TEXCOORD1;
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

sampler2D Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../common/default2dsamplerstate.fx"
};


//********************************************************************************
// Shader support functions.
//********************************************************************************

#include "../common/legacy lighting.fx"
#include "../common/texture transformation.fx"


//********************************************************************************
// Shader programs.
//********************************************************************************

BasicVertexOutput BasicVertexShader(VertexInput input)
{
	BasicVertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.Colour0 = LegacyLight(input.Normal, LightDirections, LightColour0, LightColour1, LightColour2, LightColour3, LightAmbientColour, LightColourScalar);
	output.TexCoord0 = TransformTextureCoordinate(input.TexCoord0, TextureTransform0);

	return output;
}

float4 BasicPixelShader(BasicVertexOutput input, uniform sampler2D sampler0) : COLOR
{
	float4 texture0Texel = tex2D(sampler0, input.TexCoord0);
	
	return texture0Texel * input.Colour0;
}

AdvancedVertexOutput AdvancedVertexShader(VertexInput input)
{
	AdvancedVertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.TexCoord0 = TransformTextureCoordinate(input.TexCoord0, TextureTransform0);
	output.Normal = input.Normal;

	return output;
}

float4 AdvancedPixelShader(AdvancedVertexOutput input, uniform sampler2D sampler0) : COLOR
{
	float4 colour = LegacyLight(input.Normal, LightDirections, LightColour0, LightColour1, LightColour2, LightColour3, LightAmbientColour, LightColourScalar);
	float4 texture0Texel = tex2D(sampler0, input.TexCoord0);
	
	return texture0Texel * colour;
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique AdvancedShader
{
	pass
	{
		VertexShader = compile vs_2_0 AdvancedVertexShader();
		PixelShader = compile ps_2_0 AdvancedPixelShader(Sampler0);
	}
}

technique BasicShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader(Sampler0);
	}
}
