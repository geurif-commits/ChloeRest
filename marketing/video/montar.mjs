/**
 * Monta el video final a partir de salida/borrador.mp4 y salida/marcas.json:
 *  - velocidad por escena (los tramos de escritura y de espera se aceleran un poco),
 *  - música ambiental generada con ffmpeg (acordes suaves, sin derechos de autor),
 *  - fundido final.
 *   node montar.mjs [--salida=ruta.mp4] [--sin-musica]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { carpeta } from './lib.mjs';
import { expresionMusica } from './musica.mjs';

const SALIDA = carpeta('salida');
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split('=')[1];
const DESTINO = arg('salida', path.join(SALIDA, 'comercial.mp4'));
const SIN_MUSICA = process.argv.includes('--sin-musica');

// factor de velocidad por número de escena (ver README); lo que no está aquí va a 1
const VELOCIDAD = {
  3: 1.2, 4: 1.2, 5: 1.15, 6: 1.25, 7: 1.25, 8: 1.45, 10: 1.2, 11: 1.15, 13: 1.1, 14: 1.2, 15: 1.1, 16: 1.25,
};

const { inicioVideo, marcas } = JSON.parse(fs.readFileSync(path.join(SALIDA, 'marcas.json'), 'utf8'));
const segmentos = marcas.map((m, i) => ({
  n: m.n,
  a: Math.max(0, m.inicio - inicioVideo),
  b: (i + 1 < marcas.length ? marcas[i + 1].inicio : m.fin + 0.4) - inicioVideo,
  f: VELOCIDAD[m.n] ?? 1,
}));
const total = segmentos.reduce((s, x) => s + (x.b - x.a) / x.f, 0);

const video = segmentos.map((s, i) => `[0:v]trim=start=${s.a.toFixed(3)}:end=${s.b.toFixed(3)},setpts=(PTS-STARTPTS)/${s.f},fps=30[v${i}]`).join(';\n');
const union = `${segmentos.map((_, i) => `[v${i}]`).join('')}concat=n=${segmentos.length}:v=1:a=0[vc]`;
const fundidoFinal = `[vc]fade=t=out:st=${(total - 1.4).toFixed(2)}:d=1.4,format=yuv420p[vf]`;
const audio = SIN_MUSICA
  ? ''
  : `;\naevalsrc='${expresionMusica(0)}|${expresionMusica(0.35)}':s=44100:d=${(total + 1).toFixed(2)},lowpass=f=2200,aecho=0.8:0.6:70|140:0.3|0.2,volume=0.85,afade=t=in:d=2.5,afade=t=out:st=${(total - 3.5).toFixed(2)}:d=3.5[a]`;

const script = `${video};\n${union};\n${fundidoFinal}${audio}`;
const archivoScript = path.join(os.tmpdir(), 'chloe-montaje.txt');
fs.writeFileSync(archivoScript, script);

const args = ['-y', '-loglevel', 'error', '-stats', '-i', path.join(SALIDA, 'borrador.mp4'), '-/filter_complex', archivoScript, '-map', '[vf]'];
if (!SIN_MUSICA) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '192k');
args.push('-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', '-t', total.toFixed(2), DESTINO);
console.log(`Montando ${segmentos.length} escenas → ${total.toFixed(1)} s (${(total / 60).toFixed(1)} min)${SIN_MUSICA ? ' sin música' : ' con música'}…`);
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (r.status !== 0) { console.error('ffmpeg falló'); process.exit(1); }
console.log('Listo:', DESTINO, `(${(fs.statSync(DESTINO).size / 1048576).toFixed(1)} MB)`);
