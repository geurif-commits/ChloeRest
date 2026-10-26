import { useEffect, useRef } from 'react';
import { Delete, ArrowRight } from 'lucide-react';
import './pinpad.css';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const esCampoEditable = (el) =>
  !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

// Enter sobre un botón o enlace con el foco debe activar ESE control (accesibilidad), no confirmar el PIN.
const esControlActivable = (el) => !!el && typeof el.closest === 'function' && !!el.closest('button, a[href], summary, [role="button"]');

/**
 * Teclado PIN compartido (bloqueo de licencia, acceso del propietario, etc.).
 *  - length: cantidad de indicadores; crece si el PIN excede ese valor.
 *  - onSubmit: si se define, la tecla ➜ llama a onSubmit; con asSubmit se comporta como
 *    botón "submit" de un <form> padre.
 *  - keyboard: acepta el teclado físico (dígitos, Backspace/Delete y Enter para confirmar). Se ignora
 *    mientras se escribe en un campo de texto, con Ctrl/Alt/Meta, y Enter sobre un botón enfocado.
 *  - autoSubmitLength: si es > 0, confirma sola al llegar a esa cantidad exacta de dígitos (solo cuando
 *    la longitud es conocida de antemano; si el usuario elige su propia longitud, déjala en 0).
 */
export default function PinPad({
  value = '',
  length = 6,
  onDigit,
  onDelete,
  onSubmit,
  asSubmit = false,
  submitDisabled = false,
  disabled = false,
  error = '',
  keyboard = true,
  autoSubmitLength = 0,
}) {
  const puntos = Math.max(length, value.length);
  const conSubmit = asSubmit || typeof onSubmit === 'function';
  const botonConfirmar = useRef(null);
  const vivo = useRef({});
  vivo.current = { onDigit, onDelete, disabled };

  useEffect(() => {
    if (!keyboard) return undefined;
    const alTeclear = (evento) => {
      if (evento.defaultPrevented || evento.ctrlKey || evento.altKey || evento.metaKey) return;
      if (esCampoEditable(evento.target)) return;
      const esDigito = /^[0-9]$/.test(evento.key);
      const esBorrar = evento.key === 'Backspace' || evento.key === 'Delete';
      const esEnter = evento.key === 'Enter' && !esControlActivable(evento.target);
      if (!esDigito && !esBorrar && !esEnter) return;
      // preventDefault: evita que el navegador además active el botón que tenga el foco.
      evento.preventDefault();
      const { onDigit: agregar, onDelete: borrar, disabled: bloqueado } = vivo.current;
      if (bloqueado) return;
      if (esDigito) { if (!evento.repeat) agregar?.(evento.key); }
      else if (esBorrar) borrar?.();
      else if (!evento.repeat) botonConfirmar.current?.click(); // un botón deshabilitado no responde al clic
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [keyboard]);

  useEffect(() => {
    if (autoSubmitLength > 0 && value.length === autoSubmitLength && !disabled && !submitDisabled) {
      botonConfirmar.current?.click();
    }
  }, [value, autoSubmitLength, disabled, submitDisabled]);

  // Con el ratón las teclas no toman el foco: si no, Enter volvería a pulsar el último dígito pulsado.
  const sinFoco = (evento) => evento.preventDefault();

  return (
    <div className="pp">
      <div className={`pp__dots ${error ? 'is-error' : ''}`} role="status" aria-label={`${value.length} dígitos ingresados`}>
        {Array.from({ length: puntos }).map((_, i) => (
          <span key={i} className={`pp__dot ${i < value.length ? 'is-on' : ''}`} />
        ))}
      </div>
      <p className="pp__error" role="alert">{error || ' '}</p>

      <div className="pp__grid">
        {TECLAS.map((n) => (
          <button key={n} type="button" className="pp__key" disabled={disabled} onMouseDown={sinFoco} onClick={() => onDigit?.(n)}>{n}</button>
        ))}
        <button type="button" className="pp__key pp__key--ghost" disabled={disabled || value.length === 0} onMouseDown={sinFoco} onClick={() => onDelete?.()} aria-label="Borrar último dígito">
          <Delete size={21} />
        </button>
        <button type="button" className="pp__key" disabled={disabled} onMouseDown={sinFoco} onClick={() => onDigit?.('0')}>0</button>
        {conSubmit ? (
          <button
            ref={botonConfirmar}
            type={asSubmit ? 'submit' : 'button'}
            className="pp__key pp__key--go"
            disabled={disabled || submitDisabled}
            onMouseDown={sinFoco}
            onClick={asSubmit ? undefined : () => onSubmit?.()}
            aria-label="Confirmar PIN"
          >
            <ArrowRight size={22} />
          </button>
        ) : <span />}
      </div>
    </div>
  );
}
