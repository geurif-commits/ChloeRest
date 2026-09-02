import { useState, useEffect } from 'react';
import TicketTermico from './TicketTermico';
import { toastError, toastAviso } from './Toast.jsx';
import { obtenerSesion } from '../api.js';
import { FileText, Search, Printer, Clock, Filter, LayoutList, LayoutGrid, Receipt, TrendingUp, Hash } from 'lucide-react';

const formatearRD = (val) => {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function HistorialFacturas({ alVolver, apiUrl }) {
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const [pestana, setPestana] = useState('historial');
  const [vistaModo, setVistaModo] = useState('lista');
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [reporteData, setReporteData] = useState(null);
  const [cargandoReporte, setCargandoReporte] = useState(false);

  const urlBase = apiUrl;

  useEffect(() => {
    cargarFacturas();
  }, []);

  const cargarFacturas = async () => {
    try {
      const res = await fetch(`${urlBase}/api/reportes/facturas`);
      if (!res.ok) throw new Error("No se pudo cargar el historial.");
      const data = await res.json();
      setFacturas(data);
      setCargando(false);
    } catch (error) {
      console.error(error);
      toastError("Error al cargar el historial de facturas.");
      setCargando(false);
    }
  };

  const prepararReimpresion = (fac) => {
    setFacturaSeleccionada({
      mesa: fac.mesa_nombre || `Mesa #${fac.mesa_id}`,
      cajero: fac.cajero_nombre || fac.camarero_nombre || 'Cajero/a',
      camarero: fac.camarero_nombre || null,
      items: fac.items || [],
      subtotal: Number(fac.subtotal),
      itbis: Number(fac.itbis),
      propina: Number(fac.propina),
      total: Number(fac.total),
      metodoPago: fac.metodo_pago,
      tipoComprobante: fac.tipo_comprobante || 'B02',
      rncCliente: fac.rnc_cedula_cliente,
      ncfGenerado: fac.ncf_ecf_generado || 'N/D',
      fecha: new Date(fac.fecha_cierre).toLocaleString()
    });
  };

  const generarReporte = async () => {
    setCargandoReporte(true);
    setReporteData(null);
    try {
      const params = new URLSearchParams();
      params.set('desde', fechaDesde);
      params.set('hasta', fechaHasta);
      if (filtroMetodo) params.set('metodo_pago', filtroMetodo);
      const res = await fetch(`${urlBase}/api/reportes/facturas/filtro?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
      });
      if (!res.ok) throw new Error("Error al generar reporte.");
      const data = await res.json();
      setReporteData(data);
    } catch (error) {
      console.error(error);
      toastError("Error al generar el reporte.");
    } finally {
      setCargandoReporte(false);
    }
  };

  const facturasFiltradas = facturas.filter(f => {
    const q = busqueda.toLowerCase();
    const mesaStr = (f.mesa_nombre || '').toLowerCase();
    const ncfStr = (f.ncf_ecf_generado || '').toLowerCase();
    const metStr = (f.metodo_pago || '').toLowerCase();
    return mesaStr.includes(q) || ncfStr.includes(q) || metStr.includes(q);
  });

  const reporteFiltrado = (reporteData?.facturas || []).filter(f => {
    if (filtroTipo && f.tipo_comprobante !== filtroTipo) return false;
    if (filtroMetodo && f.metodo_pago !== filtroMetodo) return false;
    return true;
  });

  const totales = reporteData?.totales || {};
  const totalReporte = Number(totales.total || 0);
  const totalItbis = Number(totales.itbis || 0);
  const totalPropina = Number(totales.propina || 0);
  const totalCantidad = Number(totales.cantidad || 0);

  const METHOD_COLORS = {
    Efectivo: { bg: 'rgba(0, 230, 118, 0.12)', color: 'var(--green)' },
    Tarjeta: { bg: 'rgba(91, 140, 255, 0.12)', color: 'var(--blue)' },
    Transferencia: { bg: 'rgba(139, 92, 246, 0.12)', color: 'var(--purple)' },
  };

  const TIPO_COLORS = {
    B01: { bg: 'rgba(91, 140, 255, 0.12)', color: 'var(--blue)' },
    B02: { bg: 'rgba(0, 230, 118, 0.12)', color: 'var(--green)' },
    'e-CF': { bg: 'rgba(139, 92, 246, 0.12)', color: 'var(--purple)' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>

      {/* Pestañas + Vista */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div className="admin-tabs" style={{ marginBottom: 0 }}>
          <button onClick={() => setPestana('historial')} className={`admin-tab ${pestana === 'historial' ? 'activo' : ''}`}>
            <FileText size={16} /> Historial
          </button>
          <button onClick={() => setPestana('reportes')} className={`admin-tab ${pestana === 'reportes' ? 'activo' : ''}`}>
            <Clock size={16} /> Reportes
          </button>
        </div>
        {pestana === 'historial' && (
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '3px' }}>
            <button onClick={() => setVistaModo('lista')} style={{ background: vistaModo === 'lista' ? 'var(--bg-card)' : 'transparent', color: vistaModo === 'lista' ? 'var(--gold)' : 'var(--text-muted)', border: 'none', borderRadius: 'var(--radius-xs)', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <LayoutList size={15} />
            </button>
            <button onClick={() => setVistaModo('grid')} style={{ background: vistaModo === 'grid' ? 'var(--bg-card)' : 'transparent', color: vistaModo === 'grid' ? 'var(--gold)' : 'var(--text-muted)', border: 'none', borderRadius: 'var(--radius-xs)', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <LayoutGrid size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Búsqueda (solo historial) */}
      {pestana === 'historial' && (
        <div className="admin-form-group">
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Buscar por NCF, Mesa o Metodo..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="admin-input"
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>
      )}

      {/* PESTANA: Historial */}
      {pestana === 'historial' && (
        <>
          {cargando ? (
            <div className="admin-empty">
              <Clock size={32} style={{ color: 'var(--text-dim)', marginBottom: '8px' }} />
              <p style={{ color: 'var(--text-muted)' }}>Cargando historial...</p>
            </div>
          ) : facturasFiltradas.length === 0 ? (
            <div className="admin-empty">
              <Receipt size={32} style={{ color: 'var(--text-dim)', marginBottom: '8px' }} />
              <h3 style={{ color: 'var(--text-secondary)', margin: '0 0 4px' }}>No hay facturas</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>Las facturas cerradas aparecen automaticamente aqui.</p>
            </div>
          ) : vistaModo === 'lista' ? (
            /* VISTA LISTA */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 140px 100px 90px', gap: '8px', padding: '6px 12px', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <span>Mesa / NCF</span>
                <span>Tipo</span>
                <span>Metodo</span>
                <span>Atendido</span>
                <span style={{ textAlign: 'right' }}>Total</span>
                <span></span>
              </div>
              {facturasFiltradas.map(fac => {
                const mc = METHOD_COLORS[fac.metodo_pago] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' };
                const tc = TIPO_COLORS[fac.tipo_comprobante] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' };
                return (
                  <div key={fac.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 140px 100px 90px', gap: '8px', padding: '10px 12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', alignItems: 'center', fontSize: '0.82rem', transition: 'border-color 0.15s' }}>
                    <div>
                      <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '2px' }}>{fac.mesa_nombre || 'N/A'}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-dim)' }}>{fac.ncf_ecf_generado || fac.tipo_comprobante || 'NCF'}</div>
                    </div>
                    <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '600', background: tc.bg, color: tc.color, alignSelf: 'center', justifySelf: 'start' }}>{fac.tipo_comprobante || 'N/D'}</span>
                    <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '600', background: mc.bg, color: mc.color, alignSelf: 'center' }}>{fac.metodo_pago}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fac.camarero_nombre || 'N/A'}</span>
                    <span style={{ fontWeight: '700', color: 'var(--gold)', textAlign: 'right', fontSize: '0.85rem' }}>RD$ {formatearRD(fac.total)}</span>
                    <button onClick={() => prepararReimpresion(fac)} style={{ background: 'var(--gold-soft)', color: 'var(--gold)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-xs)', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'end' }}>
                      <Printer size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* VISTA GRID / ICONOS */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', width: '100%' }}>
              {facturasFiltradas.map(fac => {
                const mc = METHOD_COLORS[fac.metodo_pago] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' };
                return (
                  <div key={fac.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', transition: 'border-color 0.15s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{fac.mesa_nombre || 'N/A'}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>{fac.ncf_ecf_generado || 'NCF'}</div>
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.65rem', fontWeight: '600', background: mc.bg, color: mc.color }}>{fac.metodo_pago}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {fac.camarero_nombre || 'N/A'} &middot; {new Date(fac.fecha_cierre).toLocaleDateString('es-DO')}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                      <span style={{ fontWeight: '800', color: 'var(--gold)', fontSize: '1rem' }}>RD$ {formatearRD(fac.total)}</span>
                      <button onClick={() => prepararReimpresion(fac)} style={{ background: 'var(--gold-soft)', color: 'var(--gold)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-xs)', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <Printer size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* PESTANA: Reportes */}
      {pestana === 'reportes' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Filtros */}
          <div className="admin-section">
            <h3 className="admin-section-title" style={{ margin: '0 0 12px' }}><Filter size={16} /> Filtros del Reporte</h3>
            <div className="admin-form-row">
              <div className="admin-form-group" style={{ flex: 1, minWidth: '140px' }}>
                <label className="admin-label">Desde</label>
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} className="admin-input" />
              </div>
              <div className="admin-form-group" style={{ flex: 1, minWidth: '140px' }}>
                <label className="admin-label">Hasta</label>
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} className="admin-input" />
              </div>
              <div className="admin-form-group" style={{ flex: 1, minWidth: '140px' }}>
                <label className="admin-label">Metodo de Pago</label>
                <select value={filtroMetodo} onChange={(e) => setFiltroMetodo(e.target.value)} className="admin-input">
                  <option value="">Todos</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
              <div className="admin-form-group" style={{ flex: 1, minWidth: '140px' }}>
                <label className="admin-label">Tipo de Factura</label>
                <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="admin-input">
                  <option value="">Todas</option>
                  <option value="B01">B01 (Credito Fiscal)</option>
                  <option value="B02">B02 (Consumo)</option>
                  <option value="e-CF">e-CF</option>
                </select>
              </div>
              <div className="admin-form-group" style={{ flex: 0, alignSelf: 'flex-end' }}>
                <button onClick={generarReporte} disabled={cargandoReporte} className="admin-btn admin-btn-primary" style={{ whiteSpace: 'nowrap' }}>
                  {cargandoReporte ? 'Generando...' : <><FileText size={15} /> Generar Reporte</>}
                </button>
              </div>
            </div>
          </div>

          {/* KPIs */}
          {reporteData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'rgba(91, 140, 255, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={18} style={{ color: 'var(--blue)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: '500' }}>Total Ventas</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>RD$ {formatearRD(totalReporte)}</div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'rgba(139, 92, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Receipt size={18} style={{ color: 'var(--purple)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: '500' }}>ITBIS</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>RD$ {formatearRD(totalItbis)}</div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'rgba(0, 230, 118, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={18} style={{ color: 'var(--green)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: '500' }}>Propina</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-primary)' }}>RD$ {formatearRD(totalPropina)}</div>
                </div>
              </div>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-gold)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-sm)', background: 'rgba(245, 184, 61, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Hash size={18} style={{ color: 'var(--gold)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontWeight: '500' }}>Facturas</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--gold)' }}>{totalCantidad}</div>
                </div>
              </div>
            </div>
          )}

          {/* Desglose por tipo */}
          {reporteData && (
            <div className="admin-section">
              <h4 className="admin-section-title"><FileText size={16} /> Desglose por Tipo</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {['B01', 'B02', 'e-CF'].map(tipo => {
                  const facturasTipo = reporteFiltrado.filter(f => f.tipo_comprobante === tipo);
                  const totalTipo = facturasTipo.reduce((a, f) => a + Number(f.total || 0), 0);
                  if (facturasTipo.length === 0) return null;
                  const tc = TIPO_COLORS[tipo];
                  return (
                    <div key={tipo} style={{ flex: 1, minWidth: '140px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: '600', background: tc.bg, color: tc.color }}>{tipo}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>{facturasTipo.length} facturas</span>
                      </div>
                      <div style={{ fontWeight: '700', color: 'var(--gold)', fontSize: '0.95rem' }}>RD$ {formatearRD(totalTipo)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabla detallada */}
          {reporteData && (
            <div className="admin-section" style={{ overflowX: 'auto' }}>
              <h4 className="admin-section-title" style={{ margin: '0 0 12px' }}>Detalle de Facturas ({reporteFiltrado.length})</h4>
              <table className="admin-tabla">
                <thead>
                  <tr>
                    <th>NCF</th>
                    <th>Tipo</th>
                    <th>Mesa</th>
                    <th>Metodo</th>
                    <th>Atendido</th>
                    <th className="text-right">Subtotal</th>
                    <th className="text-right">ITBIS</th>
                    <th className="text-right">Propina</th>
                    <th className="text-right">Total</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {reporteFiltrado.length > 0 ? reporteFiltrado.map((fac, idx) => (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{fac.ncf}</td>
                      <td>
                        <span style={{ padding: '2px 6px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '600', background: (TIPO_COLORS[fac.tipo_comprobante] || TIPO_COLORS.B02).bg, color: (TIPO_COLORS[fac.tipo_comprobante] || TIPO_COLORS.B02).color }}>{fac.tipo_comprobante}</span>
                      </td>
                      <td>{fac.mesa}</td>
                      <td>
                        <span style={{ padding: '2px 6px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: '600', background: (METHOD_COLORS[fac.metodo_pago] || METHOD_COLORS.Efectivo).bg, color: (METHOD_COLORS[fac.metodo_pago] || METHOD_COLORS.Efectivo).color }}>{fac.metodo_pago}</span>
                      </td>
                      <td>{fac.camarero}</td>
                      <td className="text-right">RD$ {formatearRD(fac.subtotal)}</td>
                      <td className="text-right">RD$ {formatearRD(fac.itbis)}</td>
                      <td className="text-right">RD$ {formatearRD(fac.propina)}</td>
                      <td className="text-right" style={{ fontWeight: '700', color: 'var(--gold)' }}>RD$ {formatearRD(fac.total)}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{new Date(fac.fecha_cierre).toLocaleDateString('es-DO')}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No hay facturas para el rango seleccionado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {!reporteData && !cargandoReporte && (
            <div className="admin-empty">
              <Clock size={32} style={{ color: 'var(--text-dim)', marginBottom: '8px' }} />
              <h3 style={{ color: 'var(--text-secondary)', margin: '0 0 4px' }}>Selecciona rango de fechas</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>Puedes filtrar por metodo de pago y tipo de factura.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal Ticket Termico */}
      {facturaSeleccionada && (
        <TicketTermico
          datosFactura={facturaSeleccionada}
          alCerrar={() => setFacturaSeleccionada(null)}
        />
      )}
    </div>
  );
}

export default HistorialFacturas;
