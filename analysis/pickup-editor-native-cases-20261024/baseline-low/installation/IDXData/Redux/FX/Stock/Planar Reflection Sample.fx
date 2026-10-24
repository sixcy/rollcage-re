
float4 c0 = float4(-0.5, -0.5, 0, 0) * ReflectionDimensions;
float4 c1 = float4(+0.5, -0.5, 0, 0) * ReflectionDimensions;
float4 c2 = float4(-0.5, +0.5, 0, 0) * ReflectionDimensions;
float4 c3 = float4(+0.5, +0.5, 0, 0) * ReflectionDimensions;
float4 c4 = float4(0.2, 0.2, 0.2, 0.2);
float4 c6 = float4(0.30, 0.59, 0.11, 1.0);
float4 c7 = float4(0.5, 0.5, 0.0, 0.0);
float4 c8 = float4(-0.5, -0.5, 0.0, 0.0);
float4 c9 = float4(0.25, 0.25, 0.25, 1.0);
float4 c10 = float4(0.25, 0.25, 0.25, 0.0);

float4 sampleCoordinate = input.TexCoord0;

sampleCoordinate *= 1.0 / sampleCoordinate.w;
sampleCoordinate *= c8;
sampleCoordinate += c7;

float4 blurredSample = tex2D(sampler0, (float2)(sampleCoordinate));

blurredSample += tex2D(sampler0, (float2)(sampleCoordinate + c0));
blurredSample += tex2D(sampler0, (float2)(sampleCoordinate + c1));
blurredSample += tex2D(sampler0, (float2)(sampleCoordinate + c2));
blurredSample += tex2D(sampler0, (float2)(sampleCoordinate + c3));

blurredSample *= c4;

float4 offset = dot(blurredSample.xyz, c6.xyz);
offset.w = c6.w;

blurredSample *= c9;
offset *= c10;

blurredSample += offset;
blurredSample *= input.Colour0;
