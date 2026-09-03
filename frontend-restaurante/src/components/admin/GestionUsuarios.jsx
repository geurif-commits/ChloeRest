import { useState, useEffect, useMemo } from 'react';
import { obtenerSesion } from '../../api.js';
import { toastAviso, toastError } from '../Toast.jsx';
import ConfirmModal from '../ConfirmModal';
import {
  Users, UserPlus, Shield, KeyRound, Search, Pencil, Trash2,
  Save, X, CheckCircle2, UserCheck, UtensilsCrossed, Wine,
  CreditCard, Crown, Eye, EyeOff, Lock
} from 'lucide-react';
import './admin.css';

const ROLES_INFO = {
  'Administrador': { label: 'Administrador', icon: Crown, color: 'var(--kpi-gold)', bg: 'rgba(245, 184, 61, 0.15)', desc: 'Acceso total y configuración del restaurante' },
  'Cajero': { label: 'Cajero', icon: CreditCard, color: 'var(--kpi-cyan)', bg: 'rgba(56, 189, 248, 0.15)', desc: 'Apertura/cierre de caja y cobro de cuentas' },
  'Capitán de Camareros': { label: 'Capitán de Salón', icon: Shield, color: 'var(--kpi-purple)', bg: 'rgba(168, 85, 247, 0.15)', desc: 'Toma pedidos y autorización de anulaciones' },
  'Camarero': { label: 'Camarero', icon: UserCheck, color: 'var(--kpi-green)', bg: 'rgba(16, 185, 129, 0.15)', desc: 'Atención a mesas y envío de comandas' },
  'Cocina': { label: 'Cocina', icon: UtensilsCrossed, color: 'var(--kpi-amber)', bg: 'rgba(249, 115, 22, 0.15)', desc: 'Pantalla KDS de preparación de alimentos' },
  'Bar': { label: 'Bar', icon: Wine, color: '#be185d', bg: 'rgba(236, 72, 153, 0.15)', desc: 'Pantalla KDS de coctelería y bebidas' },
};

