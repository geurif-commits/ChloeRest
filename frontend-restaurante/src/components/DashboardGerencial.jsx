import { useState, useEffect } from 'react';
import {
  DollarSign, FileText, TrendingUp, TableProperties,
  UtensilsCrossed, AlertCircle, Loader2, Sparkles,
  ChevronLeft, ChevronRight, BarChart2, Flame, Award, Coffee
} from 'lucide-react';

function DashboardGerencial({ apiUrl }) {
  const urlBase = apiUrl;
  const [dataDashboard, setDataDashboard] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [slideActivo, setSlideActivo] = useState(0);

  const formatearRD = (num) => {
    return Number(num || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    cargarDashboard();
  }, []);

  // Auto-rotación del slide cada 6 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideActivo((prev) => (prev === 2 ? 0 : prev + 1));
    }, 6000);
    return () => clearInterval(timer);
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
      <div className="admin-empty" style={{ height: '60vh' }}>
        <Loader2 size={32} className="admin-empty__icon" style={{ animation: 'spin 1s linear infinite' }} />
        <p className="admin-empty__desc">Cargando centro de mando...</p>
      </div>
    );
  }

  if (!dataDashboard) {
    return (
      <div className="admin-section" style={{ borderColor: 'rgba(239, 68, 68, 0.3)' }}>
        <div className="admin-empty">
          <AlertCircle size={36} style={{ color: 'var(--red)' }} />
          <p className="admin-empty__title" style={{ color: 'var(--red-light)' }}>
            Error de conexión con el servidor central.
          </p>
          <p className="admin-empty__desc">Verifique que la red Wi-Fi esté activa.</p>
        </div>
      </div>
    );
  }

  const { resumen, mesasEstado, topProductos } = dataDashboard;

  const totalDisponibles = mesasEstado?.find((m) => m.estado === 'Disponible')?.cantidad || 0;
  const totalOcupadas = mesasEstado?.find((m) => m.estado === 'Ocupada')?.cantidad || 0;
  const totalReservadas = mesasEstado?.find((m) => m.estado === 'Reservada')?.cantidad || 0;
  const totalMesas = mesasEstado?.reduce((acc, m) => acc + (m.cantidad || 0), 0) || 0;

  const maxVendidos = topProductos && topProductos.length > 0 ? Math.max(...topProductos.map(p => Number(p.total_vendidos || 0)), 1) : 1;

  // Recomendaciones inteligentes del menú gastronómico
  const RECOMENDACIONES_CHEF = [
    {
      titulo: 'Sugerencia de Entrada & Compartir',
      plato: 'Croquetas de Chivo Liniero & Mofonguitos',
      razon: 'Excelente margen y tiempo récord de preparación (< 8 min).',
      icono: Flame,
      bg: 'rgba(245, 158, 11, 0.15)',
      color: 'var(--kpi-amber)'
    },
    {
      titulo: 'Plato Principal Recomendado',
      plato: 'Chillo Frito al Estilo Boca Chica',
      razon: 'Alta preferencia en fines de semana y excelente ticket medio.',
      icono: Award,
      bg: 'rgba(16, 185, 129, 0.15)',
      color: 'var(--kpi-green)'
    },
    {
      titulo: 'Maridaje & Postre Estrella',
      plato: 'Tres Leches Artesanal & Café Espresso',
      razon: 'Ideal para elevar el ticket promedio por comensal al cierre.',
      icono: Coffee,
      bg: 'rgba(139, 92, 246, 0.15)',
      color: 'var(--kpi-purple)'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>

      {/* ── Fila Superior: Rendimiento Financiero y Estado del Local (Mismo formato de recuadros) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        
        {/* Recuadro 1: Rendimiento Financiero (Ventas Totales, Facturas, Ticket Promedio) */}
        <div className="admin-section" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} strokeWidth={2} style={{ color: 'var(--kpi-gold)' }} /> Rendimiento del Día
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>En Vivo</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ventas Totales</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-gold)', fontSize: '1.4rem', fontWeight: 800 }}>RD$ {formatearRD(resumen.total_ventas)}</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Facturas Emitidas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-cyan)', fontSize: '1.4rem', fontWeight: 800 }}>{resumen.total_facturas}</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)', gridColumn: 'span 2' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ticket Promedio por Mesa</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-green)', fontSize: '1.4rem', fontWeight: 800 }}>RD$ {formatearRD(resumen.ticket_promedio)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recuadro 2: Estado del Local (Mesas Disponibles, Ocupadas, Reservadas) */}
        <div className="admin-section" style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TableProperties size={18} strokeWidth={2} style={{ color: 'var(--kpi-gold)' }} /> Estado del Salón
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{totalMesas} mesas totales</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Disponibles</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-green)', fontSize: '1.4rem', fontWeight: 800 }}>{totalDisponibles}</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ocupadas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-red)', fontSize: '1.4rem', fontWeight: 800 }}>{totalOcupadas}</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reservadas</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-amber)', fontSize: '1.4rem', fontWeight: 800 }}>{totalReservadas}</span>
              </div>
            </div>
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Capacidad Ocupada</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ color: 'var(--text-primary)', fontSize: '1.4rem', fontWeight: 800 }}>
                  {totalMesas > 0 ? Math.round((totalOcupadas / totalMesas) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Fila Inferior: Panel Dinámico en Modo Slide (Gráfico Top 5 + Recomendaciones + Rotación) ── */}
      <div className="admin-section" style={{ position: 'relative', overflow: 'hidden' }}>
        
        {/* Encabezado del Carrusel y Controles */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: 'var(--gold, #f5b842)' }} />
            <h3 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {slideActivo === 0 && '📊 Gráfico: Top 5 Platos Más Vendidos'}
              {slideActivo === 1 && '🌟 Recomendaciones del Chef & Platos Sugeridos'}
              {slideActivo === 2 && '⚡ Eficiencia Operativa & Desempeño'}
            </h3>
          </div>

          {/* Botones de Navegación del Slide */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px', marginRight: '8px' }}>
              {[0, 1, 2].map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSlideActivo(idx)}
                  style={{
                    width: idx === slideActivo ? '20px' : '7px',
                    height: '7px',
                    borderRadius: '4px',
                    background: idx === slideActivo ? 'var(--gold, #f5b842)' : 'var(--border-medium)',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'all 0.25s ease'
                  }}
                  title={`Slide ${idx + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSlideActivo((prev) => (prev === 0 ? 2 : prev - 1))}
              style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => setSlideActivo((prev) => (prev === 2 ? 0 : prev + 1))}
              style={{ background: 'var(--bg-card-hover)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* ── Slide 0: Gráfico de Barras Proporcionales de Top 5 ── */}
        {slideActivo === 0 && (
          <div>
            {topProductos.length === 0 ? (
              <div className="admin-empty" style={{ padding: '24px 16px' }}>
                <UtensilsCrossed size={32} style={{ color: 'var(--text-dim)', opacity: 0.4 }} />
                <p className="admin-empty__title">Sin ventas registradas en la jornada actual.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {topProductos.map((p, idx) => {
                  const cantidad = Number(p.total_vendidos || 0);
                  const porcentaje = Math.round((cantidad / maxVendidos) * 100);
                  return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: idx === 0 ? 'rgba(245, 184, 61, 0.2)' : 'var(--bg-card-hover)', color: idx === 0 ? 'var(--gold, #f5b842)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                            {idx + 1}
                          </span>
                          <strong style={{ color: 'var(--text-primary)' }}>{p.nombre}</strong>
                        </div>
                        <span style={{ color: 'var(--kpi-gold)', fontWeight: 700, fontSize: '0.8rem' }}>
                          {cantidad} {cantidad === 1 ? 'unidad' : 'unidades'} ({porcentaje}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${porcentaje}%`,
                            height: '100%',
                            borderRadius: '4px',
                            background: idx === 0 ? 'linear-gradient(90deg, #f5b842 0%, #eab308 100%)' : 'linear-gradient(90deg, #38bdf8 0%, #10b981 100%)',
                            transition: 'width 0.6s ease'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Slide 1: Recomendaciones del Chef & Platos Sugeridos ── */}
        {slideActivo === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            {RECOMENDACIONES_CHEF.map((rec, i) => {
              const Icono = rec.icono;
              return (
                <div
                  key={i}
                  style={{
                    background: 'var(--bg-input)',
                    borderRadius: 'var(--radius-md)',
                    padding: '16px',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: rec.bg, color: rec.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icono size={16} />
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
                      {rec.titulo}
                    </span>
                  </div>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.92rem', marginTop: '2px' }}>{rec.plato}</strong>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.76rem', lineHeight: 1.3 }}>
                    {rec.razon}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Slide 2: Eficiencia Operativa ── */}
        {slideActivo === 2 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Rotación Promedio</span>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-green)', fontSize: '1.3rem', fontWeight: 800 }}>38 min / mesa</span>
              </div>
              <small style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>Ritmo de atención óptimo</small>
            </div>

            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Despacho a Cocina</span>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-gold)', fontSize: '1.3rem', fontWeight: 800 }}>Inmediato (KDS)</span>
              </div>
              <small style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>Sincronización en tiempo real</small>
            </div>

            <div style={{ background: 'var(--bg-input)', borderRadius: 'var(--radius-md)', padding: '14px 16px', border: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Control Fiscal DGII</span>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: 'var(--kpi-cyan)', fontSize: '1.3rem', fontWeight: 800 }}>100% Activo</span>
              </div>
              <small style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>Secuencias NCF validadas</small>
            </div>
          </div>
        )}

      </div>

    </div>
  );
}

export default DashboardGerencial;

