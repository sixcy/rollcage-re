//********************************************************************************
//
// Speed blurred pretransformed triangles effect.
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

float BlurAmount = 0.0;
int BlurSamples = 32;
float2 BlurCentre = float2(0.5, 0.5);

#include "icy support.fx"


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;

sampler2D Sampler0 = sampler_state
{
	Texture = <Texture0>;
#include "../common/default2dsamplerstate.fx"
};

texture Texture1;

sampler2D Sampler1 = sampler_state
{
Texture = <Texture1>;
#include "../common/default2dsamplerstate.fx"
};


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

float2 BlurRadius(float2 offset)
{
	float2 result;
	
	result.x = length(offset);
	result.y = pow(result.x + 0.3, 3) - 0.0270;
	result.x = pow(result.x + 0.2, 4) - 0.0016;

	return result;
}

float4 BasicPixelShader(VertexOutput input, uniform sampler2D sampler0) : COLOR
{
	// 8 is a minimum, 20 is much better but not perfect, 32 is perfect.
	int count = BlurSamples;
	// The fire colour at the screen edges.
	float4 fire = float4(1.0, 0.5, 0.0, 0.0);
	float2 toCentre = input.TexCoord0 - BlurCentre;
	float4 blurredTexel = float4(0.0, 0.0, 0.0, 0.0);
	float blurWidth = BlurAmount * -0.25;
	float2 blurScale = BlurRadius(toCentre);
	float2 icyOffset = IcyOffset(input.TexCoord0, Sampler1, IceDistortion * MaxIceDistortion) + BlurCentre;

	for (int i = 0; i < count; i++)
	{
		float scale = blurWidth * (i / (float)(count - 1));

		blurredTexel += tex2D(sampler0, toCentre * (1.0f + (blurScale.y * scale)) + icyOffset); 
	}

	blurredTexel /= BlurSamples;

	blurredTexel *= input.Colour0;

	float brightness = pow(length(blurredTexel.xyz), 2);

	return blurredTexel + (fire * brightness * blurScale.x * BlurAmount * 10);
}

float4 LegacyPixelShader(VertexOutput input, uniform sampler2D sampler0) : COLOR
{
	// count is fixed on shader model 2.
	int count = 10;
	// The fire colour at the screen edges.
	float4 fire = float4(1.0, 0.5, 0.0, 0.0);
	float2 toCentre = input.TexCoord0 - BlurCentre;
	float4 blurredTexel = float4(0.0, 0.0, 0.0, 0.0);
	float blurWidth = BlurAmount * -0.25;
	float2 blurScale = BlurRadius(toCentre);
	float2 icyOffset = IcyOffset(input.TexCoord0, Sampler1, IceDistortion * MaxIceDistortion) + BlurCentre;

	for (int i = 0; i < count; i++)
	{
		float scale = blurWidth * (i / (float)(count - 1));

		blurredTexel += tex2D(sampler0, toCentre * (1.0f + (blurScale.y * scale)) + icyOffset); 
	}

	blurredTexel /= count;

	blurredTexel *= input.Colour0;

	float brightness = pow(length(blurredTexel.xyz), 2);

	return blurredTexel + (fire * brightness * blurScale.x * BlurAmount * 10);
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique BasicShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_3_0 BasicPixelShader(Sampler0);
	}
}

technique LegacyShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 LegacyPixelShader(Sampler0);
	}
}
