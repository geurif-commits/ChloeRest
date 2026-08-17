$ErrorActionPreference = "Stop"

$root = $PSScriptRoot

Write-Host ""
Write-Host "========================================"
Write-Host " CHLOERESTAURANT UTF8 CHECK"
Write-Host "========================================"
Write-Host ""

$utf8 = New-Object System.Text.UTF8Encoding($false)

$extensions = @(
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".css",
    ".html",
    ".json",
    ".xml",
    ".txt",
    ".md"
)

$files = Get-ChildItem -Path $root -Recurse -File |
    Where-Object {
        ($extensions -contains $_.Extension.ToLower()) -and
        ($_.FullName -notmatch "\\node_modules\\") -and
        ($_.FullName -notmatch "\\dist\\") -and
        ($_.FullName -notmatch "\\.git\\")
    }

$count = 0

foreach ($file in $files) {

    try {

        $bytes = [System.IO.File]::ReadAllBytes($file.FullName)

        if ($bytes.Length -ge 3 -and
            $bytes[0] -eq 0xEF -and
            $bytes[1] -eq 0xBB -and
            $bytes[2] -eq 0xBF) {

            $text = [System.Text.Encoding]::UTF8.GetString(
                $bytes,
                3,
                $bytes.Length - 3
            )

        } else {

            $text = [System.Text.Encoding]::UTF8.GetString($bytes)

        }

        # Detect common mojibake without placing those
        # characters directly inside this PowerShell file.

        $bad1 = [System.Text.Encoding]::UTF8.GetString(
            [System.Text.Encoding]::Default.GetBytes("Ã¡")
        )

        $bad2 = [System.Text.Encoding]::UTF8.GetString(
            [System.Text.Encoding]::Default.GetBytes("Ã©")
        )

        $bad3 = [System.Text.Encoding]::UTF8.GetString(
            [System.Text.Encoding]::Default.GetBytes("Ã­")
        )

        $bad4 = [System.Text.Encoding]::UTF8.GetString(
            [System.Text.Encoding]::Default.GetBytes("Ã³")
        )

        $bad5 = [System.Text.Encoding]::UTF8.GetString(
            [System.Text.Encoding]::Default.GetBytes("Ãº")
        )

        $bad6 = [System.Text.Encoding]::UTF8.GetString(
            [System.Text.Encoding]::Default.GetBytes("Ã±")
        )

        $text = $text.Replace($bad1, [char]0x00E1)
        $text = $text.Replace($bad2, [char]0x00E9)
        $text = $text.Replace($bad3, [char]0x00ED)
        $text = $text.Replace($bad4, [char]0x00F3)
        $text = $text.Replace($bad5, [char]0x00FA)
        $text = $text.Replace($bad6, [char]0x00F1)

        [System.IO.File]::WriteAllText(
            $file.FullName,
            $text,
            $utf8
        )

        $count++

    } catch {

        Write-Host "ERROR: $($file.FullName)" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red

    }
}

Write-Host ""
Write-Host "Files processed: $count" -ForegroundColor Green

# ============================================================
# INDEX.HTML
# ============================================================

$index = Join-Path $root "index.html"

if (Test-Path $index) {

    $html = [System.IO.File]::ReadAllText(
        $index,
        [System.Text.Encoding]::UTF8
    )

    # Remove existing icon declarations.
    $html = [regex]::Replace(
        $html,
        '<link[^>]+rel=["''](?:icon|shortcut icon|apple-touch-icon)["''][^>]*>',
        '',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    $icons = @"
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/x-icon" href="/icons.ico" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
"@

    $html = $html.Replace(
        '    <meta name="viewport"',
        $icons + '    <meta name="viewport"'
    )

    [System.IO.File]::WriteAllText(
        $index,
        $html,
        $utf8
    )

    Write-Host "index.html OK" -ForegroundColor Green

}

# ============================================================
# PUBLIC FILES
# ============================================================

Write-Host ""
Write-Host "Public branding files:"
Write-Host ""

$publicFiles = @(
    "favicon.svg",
    "icons.svg",
    "icons.ico"
)

foreach ($name in $publicFiles) {

    $path = Join-Path $root "public\$name"

    if (Test-Path $path) {

        $size = (Get-Item $path).Length

        Write-Host "OK   /$name   $size bytes" -ForegroundColor Green

    } else {

        Write-Host "MISSING   /$name" -ForegroundColor Red

    }

}

# ============================================================
# BRANDING FILES
# ============================================================

Write-Host ""
Write-Host "Application branding:"
Write-Host ""

$branding = @(
    "src\assets\branding\chloe-logo.png",
    "src\assets\branding\chloe-login-bg.jpg"
)

foreach ($name in $branding) {

    $path = Join-Path $root $name

    if (Test-Path $path) {

        $size = (Get-Item $path).Length

        Write-Host "OK   $name   $size bytes" -ForegroundColor Green

    } else {

        Write-Host "MISSING   $name" -ForegroundColor Red

    }

}

Write-Host ""
Write-Host "========================================"
Write-Host " DONE"
Write-Host "========================================"
Write-Host ""
