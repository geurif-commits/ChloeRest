import { useState } from 'react';
import { obtenerSesion } from '../api.js';
import { toastAviso } from './Toast.jsx';

const formatearRD = (val) => {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const aLocalISO = (d) => {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
};

const METODOS = ['Todos', 'Efectivo', 'Tarjeta', 'Transferencia'];

function ReporteTipoPago({ apiUrl }) {
  const urlBase = apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const [preset, setPreset] = useState('hoy');
  const [metodoPago, setMetodoPago] = useState('Todos');
  const [desde, setDesde] = useState(() => aLocalISO(new Date()));
  const [hasta, setHasta] = useState(() => aLocalISO(new Date()));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const aplicarPreset = (p) => {
    setPreset(p);
    const hoy = new Date();
    let desdeD = new Date(hoy);
    let hastaD = new Date(hoy);
    if (p === 'ayer') {
      desdeD = new Date(hoy);
      desdeD.setDate(desdeD.getDate() - 1);
      hastaD = new Date(desdeD);
    } else if (p === '7d') {
      desdeD.setDate(desdeD.getDate() - 6);
    } else if (p === 'mes') {
      desdeD = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    }
    setDesde(aLocalISO(desdeD));
    setHasta(aLocalISO(hastaD));
  };

  const consultar = async () => {
    if (!desde || !hasta) return toastAviso('Selecciona el rango de fechas.');
    if (desde > hasta) return toastAviso('La fecha inicial no puede ser mayor que la fecha final.');
    setCargando(true);
    setError('');
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (metodoPago !== 'Todos') params.set('metodo_pago', metodoPago);
      const res = await fetch(`${urlBase}/api/reportes/facturas/filtro?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando el reporte.');
      setDatos(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const totales = datos?.totales;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ color: '#00f576', margin: 0, fontSize: '0.95rem' }}>💳 Facturas por Tipo de Pago</h3>
          <button
            onClick={consultar}
            disabled={cargando}
            style={{ background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '8px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {cargando ? 'Consultando...' : '📊 Generar Reporte'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '15px' }}>
          {[{ id: 'hoy', label: 'Hoy' }, { id: 'ayer', label: 'Ayer' }, { id: '7d', label: 'Últimos 7 días' }, { id: 'mes', label: 'Este mes' }, { id: 'personalizado', label: 'Personalizado' }].map((p) => (
            <button
              key={p.id}
              onClick={() => aplicarPreset(p.id)}
              style={{ background: preset === p.id ? '#00e5ff' : '#1a1a24', color: preset === p.id ? '#000' : '#fff', border: '1px solid #2a2a38', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Desde</label>
            <input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPreset('personalizado'); }} style={{ padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #3e3e4f', borderRadius: '8px', fontSize: '0.85rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPreset('personalizado'); }} style={{ padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #3e3e4f', borderRadius: '8px', fontSize: '0.85rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Tipo de Pago</label>
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={{ padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #3e3e4f', borderRadius: '8px', fontSize: '0.85rem' }}>
              {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <p style={{ color: '#ff6b6b', margin: 0 }}>{error}</p>}

      {totales && (
        <>
          <div className="tarjetas-grid">
            <div className="tarjeta-resumen">
              <h4>Total Facturado</h4>
              <h2>RD$ {formatearRD(totales.total)}</h2>
            </div>
            <div className="tarjeta-resumen">
              <h4>ITBIS</h4>
              <h2>RD$ {formatearRD(totales.itbis)}</h2>
            </div>
            <div className="tarjeta-resumen">
              <h4>Propina</h4>
              <h2>RD$ {formatearRD(totales.propina)}</h2>
            </div>
            <div className="tarjeta-resumen destacada">
              <h4>Facturas</h4>
              <h2>{totales.cantidad}</h2>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {datos.desgloseMetodos && datos.desgloseMetodos.map((m) => (
              <div key={m.metodo_pago} style={{ background: '#1a1a24', padding: '10px 16px', borderRadius: '10px', border: '1px solid #2a2a38', fontSize: '0.85rem' }}>
                <strong style={{ color: '#00e5ff' }}>{m.metodo_pago}</strong>
                <span style={{ color: '#9494ad' }}> — {m.cantidad} factura(s), RD$ {formatearRD(m.total)}</span>
              </div>
            ))}
          </div>

          <div style={{ background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38' }}>
            <h3 style={{ color: '#00f576', marginTop: 0, marginBottom: '15px' }}>📄 Facturas del Período ({desde} → {hasta})</h3>
            <div className="tabla-contenedor" style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="admin-tabla" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: '#9494ad', borderBottom: '1px solid #2a2a38', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>NCF / Comprobante</th>
                    <th style={{ padding: '8px' }}>Tipo</th>
                    <th style={{ padding: '8px' }}>Mesa</th>
                    <th style={{ padding: '8px' }}>Método</th>
                    <th style={{ padding: '8px' }}>Atendido por</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>ITBIS</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Propina</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '8px' }}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.facturas && datos.facturas.length > 0 ? (
                    datos.facturas.map((fac, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold' }}>{fac.ncf}</td>
                        <td style={{ padding: '8px' }}>{fac.tipo_comprobante}</td>
                        <td style={{ padding: '8px' }}>{fac.mesa}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ background: 'rgba(0, 229, 255, 0.12)', color: '#00e5ff', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                            {fac.metodo_pago}
                          </span>
                        </td>
                        <td style={{ padding: '8px' }}>{fac.camarero}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>RD$ {formatearRD(fac.subtotal)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>RD$ {formatearRD(fac.itbis)}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>RD$ {formatearRD(fac.propina)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold', color: '#00f576' }}>RD$ {formatearRD(fac.total)}</td>
                        <td style={{ padding: '8px', fontSize: '0.8rem', color: '#9494ad' }}>{new Date(fac.fecha_cierre).toLocaleDateString('es-DO')}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10" style={{ padding: '20px', textAlign: 'center', color: '#88889d', fontStyle: 'italic' }}>
                        No hay facturas para el rango y método seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default ReporteTipoPago;

