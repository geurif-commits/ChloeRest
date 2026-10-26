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

LOCAL_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def _leer_pass_desde_env_local():
    """Fallback: DEPLOY_PASS desde .env del proyecto (gitignored) si no hay variable de entorno."""
    env_path = os.path.join(LOCAL_ROOT, '.env')
    if not os.path.exists(env_path):
        return ''
    try:
        with open(env_path, encoding='utf-8') as fh:
            for linea in fh:
                linea = linea.strip()
                if linea.startswith('DEPLOY_PASS='):
                    valor = linea.split('=', 1)[1].strip()
                    return valor.strip('"').strip("'")
    except OSError:
        return ''
    return ''


def _obtener_pass():
    return os.environ.get('DEPLOY_PASS') or _leer_pass_desde_env_local()


HOST = os.environ.get('DEPLOY_HOST', '104.207.79.62')
PORT = int(os.environ.get('DEPLOY_PORT', '21098'))
USER = os.environ.get('DEPLOY_USER', 'chloerest')
PASS = _obtener_pass()
REMOTE_APP_DIR = '/home/chloerest/chloerest'

# Item 11: autenticación por llave SSH (preferida). Fallback a password.
DEPLOY_KEY = os.environ.get('DEPLOY_KEY') or os.path.join(os.path.expanduser('~'), '.ssh', 'chloerest_deploy')


def _conectar_ssh():
    """Conecta por llave Ed25519 si existe; si no, cae a password (DEPLOY_PASS)."""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if os.path.exists(DEPLOY_KEY):
        try:
            pkey = paramiko.Ed25519Key.from_private_key_file(DEPLOY_KEY)
            ssh.connect(HOST, port=PORT, username=USER, pkey=pkey, timeout=20)
            print(f"  Conectado con llave SSH: {DEPLOY_KEY}")
            return ssh
        except Exception as e:
            print(f"  Aviso: llave SSH falló ({e}); usando password.")
    ssh.connect(HOST, port=PORT, username=USER, password=PASS, timeout=20)
    print("  Conectado con password (migrar a llave SSH).")
    return ssh

LOCAL_FRONTEND_DIST = os.path.join(LOCAL_ROOT, 'frontend-restaurante', 'dist')
TAR_PATH = os.path.join(LOCAL_ROOT, 'dist.tar.gz')

BACKEND_FILES = [
    'package.json',
]

# Backend compilado (TypeScript → dist/). Se sube completo porque dist/server.js
# importa módulos relativos (app.js, lib/, db/, routers/, services/).
DIST_DIR = os.path.join(LOCAL_ROOT, 'dist')

def sftp_mkdir_p(sftp, remote_dir):
    """Crea la cadena de directorios remota sin fallar si ya existe."""
    parts = remote_dir.replace('\\', '/').split('/')
    current = ''
    for part in parts:
        if not part:
            continue
        current = current + '/' + part if current else '/' + part
        try:
            sftp.stat(current)
        except IOError:
            sftp.mkdir(current)

def sftp_rmtree(sftp, remote_dir):
    """Borra un directorio remoto completo usando solo SFTP (cuando la cuenta no tiene shell)."""
    import stat as _stat
    try:
        items = sftp.listdir_attr(remote_dir)
    except IOError:
        return
    for it in items:
        path = f"{remote_dir}/{it.filename}"
        if _stat.S_ISDIR(it.st_mode):
            sftp_rmtree(sftp, path)
        else:
            sftp.remove(path)
    sftp.rmdir(remote_dir)


def sftp_upload_tree(sftp, local_dir, remote_dir):
    """Sube un directorio completo archivo por archivo (reemplaza al tar + extracción remota)."""
    count = 0
    for root, dirs, files in os.walk(local_dir):
        rel = os.path.relpath(root, local_dir).replace('\\', '/')
        target = remote_dir if rel == '.' else f"{remote_dir}/{rel}"
        sftp_mkdir_p(sftp, target)
        for file in files:
            sftp.put(os.path.join(root, file), f"{target}/{file}")
            count += 1
    return count


def tiene_shell(ssh):
    """True si la cuenta permite ejecutar comandos. En hostings con 'Shell access is not enabled' solo funciona SFTP."""
    try:
        _, out, err = ssh.exec_command('echo shell-ok', timeout=15)
        return 'shell-ok' in out.read().decode('utf-8', errors='replace')
    except Exception:
        return False


