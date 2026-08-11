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
    formatearRD,
    cuentasBancarias = []
  } = config;

  const [paso, setPaso] = useState('detalles');
  const montoInputRef = useRef(null);

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
                <button className="cobro-header__back" onClick={() => { setPaso('detalles'); resetearMixto(); }}>←</button>
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
                  {METODOS.map((m) => (
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
                  <label className="cobro-label">Banco Destino</label>
                  <select className="cobro-select" value={bancoPago2} onChange={(e) => setBancoPago2(e.target.value)}>
                    <option value="">Seleccionar banco...</option>
                    {cuentasBancarias.filter(c => c.activa).map((cuenta) => (
                      <option key={cuenta.id} value={cuenta.nombre_banco}>{cuenta.nombre_banco} - {cuenta.numero_cuenta}</option>
                    ))}
                  </select>
                  <label className="cobro-label">Monto a Transferir</label>
                  <input className="cobro-input cobro-input--monto" type="text" inputMode="decimal" placeholder="0.00" value={montoPago2} onChange={(e) => setMontoPago2(sanitizarDecimal(e.target.value))} autoFocus />
                </div>
              )}

              {/* PAGO MIXTO */}
              <div style={{marginTop: '12px', padding: '12px', background: '#0a0a0f', borderRadius: '8px', border: '1px solid #2a2a38'}}>
                <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#9494ad'}}>
                  <input
                    type="checkbox"
                    checked={pagoMixto}
                    onChange={(e) => {
                      setPagoMixto(e.target.checked);
                      if (!e.target.checked) {
                        setMetodoPago2('');
                        setMontoPago2('');
                        setBancoPago2('');
                      }
                    }}
                    style={{width: '14px', height: '14px', accentColor: '#00f576'}}
                  />
                  💳 Pago Mixto (2 métodos de pago)
                </label>

                {pagoMixto && (
                  <div style={{marginTop: '10px', padding: '10px', background: '#14141b', borderRadius: '8px', border: '1px solid #2a2a38'}}>
                    <div style={{display: 'flex', gap: '6px', marginBottom: '8px'}}>
                      {METODOS.filter(m => m.v !== metodoPago).map((m) => (
                        <button key={m.v} className={`cobro-pago__btn ${metodoPago2 === m.v ? 'activo' : ''}`}
                          onClick={() => setMetodoPago2(m.v)}
                          style={{flex: 1, padding: '6px', fontSize: '0.75rem'}}>
                          <span>{m.i}</span><span>{m.l}</span>
                        </button>
                      ))}
                    </div>

                    {metodoPago2 === 'Transferencia' && (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                        <select className="cobro-select" value={bancoPago2} onChange={(e) => setBancoPago2(e.target.value)} style={{fontSize: '0.8rem', padding: '6px'}}>
                          <option value="">Banco destino...</option>
                          {cuentasBancarias.filter(c => c.activa).map((cuenta) => (
                            <option key={cuenta.id} value={cuenta.nombre_banco}>{cuenta.nombre_banco} - {cuenta.numero_cuenta}</option>
                          ))}
                        </select>
                        <input className="cobro-input" type="text" inputMode="decimal" placeholder="Monto transferencia" value={montoPago2} onChange={(e) => setMontoPago2(sanitizarDecimal(e.target.value))} style={{fontSize: '0.8rem', padding: '6px'}} />
                      </div>
                    )}

                    {metodoPago2 === 'Efectivo' && (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                        <select className="cobro-select" value={monedaPago2} onChange={(e) => setMonedaPago2(e.target.value)} style={{fontSize: '0.8rem', padding: '6px'}}>
                          <option value="DOP">RD$ Dominicanos</option>
                          <option value="USD">$ USD</option>
                          <option value="EUR">€ EUR</option>
                        </select>
                        <input className="cobro-input" type="text" inputMode="decimal" placeholder="Monto efectivo" value={montoPago2} onChange={(e) => setMontoPago2(sanitizarDecimal(e.target.value))} style={{fontSize: '0.8rem', padding: '6px'}} />
                      </div>
                    )}

                    {metodoPago2 === 'Tarjeta' && (
                      <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                        <select className="cobro-select" value={tarjetaMarcaPago2} onChange={(e) => setTarjetaMarcaPago2(e.target.value)} style={{fontSize: '0.8rem', padding: '6px'}}>
                          <option value="Visa">Visa</option>
                          <option value="Mastercard">Mastercard</option>
                          <option value="American Express">Amex</option>
                          <option value="Otra">Otra</option>
                        </select>
                        <input className="cobro-input" type="text" maxLength="4" placeholder="Últimos 4 dígitos" value={tarjetaUltimos4Pago2} onChange={(e) => setTarjetaUltimos4Pago2(e.target.value.replace(/\D/g, ''))} style={{fontSize: '0.8rem', padding: '6px'}} />
                      </div>
                    )}

                    {metodoPago2 && (
                      <div style={{marginTop: '8px', padding: '8px', background: '#0a0a0f', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem'}}>
                        <span style={{color: '#9494ad'}}>Total pagado:</span>
                        <span style={{color: '#00f576', fontWeight: 'bold'}}>
                          RD$ {formatearRD(total)} / RD$ {formatearRD(
                            (metodoPago === 'Efectivo' ? montoEntregadoDOP : total) + montoPago2DOP
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="cobro-acciones">
              <button className="cobro-btn cobro-btn--cancelar" onClick={() => { setPaso('detalles'); resetearMixto(); }}>← Atrás</button>
              <button className="cobro-btn cobro-btn--pagar" onClick={handleCobro}>✅ Confirmar y Facturar</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
