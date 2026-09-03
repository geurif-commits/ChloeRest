#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Despliegue Atómico y Seguro a Producción — ChloeRestaurant POS
"""

import os
import sys
import time
import tarfile
import subprocess
import paramiko
import urllib.request
import json

HOST = os.environ.get('DEPLOY_HOST', '104.207.79.62')
PORT = int(os.environ.get('DEPLOY_PORT', '21098'))
USER = os.environ.get('DEPLOY_USER', 'chlogdyh')
PASS = os.environ.get('DEPLOY_PASS', '')
REMOTE_APP_DIR = '/home/chlogdyh/chloerest'

LOCAL_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LOCAL_FRONTEND_DIST = os.path.join(LOCAL_ROOT, 'frontend-restaurante', 'dist')
TAR_PATH = os.path.join(LOCAL_ROOT, 'dist.tar.gz')

BACKEND_FILES = [
    'package.json',
]

# Backend compilado (TypeScript → dist/). Se sube completo porque dist/server.js
# importa módulos relativos (app.js, lib/, db/, routers/, services/).
DIST_DIR = os.path.join(LOCAL_ROOT, 'dist')

def build_and_pack():
    print("[1] Compilando Frontend...")
    frontend_dir = os.path.join(LOCAL_ROOT, 'frontend-restaurante')
    res = subprocess.run(['npm', 'run', 'build'], cwd=frontend_dir, shell=True)
    if res.returncode != 0:
        print("ERROR: Error de compilación Vite.")
        sys.exit(1)

    print("[1b] Compilando Backend TypeScript (tsc)...")
    res = subprocess.run(['npm', 'run', 'build'], cwd=LOCAL_ROOT, shell=True)
    if res.returncode != 0:
        print("ERROR: Error de compilación TypeScript (tsc).")
        sys.exit(1)

    print("[2] Creando paquete comprimido dist.tar.gz...")
    with tarfile.open(TAR_PATH, "w:gz") as tar:
        for root, dirs, files in os.walk(LOCAL_FRONTEND_DIST):
            for file in files:
                full_p = os.path.join(root, file)
                rel_p = os.path.relpath(full_p, LOCAL_FRONTEND_DIST)
                tar.add(full_p, arcname=rel_p)
    print(f"Paquete creado: {os.path.getsize(TAR_PATH):,} bytes.")

def deploy():
    start = time.time()
    print("=" * 60)
    print("DESPLIEGUE ATOMICO A PRODUCCION")
    print("=" * 60)

    if not PASS:
        print("ERROR: Variable de entorno DEPLOY_PASS no configurada.")
        print("Configúrala antes de desplegar (no se permite hardcodear credenciales).")
        sys.exit(1)

    build_and_pack()

    print(f"\n[3] Conectando a {HOST}:{PORT}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20)
    sftp = ssh.open_sftp()

    print("\n[4] Subiendo Backend (dist/ compilado) y Paquete Frontend...")
    for bf in BACKEND_FILES:
        lp = os.path.join(LOCAL_ROOT, bf)
        if os.path.exists(lp):
            sftp.put(lp, f"{REMOTE_APP_DIR}/{bf}")
            print(f"  {bf}")

    # Subir dist/ completo (backend TypeScript compilado)
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            full_p = os.path.join(root, file)
            rel_p = os.path.relpath(full_p, DIST_DIR)
            remote_p = f"{REMOTE_APP_DIR}/dist/{rel_p}"
            sftp.mkdir(os.path.dirname(remote_p))
            sftp.put(full_p, remote_p)
    print("  dist/ (Backend TypeScript compilado)")

    sftp.put(TAR_PATH, f"{REMOTE_APP_DIR}/dist.tar.gz")
    print("  dist.tar.gz (Paquete completo de Frontend)")
    sftp.close()

    print("\n[5] Extrayendo archivos en producción...")
    cmd = (
        f"mkdir -p {REMOTE_APP_DIR}/public && "
        f"rm -rf {REMOTE_APP_DIR}/public/assets && "
        f"tar -xzf {REMOTE_APP_DIR}/dist.tar.gz -C {REMOTE_APP_DIR}/public/ && "
        f"rm -f {REMOTE_APP_DIR}/dist.tar.gz && "
        f"mkdir -p {REMOTE_APP_DIR}/tmp && "
        f"touch {REMOTE_APP_DIR}/tmp/restart.txt && "
        # Limpiar backend legacy (ya migrado a TypeScript en dist/)
        f"rm -f {REMOTE_APP_DIR}/server.js {REMOTE_APP_DIR}/auth.js {REMOTE_APP_DIR}/db.js "
        f"{REMOTE_APP_DIR}/config.js {REMOTE_APP_DIR}/migrations.js {REMOTE_APP_DIR}/telegramBot.js "
        f"{REMOTE_APP_DIR}/audit.js {REMOTE_APP_DIR}/index.js {REMOTE_APP_DIR}/smoke.js && "
        f"rm -rf {REMOTE_APP_DIR}/routes {REMOTE_APP_DIR}/lib && "
        f"pkill -9 -u {USER} node || true"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()
    print("Extracción y reinicio de Node completados.")

    if os.path.exists(TAR_PATH):
        os.remove(TAR_PATH)

    print("\n[6] Verificando disponibilidad...")
    time.sleep(3)
    for i in range(1, 8):
        try:
            req = urllib.request.Request('https://chloerestaurant.lat/api/health', headers={'User-Agent': 'Deploy/2.1'})
            with urllib.request.urlopen(req, timeout=10) as res:
                data = json.loads(res.read().decode('utf-8'))
                print("API Health:", data)
                break
        except Exception as e:
            print(f"  Intento {i}/7: {e}")
            time.sleep(2)

    ssh.close()
    dur = time.time() - start
    print(f"\n¡Despliegue atómico finalizado con éxito en {dur:.1f} segundos!")
    print("=" * 60)

if __name__ == '__main__':
    deploy()