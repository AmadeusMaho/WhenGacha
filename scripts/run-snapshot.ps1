# Lo ejecuta la tarea programada "WhenGacha snapshots": genera las copias de los juegos desde este equipo y las publica en la rama `data`.
# El resultado queda en .cache\snapshot.log (se recorta solo). Ver docs\fuentes-y-proxy.md.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
New-Item -ItemType Directory -Force -Path (Join-Path $root '.cache') | Out-Null
$log = Join-Path $root '.cache\snapshot.log'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Program Files\nodejs\node.exe' }

"=== $(Get-Date -Format 's') ===" | Add-Content -Path $log -Encoding utf8
& $node (Join-Path $root 'scripts\snapshot.mjs') --publish 2>&1 | Add-Content -Path $log -Encoding utf8

# Recorta el log para que no crezca sin límite.
$lines = Get-Content -Path $log -Encoding utf8 -ErrorAction SilentlyContinue
if ($lines.Count -gt 600) { $lines | Select-Object -Last 400 | Set-Content -Path $log -Encoding utf8 }
