import { Unlock, Banknote, StickyNote } from 'lucide-react';
import { sanitizarDecimal } from '../utils/input.js';
import './caja/caja.css';

// ════════════════════════════════════════════════════════════════════════
// Modal de Apertura de Caja / Fondo Inicial
// ════════════════════════════════════════════════════════════════════════

export default function AperturaModal({
  montoApertura, setMontoApertura,
  notasApertura, setNotasApertura,
  cajaAbierta,
  guardandoApertura,
  onSubmit,
  onClose
}) {
  return (
    <div className="po-modal caja-open" role="dialog" aria-modal="true" aria-labelledby="apertura-title">
      <div className="po-modal__card">
        <div className="caja-open__badge"><Unlock size={28} /></div>
        <span className="px-eyebrow">Turno de caja</span>
        <h3 id="apertura-title">Apertura de caja</h3>
        <p>Indica el efectivo inicial en gaveta para abrir el turno. Podrás corregirlo mientras el turno siga abierto.</p>

        <form onSubmit={onSubmit}>
          <div className="po-field">
            <label htmlFor="apertura-monto"><Banknote size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Fondo inicial (RD$)</label>
            <input
              id="apertura-monto"
              className="po-input po-input--amount"
              type="text"
              inputMode="decimal"
              placeholder="2,000.00"
              value={montoApertura}
              onChange={(e) => setMontoApertura(sanitizarDecimal(e.target.value))}
              required
              autoFocus
            />
          </div>

          <div className="po-field">
            <label htmlFor="apertura-notas"><StickyNote size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />Notas <small style={{ fontWeight: 500, color: 'var(--px-ink-3)' }}>(opcional)</small></label>
            <input
              id="apertura-notas"
              className="po-input"
              type="text"
              placeholder="Billetes de 100 y 500 para cambio"
              value={notasApertura}
              onChange={(e) => setNotasApertura(e.target.value)}
            />
          </div>

          <div className="po-modal__actions">
            {cajaAbierta && (
              <button type="button" className="px-btn px-btn--lg" onClick={onClose}>
                Cancelar
              </button>
            )}
            <button type="submit" className="px-btn px-btn--gold px-btn--lg" disabled={guardandoApertura}>
              <Unlock size={18} />
              {guardandoApertura ? 'Guardando…' : 'Registrar apertura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
