import { useEffect, useRef, useState } from 'react';
import { sanitizarDecimal, redondearMoneda } from '../utils/input.js';
import { toastAviso } from './Toast.jsx';

export default function CobroModal({ config, onClose }) {
  const {
    mesa,
    cuentaMesa = [],
    configNegocio,
    metodoPago, setMetodoPago,
    monedaPago, setMonedaPago,
    montoEntregado, setMontoEntregado,
    tarjetaUltimos4, setTarjetaUltimos4,
    tarjetaMarca, setTarjetaMarca,
    tasaUsd, tasaEur,
    subtotal, itbis, propina, total,
    onCobroExitoso,
    formatearRD
  } = config;

  const [paso, setPaso] = useState('detalles');
  const montoInputRef = useRef(null);

  useEffect(() => {
    if (paso === 'pago' && metodoPago === 'Efectivo' && montoInputRef.current) {
      const t = setTimeout(() => { montoInputRef.current?.focus(); montoInputRef.current?.select(); }, 80);
      return () => clearTimeout(t);
    }
  }, [paso, metodoPago]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const montoEntregadoNum = parseFloat(montoEntregado || '0');
  let montoEntregadoDOP = montoEntregadoNum;
  if (monedaPago === 'USD') montoEntregadoDOP = redondearMoneda(montoEntregadoNum * tasaUsd);
  if (monedaPago === 'EUR') montoEntregadoDOP = redondearMoneda(montoEntregadoNum * tasaEur);
  const cambioDevolver = montoEntregado !== '' ? redondearMoneda(montoEntregadoDOP - total) : 0;

  const handleCobro = async () => {
    if (metodoPago === 'Efectivo' && montoEntregadoDOP < total) {
      return toastAviso("El monto entregado es menor al total a pagar.");
    }
    if (metodoPago === 'Tarjeta' && (!tarjetaUltimos4 || tarjetaUltimos4.length !== 4)) {
      return toastAviso("Ingresa los últimos 4 dígitos de la tarjeta.");
    }
    await onCobroExitoso();
  };

  return (
    <div className="cobro-overlay" onClick={onClose}>
      <div className="cobro-modal" onClick={(e) => e.stopPropagation()}>

        {paso === 'detalles' && (
          <>
            <div className="cobro-header">
              <div className="cobro-header__mesa">
                <span className="cobro-header__icono">🍽️</span>
                <div>
                  <h2>{mesa?.nombre_numero || 'Mesa'}</h2>
                  <p className="cobro-header__sub">Cuenta abierta · {cuentaMesa.length} artículo{cuentaMesa.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            </div>

            <div className="cobro-detalles">
              <div className="cobro-detalles__lista">
                {cuentaMesa.length === 0 ? (
                  <p className="cobro-detalles__vacia">No hay artículos en esta cuenta.</p>
                ) : (
                  cuentaMesa.map((item, i) => (
                    <div key={i} className="cobro-detalles__item">
                      <span className="cobro-detalles__qty">{item.cantidad}×</span>
                      <span className="cobro-detalles__nombre">{item.nombre || item.producto || item.descripcion}</span>
                      <span className="cobro-detalles__precio">RD$ {formatearRD(Number(item.precio || 0) * Number(item.cantidad || 1))}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="cobro-totales">
                <div className="cobro-totales__row"><span>Subtotal</span><strong>RD$ {formatearRD(subtotal)}</strong></div>
                {configNegocio?.cobrar_itbis && <div className="cobro-totales__row"><span>ITBIS (18%)</span><strong>RD$ {formatearRD(itbis)}</strong></div>}
                {configNegocio?.cobrar_propina && <div className="cobro-totales__row"><span>Propina (10%)</span><strong>RD$ {formatearRD(propina)}</strong></div>}
                <div className="cobro-totales__row cobro-totales__row--total"><span>Total</span><strong>RD$ {formatearRD(total)}</strong></div>
              </div>
            </div>

            <div className="cobro-acciones">
              <button className="cobro-btn cobro-btn--cancelar" onClick={onClose}>Cancelar</button>
              <button className="cobro-btn cobro-btn--pagar" onClick={() => setPaso('pago')}>Proceder al Pago →</button>
            </div>
          </>
        )}

        {paso === 'pago' && (
          <>
            <div className="cobro-header">
              <div className="cobro-header__mesa">
                <button className="cobro-header__back" onClick={() => setPaso('detalles')}>←</button>
                <span className="cobro-header__icono">💳</span>
                <div>
                  <h2>Pago · {mesa?.nombre_numero}</h2>
                  <p className="cobro-header__sub">Total: <strong>RD$ {formatearRD(total)}</strong></p>
                </div>
              </div>
            </div>

            <div className="cobro-pago">
              <div className="cobro-pago__metodos">
                <label className="cobro-label">Método de Pago</label>
                <div className="cobro-pago__grid">
                  {[{v:'Efectivo',i:'💵',l:'Efectivo'},{v:'Tarjeta',i:'💳',l:'Tarjeta'},{v:'Transferencia',i:'🏦',l:'Transferencia'}].map((m) => (
                    <button key={m.v} className={`cobro-pago__btn ${metodoPago === m.v ? 'activo' : ''}`} onClick={() => setMetodoPago(m.v)}>
                      <span>{m.i}</span><span>{m.l}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="cobro-pago__moneda">
                <label className="cobro-label">Moneda</label>
                <select className="cobro-select" value={monedaPago} onChange={(e) => { setMonedaPago(e.target.value); setMontoEntregado(''); }}>
                  <option value="DOP">RD$ Dominicanos</option>
                  <option value="USD">$ USD (Tasa: {tasaUsd})</option>
                  <option value="EUR">€ EUR (Tasa: {tasaEur})</option>
                </select>
              </div>

              {metodoPago === 'Efectivo' && (
                <div className="cobro-pago__efectivo">
                  <label className="cobro-label">Monto Entregado ({monedaPago === 'DOP' ? 'RD$' : monedaPago === 'USD' ? '$' : '€'})</label>
                  <input ref={montoInputRef} className="cobro-input cobro-input--monto" type="text" inputMode="decimal" placeholder="0.00" value={montoEntregado} onChange={(e) => setMontoEntregado(sanitizarDecimal(e.target.value))} />
                  {monedaPago !== 'DOP' && montoEntregadoNum > 0 && (
                    <span className="cobro-pago__equiv">≈ RD$ {formatearRD(montoEntregadoDOP)}</span>
                  )}
                  <div className={`cobro-pago__cambio ${cambioDevolver >= 0 ? 'positivo' : 'negativo'}`}>
                    <span>Cambio</span>
                    <strong>RD$ {cambioDevolver >= 0 ? formatearRD(cambioDevolver) : '0.00'}</strong>
                  </div>
                </div>
              )}

              {metodoPago === 'Tarjeta' && (
                <div className="cobro-pago__tarjeta">
                  <label className="cobro-label">Marca</label>
                  <select className="cobro-select" value={tarjetaMarca} onChange={(e) => setTarjetaMarca(e.target.value)}>
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="American Express">Amex</option>
                    <option value="Otra">Otra</option>
                  </select>
                  <label className="cobro-label">Últimos 4 dígitos</label>
                  <input className="cobro-input" type="text" maxLength="4" placeholder="4321" value={tarjetaUltimos4} onChange={(e) => setTarjetaUltimos4(e.target.value.replace(/\D/g, ''))} autoFocus />
                </div>
              )}

              {metodoPago === 'Transferencia' && (
                <div className="cobro-pago__transfer">
                  <p>Confirma la transferencia recibida para emitir la factura.</p>
                </div>
              )}
            </div>

            <div className="cobro-acciones">
              <button className="cobro-btn cobro-btn--cancelar" onClick={() => setPaso('detalles')}>← Atrás</button>
              <button className="cobro-btn cobro-btn--pagar" onClick={handleCobro}>✅ Confirmar y Facturar</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
