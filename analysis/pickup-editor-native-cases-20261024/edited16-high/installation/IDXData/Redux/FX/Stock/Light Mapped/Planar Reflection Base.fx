//********************************************************************************
//
// Planar reflection, like a marble floor, with a surface texture and the
// reflection on top of it. The reflection is from a scene rendered into a texture.
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
	float2 TexCoord0 : TEXCOORD0;
	float2 LightMapCoord : TEXCOORD1;
};

struct VertexOutput 
{
	float4 Position : POSITION;
	float4 Colour0 : COLOR0;
	float4 TexCoord0 : TEXCOORD0;
	float2 TexCoord1 : TEXCOORD1;
	float2 LightMapCoord : TEXCOORD2;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 ModelToClipSpace;
float4 ReflectionFactor;
float4 ReflectionDimensions;


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;
texture Texture1;
texture Texture2;

sampler2D Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../../common/default2dsamplerstate.fx"
};

sampler2D Sampler1 = sampler_state
{
Texture = <Texture1>;
#include "../../common/default2dsamplerstate.fx"
};

sampler2D Sampler2 = sampler_state
{
Texture = <Texture2>;
#include "../../common/default2dsamplerstate.fx"
};


//********************************************************************************
// Shader support functions.
//********************************************************************************

#include "../../common/legacy lighting.fx"
#include "../../common/texture transformation.fx"


//********************************************************************************
// Shader programs.
//********************************************************************************

VertexOutput BasicVertexShader(VertexInput input)
{
	VertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.Colour0 = ReflectionFactor;
	output.TexCoord0 = output.Position;
	output.TexCoord1 = input.TexCoord0;
	output.LightMapCoord = input.LightMapCoord;

	return output;
}

float4 BasicPixelShader(VertexOutput input, uniform sampler2D sampler0, uniform sampler2D sampler1, uniform sampler2D sampler2) : COLOR
{
	float4 lightMapTexel = tex2D(sampler2, input.LightMapCoord);

	lightMapTexel.w = 1.0;

#include "../planar reflection sample.fx"

	return blurredSample + (tex2D(sampler1, input.TexCoord1) * lightMapTexel);
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique BasicShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader(Sampler1, Sampler0, Sampler2);
	}
}
