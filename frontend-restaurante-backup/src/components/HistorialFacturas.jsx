import { useState, useEffect } from 'react';
import TicketTermico from './TicketTermico';
import { toastError, toastAviso } from './Toast.jsx';

function HistorialFacturas({ alVolver, apiUrl }) {
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const [pestana, setPestana] = useState('historial');
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

  const formatearRD = (val) => {
    return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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
    try {
      const params = new URLSearchParams();
      params.set('desde', fechaDesde);
      params.set('hasta', fechaHasta);
      if (filtroMetodo) params.set('metodo_pago', filtroMetodo);
      const res = await fetch(`${urlBase}/api/reportes/facturas/filtro?${params.toString()}`);
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

  const reporteFiltrado = (reporteData || []).filter(f => {
    if (filtroTipo && f.tipo_comprobante !== filtroTipo) return false;
    if (filtroMetodo && f.metodo_pago !== filtroMetodo) return false;
    return true;
  });

  const totalReporte = reporteFiltrado.reduce((acc, f) => acc + Number(f.total || 0), 0);
  const totalItbis = reporteFiltrado.reduce((acc, f) => acc + Number(f.itbis || 0), 0);
  const totalPropina = reporteFiltrado.reduce((acc, f) => acc + Number(f.propina || 0), 0);

  return (
    <div style={{display: 'flex', flexDirection: 'column', padding: '20px', background: '#0a0a0f', height: '100%', overflowY: 'auto', boxSizing: 'border-box'}}>
      
      {/* Header */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: '#14141b', padding: '15px 20px', borderRadius: '14px', border: '1px solid #2a2a38'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
          <h2 style={{color: '#00f576', margin: 0, fontSize: '1.3rem'}}>📜 Centro de Reportes</h2>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
          <input 
            type="text" 
            placeholder="🔍 Buscar por NCF, Mesa o Método..." 
            value={busqueda} 
            onChange={(e) => setBusqueda(e.target.value)}
            style={{padding: '9px 15px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', width: '240px', fontSize: '0.85rem'}}
          />
          <button onClick={alVolver} style={{background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem'}}>
            ⬅ Volver
          </button>
        </div>
      </div>

      {/* Pestañas */}
      <div style={{display: 'flex', gap: '4px', marginBottom: '16px'}}>
        <button
          onClick={() => setPestana('historial')}
          style={{
            flex: 1, padding: '10px', border: '1px solid #2a2a38', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem',
            background: pestana === 'historial' ? 'linear-gradient(135deg, #00f576, #00b852)' : '#14141b',
            color: pestana === 'historial' ? '#000' : '#9494ad'
          }}
        >
          📋 Historial de Facturas
        </button>
        <button
          onClick={() => setPestana('reportes')}
          style={{
            flex: 1, padding: '10px', border: '1px solid #2a2a38', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem',
            background: pestana === 'reportes' ? 'linear-gradient(135deg, #00f576, #00b852)' : '#14141b',
            color: pestana === 'reportes' ? '#000' : '#9494ad'
          }}
        >
          📊 Reporte de Ventas
        </button>
      </div>

      {/* PESTAÑA: Historial */}
      {pestana === 'historial' && (
        <>
          {cargando ? (
            <p style={{color: '#00f576', textAlign: 'center', marginTop: '40px', fontSize: '1.1rem'}}>Cargando historial de comprobantes...</p>
          ) : facturasFiltradas.length === 0 ? (
            <div style={{textAlign: 'center', color: '#888', marginTop: '60px', fontStyle: 'italic'}}>
              <h3>No se encontraron facturas emitidas.</h3>
              <p>Las facturas cerradas aparecerán automáticamente en esta lista.</p>
            </div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '900px', margin: '0 auto', width: '100%'}}>
              {facturasFiltradas.map(fac => (
                <div key={fac.id} style={{background: '#14141b', padding: '16px 20px', borderRadius: '12px', border: '1px solid #2a2a38', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.2)'}}>
                  <div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px'}}>
                      <span style={{color: '#ffb703', fontWeight: 'bold', fontSize: '1.05rem'}}>{fac.mesa_nombre}</span>
                      <span style={{background: 'rgba(0, 245, 118, 0.15)', color: '#00f576', border: '1px solid rgba(0, 245, 118, 0.3)', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold'}}>
                        {fac.ncf_ecf_generado || fac.tipo_comprobante || 'NCF'}
                      </span>
                    </div>
                    <p style={{color: '#9494ad', fontSize: '0.85rem', margin: 0}}>
                      Atendido: <strong>{fac.camarero_nombre || 'Cajero/a'}</strong> — Método: <strong>{fac.metodo_pago}</strong> — Fecha: {new Date(fac.fecha_cierre).toLocaleString()}
                    </p>
                  </div>

                  <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
                    <span style={{fontSize: '1.25rem', fontWeight: '800', color: '#00f576'}}>
                      RD$ {formatearRD(fac.total)}
                    </span>
                    <button 
                      onClick={() => prepararReimpresion(fac)}
                      style={{background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '9px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '800', fontSize: '0.85rem'}}
                    >
                      🖨️ Re-imprimir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* PESTAÑA: Reportes */}
      {pestana === 'reportes' && (
        <div style={{maxWidth: '900px', margin: '0 auto', width: '100%'}}>
          {/* Filtros */}
          <div style={{background: '#14141b', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a38', marginBottom: '16px'}}>
            <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end'}}>
              <div style={{flex: 1, minWidth: '150px'}}>
                <label style={{color: '#9494ad', fontSize: '0.75rem', display: 'block', marginBottom: '4px'}}>Fecha Desde</label>
                <input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)}
                  style={{width: '100%', padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
              </div>
              <div style={{flex: 1, minWidth: '150px'}}>
                <label style={{color: '#9494ad', fontSize: '0.75rem', display: 'block', marginBottom: '4px'}}>Fecha Hasta</label>
                <input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)}
                  style={{width: '100%', padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
              </div>
              <div style={{flex: 1, minWidth: '150px'}}>
                <label style={{color: '#9494ad', fontSize: '0.75rem', display: 'block', marginBottom: '4px'}}>Método de Pago</label>
                <select value={filtroMetodo} onChange={(e) => setFiltroMetodo(e.target.value)}
                  style={{width: '100%', padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}}>
                  <option value="">Todos</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
              <div style={{flex: 1, minWidth: '150px'}}>
                <label style={{color: '#9494ad', fontSize: '0.75rem', display: 'block', marginBottom: '4px'}}>Tipo de Factura</label>
                <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}
                  style={{width: '100%', padding: '8px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}}>
                  <option value="">Todas</option>
                  <option value="B01">B01 (Crédito Fiscal)</option>
                  <option value="B02">B02 (Consumo)</option>
                  <option value="e-CF">e-CF</option>
                </select>
              </div>
              <button onClick={generarReporte} disabled={cargandoReporte}
                style={{background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap'}}>
                {cargandoReporte ? 'Generando...' : '📊 Generar Reporte'}
              </button>
            </div>
          </div>

          {/* Resumen */}
          {reporteData && (
            <>
              <div style={{display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap'}}>
                <div style={{flex: 1, minWidth: '180px', background: '#14141b', padding: '14px', borderRadius: '10px', border: '1px solid #2a2a38', textAlign: 'center'}}>
                  <span style={{color: '#9494ad', fontSize: '0.75rem', display: 'block'}}>Total Ventas</span>
                  <span style={{color: '#00f576', fontSize: '1.2rem', fontWeight: 'bold'}}>RD$ {formatearRD(totalReporte)}</span>
                </div>
                <div style={{flex: 1, minWidth: '180px', background: '#14141b', padding: '14px', borderRadius: '10px', border: '1px solid #2a2a38', textAlign: 'center'}}>
                  <span style={{color: '#9494ad', fontSize: '0.75rem', display: 'block'}}>ITBIS Recaudado</span>
                  <span style={{color: '#ffb703', fontSize: '1.2rem', fontWeight: 'bold'}}>RD$ {formatearRD(totalItbis)}</span>
                </div>
                <div style={{flex: 1, minWidth: '180px', background: '#14141b', padding: '14px', borderRadius: '10px', border: '1px solid #2a2a38', textAlign: 'center'}}>
                  <span style={{color: '#9494ad', fontSize: '0.75rem', display: 'block'}}>Propina</span>
                  <span style={{color: '#ff6b6b', fontSize: '1.2rem', fontWeight: 'bold'}}>RD$ {formatearRD(totalPropina)}</span>
                </div>
                <div style={{flex: 1, minWidth: '180px', background: '#14141b', padding: '14px', borderRadius: '10px', border: '1px solid #2a2a38', textAlign: 'center'}}>
                  <span style={{color: '#9494ad', fontSize: '0.75rem', display: 'block'}}>Facturas</span>
                  <span style={{color: '#fff', fontSize: '1.2rem', fontWeight: 'bold'}}>{reporteFiltrado.length}</span>
                </div>
              </div>

              {/* Desglose por tipo */}
              <div style={{background: '#14141b', padding: '16px', borderRadius: '12px', border: '1px solid #2a2a38', marginBottom: '16px'}}>
                <h4 style={{color: '#ffb703', margin: '0 0 10px 0', fontSize: '0.9rem'}}>📊 Desglose por Tipo de Factura</h4>
                {['B01', 'B02', 'e-CF'].map(tipo => {
                  const facturasTipo = reporteFiltrado.filter(f => f.tipo_comprobante === tipo);
                  const totalTipo = facturasTipo.reduce((a, f) => a + Number(f.total || 0), 0);
                  if (facturasTipo.length === 0) return null;
                  return (
                    <div key={tipo} style={{display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #2a2a38'}}>
                      <span style={{color: '#9494ad', fontSize: '0.85rem'}}>{tipo} ({facturasTipo.length} facturas)</span>
                      <span style={{color: '#00f576', fontWeight: 'bold', fontSize: '0.9rem'}}>RD$ {formatearRD(totalTipo)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Lista detallada */}
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                {reporteFiltrado.map(fac => (
                  <div key={fac.id} style={{background: '#14141b', padding: '12px 16px', borderRadius: '10px', border: '1px solid #2a2a38', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
                      <span style={{background: 'rgba(0,245,118,0.15)', color: '#00f576', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold'}}>{fac.tipo_comprobante}</span>
                      <span style={{color: '#ffb703', fontWeight: 'bold', fontSize: '0.9rem'}}>{fac.mesa_nombre}</span>
                      <span style={{color: '#9494ad', fontSize: '0.8rem'}}>{fac.ncf_ecf_generado}</span>
                      <span style={{color: '#9494ad', fontSize: '0.8rem'}}>{new Date(fac.fecha_cierre).toLocaleDateString()}</span>
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: '16px'}}>
                      <span style={{color: '#9494ad', fontSize: '0.8rem'}}>{fac.metodo_pago}</span>
                      <span style={{fontWeight: 'bold', color: '#00f576', fontSize: '0.95rem'}}>RD$ {formatearRD(fac.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {!reporteData && (
            <div style={{textAlign: 'center', color: '#888', marginTop: '60px', fontStyle: 'italic'}}>
              <h3>Selecciona rango de fechas y genera el reporte</h3>
              <p>Puedes filtrar por método de pago y tipo de factura.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal del Ticket Termico para Re-impresion */}
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
