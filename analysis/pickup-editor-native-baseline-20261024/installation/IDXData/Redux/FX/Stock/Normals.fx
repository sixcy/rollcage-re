//********************************************************************************
//
// Just show vertex normals.
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
};

struct VertexOutput 
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 ModelToClipSpace;


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
// Shader programs.
//********************************************************************************

VertexOutput BasicVertexShader(VertexInput input)
{
	VertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.Colour0 = (input.Normal + float4(1.0f, 1.0f, 1.0f, 0.0f)) * float4(0.5f, 0.5f, 0.5f, 1.0f);

	return output;
}

float4 BasicPixelShader(VertexOutput input, uniform sampler2D sampler0) : COLOR
{
	return input.Colour0;
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique BasicShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader(Sampler0);
	}
}
