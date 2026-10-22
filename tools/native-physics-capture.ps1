[CmdletBinding(DefaultParameterSetName = 'Capture')]
param(
  [Parameter(Mandatory = $true, ParameterSetName = 'Capture')]
  [string] $ConfigPath,
  [Parameter(ParameterSetName = 'Capture')]
  [switch] $ValidateOnly,
  [Parameter(ParameterSetName = 'Capture')]
  [switch] $Quiet,
  [Parameter(Mandatory = $true, ParameterSetName = 'Compile')]
  [switch] $CompileOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$sourcePath = Join-Path $PSScriptRoot 'lib\native-physics-debugger.cs'
if (-not ('RollcageCapture.NativeDebugger' -as [type])) {
  Add-Type -Path $sourcePath
}
if ($CompileOnly) {
  Write-Output 'Windows capture helper compiled; no process launched.'
  return
}

# Convert only declared fields. Reject typos instead of silently omitting a bound or intervention.
function ConvertTo-CaptureType {
  param([AllowNull()] $Value, [type] $TargetType)
  if ($null -eq $Value) { throw "Null is not accepted for $($TargetType.FullName)." }
  $nullableElement = [Nullable]::GetUnderlyingType($TargetType)
  if ($null -ne $nullableElement) { return (ConvertTo-CaptureType $Value $nullableElement) }
  if ($TargetType.IsArray) {
    $items = @($Value)
    $array = [Array]::CreateInstance($TargetType.GetElementType(), $items.Count)
    for ($i = 0; $i -lt $items.Count; $i++) {
      $array.SetValue((ConvertTo-CaptureType $items[$i] $TargetType.GetElementType()), $i)
    }
    return ,$array
  }
  if ($TargetType -eq [string]) { return [string] $Value }
  if ($TargetType -eq [int]) {
    $integerValue = [int] $Value
    if ([double] $integerValue -ne [double] $Value) { throw 'Integer fields require integral values.' }
    return $integerValue
  }
  if ($TargetType -eq [bool]) {
    if ($Value -isnot [bool]) { throw 'Boolean fields require JSON true or false.' }
    return [bool] $Value
  }
  $result = [Activator]::CreateInstance($TargetType)
  foreach ($property in $Value.PSObject.Properties) {
    $field = $TargetType.GetField($property.Name)
    if ($null -eq $field -or -not $field.IsPublic) { throw "Unknown $($TargetType.Name) field: $($property.Name)" }
    $field.SetValue($result, (ConvertTo-CaptureType $property.Value $field.FieldType))
  }
  return $result
}

$resolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$configBytes = [IO.File]::ReadAllBytes($resolvedConfig)
$configuration = [Text.Encoding]::UTF8.GetString($configBytes) | ConvertFrom-Json
$options = ConvertTo-CaptureType $configuration ([RollcageCapture.Options])
[RollcageCapture.NativeDebugger]::Validate($options)
if ($ValidateOnly) {
  Write-Output 'Capture configuration validated; no process launched or output created.'
  return
}

$captureResult = [RollcageCapture.NativeDebugger]::Run($options, $configBytes, $Quiet.IsPresent)
if ($captureResult -ne 0) { throw "Native capture ended with failure code $captureResult. See trace.jsonl." }
