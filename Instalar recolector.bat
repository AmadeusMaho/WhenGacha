@echo off
setlocal
chcp 65001 >nul
title Instalar recolector WhenGacha
cd /d "%~dp0"
echo.
echo  Recolector de WhenGacha: genera las copias de los juegos en este PC y las publica en la rama data.
echo  -----------------------------------------------------------------------------------------------
echo.

rem 1) Node.js y Git
where node >nul 2>nul
if errorlevel 1 (
  echo  Falta Node.js. Instalalo con:   winget install OpenJS.NodeJS.LTS
  set FALTA=1
)
where git >nul 2>nul
if errorlevel 1 (
  echo  Falta Git. Instalalo con:       winget install Git.Git
  set FALTA=1
)
if defined FALTA (
  echo.
  echo  Instala lo que falta, cierra esta ventana y vuelve a abrir este archivo.
  pause
  exit /b 1
)

rem 2) Dependencias
if not exist node_modules (
  echo  Instalando dependencias ^(npm install^)...
  call npm install
  if errorlevel 1 ( echo  npm install fallo. & pause & exit /b 1 )
)

rem 3) Token y canales de Discord (nunca se suben al repositorio)
if not exist .env.local (
  echo.
  echo  AVISO: no existe .env.local ^(junto a este archivo^). Sin el, las copias salen sin los anuncios de Discord.
  echo  Copia aqui tu respaldo de .env.local ^(DISCORD_TOKEN=... y DISCORD_CHANNELS=...^) y vuelve a ejecutar este archivo.
  echo.
  choice /c SN /m " Continuar de todos modos"
  if errorlevel 2 exit /b 1
)

rem 4) Permiso para publicar en GitHub (rama data)
git ls-remote origin -h refs/heads/data >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Git no puede leer el repositorio remoto. Inicia sesion en GitHub ^(se abrira el navegador^) y vuelve a ejecutar esto.
  git fetch origin
  pause
  exit /b 1
)

rem 5) Tarea programada (cada 3 h, oculta) y primera ejecucion
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-task.ps1" -RunNow
if errorlevel 1 ( echo  No se pudo registrar la tarea. & pause & exit /b 1 )

echo.
echo  Listo. Para ver que hizo:  Get-Content "%~dp0.cache\snapshot.log" -Tail 30
echo.
pause
