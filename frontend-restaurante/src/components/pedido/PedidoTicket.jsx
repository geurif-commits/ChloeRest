import React from 'react';

function PedidoTicket({
  mesa,
  usuario,
  cuentaActual,
  comandaNueva,
  granTotal,
  esCajero,
  onAgregar,
  onRestar,
  onAnular,
  onEnviar,
  onPreCheque,
  onTrasladar,
  onCobrar,
  onVolver,
  formatearRD,
  isMobile,
  mobileTab,
}) {
  return (
    <div
      className="pedido-ticket"
      style={{
        width: isMobile ? '100vw' : '420px',
        display: !isMobile || mobileTab === 'cuenta' ? 'flex' : 'none',
        height: isMobile ? 'auto' : '100vh',
        flex: isMobile ? 1 : 'none',
        borderLeft: isMobile ? 'none' : undefined,
      }}
    >
      <div className="pedido-ticket__head">
        <h3>{mesa.nombre_numero}</h3>
        <p>Camarero/a: <strong>{usuario.nombre}</strong></p>
      </div>

      <div className="pedido-ticket__body">
        {cuentaActual.length > 0 && (
          <div>
            <p className="pedido-ticket__section-label">Consumo Registrado</p>
            {cuentaActual.map((item) => (
              <div key={`old-${item.id}`} className="pedido-ticket__item pedido-ticket__item--registered">
                <div>
                  <span className="pedido-ticket__item-qty">{item.cantidad}x</span>
                  <span className="pedido-ticket__item-name">{item.nombre}</span>
                </div>
                <div className="pedido-ticket__item-actions">
                  <span className="pedido-ticket__item-price">RD$ {formatearRD(item.precio * item.cantidad)}</span>
                  <button
                    onClick={() => onAnular(item)}
                    className="pedido-ticket__btn-anular"
                    title="Anular"
                  >
                    ❌
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <p className="pedido-ticket__section-label pedido-ticket__section-label--new">Nueva Comanda (Pendiente)</p>
          {comandaNueva.length === 0 ? (
            <p className="pedido-ticket__empty">Selecciona platos del menú para agregar</p>
          ) : (
            comandaNueva.map(item => (
              <div key={`new-${item.id}`} className="pedido-ticket__item pedido-ticket__item--new">
                <div style={{ flex: 1 }}>
                  <span className="pedido-ticket__item-name" style={{ display: 'block' }}>{item.nombre}</span>
                  <span className="pedido-ticket__item-price--new">RD$ {formatearRD(item.precio * item.cantidad)}</span>
                </div>
                <div className="pedido-ticket__item-actions">
                  <button onClick={() => onRestar(item.id)} className="pedido-ticket__qty-btn">-</button>
                  <span className="pedido-ticket__qty-value">{item.cantidad}</span>
                  <button onClick={() => onAgregar(item)} className="pedido-ticket__qty-btn">+</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pedido-ticket__footer">
        <div className="pedido-ticket__total">
          <span>Total Mesa:</span>
          <span className="pedido-ticket__total-value">RD$ {formatearRD(granTotal)}</span>
        </div>

        <button
          onClick={onEnviar}
          disabled={comandaNueva.length === 0}
          className="pedido-ticket__btn-send"
        >
          🛎️ Enviar Comanda a Cocina/Bar
        </button>

        <div className="pedido-ticket__btn-actions">
          <button onClick={onPreCheque} className="pedido-ticket__btn-secondary">
            🖨️ Pre-Cheque
          </button>
          <button onClick={onTrasladar} className="pedido-ticket__btn-secondary" style={{ flex: 0.9 }}>
            🔄 Trasladar
          </button>
          {esCajero && (
            <button onClick={onCobrar} className="pedido-ticket__btn-cobrar">
              💳 Cobrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PedidoTicket;
