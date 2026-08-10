@echo off
setlocal

if not exist "ServidorPOS.exe" (
  echo ERROR: No se encontro ServidorPOS.exe en este directorio.
  pause
  exit /b 1
)

if exist ".env" (
  echo Usando configuracion desde .env en el mismo directorio.
) else (
  if "%APP_SESSION_SECRET%"=="" (
    echo ADVERTENCIA: APP_SESSION_SECRET no definido.
    set /p APP_SESSION_SECRET=Ingresa APP_SESSION_SECRET seguro (o presiona Enter para cancelar): 
    if "%APP_SESSION_SECRET%"=="" (
      echo ERROR: APP_SESSION_SECRET es obligatorio cuando no existe .env.
      pause
      exit /b 1
    )
  )

  if "%DB_PASSWORD%"=="" (
    set /p DB_PASSWORD=Ingresa DB_PASSWORD de PostgreSQL (deja vacio si no aplica): 
  )
)

echo Iniciando ServidorPOS.exe...
ServidorPOS.exe
set "exitCode=%ERRORLEVEL%"
if %exitCode% neq 0 (
  echo.
  echo ServidorPOS.exe termino con codigo %exitCode%.
  pause
)
endlocal
exit /b %exitCode%
