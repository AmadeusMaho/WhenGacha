# Registra (o vuelve a registrar) la tarea programada "WhenGacha snapshots": cada 3 h, oculta, y recupera las ejecuciones perdidas con el PC apagado.
# La llama "Instalar recolector.bat" (raíz del repositorio). Ver docs\tarea-copias-pc.md.
param([switch]$RunNow)
$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'run-snapshot.ps1'
$name = 'WhenGacha snapshots'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 3)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Tarea '$name' registrada: cada 3 horas (la primera en 5 minutos)."

if ($RunNow) {
  Start-ScheduledTask -TaskName $name
  Write-Host 'Primera ejecucion lanzada. El resultado queda en .cache\snapshot.log'
}
