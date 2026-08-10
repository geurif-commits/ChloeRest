param(
  [string]$Output = "backend-installer.zip"
)

# Ubicar la raíz del repo (una carpeta arriba de scripts)
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

Write-Output "[package_backend] Repo root: $repoRoot"

Write-Output "[package_backend] Instalando dependencias (si es necesario)..."
npm ci

Write-Output "[package_backend] Ejecutando build del servidor (esbuild)..."
npm run build:server

Write-Output "[package_backend] Empaquetando con pkg (ServidorPOS.exe)..."
npm run package:win

if (Test-Path "ServidorPOS.exe") {
  Write-Output "[package_backend] Comprimiendo ServidorPOS.exe -> $Output"
  if (Test-Path $Output) { Remove-Item $Output -Force }
  Compress-Archive -Path "ServidorPOS.exe" -DestinationPath $Output -Force
  Write-Output "[package_backend] Instalador backend generado: $Output"
} else {
  Write-Error "[package_backend] Error: ServidorPOS.exe no encontrado. Revisa la salida de pkg.";
  exit 2
}
