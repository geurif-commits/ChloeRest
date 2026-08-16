import { useEffect, useRef, useState } from 'react';
import { sanitizarDecimal, redondearMoneda } from '../utils/input.js';
import { toastAviso } from './Toast.jsx';

const METODOS = [
  { v: 'Efectivo', i: '💵', l: 'Efectivo' },
  { v: 'Tarjeta', i: '💳', l: 'Tarjeta' },
  { v: 'Transferencia', i: '🏦', l: 'Transferencia' },
];

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
    onImprimirPreCheque,
    formatearRD,
    cuentasBancarias = []
  } = config;

  const [paso, setPaso] = useState('detalles');
  const [animDir, setAnimDir] = useState('');
  const montoInputRef = useRef(null);

  const irAPago = () => {
    setAnimDir('right');
    setPaso('pago');
  };

  const irADetalles = () => {
    setAnimDir('left');
    setPaso('detalles');
    resetearMixto();
  };

  // Estados para pago mixto
  const [pagoMixto, setPagoMixto] = useState(false);
  const [metodoPago2, setMetodoPago2] = useState('');
  const [montoPago2, setMontoPago2] = useState('');
  const [bancoPago2, setBancoPago2] = useState('');
  const [monedaPago2, setMonedaPago2] = useState('DOP');
  const [tarjetaUltimos4Pago2, setTarjetaUltimos4Pago2] = useState('');
  const [tarjetaMarcaPago2, setTarjetaMarcaPago2] = useState('Visa');

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

  // Cálculos para pago mixto
  const montoPago2Num = parseFloat(montoPago2 || '0');
  let montoPago2DOP = montoPago2Num;
  if (monedaPago2 === 'USD') montoPago2DOP = redondearMoneda(montoPago2Num * tasaUsd);
  if (monedaPago2 === 'EUR') montoPago2DOP = redondearMoneda(montoPago2Num * tasaEur);

  const totalPagadoMixto = (metodoPago === 'Efectivo' ? montoEntregadoDOP : metodoPago === 'Transferencia' ? montoPago2DOP : total) +
    (pagoMixto && metodoPago2 === 'Transferencia' ? montoPago2DOP : 0);
  const cambioDevolver = pagoMixto ? 0 : (montoEntregado !== '' ? redondearMoneda(montoEntregadoDOP - total) : 0);

  const handleCobro = async () => {
    if (!pagoMixto) {
      if (metodoPago === 'Efectivo' && montoEntregadoDOP < total) {
        return toastAviso("El monto entregado es menor al total a pagar.");
      }
      if (metodoPago === 'Tarjeta' && (!tarjetaUltimos4 || tarjetaUltimos4.length !== 4)) {
        return toastAviso("Ingresa los últimos 4 dígitos de la tarjeta.");
      }
    } else {
      if (!metodoPago2) {
        return toastAviso("Selecciona el segundo método de pago.");
      }
      if (metodoPago2 === 'Transferencia' && montoPago2DOP <= 0) {
        return toastAviso("Indica el monto de la transferencia.");
      }
      if (metodoPago2 === 'Tarjeta' && (!tarjetaUltimos4Pago2 || tarjetaUltimos4Pago2.length !== 4)) {
        return toastAviso("Ingresa los últimos 4 dígitos de la tarjeta del segundo pago.");
      }
    }
    await onCobroExitoso({
      pagoMixto,
      metodoPago2: pagoMixto ? metodoPago2 : null,
      montoPago2: pagoMixto ? montoPago2DOP : 0,
      bancoPago2: pagoMixto && metodoPago2 === 'Transferencia' ? bancoPago2 : null
    });
  };

  const resetearMixto = () => {
    setPagoMixto(false);
    setMetodoPago2('');
    setMontoPago2('');
    setBancoPago2('');
    setMonedaPago2('DOP');
    setTarjetaUltimos4Pago2('');
    setTarjetaMarcaPago2('Visa');
  };

  return (
    <div className="cobro-overlay" onClick={onClose}>
      <div className="cobro-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cobro-slider">

          {/* PASO 1: Detalles */}
          {paso === 'detalles' && (
          <div className={`cobro-slide ${animDir === 'right' ? 'cobro-slide--animating' : ''}`}>
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
              {onImprimirPreCheque && (
                <button className="cobro-btn cobro-btn--cancelar" onClick={onImprimirPreCheque}>📄 Estado de Cuenta</button>
              )}
              <button className="cobro-btn cobro-btn--pagar" onClick={irAPago}>Proceder al Pago →</button>
            </div>
          </div>
          )}

          {/* PASO 2: Pago */}
          {paso === 'pago' && (
          <div className={`cobro-slide ${animDir === 'left' ? 'cobro-slide--animating-left' : 'cobro-slide--animating'}`}>
            <div className="cobro-header cobro-header--tight">
              <button className="cobro-header__back" onClick={irADetalles}>←</button>
              <div className="cobro-header__total">
                <span className="cobro-header__total-label">Total</span>
                <span className="cobro-header__total-value">RD$ {formatearRD(total)}</span>
              </div>
            </div>

            <div className="cobro-pago cobro-pago--scroll">
              {/* Fila: Método + Moneda */}
              <div className="cobro-row">
                <div className="cobro-row__metodos">
                  {METODOS.map((m) => (
                    <button key={m.v} className={`cobro-pago__btn ${metodoPago === m.v ? 'activo' : ''}`} onClick={() => setMetodoPago(m.v)}>
                      <span>{m.i}</span><span>{m.l}</span>
                    </button>
                  ))}
                </div>
                <select className="cobro-select cobro-select--tiny" value={monedaPago} onChange={(e) => { setMonedaPago(e.target.value); setMontoEntregado(''); }}>
                  <option value="DOP">RD$</option>
                  <option value="USD">$USD</option>
                  <option value="EUR">€EUR</option>
                </select>
              </div>

              {/* Campo según método */}
              {metodoPago === 'Efectivo' && (
                <div className="cobro-campo">
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
                <div className="cobro-campo cobro-campo--row">
                  <select className="cobro-select cobro-select--tiny" value={tarjetaMarca} onChange={(e) => setTarjetaMarca(e.target.value)}>
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">MC</option>
                    <option value="American Express">Amex</option>
                    <option value="Otra">Otra</option>
                  </select>
                  <input className="cobro-input cobro-input--4dig" type="text" maxLength="4" placeholder="4 dígitos" value={tarjetaUltimos4} onChange={(e) => setTarjetaUltimos4(e.target.value.replace(/\D/g, ''))} autoFocus />
                </div>
              )}

              {metodoPago === 'Transferencia' && (
                <div className="cobro-campo cobro-campo--row">
                  <select className="cobro-select cobro-select--tiny" value={bancoPago2} onChange={(e) => setBancoPago2(e.target.value)}>
                    <option value="">Banco...</option>
                    {cuentasBancarias.filter(c => c.activa).map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.nombre_banco}>{cuenta.nombre_banco}</option>
                    ))}
                  </select>
                  <input className="cobro-input cobro-input--monto cobro-input--small" type="text" inputMode="decimal" placeholder="0.00" value={montoPago2} onChange={(e) => setMontoPago2(sanitizarDecimal(e.target.value))} autoFocus />
                </div>
              )}

              {/* PAGO MIXTO */}
              <div className="cobro-mixto">
                <label className="cobro-mixto__toggle">
                  <input type="checkbox" checked={pagoMixto} onChange={(e) => {
                    setPagoMixto(e.target.checked);
                    if (!e.target.checked) { setMetodoPago2(''); setMontoPago2(''); setBancoPago2(''); }
                  }} />
                  <span>💳 Mixto</span>
                </label>

                {pagoMixto && (
                  <div className="cobro-mixto__body">
                    <div className="cobro-row" style={{marginBottom: 0}}>
                      <div className="cobro-row__metodos">
                        {METODOS.filter(m => m.v !== metodoPago).map((m) => (
                          <button key={m.v} className={`cobro-pago__btn cobro-pago__btn--sm ${metodoPago2 === m.v ? 'activo' : ''}`} onClick={() => setMetodoPago2(m.v)}>
                            <span>{m.i}</span><span>{m.l}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {metodoPago2 === 'Transferencia' && (
                      <div className="cobro-campo cobro-campo--row cobro-campo--sm">
                        <select className="cobro-select cobro-select--tiny" value={bancoPago2} onChange={(e) => setBancoPago2(e.target.value)}>
                          <option value="">Banco...</option>
                          {cuentasBancarias.filter(c => c.activa).map((cuenta) => (
                            <option key={cuenta.id} value={cuenta.nombre_banco}>{cuenta.nombre_banco}</option>
                          ))}
                        </select>
                        <input className="cobro-input cobro-input--small" type="text" inputMode="decimal" placeholder="Monto" value={montoPago2} onChange={(e) => setMontoPago2(sanitizarDecimal(e.target.value))} />
                      </div>
                    )}

                    {metodoPago2 === 'Efectivo' && (
                      <div className="cobro-campo cobro-campo--row cobro-campo--sm">
                        <select className="cobro-select cobro-select--tiny" value={monedaPago2} onChange={(e) => setMonedaPago2(e.target.value)}>
                          <option value="DOP">RD$</option>
                          <option value="USD">$USD</option>
                          <option value="EUR">€EUR</option>
                        </select>
                        <input className="cobro-input cobro-input--small" type="text" inputMode="decimal" placeholder="Monto" value={montoPago2} onChange={(e) => setMontoPago2(sanitizarDecimal(e.target.value))} />
                      </div>
                    )}

                    {metodoPago2 === 'Tarjeta' && (
                      <div className="cobro-campo cobro-campo--row cobro-campo--sm">
                        <select className="cobro-select cobro-select--tiny" value={tarjetaMarcaPago2} onChange={(e) => setTarjetaMarcaPago2(e.target.value)}>
                          <option value="Visa">Visa</option>
                          <option value="Mastercard">MC</option>
                          <option value="American Express">Amex</option>
                          <option value="Otra">Otra</option>
                        </select>
                        <input className="cobro-input cobro-input--4dig" type="text" maxLength="4" placeholder="4 dig" value={tarjetaUltimos4Pago2} onChange={(e) => setTarjetaUltimos4Pago2(e.target.value.replace(/\D/g, ''))} />
                      </div>
                    )}

                    {metodoPago2 && (
                      <div className="cobro-mixto__total">
                        <span>Total:</span>
                        <strong>RD$ {formatearRD(total)} / RD$ {formatearRD(
                          (metodoPago === 'Efectivo' ? montoEntregadoDOP : total) + montoPago2DOP
                        )}</strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="cobro-acciones cobro-acciones--tight">
              <button className="cobro-btn cobro-btn--cancelar" onClick={irADetalles}>← Atrás</button>
              <button className="cobro-btn cobro-btn--pagar" onClick={handleCobro}>✅ Facturar</button>
            </div>
          </div>
          )}

        </div>
      </div>
    </div>
  );
}
