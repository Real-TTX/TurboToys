#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Draws the PNG icons of TurboToys from the SVG logo (scripts/logo.js writes them) with Edge headless: the PWA icons (192, 512, maskable 512),
    the apple-touch-icon (180), the favicon (32), docs/logo/turbotoys-mark-512.png, the hero picture (wwwroot/img/hero.png, 1200 x 630)
    and the Windows icon of the app (src/TurboToys.App/turbotoys.ico: 16, 24 and 32 px from the favicon, 48 to 256 px from the mark, PNG in ICO).
.EXAMPLE
    node scripts/logo.js; ./scripts/icons.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logo = Join-Path $root 'src/TurboToys.Module/wwwroot/img/logo'
$img = Join-Path $root 'src/TurboToys.Module/wwwroot/img'
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge was not found.' }

$work = Join-Path ([IO.Path]::GetTempPath()) "turbotoys-icons-$([guid]::NewGuid().ToString('n'))"
New-Item -ItemType Directory -Force $work | Out-Null

function Draw([string]$svg, [int]$width, [string]$target, [int]$height = $width) {
    # an html page that shows the svg at exactly the size of the window, without a margin
    $html = Join-Path $work "icon-$width-$height.html"
    $source = Get-Content -Raw -Encoding utf8 (Join-Path $logo $svg)
    Set-Content -Encoding utf8 $html "<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block;width:${width}px;height:${height}px}</style></head><body>$source</body></html>"
    if (Test-Path $target) { Remove-Item -Force $target }
    # a profile of its own per picture; Edge headless sometimes stays alive after the screenshot, so it is stopped once the file is there
    $profile = Join-Path $work "edge-$width-$height"
    $arguments = "--headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --default-background-color=00000000 " +
        "`"--user-data-dir=$profile`" --window-size=$width,$height `"--screenshot=$target`" `"file:///$($html -replace '\\','/')`""
    $process = Start-Process -FilePath $edge -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $deadline = (Get-Date).AddSeconds(30)
    while (-not (Test-Path $target) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
    if (-not $process.WaitForExit(5000)) {
        Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$profile*" } |
            ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
    }
    if (-not (Test-Path $target)) { throw "Edge did not draw $target" }
    Write-Host "drew $target"
}

# an .ico with PNG images (Windows Vista and later): the header, one directory entry per image, then the PNG files
function Write-Ico([string[]]$pngs, [int[]]$sizes, [string]$target) {
    $images = @($pngs | ForEach-Object { , [IO.File]::ReadAllBytes($_) })
    $stream = [IO.File]::Create($target)
    $writer = New-Object IO.BinaryWriter($stream)
    try {
        $writer.Write([uint16]0)              # reserved
        $writer.Write([uint16]1)              # type: icon
        $writer.Write([uint16]$images.Count)
        $offset = 6 + 16 * $images.Count
        for ($i = 0; $i -lt $images.Count; $i++) {
            $size = $sizes[$i]
            $byte = if ($size -ge 256) { 0 } else { $size } # 0 means 256
            $writer.Write([byte]$byte)            # width
            $writer.Write([byte]$byte)            # height
            $writer.Write([byte]0)                # colours in the palette (none)
            $writer.Write([byte]0)                # reserved
            $writer.Write([uint16]1)              # colour planes
            $writer.Write([uint16]32)             # bits per pixel
            $writer.Write([uint32]$images[$i].Length)
            $writer.Write([uint32]$offset)
            $offset += $images[$i].Length
        }
        foreach ($image in $images) { $writer.Write($image) }
    }
    finally {
        $writer.Dispose()
    }
    Write-Host "wrote $target"
}

try {
    Draw 'turbotoys-mark.svg' 192 (Join-Path $img 'icon-192.png')
    Draw 'turbotoys-mark.svg' 512 (Join-Path $img 'icon-512.png')
    Draw 'turbotoys-maskable.svg' 512 (Join-Path $img 'icon-maskable-512.png')
    Draw 'turbotoys-maskable.svg' 180 (Join-Path $img 'apple-touch-icon.png')
    Draw 'turbotoys-favicon.svg' 32 (Join-Path $img 'favicon-32.png')
    Draw 'turbotoys-hero.svg' 1200 (Join-Path $img 'hero.png') 630
    New-Item -ItemType Directory -Force (Join-Path $root 'docs/logo') | Out-Null
    Copy-Item (Join-Path $img 'icon-512.png') (Join-Path $root 'docs/logo/turbotoys-mark-512.png') -Force

    # the Windows icon: the small sizes from the favicon (thicker lines), the large ones from the mark
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $pngs = foreach ($size in $sizes) {
        $svg = if ($size -le 32) { 'turbotoys-favicon.svg' } else { 'turbotoys-mark.svg' }
        $png = Join-Path $work "ico-$size.png"
        Draw $svg $size $png | Out-Null
        $png
    }
    $app = Join-Path $root 'src/TurboToys.App'
    New-Item -ItemType Directory -Force $app | Out-Null
    Write-Ico $pngs $sizes (Join-Path $app 'turbotoys.ico')
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
