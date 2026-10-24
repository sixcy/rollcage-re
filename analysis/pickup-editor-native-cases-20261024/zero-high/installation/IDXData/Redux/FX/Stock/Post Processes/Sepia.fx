//********************************************************************************
//
// Sepia post process.
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
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
};

struct VertexOutput 
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************


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


//********************************************************************************
// Shader programs.
//********************************************************************************

VertexOutput BasicVertexShader(VertexInput input)
{
	VertexOutput output;

	output.Position = input.Position;
	output.Colour0 = input.Colour0;
	output.TexCoord0 = input.TexCoord0;

	return output;
}

float4 BasicPixelShader(VertexOutput input, uniform sampler2D sampler0) : COLOR
{
	float desaturationRatio = 0.5f;
	float toneRatio = 1.0f;
	float3 inkColour = float3(1, 0.9, 0.5);
	float3 paperColour = float3(0.2, 0.05, 0);
	
	float3 scnColor = inkColour * tex2D(sampler0, input.TexCoord0).xyz;
	float3 grayXfer = float3(0.3,0.59,0.11);
	float gray = dot(grayXfer, scnColor);
	float3 muted = lerp(scnColor, gray.xxx, desaturationRatio);
	float3 sepia = lerp(paperColour, inkColour, gray);
	float3 result = lerp(muted, sepia, toneRatio);

	return float4(result,1);
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
