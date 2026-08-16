# Script para reemplazar alert() por toast en componentes React
# Usar desde PowerShell en la carpeta del frontend

$componentes = @(
    "src/components/Inventario.jsx",
    "src/components/GestionNCF.jsx",
    "src/components/GestionMesas.jsx",
    "src/components/GestionRecetas.jsx",
    "src/components/MapaMesas.jsx",
    "src/components/MenuPedido.jsx",
    "src/components/PanelAdmin.jsx",
    "src/components/PantallaKDS.jsx",
    "src/components/ConfiguracionNegocio.jsx",
    "src/components/CierreCaja.jsx",
    "src/components/HistorialFacturas.jsx",
    "src/components/PersonalizacionSistema.jsx",
    "src/components/ReporteTipoPago.jsx"
)

foreach ($comp in $componentes) {
    $path = "C:\Users\Administrador\sistema_restaurante\frontend-restaurante\$comp"
    if (!(Test-Path $path)) { Write-Output "NO EXISTE: $comp"; continue }
    
    $content = Get-Content -Path $path -Raw -Encoding UTF8
    $original = $content
    
    # Agregar import de toast si no lo tiene
    if ($content -notmatch "from './Toast.jsx'" -and $content -notmatch "from '\.\./components/Toast\.jsx'") {
        if ($comp -match "components/") {
            $content = $content -replace "(import.*from '\.\./utils/input\.js';)", "`$1`nimport { toastExito, toastError, toastAviso } from './Toast.jsx';"
        }
    }
    
    # Reemplazar alert por toast según tipo
    $content = $content -replace 'alert\("⚠️ ', 'toastAviso("'
    $content = $content -replace 'alert\("✅ ', 'toastExito("'
    $content = $content -replace 'alert\("❌ ', 'toastError("'
    $content = $content -replace 'alert\(`⚠️ ', 'toastAviso(`'
    $content = $content -replace 'alert\(`✅ ', 'toastExito(`'
    $content = $content -replace 'alert\(`❌ ', 'toastError(`'
    $content = $content -replace 'alert\("Error', 'toastError("Error'
    $content = $content -replace 'alert\(', 'toastAviso('
    
    if ($content -ne $original) {
        Set-Content -Path $path -Value $content -Encoding UTF8
        Write-Output "OK: $comp"
    } else {
        Write-Output "SIN CAMBIOS: $comp"
    }
}

Write-Output "`n=== Proceso completado ==="
