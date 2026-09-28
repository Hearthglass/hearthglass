# Builds the Windows release zip: a self-contained Hearthglass.exe (no .NET install
# needed) with the scenes and the install scripts, ready to unzip and run Install.cmd.
# Used by .github/workflows/release.yml; also runs locally.
param(
    [string]$Out = "dist"
)

$ErrorActionPreference = "Stop"

$project = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$out = Join-Path $project $Out
$stage = Join-Path $out "Hearthglass"
$zip = Join-Path $out "Hearthglass-win-x64.zip"

if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

dotnet publish (Join-Path $project "wallpaper\windows\Hearthglass.csproj") `
    -c Release -r win-x64 --self-contained true -p:DebugType=none -p:SatelliteResourceLanguages=en -o $stage --nologo -v q
if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }

foreach ($asset in @("scenes", "vendor", "ui")) {
    Copy-Item (Join-Path $project $asset) (Join-Path $stage $asset) -Recurse
}
Get-ChildItem (Join-Path $stage "scenes") -Filter "tests" -Directory -Recurse | Remove-Item -Recurse -Force
Get-ChildItem (Join-Path $stage "ui") -Filter "tests" -Directory -Recurse | Remove-Item -Recurse -Force

foreach ($file in @("Install.cmd", "Uninstall.cmd", "LICENSE", "wallpaper\install.ps1", "wallpaper\uninstall.ps1")) {
    Copy-Item (Join-Path $project $file) $stage
}

Compress-Archive -Path $stage -DestinationPath $zip
Write-Host "Packaged $zip"
