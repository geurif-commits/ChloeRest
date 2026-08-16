import { useState, useEffect } from 'react';
import { obtenerSesion } from '../../api.js';
import { toastAviso } from '../Toast.jsx';
import './admin.css';

function GestionDispositivos({ apiUrl, token }) {
  const [dispositivos, setDispositivos] = useState([]);
  const [claveMaestra, setClaveMaestra] = useState('');
  const [cargando, setCargando] = useState(true);

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
      setClaveMaestra(data.claveMaestra || '');
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
      toastAviso(estado === 'Activo' ? 'Dispositivo activado.' : 'Dispositivo desactivado.');
      cargar();
    } catch {
      toastAviso('Error actualizando el dispositivo.');
    }
  };

  const copiarClave = async () => {
    try {
      await navigator.clipboard.writeText(claveMaestra);
      toastAviso('Clave de activación copiada al portapapeles.');
    } catch {
      toastAviso('No se pudo copiar la clave automáticamente.');
    }
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return '—';
    return new Date(fecha).toLocaleString();
  };

  const diasRestantes = (d) => {
    if (!d.licencia_vencimiento) return null;
    const restante = Math.ceil((new Date(d.licencia_vencimiento).getTime() - Date.now()) / 86400000);
    return restante;
  };

  return (
    <>
      <div className="admin-grid-layout">
        <div className="admin-panel-lista">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>Dispositivos Registrados</h3>
            <button className="btn-accion" onClick={cargar} disabled={cargando}>↻</button>
          </div>

          <div className="tabla-contenedor">
            <table className="admin-tabla">
              <thead>
                <tr><th>#</th><th>Estado</th><th>Dispositivo</th><th>IP</th><th>Licencia</th><th>Activado</th><th>Último acceso</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {dispositivos.length === 0 && (
                  <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {cargando ? 'Cargando dispositivos...' : 'Ningún dispositivo registrado aún.'}
                  </td></tr>
                )}
                {dispositivos.map((d) => {
                  const restante = diasRestantes(d);
                  return (
                  <tr key={d.id}>
                    <td>#{d.id}</td>
                    <td>
                      <span className={`badge-rol ${d.estado === 'Activo' ? 'cajero' : 'default'}`}>
                        {d.estado}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 'bold' }}>{d.nombre || 'Dispositivo'}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', wordBreak: 'break-all' }}>{d.device_id}</div>
                    </td>
                    <td>{d.ip || '—'}</td>
                    <td>
                      {d.licencia_duracion ? (
                        <>
                          <div style={{ fontWeight: 'bold' }}>{d.licencia_duracion === 'L' ? 'Vitalicia' : d.licencia_duracion}</div>
                          {d.licencia_vencimiento && (
                            <div style={{ fontSize: '0.75rem', color: restante != null && restante < 15 ? '#ff8b6b' : 'var(--muted)' }}>
                              vence {new Date(d.licencia_vencimiento).toLocaleDateString()}
                              {restante != null && <> ({restante} día{restante !== 1 ? 's' : ''})</>}
                            </div>
                          )}
                        </>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td>{formatearFecha(d.activado_en)}</td>
                    <td>{formatearFecha(d.ultimo_acceso)}</td>
                    <td>
                      {d.estado !== 'Activo' ? (
                        <button className="btn-accion" onClick={() => cambiarEstado(d.id, 'Activo')}>✅ Activar</button>
                      ) : (
                        <button className="btn-accion delete" onClick={() => cambiarEstado(d.id, 'Inactivo')}>⛔</button>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel-formulario">
          <h3>Clave de Activación</h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '12px' }}>
            Entrégala a los dispositivos nuevos para que puedan activarse. Cada dispositivo la ingresa una sola vez.
          </p>
          <div className="form-group">
            <label>Clave Maestra</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                readOnly
                value={claveMaestra || '(no configurada)'}
                style={{ fontFamily: 'monospace', letterSpacing: '1px', flex: 1 }}
                className="form-input"
              />
              {claveMaestra && (
                <button className="btn-guardar-admin" onClick={copiarClave} type="button">📋</button>
              )}
            </div>
            {!claveMaestra && (
              <span className="form-ayuda">Configura LICENSE_ACTIVATION_KEY en el archivo .env del servidor.</span>
            )}
          </div>

          <div className="form-group">
            <label>¿Cómo funciona?</label>
            <ul style={{ color: 'var(--muted)', fontSize: '0.9rem', paddingLeft: '18px', lineHeight: '1.7' }}>
              <li>Cada dispositivo genera una identificación propia.</li>
              <li>Sin activación no puede entrar al panel ni al registro.</li>
              <li>Al iniciar sesión como Administrador, ese dispositivo se activa automáticamente.</li>
              <li>Puedes desactivar un dispositivo desde aquí para revocar su acceso.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

export default GestionDispositivos;
