# Copias de eventos desde el PC (tarea programada "WhenGacha snapshots")

Algunas fuentes bloquean la IP del servidor de Botkeep (centro de datos), pero aceptan una IP doméstica:

- **BrownDust2** (`webapi.browndust2.com`): responde `403` al servidor.
- **Game8** (CZN y NTE): responde `202`, un desafío anti-bots de AWS WAF (CloudFront). No se intenta resolver.

La solución es generar las copias de todos los juegos **desde el PC** y publicarlas en la rama `data` del repositorio. El servidor revisa esa rama cada 20 minutos
y adopta las copias más recientes que las suyas (si tienen menos de 48 h). No hace falta redesplegar.

El script es `scripts/run-snapshot.ps1` (ejecuta `node scripts/snapshot.mjs --publish`). Lee el token y los canales de Discord de `.env.local`, que **nunca se sube**
al repositorio; sin ellos, las copias saldrían sin los anuncios de Discord.

Todos los comandos son para **PowerShell** y se ejecutan en el PC.

## Crear la tarea (cada 3 horas)

```powershell
schtasks /Create /TN "WhenGacha snapshots" /SC HOURLY /MO 3 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\PC\Documents\Whengacha\app\scripts\run-snapshot.ps1"
```

## Que se ejecute oculta (sin abrir una ventana de PowerShell)

```powershell
$a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Users\PC\Documents\Whengacha\app\scripts\run-snapshot.ps1"'; Set-ScheduledTask -TaskName 'WhenGacha snapshots' -Action $a
```

Puede aparecer un destello de una fracción de segundo al arrancar (limitación de PowerShell).

## Que recupere las ejecuciones perdidas al encender el PC

Si el PC está apagado a la hora programada, la ejecución se pierde. Con esto se ejecuta en cuanto se encienda:

```powershell
$s = (Get-ScheduledTask -TaskName 'WhenGacha snapshots').Settings; $s.StartWhenAvailable = $true; Set-ScheduledTask -TaskName 'WhenGacha snapshots' -Settings $s
```

## Ejecutarla ahora mismo

```powershell
Start-ScheduledTask -TaskName 'WhenGacha snapshots'
```

## Ver su estado (última y próxima ejecución)

```powershell
Get-ScheduledTask -TaskName 'WhenGacha snapshots' | Get-ScheduledTaskInfo | Select-Object LastRunTime, LastTaskResult, NextRunTime
```

`LastTaskResult` = `0` significa que terminó bien; `267011` = todavía no se ha ejecutado nunca.

## Ver qué hizo (últimas líneas del log)

```powershell
Get-Content "C:\Users\PC\Documents\Whengacha\app\.cache\snapshot.log" -Tail 30 -Encoding utf8
```

Cada ejecución lista los juegos con su número de elementos y termina con `publicadas en la rama data`.

## Borrar la tarea

```powershell
Unregister-ScheduledTask -TaskName 'WhenGacha snapshots' -Confirm:$false
```

## Discord: lista de canales

`DISCORD_CHANNELS` debe ser la misma en `.env.local`, en Botkeep y en el secreto de GitHub Actions (el token, `DISCORD_TOKEN`, no se escribe aquí):

```
stellasora:1568334305728659496,bluearchive:1568333566566207658,limbus:1568338884558061578,arknights:1568339330332885184,honkai3:1568351612697575424,azurlane:1568350070858977340,infinitynikki:1568519866464600217,nikke:1569427788492972082,dna:1570290121004294244
```

Al añadir un juego por Discord, se suma `<id del juego>:<id del canal>` al final en los tres sitios. Botkeep solo lee las variables al arrancar (hace falta redesplegar).

## Alternativas al PC

- **Android con Termux**: instalar Node y Git, clonar el repositorio, crear `.env.local` y programar `node scripts/snapshot.mjs --publish` cada pocas horas.
  La IP de datos móviles es de operador y debería pasar los filtros. Hay que excluir Termux de la optimización de batería y guardar en el teléfono un token
  de GitHub para publicar. En iPhone no es práctico (no permite tareas programadas de este tipo).
- **Un dispositivo siempre encendido en casa** (p. ej. una Raspberry Pi): lo mismo que la tarea del PC, sin depender de que el PC esté encendido.
