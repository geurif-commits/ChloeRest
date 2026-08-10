import { useState, useEffect } from 'react';
import TicketTermico from './TicketTermico';
import { toastError } from './Toast.jsx';

function HistorialFacturas({ alVolver, apiUrl }) {
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [busqueda, setBusqueda] = useState('');

  const urlBase = apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';

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

  const facturasFiltradas = facturas.filter(f => {
    const q = busqueda.toLowerCase();
    const mesaStr = (f.mesa_nombre || '').toLowerCase();
    const ncfStr = (f.ncf_ecf_generado || '').toLowerCase();
    const metStr = (f.metodo_pago || '').toLowerCase();
    return mesaStr.includes(q) || ncfStr.includes(q) || metStr.includes(q);
  });

  return (
    <div style={{display: 'flex', flexDirection: 'column', padding: '20px', background: '#0a0a0f', height: '100%', overflowY: 'auto', boxSizing: 'border-box'}}>
      
      {/* Header */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: '#14141b', padding: '15px 20px', borderRadius: '14px', border: '1px solid #2a2a38'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
          <button onClick={alVolver} style={{background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem'}}>
            ⬅ Volver
          </button>
          <h2 style={{color: '#00f576', margin: 0, fontSize: '1.3rem'}}>📜 Historial de Facturas Emitidas</h2>
        </div>

        <input 
          type="text" 
          placeholder="🔍 Buscar por NCF, Mesa o Método..." 
          value={busqueda} 
          onChange={(e) => setBusqueda(e.target.value)}
          style={{padding: '9px 15px', background: '#0a0a0f', color: '#fff', border: '1px solid #00f576', borderRadius: '8px', width: '280px', fontSize: '0.9rem'}}
        />
      </div>

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
                  🖨️ Re-imprimir Ticket
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal del Ticket Térmico para Re-impresión */}
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
