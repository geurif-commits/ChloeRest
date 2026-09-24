import { Delete, ArrowRight } from 'lucide-react';
import './pinpad.css';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * Teclado PIN compartido (bloqueo de licencia, acceso del propietario, etc.).
 *  - length: cantidad de indicadores; crece si el PIN excede ese valor.
 *  - onSubmit: si se define, la tecla ➜ llama a onSubmit; con asSubmit se comporta como
 *    botón "submit" de un <form> padre.
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
}) {
  const puntos = Math.max(length, value.length);
  const conSubmit = asSubmit || typeof onSubmit === 'function';

  return (
    <div className="pp">
      <div className={`pp__dots ${error ? 'is-error' : ''}`} role="status" aria-label={`${value.length} dígitos ingresados`}>
        {Array.from({ length: puntos }).map((_, i) => (
          <span key={i} className={`pp__dot ${i < value.length ? 'is-on' : ''}`} />
        ))}
      </div>
      <p className="pp__error" role="alert">{error || ' '}</p>

      <div className="pp__grid">
        {TECLAS.map((n) => (
          <button key={n} type="button" className="pp__key" disabled={disabled} onClick={() => onDigit?.(n)}>{n}</button>
        ))}
        <button type="button" className="pp__key pp__key--ghost" disabled={disabled || value.length === 0} onClick={() => onDelete?.()} aria-label="Borrar último dígito">
          <Delete size={21} />
        </button>
        <button type="button" className="pp__key" disabled={disabled} onClick={() => onDigit?.('0')}>0</button>
        {conSubmit ? (
          <button
            type={asSubmit ? 'submit' : 'button'}
            className="pp__key pp__key--go"
            disabled={disabled || submitDisabled}
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
