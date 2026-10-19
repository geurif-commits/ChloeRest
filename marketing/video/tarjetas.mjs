/**
 * Tarjetas de apertura y cierre del video (HTML animado con CSS): sello premium, nombre, lema y dominio.
 * Las fuentes de marca se incrustan en base64 para que la página no dependa de ningún servidor.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const b64 = (rel) => fs.readFileSync(path.join(RAIZ, rel)).toString('base64');
const SELLO = () => fs.readFileSync(path.join(RAIZ, 'branding', 'logos', 'isotipo-dorado.svg'), 'utf8').replace(/<svg /, '<svg class="sello" ');

const BASE_CSS = () => `
@font-face{font-family:'Fraunces';src:url(data:font/woff2;base64,${b64('assets/fraunces.woff2')}) format('woff2');font-weight:100 900}
@font-face{font-family:'Inter';src:url(data:font/woff2;base64,${b64('assets/inter.woff2')}) format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0}
html,body{width:100%;height:100%;overflow:hidden;background:#050A14}
body{display:grid;place-items:center;font-family:'Inter',sans-serif;color:#fff;
  background:radial-gradient(1200px 800px at 50% 42%,#142645 0%,#091226 55%,#04070F 100%)}
.aros{position:absolute;inset:0;pointer-events:none}
.aros i{position:absolute;left:50%;top:44%;border-radius:50%;border:1.5px solid rgba(245,184,61,.16);transform:translate(-50%,-50%) scale(.6);opacity:0;animation:aro 5s ease-out infinite}
.aros i:nth-child(1){width:560px;height:560px;animation-delay:0s}.aros i:nth-child(2){width:860px;height:860px;animation-delay:1.2s}
.aros i:nth-child(3){width:1180px;height:1180px;animation-delay:2.4s}.aros i:nth-child(4){width:1560px;height:1560px;animation-delay:3.6s}
@keyframes aro{0%{opacity:0;transform:translate(-50%,-50%) scale(.6)}25%{opacity:1}100%{opacity:0;transform:translate(-50%,-50%) scale(1.08)}}
.escena{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center}
.sello{width:430px;height:430px;filter:drop-shadow(0 0 60px rgba(245,184,61,.42));opacity:0;transform:scale(.55) rotate(-8deg);animation:sello 1.5s cubic-bezier(.2,.9,.25,1.1) .15s forwards}
@keyframes sello{to{opacity:1;transform:none}}
h1{margin-top:6px;font-family:'Fraunces',serif;font-weight:800;font-size:132px;letter-spacing:-3px;line-height:1;opacity:0;transform:translateY(26px);animation:sube .9s ease-out .9s forwards}
h1 b{background:linear-gradient(180deg,#FFE9A6,#E19A14 62%,#8E5300);-webkit-background-clip:text;color:transparent}
.desc{margin-top:14px;font-weight:600;font-size:25px;letter-spacing:.62em;color:#FFE9A6;opacity:0;animation:sube .9s ease-out 1.3s forwards}
.lema{margin-top:46px;font-family:'Fraunces',serif;font-weight:700;font-size:62px;opacity:0;animation:sube .9s ease-out 1.8s forwards}
.lema b{font-weight:800;background:linear-gradient(180deg,#FFE9A6,#E19A14 70%,#8E5300);-webkit-background-clip:text;color:transparent}
.sub{margin-top:16px;font-size:27px;color:#B7C4DC;letter-spacing:.3px;opacity:0;animation:sube .9s ease-out 2.3s forwards}
.chips{display:flex;gap:16px;margin-top:34px;opacity:0;animation:sube .9s ease-out 2.7s forwards}
.chips span{padding:12px 26px;border-radius:99px;font-weight:700;font-size:19px;letter-spacing:.14em;color:#FFE9A6;background:rgba(245,184,61,.1);border:1.5px solid rgba(245,184,61,.5)}
.dom{margin-top:40px;font-weight:800;font-size:38px;letter-spacing:.06em;color:#F5B83D;opacity:0;animation:sube .9s ease-out 3.1s forwards}
@keyframes sube{to{opacity:1;transform:none}}
.brillo{position:absolute;left:50%;top:44%;width:560px;height:560px;margin:-280px 0 0 -280px;border-radius:50%;pointer-events:none;
  background:conic-gradient(from 0deg,transparent 0 62%,rgba(255,233,166,.28) 70%,transparent 78% 100%);mix-blend-mode:screen;filter:blur(8px);
  opacity:0;animation:gira 3.4s linear 1.2s infinite,aparece .8s ease-out 1.2s forwards}
@keyframes gira{to{transform:rotate(360deg)}}@keyframes aparece{to{opacity:.9}}
`;

export function htmlIntro() {
  return `<!doctype html><meta charset="utf-8"><title>Intro</title><style>${BASE_CSS()}
  .escena{margin-top:-30px}.sello{width:380px;height:380px}</style>
  <div class="aros"><i></i><i></i><i></i><i></i></div>
  <div class="escena"><div class="brillo"></div>${SELLO()}
    <h1>Chloe<b>Rest</b></h1><div class="desc">RESTAURANT SYSTEM</div>
    <div class="lema">Gestiona. Vende. <b>Crece.</b></div></div>`;
}

export function htmlCierre() {
  return `<!doctype html><meta charset="utf-8"><title>Cierre</title><style>${BASE_CSS()}
  .sello{width:300px;height:300px}h1{font-size:104px}.lema{margin-top:30px;font-size:52px}.sub{margin-top:10px}</style>
  <div class="aros"><i></i><i></i><i></i><i></i></div>
  <div class="escena">${SELLO()}
    <h1>Chloe<b>Rest</b></h1>
    <div class="lema">Tu restaurante, <b>bajo control</b></div>
    <div class="sub">Mesas · Cocina y Bar · Caja · Facturación DGII · Inventario</div>
    <div class="chips"><span>PRUÉBALO HOY</span><span>SIN PAPEL</span><span>EN TIEMPO REAL</span></div>
    <div class="dom">chloerestaurant.lat</div></div>`;
}
