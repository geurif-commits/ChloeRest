import { useState, useEffect } from 'react';

function DashboardGerencial({ apiUrl }) {
  const urlBase = apiUrl;

  const [dataDashboard, setDataDashboard] = useState(null);
  const [cargando, setCargando] = useState(true);

  const formatearRD = (num) => {
    return Number(num || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    cargarDashboard();
  }, []);

  const cargarDashboard = async () => {
    try {
      const res = await fetch(`${urlBase}/api/reportes/dashboard`);
      if (!res.ok) throw new Error("No se pudo conectar con el servidor gerencial.");
      const data = await res.json();
      setDataDashboard(data);
    } catch (error) {
      console.error("Error al cargar dashboard:", error);
    } finally {
      setCargando(false);
    }
  };

  if (cargando) {
    return (
      <div style={{height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00f576', padding: '20px'}}>
        <h2>Cargando centro de mando...</h2>
      </div>
    );
  }

  if (!dataDashboard) {
    return (
      <div style={{background: 'rgba(255,51,102,0.1)', border: '1px solid #ff3366', padding: '20px', borderRadius: '12px', color: '#ff3366', textAlign: 'center'}}>
        <h3>⚠️ Error de conexión con el servidor central. Verifique que la red Wi-Fi esté activa.</h3>
      </div>
    );
  }

  const { resumen, mesasEstado, topProductos } = dataDashboard;

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box'}}>
      
      {/* TARJETAS DE KPIs PRINCIPALES */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '15px'}}>
        <div style={{background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}>
          <h4 style={{color: '#9494ad', margin: '0 0 10px 0', fontSize: '0.85rem'}}>💰 Ventas Totales (Hoy)</h4>
          <h2 style={{color: '#00f576', margin: 0, fontSize: '1.8rem', fontWeight: '800'}}>RD$ {formatearRD(resumen.total_ventas)}</h2>
        </div>

        <div style={{background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}>
          <h4 style={{color: '#9494ad', margin: '0 0 10px 0', fontSize: '0.85rem'}}>📄 Facturas Emitidas</h4>
          <h2 style={{color: '#fff', margin: 0, fontSize: '1.8rem', fontWeight: '800'}}>{resumen.total_facturas}</h2>
        </div>

        <div style={{background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}>
          <h4 style={{color: '#9494ad', margin: '0 0 10px 0', fontSize: '0.85rem'}}>📊 Ticket Promedio</h4>
          <h2 style={{color: '#ffb703', margin: 0, fontSize: '1.8rem', fontWeight: '800'}}>RD$ {formatearRD(resumen.ticket_promedio)}</h2>
        </div>
      </div>

      {/* SECCIÓN INFERIOR: ESTADO DE MESAS Y TOP PRODUCTOS */}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginTop: '5px'}}>
        
        {/* Estado de Mesas */}
        <div style={{background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}>
          <h3 style={{color: '#fff', marginTop: 0, borderBottom: '1px solid #2a2a38', paddingBottom: '12px', fontSize: '1.05rem'}}>🗺️ Estado del Local (Mesas)</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px'}}>
            {mesasEstado.map((m, idx) => (
              <div key={idx} style={{display: 'flex', justifyContent: 'space-between', background: '#0a0a0f', padding: '12px 16px', borderRadius: '10px', alignItems: 'center', border: '1px solid #2a2a38'}}>
                <span style={{color: m.estado === 'Ocupada' ? '#ff3366' : '#00f576', fontWeight: 'bold', fontSize: '0.9rem'}}>
                  {m.estado === 'Ocupada' ? '🔴 Ocupadas' : '🟢 Disponibles'}
                </span>
                <strong style={{color: '#fff', fontSize: '1.2rem'}}>{m.cantidad}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Top 5 Platos más vendidos */}
        <div style={{background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38', boxShadow: '0 4px 15px rgba(0,0,0,0.2)'}}>
          <h3 style={{color: '#fff', marginTop: 0, borderBottom: '1px solid #2a2a38', paddingBottom: '12px', fontSize: '1.05rem'}}>🔥 Top 5 Platos Vendidos</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px'}}>
            {topProductos.length === 0 ? (
              <p style={{color: '#9494ad', textAlign: 'center', fontStyle: 'italic', padding: '20px 0'}}>No hay ventas registradas hoy.</p>
            ) : (
              topProductos.map((p, idx) => (
                <div key={idx} style={{display: 'flex', justifyContent: 'space-between', background: '#0a0a0f', padding: '10px 16px', borderRadius: '10px', alignItems: 'center', border: '1px solid #2a2a38'}}>
                  <span style={{color: '#fff', fontSize: '0.9rem'}}>{idx + 1}. {p.nombre}</span>
                  <span style={{background: 'rgba(0, 245, 118, 0.15)', color: '#00f576', padding: '4px 10px', borderRadius: '10px', fontWeight: '800', fontSize: '0.8rem'}}>
                    {p.total_vendidos} unds.
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}

export default DashboardGerencial;