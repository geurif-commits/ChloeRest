@echo off
cd /d "%~dp0"
start cmd /k "node dist/server.js"
cd frontend-restaurante
npm run dev
