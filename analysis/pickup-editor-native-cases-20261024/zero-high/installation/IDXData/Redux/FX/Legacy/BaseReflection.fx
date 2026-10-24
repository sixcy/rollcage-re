//********************************************************************************
//
// Basic effect that simply uses a base texture and is lit using the vertex
// colour and normal combined with other material parameters.
//
// This uses a standard lit base texture combined with a reflection texture added
// on top to immitate surface reflection.
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
	float2 TexCoord0 : TEXCOORD0;
};

struct BasicVertexOutput 
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
	float3 TexCoord1 : TEXCOORD1;
};

struct AdvancedVertexInput 
{
	float4 Position : POSITION;
	float3 Normal : NORMAL;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
};

struct AdvancedVertexOutput 
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
	float3 Normal : TEXCOORD1;
	float3 ViewVector : TEXCOORD2;
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


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;
texture Texture1;

sampler2D Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../common/default2dsamplerstate.fx"
};

samplerCUBE Sampler1 = sampler_state
{
Texture = <Texture1>;
#include "../common/default3dsamplerstate.fx"
};


//********************************************************************************
// Shader support functions.
//********************************************************************************

#include "../common/legacy lighting.fx"
#include "../common/texture transformation.fx"


//********************************************************************************
// Shader programs.
//********************************************************************************

BasicVertexOutput BasicVertexShader(BasicVertexInput input)
{
	BasicVertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.Colour0 = LegacyLight(input.Normal, LightDirections, LightColour0, LightColour1, LightColour2, LightColour3, LightAmbientColour, LightColourScalar);
	output.TexCoord0 = TransformTextureCoordinate(input.TexCoord0, TextureTransform0);
	output.TexCoord1 = ReflectionTextureCoordinate(input.Position.xyz, input.Normal, CameraPosition.xyz);

	return output;
}

float4 BasicPixelShader(BasicVertexOutput input, uniform sampler2D sampler0, uniform samplerCUBE sampler1) : COLOR
{
	float4 texture0Texel = tex2D(sampler0, input.TexCoord0);
	float4 texture1Texel = texCUBE(sampler1, input.TexCoord1);
	
	return (texture0Texel * input.Colour0) + (texture1Texel * LightColourFactor);
}

AdvancedVertexOutput AdvancedVertexShader(AdvancedVertexInput input)
{
	AdvancedVertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.Colour0 = LegacyLight(input.Normal, LightDirections, LightColour0, LightColour1, LightColour2, LightColour3, LightAmbientColour, LightColourScalar);
	output.TexCoord0 = TransformTextureCoordinate(input.TexCoord0, TextureTransform0);
	output.Normal = input.Normal;
	output.ViewVector = (CameraPosition - input.Position).xyz;

	return output;
}

float4 AdvancedPixelShader(AdvancedVertexOutput input, uniform sampler2D sampler0, uniform samplerCUBE sampler1) : COLOR
{
	float4 texture0Texel = tex2D(sampler0, input.TexCoord0);

	input.Normal = normalize(input.Normal);
	input.ViewVector = normalize(input.ViewVector);

	// Look up the reflection
	float3 reflVec = reflect(-input.ViewVector, input.Normal);
	float4 reflection = texCUBE(sampler1, reflVec.xyz);
	
	return (texture0Texel * input.Colour0) + (reflection * LightColourFactor);
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique AdvancedShader
{
	pass
	{
		VertexShader = compile vs_2_0 AdvancedVertexShader();
		PixelShader = compile ps_2_0 AdvancedPixelShader(Sampler0, Sampler1);
	}
}

technique BasicShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader(Sampler0, Sampler1);
	}
}
