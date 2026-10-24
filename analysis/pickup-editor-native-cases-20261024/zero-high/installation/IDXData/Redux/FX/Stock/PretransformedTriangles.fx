//********************************************************************************
//
// Standard pretransformed triangles effect, simply moves vertex input across
// to the pixel shader.
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
	float2 TexCoord1 : TEXCOORD1;
};

struct VertexOutput 
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float2 TexCoord0 : TEXCOORD0;
	float2 TexCoord1 : TEXCOORD1;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 TextureTransform0;
float4x4 TextureTransform1;


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;

sampler2D Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../common/default2dsamplerstate.cg"
};


//********************************************************************************
// Shader support functions.
//********************************************************************************

#include "../common/legacylighting.cg"
#include "../common/texturetransformation.cg"


//********************************************************************************
// Shader programs.
//********************************************************************************

VertexOutput BasicVertexShader(VertexInput input)
{
	VertexOutput output;

	output.Position = input.Position;
	output.Colour0 = input.Colour0;
	output.TexCoord0 = TransformTextureCoordinate(input.TexCoord0, TextureTransform0);
	output.TexCoord1 = TransformTextureCoordinate(input.TexCoord1, TextureTransform1);

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

technique FixedFunction
{
	pass
	{
		VertexShader = NULL;
		PixelShader = NULL;
	}
}
