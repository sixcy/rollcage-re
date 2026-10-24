$ErrorActionPreference = 'Stop'
$env:GHIDRA_INSTALL_DIR = 'C:/Users/Cyril/Documents/ghidra_12.1.4_PUBLIC'
$env:JAVA_HOME = 'C:/Program Files/Eclipse Adoptium/jdk-25.0.4.101-hotspot'
Set-Location -LiteralPath 'C:/Users/Cyril/Documents/Rollcage RE'
& node 'tools/rea-session.mjs' 'C:/Users/Cyril/AppData/Local/npm-cache/_npx/a1722018f28f9df2/node_modules/rea-agents/scripts/rea.mjs' 'native-callback-clone-static-20261024-v2'
if ($LASTEXITCODE -ne 0) { throw "REA session exited with code $LASTEXITCODE" }