export default function GestionUsuarios({ apiUrl, usuarioIdActual }) {
  const [usuariosLista, setUsuariosLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [idEditando, setIdEditando] = useState(null);
  const [verPin, setVerPin] = useState(false);
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', rol: 'Camarero', pin: '' });
  const [confirmData, setConfirmData] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargarUsuarios = async () => {
    setCargando(true);
    try {
      const res = await fetch(`${apiUrl}/api/usuarios`, {
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsuariosLista(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Error usuarios:", e);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const manejarCambioInput = (e) => {
    const { name, value } = e.target;
    setNuevoUsuario((prev) => ({ ...prev, [name]: value }));
  };

  const prepararEdicion = (usu) => {
    setModoEdicion(true);
    setIdEditando(usu.id);
    setNuevoUsuario({ nombre: usu.nombre, rol: usu.rol, pin: '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicion = () => {
    setModoEdicion(false);
    setIdEditando(null);
    setNuevoUsuario({ nombre: '', rol: 'Camarero', pin: '' });
  };

  const guardarUsuario = async (e) => {
    e.preventDefault();
    const nombre = String(nuevoUsuario.nombre || '').trim();
    const rol = String(nuevoUsuario.rol || 'Camarero');
    const pin = String(nuevoUsuario.pin || '').trim();

    if (!nombre) {
      toastAviso('Completa el nombre del colaborador antes de guardar.');
      return;
    }
    if (!modoEdicion && !pin) {
      toastAviso('Ingresa el PIN de acceso numérico para el nuevo usuario.');
      return;
    }
    if (pin && !/^[0-9]{4,12}$/.test(pin)) {
      toastAviso('El PIN debe contener entre 4 y 12 dígitos numéricos.');
      return;
    }

    setGuardando(true);
    try {
      const url = modoEdicion ? `${apiUrl}/api/usuarios/${idEditando}` : `${apiUrl}/api/usuarios`;
      const res = await fetch(url, {
        method: modoEdicion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
        body: JSON.stringify({ nombre, rol, ...(pin ? { pin } : {}) })
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error al guardar el usuario.');
        return;
      }
      toastAviso(modoEdicion ? '✅ Usuario actualizado con éxito.' : '✨ Nuevo usuario registrado correctamente.');
      cancelarEdicion();
      cargarUsuarios();
    } catch (err) {
      toastAviso('Error de conexión al guardar el usuario.');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarUsuario = (id, nombre) => {
    setConfirmData({
      mensaje: `¿Estás seguro de eliminar el acceso de "${nombre}" del sistema?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${apiUrl}/api/usuarios/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
          });
          if (res.ok) {
            toastAviso('🗑️ Acceso de usuario eliminado.');
            cargarUsuarios();
          } else {
            const data = await res.json();
            toastAviso(data.error || 'No se pudo eliminar el usuario.');
          }
        } catch {
          toastAviso('Error al procesar la solicitud.');
        }
      }
    });
  };

  // KPIs
  const conteoRoles = useMemo(() => {
    const kpis = { total: usuariosLista.length, admin: 0, cajero: 0, camarero: 0, kds: 0 };
    usuariosLista.forEach(u => {
      if (u.rol === 'Administrador') kpis.admin++;
      else if (u.rol === 'Cajero') kpis.cajero++;
      else if (u.rol === 'Camarero' || u.rol === 'Capitán de Camareros') kpis.camarero++;
      else if (u.rol === 'Cocina' || u.rol === 'Bar') kpis.kds++;
    });
    return kpis;
  }, [usuariosLista]);

  // Filtro y Búsqueda
  const usuariosFiltrados = useMemo(() => {
    return usuariosLista.filter(u => {
      const matchTexto = (u.nombre || '').toLowerCase().includes(busqueda.toLowerCase()) || String(u.id).includes(busqueda);
      const matchRol = filtroRol === 'todos' || u.rol === filtroRol;
      return matchTexto && matchRol;
    });
  }, [usuariosLista, busqueda, filtroRol]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      
      {/* ── KPIs Superiores Horizontales ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', width: '100%' }}>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', background: 'var(--glass-bg)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--kpi-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Total Personal</span>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{conteoRoles.total}</div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', background: 'var(--glass-bg)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--kpi-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Crown size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Administradores</span>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{conteoRoles.admin}</div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', background: 'var(--glass-bg)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.15)', color: 'var(--kpi-cyan)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CreditCard size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Cajeros</span>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{conteoRoles.cajero}</div>
          </div>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', background: 'var(--glass-bg)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: 'var(--kpi-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserCheck size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Salón & Mesas</span>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{conteoRoles.camarero}</div>
          </div>
        </div>
      </div>

      {/* ── Formulario y Lista Principal ── */}
      <div className="admin-responsive-grid">
        
        {/* Columna Izquierda: Lista de Colaboradores */}
        <div className="admin-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} style={{ color: 'var(--kpi-gold)' }} />
                Equipo de Trabajo
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--admin-text-muted)' }}>
                Gestiona roles, accesos y claves PIN de tu personal.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', minWidth: '180px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--admin-text-muted)' }} />
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="admin-input"
                  style={{ paddingLeft: '32px', fontSize: '0.82rem', height: '36px' }}
                />
              </div>

              <select
                value={filtroRol}
                onChange={(e) => setFiltroRol(e.target.value)}
                className="admin-select"
                style={{ fontSize: '0.82rem', height: '36px', width: 'auto', minWidth: '130px' }}
              >
                <option value="todos">Todos los roles</option>
                <option value="Administrador">Administrador</option>
                <option value="Cajero">Cajero</option>
                <option value="Camarero">Camarero</option>
                <option value="Capitán de Camareros">Capitán</option>
                <option value="Cocina">Cocina</option>
                <option value="Bar">Bar</option>
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>ID</th>
                  <th>Colaborador</th>
                  <th>Rol Asignado</th>
                  <th>Acceso PIN</th>
                  <th style={{ textAlign: 'right', width: '100px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--admin-text-muted)' }}>Cargando personal...</td></tr>
                ) : usuariosFiltrados.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--admin-text-muted)' }}>No se encontraron colaboradores registrados.</td></tr>
                ) : (
                  usuariosFiltrados.map((usu) => {
                    const infoRol = ROLES_INFO[usu.rol] || { label: usu.rol, icon: UserCheck, color: 'var(--text-muted)', bg: 'rgba(148, 163, 184, 0.15)' };
                    const IconoRol = infoRol.icon;
                    const esActual = usu.id === usuarioIdActual;

                    return (
                      <tr key={usu.id} style={{ background: idEditando === usu.id ? 'rgba(245, 184, 61, 0.08)' : 'transparent', transition: 'background 0.2s ease' }}>
                        <td style={{ color: 'var(--admin-text-muted)', fontSize: '0.8rem', fontWeight: 600 }}>#{usu.id}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: infoRol.bg, color: infoRol.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                              {usu.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <strong style={{ color: 'var(--text-primary)', fontSize: '0.88rem' }}>{usu.nombre}</strong>
                              {esActual && <span style={{ marginLeft: '6px', fontSize: '0.68rem', color: 'var(--kpi-gold)', background: 'rgba(245, 184, 61, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>Tú</span>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 600, background: infoRol.bg, color: infoRol.color }}>
                            <IconoRol size={12} />
                            {infoRol.label}
                          </span>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--admin-text-muted)', fontSize: '0.82rem', fontFamily: 'monospace' }}>
                            <Lock size={12} />
                            ••••••
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => prepararEdicion(usu)}
                              className="admin-btn admin-btn-secondary"
                              style={{ padding: '6px 8px', height: '30px' }}
                              title="Editar usuario"
                            >
                              <Pencil size={13} />
                            </button>
                            {!esActual && (
                              <button
                                type="button"
                                onClick={() => eliminarUsuario(usu.id, usu.nombre)}
                                className="admin-btn admin-btn-danger"
                                style={{ padding: '6px 8px', height: '30px' }}
                                title="Eliminar usuario"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Columna Derecha: Formulario Alta / Edición */}
        <div className="admin-card" style={{ padding: '22px', border: modoEdicion ? '1px solid var(--kpi-gold)' : '1px solid var(--border-subtle)', position: 'sticky', top: '16px' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: modoEdicion ? 'rgba(245, 184, 61, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: modoEdicion ? 'var(--kpi-gold)' : 'var(--kpi-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {modoEdicion ? <Pencil size={18} /> : <UserPlus size={18} />}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {modoEdicion ? 'Editar Colaborador' : 'Registrar Nuevo Acceso'}
                </h3>
                <span style={{ fontSize: '0.74rem', color: 'var(--admin-text-muted)' }}>
                  {modoEdicion ? 'Actualiza los datos o PIN de este colaborador' : 'Ingresa los datos para autorizar el acceso'}
                </span>
              </div>
            </div>

            {modoEdicion && (
              <button
                type="button"
                onClick={cancelarEdicion}
                className="admin-btn admin-btn-secondary"
                style={{ padding: '5px 8px', fontSize: '0.75rem' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <form onSubmit={guardarUsuario} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            <div className="admin-form-group">
              <label className="admin-label">Nombre Completo *</label>
              <input
                type="text"
                name="nombre"
                className="admin-input"
                placeholder="Ej: Carlos Ramírez"
                value={nuevoUsuario.nombre}
                onChange={manejarCambioInput}
                required
              />
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Rol y Nivel de Acceso *</label>
              <select
                name="rol"
                className="admin-select"
                value={nuevoUsuario.rol}
                onChange={manejarCambioInput}
              >
                <option value="Camarero">Camarero (Toma de pedidos en mesas)</option>
                <option value="Capitán de Camareros">Capitán de Salón (Pedidos + Anulaciones)</option>
                <option value="Cajero">Cajero (Cobro de cuentas y control de caja)</option>
                <option value="Cocina">Cocina (Visualización y despacho en KDS)</option>
                <option value="Bar">Bar (Visualización y despacho en Bar)</option>
                <option value="Administrador">Administrador (Acceso total al sistema)</option>
              </select>
            </div>

            {/* Tarjeta Informativa del Rol */}
            {ROLES_INFO[nuevoUsuario.rol] && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', padding: '10px 12px', borderRadius: '10px', fontSize: '0.75rem', color: 'var(--admin-text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={14} style={{ color: ROLES_INFO[nuevoUsuario.rol].color, flexShrink: 0 }} />
                <span>{ROLES_INFO[nuevoUsuario.rol].desc}</span>
              </div>
            )}

            <div className="admin-form-group">
              <label className="admin-label">
                PIN de Acceso {modoEdicion ? '(Opcional: Dejar vacío para mantener el actual)' : '* (4 a 12 dígitos)'}
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={verPin ? "text" : "password"}
                  name="pin"
                  className="admin-input"
                  placeholder={modoEdicion ? "••••••••" : "Ej: 123456"}
                  maxLength="12"
                  value={nuevoUsuario.pin}
                  onChange={manejarCambioInput}
                  required={!modoEdicion}
                  style={{ paddingRight: '40px', letterSpacing: verPin ? 'normal' : '0.15em' }}
                />
                <button
                  type="button"
                  onClick={() => setVerPin(!verPin)}
                  style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--admin-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  {verPin ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <small style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '4px', display: 'block' }}>
                Este PIN se utiliza en la pantalla de entrada rápida y teclados táctiles.
              </small>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="submit"
                disabled={guardando}
                className="admin-btn admin-btn-primary"
                style={{ flex: 1, padding: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Save size={16} />
                {guardando ? 'Guardando...' : modoEdicion ? 'Actualizar Colaborador' : 'Guardar y Autorizar'}
              </button>

              {modoEdicion && (
                <button
                  type="button"
                  onClick={cancelarEdicion}
                  className="admin-btn admin-btn-secondary"
                  style={{ padding: '11px 16px' }}
                >
                  Cancelar
                </button>
              )}
            </div>

          </form>
        </div>

      </div>

      {confirmData && (
        <ConfirmModal
          mensaje={confirmData.mensaje}
          onConfirm={async () => {
            await confirmData.onConfirm();
            setConfirmData(null);
          }}
          onCancel={() => setConfirmData(null)}
        />
      )}

    </div>
  );
}

