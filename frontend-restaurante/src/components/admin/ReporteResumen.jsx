import { useState, useEffect } from 'react';
import { obtenerSesion } from '../../api.js';
import './admin.css';

const formatearRD = (val) => {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

function ReporteResumen({ apiUrl }) {
  const [datosReporte, setDatosReporte] = useState(null);

  useEffect(() => {
    const cargarReportes = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/reportes/cierre`, {
          headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
        });
        setDatosReporte(await res.json());
      } catch (e) { console.error("Error cargando reportes"); }
    };
    cargarReportes();
  }, [apiUrl]);

  if (!datosReporte) return null;

  return (
    <div className="dashboard-reportes">
      <div className="tarjetas-grid">
        <div className="tarjeta-resumen">
          <h4>Ventas Netas</h4>
          <h2>RD$ {formatearRD(datosReporte.totalesGenerales.subtotal)}</h2>
        </div>
        <div className="tarjeta-resumen">
          <h4>ITBIS Recaudado</h4>
          <h2>RD$ {formatearRD(datosReporte.totalesGenerales.itbis)}</h2>
        </div>
        <div className="tarjeta-resumen">
          <h4>Propina Legal</h4>
          <h2>RD$ {formatearRD(datosReporte.totalesGenerales.propina)}</h2>
        </div>
        <div className="tarjeta-resumen destacada">
          <h4>Total Ingresos</h4>
          <h2>RD$ {formatearRD(datosReporte.totalesGenerales.total)}</h2>
        </div>
      </div>

      <div className="admin-panel-lista" style={{ background: '#14141b', padding: '20px', borderRadius: '14px', border: '1px solid #2a2a38' }}>
        <h3 style={{ color: '#00f576', marginTop: 0, marginBottom: '15px' }}>📄 Detalle de Facturas Cobradas (Turno Actual)</h3>

        <div className="tabla-reporte-contenedor">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th>NCF / Comprobante</th>
                <th>Tipo</th>
                <th>Mesa</th>
                <th className="text-right">Subtotal</th>
                <th className="text-right">ITBIS</th>
                <th className="text-right">Propina</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {datosReporte.facturasDetalladas && datosReporte.facturasDetalladas.length > 0 ? (
                datosReporte.facturasDetalladas.map((fac, index) => (
                  <tr key={index}>
                    <td className="ncf-cell">{fac.ncf}</td>
                    <td>{fac.tipo_comprobante}</td>
                    <td>{fac.mesa || 'N/A'}</td>
                    <td className="text-right">RD$ {formatearRD(fac.subtotal)}</td>
                    <td className="text-right">RD$ {formatearRD(fac.itbis)}</td>
                    <td className="text-right">RD$ {formatearRD(fac.propina)}</td>
                    <td className="total-accent text-right">RD$ {formatearRD(fac.total)}</td>
                  </tr>
                ))
              ) : (
                <tr className="tabla-reporte-empty">
                  <td colSpan="7">
                    No hay facturas registradas en este turno.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="totalizador-final">
          <div className="totalizador-fila">
            <span>Subtotal Facturado:</span>
            <strong>${Number(datosReporte.totalesGenerales.subtotal).toFixed(2)}</strong>
          </div>
          <div className="totalizador-fila">
            <span>Total ITBIS:</span>
            <strong>${Number(datosReporte.totalesGenerales.itbis).toFixed(2)}</strong>
          </div>
          <div className="totalizador-fila">
            <span>Total Propina Legal:</span>
            <strong>${Number(datosReporte.totalesGenerales.propina).toFixed(2)}</strong>
          </div>
          <div className="totalizador-fila total-final">
            <span>TOTAL VENDIDO:</span>
            <span>${Number(datosReporte.totalesGenerales.total).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReporteResumen;
