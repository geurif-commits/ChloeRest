@echo off
REM ============================================================
REM Backup automático diario de PostgreSQL para ChloeRest POS
REM Configurar en Windows Task Scheduler para ejecutar diariamente
REM ============================================================

@echo off
setlocal enabledelayedexpansion

REM === CONFIGURACIÓN ===
set PG_DUMP="C:\Program Files\PostgreSQL\17\bin\pg_dump.exe"
set PG_USER=postgres
set PG_DB=postgres
set BACKUP_DIR=C:\POS_Backups
set RETENCION_DIAS=30

REM === CREAR DIRECTORIO SI NO EXISTE ===
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM === FECHA PARA NOMBRE DE ARCHIVO ===
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set FECHA=!datetime:~0,4!-!datetime:~4,2!-!datetime:~6,2!
set HORA=!datetime:~8,2!-!datetime:~10,2!-!datetime:~12,2!
set ARCHIVO=%BACKUP_DIR%\pos_%FECHA%_%HORA%.backup

REM === EJECUTAR BACKUP ===
echo [%DATE% %TIME%] Iniciando backup de %PG_DB%...
%PG_DUMP% -U %PG_USER% -d %PG_DB% -F c -f "%ARCHIVO%" 2>&1

if %ERRORLEVEL% EQU 0 (
    echo [%DATE% %TIME%] Backup completado: %ARCHIVO%
    
    REM === LIMPIEZA DE BACKUPS ANTIGUOS (más de %RETENCION_DIAS% días) ===
    forfiles /p "%BACKUP_DIR%" /m "pos_*.backup" /d -%RETENCION_DIAS% /c "cmd /c del @path" 2>nul
    echo [%DATE% %TIME%] Limpieza de backups antiguos (>%RETENCION_DIAS% días) completada.
) else (
    echo [%DATE% %TIME%] ERROR: Falló el backup (código %ERRORLEVEL%)
    exit /b 1
)

echo [%DATE% %TIME%] Proceso finalizado correctamente.