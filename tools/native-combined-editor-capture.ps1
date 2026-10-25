[CmdletBinding(DefaultParameterSetName = 'Capture')]
param(
  [Parameter(Mandatory = $true, ParameterSetName = 'Capture')]
  [string] $ConfigPath,
  [Parameter(ParameterSetName = 'Capture')]
  [switch] $ValidateOnly,
  [Parameter(ParameterSetName = 'Capture')]
  [switch] $Quiet,
  [Parameter(Mandatory = $true, ParameterSetName = 'Compile')]
  [switch] $CompileOnly,
  [string] $HelperSourcePath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$sourcePath = if ($HelperSourcePath) { $HelperSourcePath } else { Join-Path $PSScriptRoot 'lib\combined-editor-native-debugger.cs' }
$sourceStream = [IO.File]::OpenRead($sourcePath)
$sourceHasher = [Security.Cryptography.SHA256]::Create()
try {
  $pickupSourceHash = ([BitConverter]::ToString($sourceHasher.ComputeHash($sourceStream))).Replace('-', '').ToLowerInvariant()
} finally { $sourceStream.Dispose(); $sourceHasher.Dispose() }
if ('RollcageCombinedEditor.NativeDebugger' -as [type]) {
  if ([RollcageCombinedEditor.NativeDebugger]::HelperSourceSha256 -ne $pickupSourceHash) { throw 'Loaded pickup helper differs from the current source. Use a fresh PowerShell process.' }
} else {
  Add-Type -Path $sourcePath
  [RollcageCombinedEditor.NativeDebugger]::HelperSourceSha256 = $pickupSourceHash
}
if ($CompileOnly) {
  Write-Output 'Scenery editor helper compiled; no process launched.'
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
  if ($TargetType -eq [uint32]) {
    $unsignedValue = [uint32] $Value
    if ([double] $unsignedValue -ne [double] $Value) { throw 'Unsigned fields require integral UInt32 values.' }
    return $unsignedValue
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
$options = ConvertTo-CaptureType $configuration ([RollcageCombinedEditor.Options])
$expectedPath = Join-Path (Split-Path (Split-Path $options.workingDirectory -Parent) -Parent) 'scenery-expected.json'
$expected = [IO.File]::ReadAllText($expectedPath) | ConvertFrom-Json
if ($options.sceneryEditorObservation.linksHex -ne $expected.probe.linksHex -or $options.sceneryEditorObservation.linksOffset -ne $expected.probe.linksOffset -or $options.sceneryEditorObservation.placementCount -ne $expected.probe.placementCount) { throw 'Typed scenery policy differs from expected source manifest.' }
[RollcageCombinedEditor.NativeDebugger]::Validate($options)
if ($ValidateOnly) {
  Write-Output 'Capture configuration validated; no process launched or output created.'
  Write-Output ('SCENERY-POLICY ' + (@{ links = $options.sceneryEditorObservation.links; linksHex = $options.sceneryEditorObservation.linksHex; linksOffset = $options.sceneryEditorObservation.linksOffset; placementCount = $options.sceneryEditorObservation.placementCount } | ConvertTo-Json -Compress -Depth 4))
  return
}

$captureResult = [RollcageCombinedEditor.NativeDebugger]::Run($options, $configBytes, $Quiet.IsPresent)
if ($captureResult -ne 0) { throw "Native capture ended with failure code $captureResult. See trace.jsonl." }
