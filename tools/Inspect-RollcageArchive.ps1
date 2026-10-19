param(
    [string]$GameDirectory = 'C:\Program Files (x86)\Psygnosis\Rollcage',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\analysis')
)

$ErrorActionPreference = 'Stop'
$null = New-Item -ItemType Directory -Path $OutputDirectory -Force
$idxPath = Join-Path $GameDirectory 'IDXData\Rollcage.idx'
$imgPath = Join-Path $GameDirectory 'IDXData\Rollcage.img'
$idx = [IO.File]::ReadAllBytes($idxPath)
if ($idx.Length % 16 -ne 0) { throw 'Index size is not divisible by 16.' }
$img = [IO.File]::OpenRead($imgPath)
$entries = @()
$previousEnd = [long]0
try {
    $entries = @(for ($pos = 0; $pos -lt $idx.Length; $pos += 16) {
        $offset = [BitConverter]::ToUInt32($idx, $pos)
        $stored = [BitConverter]::ToUInt32($idx, $pos + 4)
        $field8 = [BitConverter]::ToUInt32($idx, $pos + 8)
        $flags = [BitConverter]::ToUInt32($idx, $pos + 12)
        $end = [long]$offset + $stored
        if ($offset -ne $previousEnd) { throw "Noncontiguous entry at index $($pos / 16)." }
        if ($end -gt $img.Length) { throw "Entry exceeds image at index $($pos / 16)." }
        $head = New-Object byte[] ([Math]::Min(32, $stored))
        $null = $img.Seek($offset, [IO.SeekOrigin]::Begin)
        if ($img.Read($head, 0, $head.Length) -ne $head.Length) { throw 'Short header read.' }
        $magic = if ($head.Length -ge 4) { [Text.Encoding]::ASCII.GetString($head, 0, 4) } else { '' }
        $isGT20 = $magic -ceq 'GT20'
        $previousEnd = $end
        [pscustomobject]@{
            Index = [int]($pos / 16)
            IndexFileOffset = $pos
            ImageOffset = $offset
            StoredBytes = $stored
            IndexField8 = $field8
            Flags = $flags
            Magic = $magic
            HeaderField4 = $(if ($isGT20) { [BitConverter]::ToUInt32($head, 4) } else { $null })
            HeaderField8 = $(if ($isGT20) { [BitConverter]::ToUInt32($head, 8) } else { $null })
            HeaderField12 = $(if ($isGT20) { [BitConverter]::ToUInt32($head, 12) } else { $null })
            HeaderHex = [BitConverter]::ToString($head)
        }
    })
    if ($previousEnd -ne $img.Length) { throw 'Index does not cover complete image.' }
    $imgBytes = $img.Length
} finally {
    $img.Dispose()
}
$entries | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'archive-entries.csv') -NoTypeInformation -Encoding UTF8
$artifacts = @($idxPath, $imgPath,
    (Join-Path $GameDirectory 'Direct3D\Rollcage Player.exe'),
    (Join-Path $GameDirectory 'Direct3D\Rollcage Redux.exe'))
$identities = @(foreach ($path in $artifacts) {
    $file = Get-Item -LiteralPath $path
    [pscustomobject]@{ Path = $path; Bytes = $file.Length; SHA256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$summary = [pscustomobject]@{
    GeneratedAt = [DateTime]::UtcNow.ToString('o')
    Method = 'Direct static file inspection using PowerShell; not REA Evidence. No target execution or decompression.'
    Artifacts = $identities
    RecordBytes = 16
    RecordCount = $entries.Count
    ImageBytes = $imgBytes
    CompleteContiguousCoverage = $true
    MagicCounts = @($entries | Group-Object Magic | Select-Object Name, Count)
    FlagCounts = @($entries | Group-Object Flags | Select-Object Name, Count)
    GT20Field4MatchesIndexField8 = @($entries | Where-Object { $_.Magic -ceq 'GT20' -and $_.HeaderField4 -eq $_.IndexField8 }).Count
    GT20Field8MatchesFlags = @($entries | Where-Object { $_.Magic -ceq 'GT20' -and $_.HeaderField8 -eq $_.Flags }).Count
    SumIndexField8 = ($entries | Measure-Object IndexField8 -Sum).Sum
    Unknowns = @('Index field +8 meaning is unconfirmed; a decoded byte count is a candidate.', 'Flags, GT20 header semantics, compression and resource identifiers require executable cross-references.')
}
$summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'archive-summary.json') -Encoding UTF8
$summary | ConvertTo-Json -Depth 8
