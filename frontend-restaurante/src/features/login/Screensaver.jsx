import { Sparkles } from 'lucide-react';

export const TIPOS_PROTECTOR = [
  { id: 'reloj', nombre: 'Reloj', desc: 'Hora grande y minimalista que se desplaza sola.' },
  { id: 'aurora', nombre: 'Aurora', desc: 'Luces suaves en movimiento con la hora en cristal.' },
  { id: 'marca', nombre: 'Marca', desc: 'Tu logotipo flotando entre anillos animados.' },
];

/** Miniatura de cada protector (solo CSS) para el selector. */
export function VistaPreviaProtector({ tipo }) {
  return (
    <span className={`lg-prev lg-prev--${tipo}`} aria-hidden="true">
      {tipo === 'reloj' && <b>10:24</b>}
      {tipo === 'aurora' && <><i /><i /><i /><b>10:24</b></>}
      {tipo === 'marca' && <><i /><i /><span /></>}
    </span>
  );
}

/**
 * Protector de pantalla. Los colores salen de --brand-ink y --gold, así que respeta el estilo
 * del login y del tema activo. Se cierra al tocar o con cualquier tecla.
 */
export default function Screensaver({ tipo = 'reloj', hora, fecha, logo, nombre, onClose, onLogoError }) {
  return (
    <div className={`lg-saver lg-saver--${tipo}`} onClick={onClose} role="dialog" aria-label="Protector de pantalla">
      {tipo === 'aurora' && (
        <div className="lg-saver__aurora" aria-hidden="true"><i /><i /><i /></div>
      )}
      {tipo === 'marca' && (
        <div className="lg-saver__rings" aria-hidden="true"><i /><i /><i /><i /></div>
      )}

      {tipo === 'reloj' && (
        <div className="lg-saver__drift">
          <p className="lg-saver__time">{hora}</p>
          <p className="lg-saver__date">{fecha}</p>
          <p className="lg-saver__name">{nombre}</p>
        </div>
      )}

      {tipo === 'aurora' && (
        <div className="lg-saver__glass">
          <p className="lg-saver__date">{fecha}</p>
          <p className="lg-saver__time">{hora}</p>
          <p className="lg-saver__name">{nombre}</p>
        </div>
      )}

      {tipo === 'marca' && (
        <div className="lg-saver__brand">
          <span className="lg-saver__logo"><img src={logo} alt={nombre} onError={onLogoError} /></span>
          <p className="lg-saver__name lg-saver__name--big">{nombre}</p>
          <p className="lg-saver__clock-sm">{hora} · {fecha}</p>
        </div>
      )}

      <p className="lg-saver__hint"><Sparkles size={14} />Toca la pantalla o presiona cualquier tecla para continuar</p>
    </div>
  );
}
