//********************************************************************************
//
// Basic effect that uses a specular texture alone to immitate surface reflection.
//
// Original author: Rob Baker.
// Current maintainer: Rob Baker.
//
//********************************************************************************


//********************************************************************************
// Shader input and output structures.
//********************************************************************************

struct BasicVertexInput
{
	float4 Position : POSITION;
	float3 Normal : NORMAL;
};

struct BasicVertexOutput
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float2 Specular : TEXCOORD0;
};

struct AdvancedVertexInput
{
	float4 Position : POSITION;
	float3 Normal : NORMAL;
};

struct AdvancedVertexOutput
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float4 InputPosition : TEXCOORD0;
	float3 InputNormal : TEXCOORD1;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 ModelToClipSpace;
float4 LightColourFactor;
float4 CameraPosition;
float4x4 TextureTransform0;


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;

sampler2D Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../../common/default2dsamplerstate.fx"
};


//********************************************************************************
// Shader support functions.
//********************************************************************************

#include "../../common/texture transformation.fx"


//********************************************************************************
// Shader programs.
//********************************************************************************

BasicVertexOutput BasicVertexShader(BasicVertexInput input)
{
	BasicVertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.Specular = SpecularTextureCoordinate(input.Position.xyz, input.Normal, CameraPosition.xyz, TextureTransform0).xy;
	output.Colour0 = LightColourFactor;

	return output;
}

float4 BasicPixelShader(BasicVertexOutput input, uniform sampler2D sampler0) : COLOR
{
	return tex2D(sampler0, input.Specular) * LightColourFactor;
}

AdvancedVertexOutput AdvancedVertexShader(AdvancedVertexInput input)
{
	AdvancedVertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.InputPosition = input.Position;
	output.InputNormal = input.Normal;
	output.Colour0 = LightColourFactor;

	return output;
}

float4 AdvancedPixelShader(AdvancedVertexOutput input, uniform sampler2D sampler0) : COLOR
{
	float3 specular = SpecularTextureCoordinate(input.InputPosition.xyz, normalize(input.InputNormal), CameraPosition.xyz, TextureTransform0);

	return tex2D(sampler0, (float2)(specular)) * input.Colour0;
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique AdvancedShader
{
	pass
	{
#include "../../common/specular render state.fx"

		VertexShader = compile vs_2_0 AdvancedVertexShader();
		PixelShader = compile ps_2_0 AdvancedPixelShader(Sampler0);
	}
}

technique BasicShader
{
	pass
	{
#include "../../common/specular render state.fx"

		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader(Sampler0);
	}
}
