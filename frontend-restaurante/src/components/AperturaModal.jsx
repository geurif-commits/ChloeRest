import { sanitizarDecimal } from '../utils/input.js';

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
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: '#181820', border: '2px solid #00f576', borderRadius: '16px',
        padding: '30px', maxWidth: '450px', width: '90%', textAlign: 'center',
        boxShadow: '0 20px 50px rgba(0, 245, 118, 0.2)'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🔓</div>
        <h3 style={{ color: 'var(--accent, #00f576)', margin: '0 0 10px 0', fontSize: '1.4rem' }}>Apertura de Caja / Fondo Inicial</h3>
        <p style={{ color: 'var(--text-secondary, #9494ad)', fontSize: '0.9rem', marginBottom: '20px' }}>
          Digita el monto de efectivo inicial en gaveta para abrir el turno de caja.
        </p>

        <form onSubmit={onSubmit}>
          <div style={{ textAlign: 'left', marginBottom: '15px' }}>
            <label style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
              💵 Fondo Inicial ($ RD)
            </label>
            <input 
              type="text" 
              inputMode="decimal" 
              placeholder="Ej: 2000.00" 
              value={montoApertura}
              onChange={(e) => setMontoApertura(sanitizarDecimal(e.target.value))}
              required
              autoFocus
              style={{ width: '100%', padding: '12px', background: 'var(--bg-primary, #0a0a0f)', color: 'var(--accent, #00f576)', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 'bold', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ textAlign: 'left', marginBottom: '20px' }}>
            <label style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
              📝 Notas / Observaciones (Opcional)
            </label>
            <input 
              type="text"
              placeholder="Ej: Billetes de $100 y $500 para cambio" 
              value={notasApertura}
              onChange={(e) => setNotasApertura(e.target.value)}
              style={{ width: '100%', padding: '10px', background: 'var(--bg-primary, #0a0a0f)', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {cajaAbierta && (
              <button 
                type="button" 
                onClick={onClose}
                style={{ flex: 1, background: 'var(--border-color, #2a2a38)', color: '#ccc', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            )}
            <button 
              type="submit" 
              disabled={guardandoApertura}
              style={{ flex: 2, background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '800', fontSize: '0.95rem', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,245,118,0.3)' }}
            >
              {guardandoApertura ? 'Guardando...' : '🔓 Registrar Apertura de Caja'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
