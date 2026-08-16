import React from 'react';
import { redondearMoneda } from '../../utils/input.js';

function formatearRD(val) {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CuentaDetallePanel({
  mesaSeleccionada,
  cuentaMesa,
  configNegocio,
  onCobrar,
  onVerHistorial,
  onImprimirPreCheque
}) {
  const subtotal = redondearMoneda(cuentaMesa.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0));
  const itbis = redondearMoneda(configNegocio.cobrar_itbis ? subtotal * 0.18 : 0);
  const propina = redondearMoneda(configNegocio.cobrar_propina ? subtotal * 0.10 : 0);
  const total = redondearMoneda(subtotal + itbis + propina);

  return (
    <div className="cuenta-panel">
      <div className="cuenta-panel__body">
        <h3 className="cuenta-panel__title">
          {mesaSeleccionada ? `Detalle de la ${mesaSeleccionada.nombre_numero}` : 'Seleccione una mesa ocupada'}
        </h3>

        {mesaSeleccionada && mesaSeleccionada.estado === 'Ocupada' ? (
          <div className="cuenta-panel__body" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div className="cuenta-panel__items-scroll">
              <table className="cuenta-panel__items-table">
                <thead>
                  <tr>
                    <th>Cant.</th>
                    <th>Descripcion</th>
                    <th style={{ textAlign: 'right' }}>Precio</th>
                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentaMesa.map((item, idx) => (
                    <tr key={idx}>
                      <td>{Number(item.cantidad).toFixed(2)}</td>
                      <td>{item.nombre}</td>
                      <td>RD$ {formatearRD(item.precio)}</td>
                      <td style={{ fontWeight: 'bold' }}>RD$ {formatearRD(Number(item.precio) * Number(item.cantidad))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cuenta-panel__totals">
              <div className="cuenta-panel__total-row"><span>Subtotal:</span><strong>RD$ {formatearRD(subtotal)}</strong></div>
              {configNegocio.cobrar_itbis && (
                <div className="cuenta-panel__total-row"><span>ITBIS (18%):</span><strong>RD$ {formatearRD(itbis)}</strong></div>
              )}
              {configNegocio.cobrar_propina && (
                <div className="cuenta-panel__total-row"><span>Propina (10%):</span><strong>RD$ {formatearRD(propina)}</strong></div>
              )}
              <div className="cuenta-panel__total-grand">
                <span>TOTAL MONTO:</span>
                <span>RD$ {formatearRD(total)}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="cuenta-panel__empty">
            Seleccione una mesa ocupada de la lista para revisar su cuenta y procesar el cobro.
          </div>
        )}
      </div>

      {mesaSeleccionada && mesaSeleccionada.estado === 'Ocupada' && (
        <div className="cuenta-panel__actions">
          <button className="cuenta-panel__btn-print" onClick={onImprimirPreCheque}>
            Estado de Cuenta
          </button>
          <button className="cuenta-panel__btn-charge" onClick={onCobrar}>
            Cobrar Factura
          </button>
        </div>
      )}
    </div>
  );
}

export default CuentaDetallePanel;
