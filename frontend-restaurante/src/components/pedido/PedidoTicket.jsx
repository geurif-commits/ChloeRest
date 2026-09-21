import React, { useState } from 'react';
import { Plus, Minus, Trash2, Send, Printer, ArrowRightLeft, CreditCard, StickyNote, ShoppingBag, LoaderCircle, Users, Ellipsis } from 'lucide-react';
import './pedido.css';

function PedidoTicket({
  mesa,
  usuario,
  cuentaActual,
  comandaNueva,
  granTotal,
  subtotalFactura,
  itbis,
  propinaLey,
  propinaPorcentaje = 10,
  totalAPagar,
  esCajero,
  onIncrementar,
  onRestar,
  onAnular,
  onEnviar,
  enviandoComanda = false,
  onPreCheque,
  onTrasladar,
  onCobrar,
  formatearRD,
  isMobile,
  mobileTab,
  comandaModo = 'kds',
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const unidades = comandaNueva.reduce((s, i) => s + i.cantidad, 0);
  const cerrarYEjecutar = (fn) => () => { setMenuAbierto(false); fn?.(); };

  return (
    <aside className="po-ticket" style={{ display: !isMobile || mobileTab === 'cuenta' ? 'flex' : 'none' }}>
      <header className="po-ticket__head">
        <div>
          <h2>{mesa.nombre_numero}</h2>
          <p>{mesa.capacidad ? `${mesa.capacidad} personas · ` : ''}{usuario.nombre}</p>
        </div>
        <span className="po-ticket__cap" title="Capacidad de la mesa"><Users size={19} /></span>
      </header>

      <div className="po-ticket__body">
        {cuentaActual.length > 0 && (
          <section>
            <p className="po-label"><span>Enviado a cocina y bar</span></p>
            {cuentaActual.map((item) => (
              <div key={`old-${item.id}`} className="po-sent">
                <div className="po-sent__main">
                  <span className="po-sent__name">{Number(item.cantidad)} × {item.nombre}</span>
                  {(item.guarnicion || item.termino) && <span className="po-line__note">{[item.guarnicion, item.termino].filter(Boolean).join(' · ')}</span>}
                  {item.notas && <span className="po-line__note"><StickyNote size={13} />{item.notas}</span>}
                </div>
                <span className="po-sent__price">RD$ {formatearRD(item.precio * item.cantidad)}</span>
                <button type="button" onClick={() => onAnular(item)} className="po-sent__void" title="Anular" aria-label={`Anular ${item.nombre}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </section>
        )}

        <section>
          <p className="po-label po-label--new"><span>Nueva comanda</span><span>{unidades} {unidades === 1 ? 'plato' : 'platos'}</span></p>
          {comandaNueva.length === 0 ? (
            <div className="po-blank"><ShoppingBag size={22} /><span>Toca un plato del menú para añadirlo.</span></div>
          ) : (
            comandaNueva.map((item, idx) => (
              <div key={item.itemKey || `new-${item.id}-${idx}`} className="po-line">
                <div className="po-line__row"><span>{item.nombre}</span><span>RD$ {formatearRD(item.precio * item.cantidad)}</span></div>
                {(item.guarnicion || item.termino) && <span className="po-line__note">{[item.guarnicion, item.termino].filter(Boolean).join(' · ')}</span>}
                {item.notas && <span className="po-line__note"><StickyNote size={13} />{item.notas}</span>}
                <div className="po-step">
                  <button type="button" onClick={() => onRestar(item.itemKey || item.id)} aria-label={`Quitar uno de ${item.nombre}`}><Minus size={16} /></button>
                  <output>{item.cantidad}</output>
                  <button type="button" onClick={() => onIncrementar(item)} aria-label={`Aumentar ${item.nombre}`}><Plus size={16} /></button>
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <footer className="po-ticket__foot">
        <div className="po-totals">
          <div><span>Subtotal</span><span>RD$ {formatearRD(subtotalFactura ?? granTotal)}</span></div>
          {itbis > 0 && <div><span>ITBIS</span><span>RD$ {formatearRD(itbis)}</span></div>}
          {propinaLey > 0 && <div><span>Propina {propinaPorcentaje} %</span><span>RD$ {formatearRD(propinaLey)}</span></div>}
          <div className="po-totals__grand"><span>Total mesa</span><strong>RD$ {formatearRD(totalAPagar ?? granTotal)}</strong></div>
        </div>

        <button type="button" onClick={onEnviar} disabled={comandaNueva.length === 0 || enviandoComanda} className="po-send">
          {enviandoComanda ? <LoaderCircle size={19} className="px-spin" /> : <Send size={19} />}
          {enviandoComanda ? 'Enviando…' : comandaNueva.length === 0 ? 'Sin platos nuevos' : `${comandaModo === 'impresora' ? 'Enviar e imprimir' : 'Enviar comanda'} (${unidades})`}
        </button>

        <div className={`po-actions ${esCajero ? 'po-actions--pay' : ''}`}>
          <button type="button" onClick={onPreCheque} className="po-btn"><Printer size={18} />Pre-cuenta</button>
          {esCajero && <button type="button" onClick={onCobrar} className="po-btn"><CreditCard size={18} />Cobrar</button>}
          <div className="po-more">
            <button type="button" className="po-btn po-btn--icon" onClick={() => setMenuAbierto((v) => !v)} aria-label="Más acciones" aria-expanded={menuAbierto}><Ellipsis size={19} /></button>
            {menuAbierto && (
              <>
                <div className="po-more__scrim" onClick={() => setMenuAbierto(false)} />
                <div className="po-more__menu" role="menu">
                  <button type="button" role="menuitem" onClick={cerrarYEjecutar(onTrasladar)}><ArrowRightLeft size={17} />Trasladar mesa</button>
                </div>
              </>
            )}
          </div>
        </div>
      </footer>
    </aside>
  );
}

export default PedidoTicket;
