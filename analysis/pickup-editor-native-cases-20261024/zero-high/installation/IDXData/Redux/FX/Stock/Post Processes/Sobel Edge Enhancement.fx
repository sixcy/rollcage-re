//********************************************************************************
//
// Monochrome post process.
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
	float4 c0 = float4(0, 0.00234375009, 0.769230783, 1);
	float4 c1 = float4(-0.00234375009, 0.00234375009, 2, 1);
	float4 c2 = float4(0.00234375009, 0.00209999993, 0, 0);
	float4 c4 = float4(-0.00234375009, 0, 0, 0);
	float4 c5 = float4(0, -0.00234375009, 0, 0);
	float4 c6 = float4(0.00234375009, -0.00234375009, 0, 0);
	float4 luminance = float4(0.299, 0.587, 0.114, 0);

	float4 tr4 = tex2D(sampler0, input.TexCoord0 + c0.xy);
	float4 tr8 = tex2D(sampler0, input.TexCoord0 + c5.xy);
	float4 tr7 = tex2D(sampler0, input.TexCoord0 + c1.x);
	float4 tr6 = tex2D(sampler0, input.TexCoord0 + c6.xy);
	float4 tr5 = tex2D(sampler0, input.TexCoord0 + c1.xy);
	float4 tr3 = tex2D(sampler0, input.TexCoord0 + c1.y);
	float4 tr2 = tex2D(sampler0, input.TexCoord0 + c2.xy);
	float4 tr1 = tex2D(sampler0, input.TexCoord0 + c4.xy);
	float4 tr0 = tex2D(sampler0, input.TexCoord0);

	float r7x = dot(tr7.xyz, luminance.xyz);
	float r6x = dot(tr6.xyz, luminance.xyz);
	float r5x = dot(tr5.xyz, luminance.xyz);
	float r3x = dot(tr3.xyz, luminance.xyz);

	float r0w = c1.z * dot(tr8.xyz, luminance.xyz) + r7x;

	r0w += r6x;
	r0w += -r5x;
	r0w += c1.z * -dot(tr4.xyz, luminance.xyz);

	float r1w = r0w + -r3x;

	r0w = r6x + r3x;

	r1w *= r1w;

	r0w += c1.z * dot(tr2.xyz, luminance.xyz);
	r0w += -r5x;
	r0w += c1.z * -dot(tr1.xyz, luminance.xyz);
	r0w += -r7x;
	r0w *= r0w;
	r0w += r1w;
	r0w *= -c0.z;
	r0w += 1.0;
	r0w = saturate(r0w);

	float4 final = tr0 * r0w;

	final.w = 1.0;

	return final;
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