def build_and_pack():
    print("[1] Compilando Frontend...")
    frontend_dir = os.path.join(LOCAL_ROOT, 'frontend-restaurante')
    res = subprocess.run(['npm', 'run', 'build'], cwd=frontend_dir, shell=True)
    if res.returncode != 0:
        print("ERROR: Error de compilación Vite.")
        sys.exit(1)

    print("[1b] Compilando Backend TypeScript (tsc incremental)...")
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

    if not PASS and not os.path.exists(DEPLOY_KEY):
        print("ERROR: ni llave SSH (DEPLOY_KEY) ni DEPLOY_PASS configurados.")
        print("Configura una credencial antes de desplegar (no se permite hardcodear).")
        sys.exit(1)

    build_and_pack()

    print(f"\n[3] Conectando a {HOST}:{PORT}...")
    ssh = _conectar_ssh()
    sftp = ssh.open_sftp()
    shell = tiene_shell(ssh)
    if not shell:
        print("  AVISO: la cuenta no tiene shell habilitado; se despliega solo por SFTP "
              "(sin extraer paquetes ni limpiar el backend legacy en el servidor).")

    print("\n[3] Subiendo Backend (dist/ compilado) y Paquete Frontend...")
    for bf in BACKEND_FILES:
        lp = os.path.join(LOCAL_ROOT, bf)
        if os.path.exists(lp):
            sftp.put(lp, f"{REMOTE_APP_DIR}/{bf}")
            print(f"  {bf}")

    # Subir dist/ completo (backend TypeScript compilado)
    for root, dirs, files in os.walk(DIST_DIR):
        for file in files:
            full_p = os.path.join(root, file)
            rel_p = os.path.relpath(full_p, DIST_DIR).replace('\\', '/')
            remote_dir = f"{REMOTE_APP_DIR}/dist/{os.path.dirname(rel_p)}"
            sftp_mkdir_p(sftp, remote_dir)
            sftp.put(full_p, f"{REMOTE_APP_DIR}/dist/{rel_p}")
    print("  dist/ (Backend TypeScript compilado)")

    if shell:
        sftp.put(TAR_PATH, f"{REMOTE_APP_DIR}/dist.tar.gz")
        print("  dist.tar.gz (Paquete completo de Frontend)")

    if shell:
        print("\n[4] Extrayendo archivos en producción...")
        cmd = (
            f"mkdir -p {REMOTE_APP_DIR}/public && "
            f"rm -rf {REMOTE_APP_DIR}/public/assets && "
            f"tar -xzf {REMOTE_APP_DIR}/dist.tar.gz -C {REMOTE_APP_DIR}/public/ && "
            f"rm -f {REMOTE_APP_DIR}/dist.tar.gz && "
            f"mkdir -p {REMOTE_APP_DIR}/tmp && "
            f"touch {REMOTE_APP_DIR}/tmp/restart.txt && "
            # Corte defensivo: solo se borra el backend legacy si el .htaccess del
            # hosting ya apunta a dist/server.js. Si no, se conserva (el deploy
            # queda en el estado anterior, sin caída) y se avisa.
            f"if grep -qs 'dist/server\\.js' /home/{USER}/public_html/.htaccess 2>/dev/null || "
            f"grep -qs 'dist/server\\.js' {REMOTE_APP_DIR}/.htaccess 2>/dev/null || "
            f"grep -qs 'dist/server\\.js' /home/{USER}/.htaccess 2>/dev/null; then "
            f"rm -f {REMOTE_APP_DIR}/server.js {REMOTE_APP_DIR}/auth.js {REMOTE_APP_DIR}/db.js "
            f"{REMOTE_APP_DIR}/config.js {REMOTE_APP_DIR}/migrations.js {REMOTE_APP_DIR}/telegramBot.js "
            f"{REMOTE_APP_DIR}/audit.js {REMOTE_APP_DIR}/index.js {REMOTE_APP_DIR}/smoke.js && "
            f"rm -rf {REMOTE_APP_DIR}/routes {REMOTE_APP_DIR}/lib && "
            f"echo 'LEGACY_REMOVED: .htaccess apunta a dist/server.js'; "
            f"else "
            f"mv -f {REMOTE_APP_DIR}/server.js {REMOTE_APP_DIR}/server.js.legacy.bak 2>/dev/null; "
            f"echo 'AVISO: el .htaccess del hosting NO apunta a dist/server.js. "
            f"El backend legacy se conserva (produccion intacta). "
            f"Actualiza el .htaccess (PassengerStartupFile dist/server.js) y vuelve a ejecutar deploy.py.'; "
            f"fi && "
            f"pkill -9 -u {USER} node || true"
        )
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        print(out.strip())
        if err.strip():
            print("stderr:", err.strip())
        print("Extracción y reinicio de Node completados.")

    else:
        print("\n[4] Publicando el frontend por SFTP...")
        public_dir = f"{REMOTE_APP_DIR}/public"
        sftp_mkdir_p(sftp, public_dir)
        sftp_rmtree(sftp, f"{public_dir}/assets")
        n = sftp_upload_tree(sftp, LOCAL_FRONTEND_DIST, public_dir)
        print(f"  {n} archivos del frontend publicados.")
        # Passenger reinicia la app cuando cambia la fecha de tmp/restart.txt.
        sftp_mkdir_p(sftp, f"{REMOTE_APP_DIR}/tmp")
        with sftp.open(f"{REMOTE_APP_DIR}/tmp/restart.txt", 'w') as fh:
            fh.write(time.strftime('%Y-%m-%d %H:%M:%S'))
        print("  Reinicio solicitado (tmp/restart.txt).")
    sftp.close()

    if os.path.exists(TAR_PATH):
        os.remove(TAR_PATH)

    print("\n[5] Verificando disponibilidad...")
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

    print("\n[6] Verificación posterior (solo lectura)...")
    verif = subprocess.run(['node', os.path.join('scripts', 'verify-deploy.mjs'), 'https://chloerestaurant.lat'], cwd=LOCAL_ROOT)
    if verif.returncode != 0:
        print("AVISO: la verificación reportó diferencias. Si la migración no está al día, "
              "ejecuta 'npm run migrate' con el rol DDL (docs/OPERACION.md sección 2).")

    ssh.close()
    dur = time.time() - start
    print(f"\n¡Despliegue atómico finalizado con éxito en {dur:.1f} segundos!")
    print("=" * 60)

if __name__ == '__main__':
    deploy()