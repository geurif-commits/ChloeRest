import React from 'react';
import { redondearMoneda } from '../../utils/input.js';

function formatearRD(val) {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function MesaDetalleModal({ mesa, cuentaMesa, configNegocio, onCobrar, onImprimirPreCheque, onCerrar }) {
  if (!mesa) return null;

  const subtotal = redondearMoneda(cuentaMesa.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0));
  const itbis = redondearMoneda(configNegocio.cobrar_itbis ? subtotal * 0.18 : 0);
  const propina = redondearMoneda(configNegocio.cobrar_propina ? subtotal * 0.10 : 0);
  const total = redondearMoneda(subtotal + itbis + propina);

  return (
    <div className="mesa-detalle-overlay" onClick={onCerrar}>
      <div className="mesa-detalle-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mesa-detalle-header">
          <div className="mesa-detalle-header__info">
            <span className="mesa-detalle-header__icon">🍽️</span>
            <div>
              <h2>{mesa.nombre_numero}</h2>
              <p>Camarero: <strong>{mesa.camarero_nombre || mesa.camarero || 'Sin asignar'}</strong></p>
              <p className="mesa-detalle-header__sub">{cuentaMesa.length} artículo{cuentaMesa.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button className="mesa-detalle-close" onClick={onCerrar}>✕</button>
        </div>

        <div className="mesa-detalle-body">
          <div className="mesa-detalle-items">
            {cuentaMesa.length === 0 ? (
              <p className="mesa-detalle-empty">No hay artículos en esta cuenta.</p>
            ) : (
              <table className="mesa-detalle-table">
                <thead>
                  <tr>
                    <th>Cant.</th>
                    <th>Descripción</th>
                    <th>Precio</th>
                    <th>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentaMesa.map((item, idx) => (
                    <tr key={idx}>
                      <td>{Number(item.cantidad)}</td>
                      <td>{item.nombre || item.producto || item.descripcion}</td>
                      <td>RD$ {formatearRD(item.precio)}</td>
                      <td><strong>RD$ {formatearRD(Number(item.precio || 0) * Number(item.cantidad || 1))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mesa-detalle-totals">
            <div className="mesa-detalle-total-row"><span>Subtotal</span><strong>RD$ {formatearRD(subtotal)}</strong></div>
            {configNegocio.cobrar_itbis && (
              <div className="mesa-detalle-total-row"><span>ITBIS (18%)</span><strong>RD$ {formatearRD(itbis)}</strong></div>
            )}
            {configNegocio.cobrar_propina && (
              <div className="mesa-detalle-total-row"><span>Propina (10%)</span><strong>RD$ {formatearRD(propina)}</strong></div>
            )}
            <div className="mesa-detalle-total-row mesa-detalle-total-row--total">
              <span>TOTAL MONTO</span>
              <strong>RD$ {formatearRD(total)}</strong>
            </div>
          </div>
        </div>

        <div className="mesa-detalle-actions">
          <button className="mesa-detalle-btn mesa-detalle-btn--print" onClick={onImprimirPreCheque}>
            Estado de Cuenta
          </button>
          <button className="mesa-detalle-btn mesa-detalle-btn--charge" onClick={onCobrar}>
            Cobrar Factura
          </button>
        </div>
      </div>
    </div>
  );
}

export default MesaDetalleModal;
