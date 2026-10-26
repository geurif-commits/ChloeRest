/** Música ambiental generada con ffmpeg (sin derechos de autor). */
/** Pad de acordes suaves (Am - F - C - G) con vibrato leve y envolvente por acorde; estéreo con ligera diferencia. */
export function expresionMusica(desfase) {
  const acordes = [
    [110, 164.81, 220, 261.63], // Am
    [87.31, 130.81, 174.61, 220], // F
    [130.81, 196, 261.63, 329.63], // C
    [98, 146.83, 196, 246.94], // G
  ];
  const seg = 12;
  const notas = (fs_) => fs_.map((fr, i) => `${(0.2 / (1 + i * 0.25)).toFixed(3)}*sin(2*PI*${(fr + desfase).toFixed(2)}*t+0.35*sin(2*PI*${(0.18 + i * 0.03).toFixed(2)}*t))`
    + `+${(0.045 / (1 + i * 0.3)).toFixed(3)}*sin(2*PI*${((fr + desfase) * 2).toFixed(2)}*t)`).join('+');
  const k = `mod(floor(t/${seg}),4)`;
  const cuerpo = `if(lt(${k},1),${notas(acordes[0])},if(lt(${k},2),${notas(acordes[1])},if(lt(${k},3),${notas(acordes[2])},${notas(acordes[3])})))`;
  const envolvente = `pow(sin(PI*mod(t,${seg})/${seg}),0.55)`;
  return `${envolvente}*(${cuerpo})`;
}

