import { useState, useEffect } from 'react';
import { obtenerSesion } from '../../api.js';
import { DollarSign, Percent, HandCoins, TrendingUp, FileText, Receipt } from 'lucide-react';
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

  const kpis = [
    { icon: DollarSign, label: 'Ventas Netas', value: `RD$ ${formatearRD(datosReporte.totalesGenerales.subtotal)}`, color: 'blue' },
    { icon: Percent, label: 'ITBIS Recaudado', value: `RD$ ${formatearRD(datosReporte.totalesGenerales.itbis)}`, color: 'purple' },
    { icon: HandCoins, label: 'Propina Legal', value: `RD$ ${formatearRD(datosReporte.totalesGenerales.propina)}`, color: 'gold' },
  ];

  return (
    <div className="dashboard-reportes">
      <div className="tarjetas-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="tarjeta-resumen" style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left' }}>
              <div className={`admin-info-card__icon admin-info-card__icon--${kpi.color}`} style={{ width: 48, height: 48 }}>
                <Icon size={22} strokeWidth={2} />
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.75rem', fontWeight: 500 }}>{kpi.label}</p>
                <h2 style={{ color: 'var(--text-primary)', margin: '2px 0 0', fontSize: '1.4rem', fontWeight: 800 }}>{kpi.value}</h2>
              </div>
            </div>
          );
        })}
        <div className="tarjeta-resumen destacada" style={{ display: 'flex', alignItems: 'center', gap: '14px', textAlign: 'left' }}>
          <div className="admin-info-card__icon admin-info-card__icon--green" style={{ width: 48, height: 48 }}>
            <TrendingUp size={22} strokeWidth={2} />
          </div>
          <div>
            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.75rem', fontWeight: 500 }}>Total Ingresos</p>
            <h2 style={{ color: 'var(--green)', margin: '2px 0 0', fontSize: '1.4rem', fontWeight: 800 }}>RD$ {formatearRD(datosReporte.totalesGenerales.total)}</h2>
          </div>
        </div>
      </div>

      <div className="admin-section" style={{ marginBottom: 0 }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={18} strokeWidth={2} /> Detalle de Facturas Cobradas (Turno Actual)
        </h3>

        <div className="tabla-reporte-contenedor">
          <table className="tabla-reporte">
            <thead>
              <tr>
                <th><Receipt size={13} style={{ marginRight: 4, verticalAlign: 'middle' }} /> NCF / Comprobante</th>
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
                  <td colSpan="7">No hay facturas registradas en este turno.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="totalizador-final">
          <div className="totalizador-fila">
            <span>Subtotal Facturado:</span>
            <strong>RD$ {formatearRD(datosReporte.totalesGenerales.subtotal)}</strong>
          </div>
          <div className="totalizador-fila">
            <span>Total ITBIS:</span>
            <strong>RD$ {formatearRD(datosReporte.totalesGenerales.itbis)}</strong>
          </div>
          <div className="totalizador-fila">
            <span>Total Propina Legal:</span>
            <strong>RD$ {formatearRD(datosReporte.totalesGenerales.propina)}</strong>
          </div>
          <div className="totalizador-fila total-final">
            <span>TOTAL VENDIDO:</span>
            <span>RD$ {formatearRD(datosReporte.totalesGenerales.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReporteResumen;
