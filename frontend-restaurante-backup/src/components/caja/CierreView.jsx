import React, { useState, useEffect } from 'react';
import { sanitizarDecimal } from '../../utils/input.js';
import { toastAviso } from '../Toast.jsx';

function formatearRD(val) {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CierreView({
  cierreCajaData,
  tasaUsd,
  tasaEur,
  onTasaUsdChange,
  onTasaEurChange,
  onGuardarTasas,
  efectivoFisico,
  usdFisicoArqueo,
  eurFisicoArqueo,
  notasArqueo,
  onEfectivoChange,
  onUsdChange,
  onEurChange,
  onNotasChange,
  onArqueo,
  onImprimir,
  onCerrarCaja,
  cierreReciente,
  apiUrl
}) {
  const [pestana, setPestana] = useState('turno');
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [filtroDesde, setFiltroDesde] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);

  const urlBase = apiUrl;

  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const params = new URLSearchParams();
      if (filtroDesde) params.set('desde', filtroDesde);
      if (filtroHasta) params.set('hasta', filtroHasta);
      const res = await fetch(`${urlBase}/api/caja/cierres?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistorial(data);
      }
    } catch {
      toastAviso("Error al cargar historial de cierres.");
    } finally {
      setCargandoHistorial(false);
    }
  };

  useEffect(() => {
    if (pestana === 'historial') cargarHistorial();
  }, [pestana]);

  if (!cierreCajaData && !cierreReciente) return null;

  const mostrarReporte = cierreReciente ? (
    <div style={{background: '#14141b', padding: '20px', borderRadius: '12px', border: '1px solid #00f576', marginBottom: '16px'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px'}}>
        <span style={{fontSize: '1.5rem'}}>✅</span>
        <div>
          <h3 style={{color: '#00f576', margin: 0, fontSize: '1.1rem'}}>Caja Cerrada — Reporte del Turno</h3>
          <p style={{color: '#9494ad', margin: 0, fontSize: '0.8rem'}}>
            {new Date(cierreReciente.fecha_cierre).toLocaleString()}
          </p>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px'}}>
        <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px', textAlign: 'center'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>Cajero/a</span>
          <span style={{color: '#fff', fontWeight: 'bold', fontSize: '0.95rem'}}>{cierreReciente.usuario_nombre}</span>
        </div>
        <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px', textAlign: 'center'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>Fondo Inicial</span>
          <span style={{color: '#ffb703', fontWeight: 'bold', fontSize: '0.95rem'}}>RD$ {formatearRD(cierreReciente.monto_inicial)}</span>
        </div>
        <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px', textAlign: 'center'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>Total Ventas</span>
          <span style={{color: '#00f576', fontWeight: 'bold', fontSize: '1.1rem'}}>RD$ {formatearRD(cierreReciente.total_ventas)}</span>
        </div>
      </div>

      <h4 style={{color: '#ffb703', margin: '0 0 10px 0', fontSize: '0.85rem'}}>Desglose por Método de Pago</h4>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px'}}>
        <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px', textAlign: 'center', borderLeft: '3px solid #00f576'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>💵 Efectivo</span>
          <span style={{color: '#00f576', fontWeight: 'bold', fontSize: '1rem'}}>RD$ {formatearRD(cierreReciente.efectivo)}</span>
        </div>
        <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px', textAlign: 'center', borderLeft: '3px solid #ffb703'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>💳 Tarjeta</span>
          <span style={{color: '#ffb703', fontWeight: 'bold', fontSize: '1rem'}}>RD$ {formatearRD(cierreReciente.tarjeta)}</span>
        </div>
        <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px', textAlign: 'center', borderLeft: '3px solid #4da6ff'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>🏦 Transferencia</span>
          <span style={{color: '#4da6ff', fontWeight: 'bold', fontSize: '1rem'}}>RD$ {formatearRD(cierreReciente.transferencia)}</span>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px'}}>
        <div style={{background: '#0a0a0f', padding: '10px', borderRadius: '8px', textAlign: 'center'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>ITBIS</span>
          <span style={{color: '#ff6b6b', fontWeight: 'bold', fontSize: '0.9rem'}}>RD$ {formatearRD(cierreReciente.total_itbis)}</span>
        </div>
        <div style={{background: '#0a0a0f', padding: '10px', borderRadius: '8px', textAlign: 'center'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>Propina</span>
          <span style={{color: '#ff6b6b', fontWeight: 'bold', fontSize: '0.9rem'}}>RD$ {formatearRD(cierreReciente.total_propina)}</span>
        </div>
        <div style={{background: '#0a0a0f', padding: '10px', borderRadius: '8px', textAlign: 'center'}}>
          <span style={{color: '#9494ad', fontSize: '0.7rem', display: 'block'}}>Facturas</span>
          <span style={{color: '#fff', fontWeight: 'bold', fontSize: '0.9rem'}}>{cierreReciente.total_facturas}</span>
        </div>
      </div>

      {Number(cierreReciente.diferencia_efectivo || 0) !== 0 && (
        <div style={{background: Number(cierreReciente.diferencia_efectivo) > 0 ? 'rgba(0,245,118,0.1)' : 'rgba(255,77,77,0.1)', padding: '10px', borderRadius: '8px', border: `1px solid ${Number(cierreReciente.diferencia_efectivo) > 0 ? '#00f576' : '#ff4d4d'}`}}>
          <span style={{color: Number(cierreReciente.diferencia_efectivo) > 0 ? '#00f576' : '#ff4d4d', fontSize: '0.85rem'}}>
            {Number(cierreReciente.diferencia_efectivo) > 0 ? '📈 Sobrante' : '📉 Faltante'}: RD$ {formatearRD(Math.abs(cierreReciente.diferencia_efectivo))}
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="cierre-view">
      {/* Pestañas */}
      <div style={{display: 'flex', gap: '4px', marginBottom: '16px'}}>
        <button
          onClick={() => setPestana('turno')}
          style={{
            flex: 1, padding: '10px', border: '1px solid #2a2a38', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem',
            background: pestana === 'turno' ? 'linear-gradient(135deg, #00f576, #00b852)' : '#14141b',
            color: pestana === 'turno' ? '#000' : '#9494ad'
          }}
        >
          📊 Turno Actual
        </button>
        <button
          onClick={() => setPestana('historial')}
          style={{
            flex: 1, padding: '10px', border: '1px solid #2a2a38', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem',
            background: pestana === 'historial' ? 'linear-gradient(135deg, #00f576, #00b852)' : '#14141b',
            color: pestana === 'historial' ? '#000' : '#9494ad'
          }}
        >
          📋 Historial de Cierres
        </button>
      </div>

      {/* PESTAÑA: Turno Actual */}
      {pestana === 'turno' && (
        <>
          {mostrarReporte}

          <div className="cierre-view__breakdowns">
            <div className="cierre-view__breakdown-card">
              <h4 style={{ color: 'var(--orange)' }}>Desglose por Metodo de Pago</h4>
              {cierreCajaData.desgloseMetodos.map((m, i) => (
                <div key={i} className="cierre-view__breakdown-row">
                  <span>{m.metodo_pago} ({m.cantidad} tickets)</span>
                  <strong>RD$ {formatearRD(m.total)}</strong>
                </div>
              ))}
            </div>
            <div className="cierre-view__breakdown-card">
              <h4 style={{ color: 'var(--green)' }}>Desglose Fiscal (DGII)</h4>
              {cierreCajaData.desgloseFiscal.map((f, i) => (
                <div key={i} className="cierre-view__breakdown-row">
                  <span>Tipo {f.tipo_comprobante} ({f.cantidad} facturas)</span>
                  <strong>RD$ {formatearRD(f.total)}</strong>
                </div>
              ))}
            </div>
          </div>

          {/* TASAS DE DIVISAS */}
          <div style={{background: '#0a0a0f', padding: '14px', borderRadius: '10px', border: '1px solid #2a2a38', marginBottom: '16px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
              <h4 style={{color: '#ffb703', margin: 0, fontSize: '0.85rem'}}>💱 Tasas de Divisas</h4>
              <button onClick={onGuardarTasas} style={{background: 'transparent', border: '1px solid #2a2a38', color: '#9494ad', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem'}}>Guardar</button>
            </div>
            <div style={{display: 'flex', gap: '12px'}}>
              <div style={{flex: 1}}>
                <label style={{color: '#9494ad', fontSize: '0.7rem', display: 'block', marginBottom: '3px'}}>USD $ → RD$</label>
                <input type="text" inputMode="decimal" value={tasaUsd} onChange={(e) => onTasaUsdChange(sanitizarDecimal(e.target.value))}
                  style={{width: '100%', padding: '7px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
              </div>
              <div style={{flex: 1}}>
                <label style={{color: '#9494ad', fontSize: '0.7rem', display: 'block', marginBottom: '3px'}}>EUR € → RD$</label>
                <input type="text" inputMode="decimal" value={tasaEur} onChange={(e) => onTasaEurChange(sanitizarDecimal(e.target.value))}
                  style={{width: '100%', padding: '7px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
              </div>
            </div>
          </div>

          {/* ARQUEO CIEGO — CONTEO EN GAVETA */}
          <div style={{background: '#14141b', padding: '18px', borderRadius: '12px', border: '2px solid #ffb703', marginBottom: '16px'}}>
            <h4 style={{color: '#ffb703', margin: '0 0 12px 0', fontSize: '0.95rem'}}>🔒 Arqueo Ciego — Conteo Multidivisa en Gaveta</h4>

            <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '12px'}}>
              <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px'}}>
                <label style={{color: '#9494ad', fontSize: '0.7rem', display: 'block', marginBottom: '4px'}}>💵 Efectivo Pesos (RD$)</label>
                <input type="text" inputMode="decimal" placeholder="0.00" value={efectivoFisico}
                  onChange={(e) => onEfectivoChange(sanitizarDecimal(e.target.value))}
                  style={{width: '100%', padding: '10px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center'}} />
              </div>
              <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px'}}>
                <label style={{color: '#9494ad', fontSize: '0.7rem', display: 'block', marginBottom: '4px'}}>💵 Dolares ($ USD)</label>
                <input type="text" inputMode="decimal" placeholder="0.00" value={usdFisicoArqueo}
                  onChange={(e) => onUsdChange(sanitizarDecimal(e.target.value))}
                  style={{width: '100%', padding: '10px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center'}} />
                {usdFisicoArqueo > 0 && <span style={{color: '#00f576', fontSize: '0.75rem', display: 'block', marginTop: '4px', textAlign: 'center'}}>= RD$ {formatearRD(usdFisicoArqueo * tasaUsd)}</span>}
              </div>
              <div style={{background: '#0a0a0f', padding: '12px', borderRadius: '8px'}}>
                <label style={{color: '#9494ad', fontSize: '0.7rem', display: 'block', marginBottom: '4px'}}>💶 Euros (€ EUR)</label>
                <input type="text" inputMode="decimal" placeholder="0.00" value={eurFisicoArqueo}
                  onChange={(e) => onEurChange(sanitizarDecimal(e.target.value))}
                  style={{width: '100%', padding: '10px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', textAlign: 'center'}} />
                {eurFisicoArqueo > 0 && <span style={{color: '#00f576', fontSize: '0.75rem', display: 'block', marginTop: '4px', textAlign: 'center'}}>= RD$ {formatearRD(eurFisicoArqueo * tasaEur)}</span>}
              </div>
            </div>

            <div style={{marginBottom: '12px'}}>
              <label style={{color: '#9494ad', fontSize: '0.7rem', display: 'block', marginBottom: '4px'}}>📝 Notas u Observaciones</label>
              <input type="text" placeholder="Ej: Billetes de $100 USD y cambio inicial..." value={notasArqueo}
                onChange={(e) => onNotasChange(e.target.value)}
                style={{width: '100%', padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
            </div>

            <button onClick={onArqueo} style={{
              width: '100%', padding: '11px', background: 'linear-gradient(135deg, #ffb703, #e6a800)', color: '#000',
              border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem'
            }}>
              📋 Registrar Arqueo
            </button>
          </div>

          {/* BOTONES DE ACCIÓN */}
          <div style={{display: 'flex', gap: '10px'}}>
            <button onClick={onImprimir} style={{
              flex: 1, padding: '14px', background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38',
              borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem'
            }}>
              🖨️ Imprimir Cierre de Caja
            </button>
            <button onClick={onCerrarCaja} style={{
              flex: 1, padding: '14px', background: 'linear-gradient(135deg, #ff4d4d, #cc0000)', color: '#fff',
              border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.95rem',
              boxShadow: '0 4px 15px rgba(255,77,77,0.3)'
            }}>
              🔒 Cerrar Caja
            </button>
          </div>
        </>
      )}

      {/* PESTAÑA: Historial de Cierres */}
      {pestana === 'historial' && (
        <div>
          <div style={{display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'flex-end', flexWrap: 'wrap'}}>
            <div style={{flex: 1, minWidth: '140px'}}>
              <label style={{color: '#9494ad', fontSize: '0.75rem', display: 'block', marginBottom: '4px'}}>Desde</label>
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)}
                style={{width: '100%', padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
            </div>
            <div style={{flex: 1, minWidth: '140px'}}>
              <label style={{color: '#9494ad', fontSize: '0.75rem', display: 'block', marginBottom: '4px'}}>Hasta</label>
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)}
                style={{width: '100%', padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
            </div>
            <button onClick={cargarHistorial} disabled={cargandoHistorial}
              style={{padding: '9px 18px', background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem'}}>
              {cargandoHistorial ? 'Cargando...' : '🔍 Buscar'}
            </button>
          </div>

          {historial.length === 0 ? (
            <div style={{textAlign: 'center', color: '#888', padding: '40px', fontStyle: 'italic'}}>
              <h3>No hay cierres registrados en este período</h3>
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              {historial.map((c) => (
                <div key={c.id} style={{
                  background: '#14141b', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a38'
                }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px'}}>
                    <div>
                      <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'}}>
                        <span style={{background: 'rgba(0,245,118,0.15)', color: '#00f576', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold'}}>
                          {new Date(c.fecha_cierre).toLocaleDateString()}
                        </span>
                        <span style={{color: '#fff', fontWeight: 'bold', fontSize: '0.95rem'}}>{c.usuario_nombre}</span>
                      </div>
                      <p style={{color: '#9494ad', fontSize: '0.75rem', margin: 0}}>
                        Apertura: {new Date(c.fecha_apertura).toLocaleString()} — Cierre: {new Date(c.fecha_cierre).toLocaleString()}
                      </p>
                    </div>
                    <span style={{fontSize: '1.1rem', fontWeight: '800', color: '#00f576'}}>
                      RD$ {formatearRD(c.total_ventas)}
                    </span>
                  </div>

                  <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px'}}>
                    <div style={{background: '#0a0a0f', padding: '8px', borderRadius: '6px', textAlign: 'center'}}>
                      <span style={{color: '#9494ad', fontSize: '0.65rem', display: 'block'}}>💵 Efectivo</span>
                      <span style={{color: '#00f576', fontWeight: 'bold', fontSize: '0.85rem'}}>RD$ {formatearRD(c.efectivo)}</span>
                    </div>
                    <div style={{background: '#0a0a0f', padding: '8px', borderRadius: '6px', textAlign: 'center'}}>
                      <span style={{color: '#9494ad', fontSize: '0.65rem', display: 'block'}}>💳 Tarjeta</span>
                      <span style={{color: '#ffb703', fontWeight: 'bold', fontSize: '0.85rem'}}>RD$ {formatearRD(c.tarjeta)}</span>
                    </div>
                    <div style={{background: '#0a0a0f', padding: '8px', borderRadius: '6px', textAlign: 'center'}}>
                      <span style={{color: '#9494ad', fontSize: '0.65rem', display: 'block'}}>🏦 Transferencia</span>
                      <span style={{color: '#4da6ff', fontWeight: 'bold', fontSize: '0.85rem'}}>RD$ {formatearRD(c.transferencia)}</span>
                    </div>
                  </div>

                  {Number(c.diferencia_efectivo || 0) !== 0 && (
                    <div style={{marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: Number(c.diferencia_efectivo) > 0 ? 'rgba(0,245,118,0.08)' : 'rgba(255,77,77,0.08)', border: `1px solid ${Number(c.diferencia_efectivo) > 0 ? 'rgba(0,245,118,0.3)' : 'rgba(255,77,77,0.3)'}`}}>
                      <span style={{color: Number(c.diferencia_efectivo) > 0 ? '#00f576' : '#ff4d4d', fontSize: '0.75rem'}}>
                        {Number(c.diferencia_efectivo) > 0 ? '📈' : '📉'} Diferencia: RD$ {formatearRD(Math.abs(c.diferencia_efectivo))}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CierreView;
