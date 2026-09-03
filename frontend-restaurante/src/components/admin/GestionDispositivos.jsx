import { useState, useEffect, useMemo } from 'react';
import { obtenerSesion } from '../../api.js';
import { obtenerDeviceId, parsearUserAgent } from '../../utils/dispositivo.js';
import { toastAviso } from '../Toast.jsx';
import {
  Monitor, CheckCircle2, Ban, Laptop, RefreshCw,
  Power, ShieldCheck, Clock, Wifi, Info, Trash2,
  Smartphone, Tablet, Globe, Cpu
} from 'lucide-react';
import './admin.css';

export default function GestionDispositivos({ apiUrl, token }) {
  const [dispositivos, setDispositivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const myDeviceId = obtenerDeviceId();

  const headers = () => ({
    'Authorization': `Bearer ${token || obtenerSesion()}`
  });

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${apiUrl}/api/dispositivos`, {
        headers: headers()
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error cargando dispositivos.');
        return;
      }
      setDispositivos(data.dispositivos || []);
    } catch {
      toastAviso('Error cargando dispositivos. Verifica la conexión.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cambiarEstado = async (id, estado) => {
    try {
      const res = await fetch(`${apiUrl}/api/dispositivos/${id}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ estado })
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error actualizando el dispositivo.');
        return;
      }
      toastAviso(estado === 'Activo' ? '✅ Dispositivo autorizado.' : '⛔ Dispositivo revocado/desactivado.');
      cargar();
    } catch {
      toastAviso('Error actualizando el dispositivo.');
    }
  };

  const eliminarDispositivo = async (id, nombre) => {
    const etiqueta = nombre || `ID ${id}`;
    if (!window.confirm(`¿Deseas eliminar permanentemente el dispositivo "${etiqueta}"? Esta acción liberará el espacio en la licencia.`)) {
      return;
    }
    try {
      const res = await fetch(`${apiUrl}/api/dispositivos/${id}`, {
        method: 'DELETE',
        headers: headers()
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error al eliminar el dispositivo.');
        return;
      }
      toastAviso('🗑️ Dispositivo eliminado correctamente.');
      cargar();
    } catch {
      toastAviso('Error al eliminar el dispositivo.');
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleDateString() + ' ' + new Date(fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const diasRestantes = (d) => {
    if (!d.licencia_vencimiento) return null;
    return Math.ceil((new Date(d.licencia_vencimiento).getTime() - Date.now()) / 86400000);
  };

  const kpis = useMemo(() => {
    const total = dispositivos.length;
    const activos = dispositivos.filter(d => d.estado === 'Activo').length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [dispositivos]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', width: '100%' }}>
      
      {/* ── KPIs Superiores Horizontales (Total, Activas, Inactivas) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '10px',
        width: '100%'
      }}>
        {/* Total Terminales */}
        <div className="admin-card" style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(56, 189, 248, 0.15)',
            color: 'var(--kpi-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Monitor size={18} />
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Total
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{kpis.total}</div>
          </div>
        </div>

        {/* Activas */}
        <div className="admin-card" style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--kpi-green)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <CheckCircle2 size={18} />
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Activas
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--kpi-green)', lineHeight: 1.1 }}>{kpis.activos}</div>
          </div>
        </div>

        {/* Inactivas */}
        <div className="admin-card" style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--kpi-red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Ban size={18} />
          </div>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Inactivas
            </span>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--kpi-red)', lineHeight: 1.1 }}>{kpis.inactivos}</div>
          </div>
        </div>
      </div>

      {/* ── Barra Informativa de Límite de Licencia (Máximo 2 Dispositivos) ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '12px 16px',
        background: 'rgba(245, 184, 61, 0.06)',
        border: '1px solid rgba(245, 184, 61, 0.25)',
        borderRadius: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Info size={16} style={{ color: 'var(--kpi-gold)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500 }}>
            Límite por licencia: <strong>Máximo 2 dispositivos activos simultáneos</strong> (Caja POS / Tablet de Salón o KDS).
          </span>
        </div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '20px',
          background: kpis.activos >= 2 ? 'rgba(245, 184, 61, 0.2)' : 'rgba(16, 185, 129, 0.2)',
          border: `1px solid ${kpis.activos >= 2 ? 'var(--kpi-gold)' : 'var(--kpi-green)'}`,
          fontSize: '0.78rem',
          fontWeight: 700,
          color: kpis.activos >= 2 ? 'var(--kpi-gold)' : 'var(--kpi-green)'
        }}>
          <span>{kpis.activos} / 2 En Uso</span>
        </div>
      </div>

      {/* ── Tarjeta Principal de Terminales Autorizadas ── */}
      <div className="admin-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Laptop size={18} style={{ color: 'var(--kpi-gold)' }} />
              Dispositivos y Terminales POS
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: 'var(--admin-text-muted)' }}>
              Solo se muestran las terminales activadas con tu licencia.
            </p>
          </div>

          <button
            type="button"
            onClick={cargar}
            disabled={cargando}
            className="admin-btn admin-btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
          >
            <RefreshCw size={14} style={{ animation: cargando ? 'spin 1s linear infinite' : 'none' }} />
            Actualizar
          </button>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--admin-text-muted)' }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando terminales autorizadas...</p>
          </div>
        ) : dispositivos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', background: 'rgba(255,255,255,0.015)', borderRadius: '10px', border: '1px dashed var(--border-subtle)' }}>
            <Monitor size={32} style={{ color: 'var(--admin-text-muted)', margin: '0 auto 8px' }} />
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Ningún dispositivo registrado con esta licencia aún.</p>
            <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>Al activar tu terminal o tableta con tu clave, aparecerá automáticamente aquí.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dispositivos.map((d) => {
              const restante = diasRestantes(d);
              const esActivo = d.estado === 'Activo';
              const esEsteDispositivo = d.device_id === myDeviceId;
              const info = parsearUserAgent(d.navegador || '');

              const IconoEquipo = info.tipo.includes('Tablet') || info.tipo.includes('iPad')
                ? Tablet
                : info.tipo.includes('Móvil') || info.tipo.includes('iPhone') || info.tipo.includes('Teléfono')
                ? Smartphone
                : info.tipo.includes('Mac') || info.tipo.includes('PC') || info.tipo.includes('Computadora')
                ? Laptop
                : Monitor;

              return (
                <div
                  key={d.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    padding: '14px',
                    borderRadius: '12px',
                    background: esEsteDispositivo ? 'rgba(56, 189, 248, 0.04)' : 'var(--bg-card-hover)',
                    border: `1px solid ${esEsteDispositivo ? 'rgba(56, 189, 248, 0.45)' : esActivo ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-subtle)'}`,
                    boxShadow: esEsteDispositivo ? '0 0 15px rgba(56, 189, 248, 0.08)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        background: esEsteDispositivo ? 'rgba(56, 189, 248, 0.15)' : esActivo ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: esEsteDispositivo ? 'var(--kpi-cyan)' : esActivo ? 'var(--kpi-green)' : 'var(--kpi-red)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <IconoEquipo size={20} />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.92rem' }}>
                            {d.nombre && d.nombre !== 'Terminal POS' ? d.nombre : info.nombreSugerido}
                          </strong>
                          {esEsteDispositivo && (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              background: 'rgba(56, 189, 248, 0.2)',
                              color: 'var(--kpi-cyan)',
                              border: '1px solid rgba(56, 189, 248, 0.45)',
                              boxShadow: '0 0 8px rgba(56, 189, 248, 0.2)'
                            }}>
                              📍 Este dispositivo (actual)
                            </span>
                          )}
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 7px',
                            borderRadius: '5px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: esActivo ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: esActivo ? 'var(--kpi-green)' : 'var(--kpi-red)'
                          }}>
                            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: esActivo ? 'var(--kpi-green)' : 'var(--kpi-red)' }} />
                            {d.estado}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)', fontFamily: 'monospace' }}>
                            ID: {d.device_id || '—'}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-card-hover)', padding: '1px 6px', borderRadius: '4px' }}>
                            🖥️ {info.so} • {info.navegadorNombre}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {esActivo ? (
                        <button
                          type="button"
                          onClick={() => cambiarEstado(d.id, 'Inactivo')}
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                          title="Revocar acceso de esta terminal"
                        >
                          <Power size={13} /> Desactivar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => cambiarEstado(d.id, 'Activo')}
                          className="admin-btn admin-btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                          title="Autorizar terminal"
                        >
                          <CheckCircle2 size={13} /> Autorizar
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => eliminarDispositivo(d.id, d.nombre || d.device_id)}
                        className="admin-btn admin-btn-danger"
                        style={{ padding: '6px 10px', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--kpi-red)' }}
                        title="Eliminar dispositivo y liberar cupo de licencia"
                      >
                        <Trash2 size={13} /> Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Metadatos en fila horizontal */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '14px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-subtle)',
                    fontSize: '0.74rem',
                    color: 'var(--admin-text-muted)'
                  }}>
                    {d.licencia_duracion && (
                      <span style={{ color: 'var(--kpi-gold)', fontWeight: 600 }}>
                        {d.licencia_duracion === 'L' ? '✨ Licencia Vitalicia' : `Plan ${d.licencia_duracion}`}
                        {restante != null && ` (${restante} días rest.)`}
                      </span>
                    )}

                    <span>
                      <Cpu size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      Tipo: <strong style={{ color: 'var(--text-primary)' }}>{info.tipo}</strong>
                    </span>

                    <span>
                      <Clock size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                      Última sesión: {formatearFecha(d.ultimo_acceso || d.activado_en)}
                    </span>

                    {d.ip && (
                      <span>
                        <Wifi size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                        IP: {d.ip}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Tarjeta de Seguridad y Buenas Prácticas ── */}
      <div className="admin-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
        <ShieldCheck size={24} style={{ color: 'var(--kpi-green)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', lineHeight: 1.4 }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '2px' }}>Seguridad y Protección de Acceso</strong>
          Cada terminal está emparejada criptográficamente a tu restaurante. Si reemplazas una tablet o computadora, desactiva la anterior para liberar su ranura de licencia.
        </div>
      </div>

    </div>
  );
}


