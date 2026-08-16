param(
  [string]$Output = "frontend-installers.zip"
)

# Ir al directorio del frontend
$frontendDir = Join-Path $PSScriptRoot '..\frontend-restaurante'
Set-Location $frontendDir

Write-Output "[package_frontend] Frontend dir: $frontendDir"

Write-Output "[package_frontend] Instalando dependencias (si es necesario)..."
npm ci

Write-Output "[package_frontend] Ejecutando build + electron-builder (dist)..."
npm run dist

$releaseDir = Join-Path $frontendDir 'release'
if (Test-Path $releaseDir) {
  Write-Output "[package_frontend] Comprimiendo release -> $Output"
  $outPath = Join-Path $PSScriptRoot "..\$Output"
  if (Test-Path $outPath) { Remove-Item $outPath -Force }
  Compress-Archive -Path (Join-Path $releaseDir '*') -DestinationPath $outPath -Force
  Write-Output "[package_frontend] Instaladores empaquetados en: $outPath"
} else {
  Write-Error "[package_frontend] Error: carpeta release no encontrada. Revisa la salida de electron-builder.";
  exit 2
}
