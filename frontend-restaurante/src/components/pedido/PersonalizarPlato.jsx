import { useEffect, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import './pedido.css';

/**
 * Opciones de un plato antes de agregarlo (guarnición, término de cocción y nota para cocina).
 * Se monta solo mientras hay un plato por personalizar: cada apertura empieza limpia.
 */
export default function PersonalizarPlato({ producto, guarniciones, terminos, formatearRD, textoAgregar = 'Agregar', onConfirmar, onCerrar }) {
  const [guarnicion, setGuarnicion] = useState(producto.requiere_guarnicion ? (guarniciones[0] || '') : '');
  const [termino, setTermino] = useState(producto.requiere_termino ? (terminos[0] || '') : '');
  const [nota, setNota] = useState('');

  useEffect(() => {
    const alTeclear = (evento) => { if (evento.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return (
    <div className="po-modal" role="dialog" aria-modal="true" aria-label={`Opciones de ${producto.nombre}`} onClick={onCerrar}>
      <div className="po-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="po-modal__head">
          <div>
            <span className="px-eyebrow">Opciones del plato</span>
            <h3>{producto.nombre}</h3>
          </div>
          <span className="po-modal__price">RD$ {formatearRD(producto.precio)}</span>
        </div>

        {producto.requiere_guarnicion && (
          <div className="po-field">
            <span>Guarnición</span>
            <div className="po-options">
              {guarniciones.map((opcion) => (
                <button key={opcion} type="button" className={`po-option ${guarnicion === opcion ? 'is-active' : ''}`} aria-pressed={guarnicion === opcion} onClick={() => setGuarnicion(opcion)}>
                  {guarnicion === opcion && <Check size={15} />}{opcion}
                </button>
              ))}
            </div>
          </div>
        )}

        {producto.requiere_termino && (
          <div className="po-field">
            <span>Término de cocción</span>
            <div className="po-options">
              {terminos.map((opcion) => (
                <button key={opcion} type="button" className={`po-option ${termino === opcion ? 'is-active' : ''}`} aria-pressed={termino === opcion} onClick={() => setTermino(opcion)}>
                  {termino === opcion && <Check size={15} />}{opcion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="po-field">
          <label htmlFor="po-nota-plato">Nota para cocina <small style={{ fontWeight: 500, color: 'var(--px-ink-3)' }}>(opcional)</small></label>
          <input
            id="po-nota-plato"
            className="po-input"
            type="text"
            maxLength={200}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Sin sal, salsa aparte, bien frito…"
          />
        </div>

        <div className="po-modal__actions">
          <button type="button" className="px-btn px-btn--lg" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="px-btn px-btn--gold px-btn--lg" onClick={() => onConfirmar({ guarnicion: guarnicion || null, termino: termino || null, notas: nota.trim() || null })}>
            <Plus size={18} />{textoAgregar}
          </button>
        </div>
      </div>
    </div>
  );
}
