//********************************************************************************
//
// Standard wireframe overlay effect, simply moves vertex input across to the
// pixel shader.
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
};

struct VertexOutput 
{
	float4 Position : POSITION;
};


//********************************************************************************
// Global / uniform variables.
//********************************************************************************

float4x4 ModelToClipSpace;


//********************************************************************************
// Shader programs.
//********************************************************************************

VertexOutput BasicVertexShader(VertexInput input)
{
	VertexOutput output;

	output.Position = mul(input.Position, ModelToClipSpace);

	return output;
}

float4 BasicPixelShader(VertexOutput input) : COLOR
{
	return float4(1.0f, 1.0f, 1.0f, 1.0f);
}


//********************************************************************************
// Techniques, listed in descending quality order.
//********************************************************************************

technique BasicShader
{
	pass
	{
		VertexShader = compile vs_2_0 BasicVertexShader();
		PixelShader = compile ps_2_0 BasicPixelShader();

		FillMode = WireFrame;
		DepthBias = -0.00003;
	}
}
