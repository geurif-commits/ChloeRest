import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { env } from 'node:process';

const port = Number(env.INTEGRATION_PORT || 3010);
const baseUrl = `http://127.0.0.1:${port}`;
const backend = spawn(process.execPath, ['bundle.cjs'], {
  cwd: process.cwd(),
  env: { ...env, PORT: String(port), NODE_ENV: 'development' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

let output = '';
backend.stdout?.on('data', (chunk) => { output += chunk.toString(); });
backend.stderr?.on('data', (chunk) => { output += chunk.toString(); });

async function stop() {
  if (backend.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(backend.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  } else {
    backend.kill('SIGTERM');
  }
}

try {
  let healthy = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      healthy = response.ok;
      if (healthy) break;
    } catch { /* el backend aún está arrancando */ }
    await delay(500);
  }
  if (!healthy) throw new Error(`backend no alcanzó health en ${baseUrl}\n${output.slice(-4000)}`);

  const smoke = spawn(process.execPath, ['scripts/integration-smoke.mjs'], {
    cwd: process.cwd(),
    env: { ...env, TEST_BASE_URL: baseUrl },
    stdio: 'inherit',
    windowsHide: true,
  });
  const code = await new Promise((resolve) => smoke.on('close', (exitCode) => resolve(exitCode ?? 1)));
  if (code !== 0) process.exitCode = code;
} finally {
  await stop();
}
