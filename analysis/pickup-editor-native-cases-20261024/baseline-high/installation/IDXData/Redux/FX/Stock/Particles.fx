//********************************************************************************
//
// Standard particle effect, simply moves vertex input across to the pixel shader.
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
	float2 ScreenOffset : TEXCOORD1;
	float2 AngleZBias : TEXCOORD2;
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

float4x4 ModelToClipSpace;
float AspectRatio;


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

	float sinAng = sin(input.AngleZBias.x);
	float cosAng = cos(input.AngleZBias.x);

	float4 offset = float4(0.0f, 0.0f, 0.0f, 0.0f);

	offset.x = (input.ScreenOffset.x * cosAng) - (input.ScreenOffset.y * sinAng);
	offset.y = ((input.ScreenOffset.y * cosAng) + (input.ScreenOffset.x * sinAng)) * AspectRatio;

	// TODO: Use zbias at some point when we know what we're doing.

	// I don't think we can mess with this without affecting the projected
	// size of the particle.

	output.Position = mul(input.Position, ModelToClipSpace) + offset;
	output.Colour0 = input.Colour0;
	output.TexCoord0 = input.TexCoord0;

	return output;
}

float4 BasicPixelShader(VertexOutput input, uniform sampler2D sampler0) : COLOR
{
	float4 texture0Texel = tex2D(sampler0, input.TexCoord0);
	
	return texture0Texel * input.Colour0;
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
