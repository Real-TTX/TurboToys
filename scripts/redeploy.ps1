#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Rebuilds and starts the local MatGame stack with TurboToys in it (TurboToys is a plugin of MatGame: ../MatGame).
.DESCRIPTION
    Delegates to ../MatGame/scripts/redeploy.ps1, which builds the MatGame image from the sibling repositories (MatGame, BunnyWarfare, KingBee, TurboToys).
    -Clean removes the volumes first (empty database).
.EXAMPLE
    ./scripts/redeploy.ps1
.EXAMPLE
    ./scripts/redeploy.ps1 -Clean
#>
param([switch]$Clean)

$matgame = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'MatGame/scripts/redeploy.ps1'
if (-not (Test-Path $matgame)) {
    throw "MatGame fehlt: TurboToys laeuft als Plugin von MatGame. Bitte https://github.com/Real-TTX/MatGame neben dieses Repository klonen ($matgame)."
}

& $matgame -Clean:$Clean
exit $LASTEXITCODE
