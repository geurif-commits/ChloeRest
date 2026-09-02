import { useState } from 'react';
import { CreditCard, Calendar, Filter, FileText, Receipt, TrendingUp } from 'lucide-react';
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
  const urlBase = apiUrl;
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      <div className="admin-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 className="admin-section-title" style={{ margin: 0 }}><CreditCard size={18} /> Facturas por Tipo de Pago</h3>
          <button onClick={consultar} disabled={cargando} className="admin-btn admin-btn-primary">
            {cargando ? 'Consultando...' : <><Filter size={14} /> Generar Reporte</>}
          </button>
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '15px' }}>
          {[{id: 'hoy', label: 'Hoy'}, {id: 'ayer', label: 'Ayer'}, {id: '7d', label: '7 dias'}, {id: 'mes', label: 'Este mes'}, {id: 'personalizado', label: 'Personalizado'}].map((p) => (
            <button key={p.id} onClick={() => aplicarPreset(p.id)} className={`admin-tab ${preset === p.id ? 'activo' : ''}`} style={{ fontSize: '0.78rem' }}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="admin-form-row">
          <div className="admin-form-group">
            <label className="admin-label"><Calendar size={14} /> Desde</label>
            <input type="date" value={desde} onChange={(e) => {setDesde(e.target.value); setPreset('personalizado');}} className="admin-input" />
          </div>
          <div className="admin-form-group">
            <label className="admin-label"><Calendar size={14} /> Hasta</label>
            <input type="date" value={hasta} onChange={(e) => {setHasta(e.target.value); setPreset('personalizado');}} className="admin-input" />
          </div>
          <div className="admin-form-group">
            <label className="admin-label"><Filter size={14} /> Tipo de Pago</label>
            <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="admin-input">
              {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </div>

      {error && <p style={{color: 'var(--red)', margin: 0, fontSize: '0.85rem' }}>{error}</p>}

      {totales && (
        <>
          <div className="tarjetas-grid">
            <div className="tarjeta-resumen">
              <h4><TrendingUp size={16} /> Total Facturado</h4>
              <h2 style={{ color: 'var(--gold)' }}>RD$ {formatearRD(totales.total)}</h2>
            </div>
            <div className="tarjeta-resumen">
              <h4><Receipt size={16} /> ITBIS</h4>
              <h2 style={{ color: 'var(--purple)' }}>RD$ {formatearRD(totales.itbis)}</h2>
            </div>
            <div className="tarjeta-resumen">
              <h4><TrendingUp size={16} /> Propina</h4>
              <h2 style={{ color: 'var(--green)' }}>RD$ {formatearRD(totales.propina)}</h2>
            </div>
            <div className="tarjeta-resumen destacada">
              <h4><FileText size={16} /> Facturas</h4>
              <h2>{totales.cantidad}</h2>
            </div>
          </div>

          <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
            {datos.desgloseMetodos && datos.desgloseMetodos.map((m) => (
              <div key={m.metodo_pago} className="admin-section" style={{ flex: 1, minWidth: '160px', padding: '12px 16px' }}>
                <strong style={{color: 'var(--blue)', fontSize: '0.85rem' }}>{m.metodo_pago}</strong>
                <span style={{color: 'var(--text-muted)', fontSize: '0.82rem' }}> &mdash; {m.cantidad} factura(s), RD$ {formatearRD(m.total)}</span>
              </div>
            ))}
          </div>

          <div className="admin-section">
            <h3 className="admin-section-title"><FileText size={16} /> Facturas del Período ({desde} → {hasta})</h3>
            <div style={{overflowX: 'auto'}}>
              <table className="admin-tabla">
                <thead>
                  <tr>
                    <th style={{padding: '8px'}}>NCF / Comprobante</th>
                    <th style={{padding: '8px'}}>Tipo</th>
                    <th style={{padding: '8px'}}>Mesa</th>
                    <th style={{padding: '8px'}}>Método</th>
                    <th style={{padding: '8px'}}>Atendido por</th>
                    <th style={{padding: '8px', textAlign: 'right'}}>Subtotal</th>
                    <th style={{padding: '8px', textAlign: 'right'}}>ITBIS</th>
                    <th style={{padding: '8px', textAlign: 'right'}}>Propina</th>
                    <th style={{padding: '8px', textAlign: 'right'}}>Total</th>
                    <th style={{padding: '8px'}}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.facturas && datos.facturas.length > 0 ? (
                    datos.facturas.map((fac, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: '600', fontFamily: 'monospace' }}>{fac.ncf}</td>
                        <td>
                          <span style={{ padding: '2px 6px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '600', background: fac.tipo_comprobante === 'B01' ? 'rgba(91,140,255,0.12)' : 'rgba(0,230,118,0.12)', color: fac.tipo_comprobante === 'B01' ? 'var(--blue)' : 'var(--green)' }}>{fac.tipo_comprobante}</span>
                        </td>
                        <td>{fac.mesa}</td>
                        <td>
                          <span style={{ padding: '2px 6px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '600', background: fac.metodo_pago === 'Efectivo' ? 'rgba(0,230,118,0.12)' : fac.metodo_pago === 'Tarjeta' ? 'rgba(91,140,255,0.12)' : 'rgba(139,92,246,0.12)', color: fac.metodo_pago === 'Efectivo' ? 'var(--green)' : fac.metodo_pago === 'Tarjeta' ? 'var(--blue)' : 'var(--purple)' }}>{fac.metodo_pago}</span>
                        </td>
                        <td>{fac.camarero}</td>
                        <td className="text-right">RD$ {formatearRD(fac.subtotal)}</td>
                        <td className="text-right">RD$ {formatearRD(fac.itbis)}</td>
                        <td className="text-right">RD$ {formatearRD(fac.propina)}</td>
                        <td className="text-right" style={{ fontWeight: '700', color: 'var(--gold)' }}>RD$ {formatearRD(fac.total)}</td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(fac.fecha_cierre).toLocaleDateString('es-DO')}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="10" style={{padding: '30px', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic'}}>
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
