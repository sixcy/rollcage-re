//********************************************************************************
//
// Basic effect that uses a reflection texture alone to immitate surface
// reflection.
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
	float3 TexCoord0 : TEXCOORD0;
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
	float3 Normal : TEXCOORD0;
	float3 ViewVector : TEXCOORD1;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 ModelToClipSpace;
float4 LightColourFactor;
float4 CameraPosition;


//********************************************************************************
// Textures and samplers.
//********************************************************************************

texture Texture0;

samplerCUBE Sampler0 = sampler_state
{
Texture = <Texture0>;
#include "../../common/default3dsamplerstate.fx"
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
	output.Colour0 = LightColourFactor;
	output.TexCoord0 = ReflectionTextureCoordinate(input.Position.xyz, input.Normal, CameraPosition.xyz);
	
	return output;
}

float4 BasicPixelShader(BasicVertexOutput input, uniform samplerCUBE sampler0) : COLOR
{
	float4 texel = texCUBE(sampler0, input.TexCoord0);
	
	return texel * input.Colour0;
}

AdvancedVertexOutput AdvancedVertexShader(AdvancedVertexInput input)
{
	AdvancedVertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);
	output.Colour0 = LightColourFactor;
	output.Normal = input.Normal;
	output.ViewVector = (input.Position - CameraPosition).xyz;

	return output;
}

float4 AdvancedPixelShader(AdvancedVertexOutput input, uniform samplerCUBE sampler0) : COLOR
{
	input.Normal = normalize(input.Normal);
	input.ViewVector = normalize(input.ViewVector);

	// Look up the reflection
	float3 reflVec = reflect(input.ViewVector, input.Normal);
	float4 reflection = texCUBE(sampler0, reflVec.xyz);

	//// We'll use Snell's refraction law:
	//// n  * sin(theta ) = n  * sin(theta )
	////  i            i     r            r
//
	//// sin(theta )
	////          i
	//float cosine = dot(input.ViewVector, input.Normal);
	//float sine = sqrt(1 - cosine * cosine);
//
	//// sin(theta )
	////          r
	//float sine2 = saturate(indexOfRefractionRatio * sine);
	//float cosine2 = sqrt(1 - sine2 * sine2);
//
	//// Out of the sine and cosine of the angle between the
	//// refraction vector and the input.Normal we can construct the
	//// refraction vector itself given two base vectors.
	//// These two base vectors are the negative input.Normal and
	//// a tangent vector along the path of the incoming vector
	//// relative to the surface.
	//float3 x = -input.Normal;
	//float3 y = normalize(cross(cross(input.ViewVector, input.Normal), input.Normal));
//
	//// Refraction
	//float3 refrVec = x * cosine2 + y * sine2;
	//float4 refraction = texCUBE(Environment, refrVec.xyz);
//
	//// Colors refract differently and the difference is more
	//// visible the stronger the refraction. We'll fake this
	//// effect by adding some rainbowish colors accordingly.
	//float4 rainbow = tex1D(Rainbow, pow(cosine, rainbowSpread));
//
	//float4 rain = rainbowScale * rainbow * baseColor;
	//float4 refl = reflectionScale * reflection;
	//float4 refr = refractionScale * refraction * baseColor;
//
	//// There is more light reflected at sharp angles and less
	//// light refracted. There is more color separation of refracted
	//// light at sharper angles
	//return sine * refl + (1 - sine2) * refr + sine2 * rain + ambient;
//}
	
	return reflection * input.Colour0;
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique AdvancedShader
{
	pass
	{
#include "../../common/reflection render state.fx"

		VertexShader = compile vs_2_0 AdvancedVertexShader();
		PixelShader = compile ps_2_0 AdvancedPixelShader(Sampler0);
	}
}

technique BasicShader
{
	pass
	{
#include "../../common/reflection render state.fx"

		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader(Sampler0);
	}
}
