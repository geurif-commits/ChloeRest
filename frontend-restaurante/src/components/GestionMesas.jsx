import { useState, useEffect } from 'react';
import { sanitizarEntero } from '../utils/input.js';
import { toastAviso, toastError } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';
import {
  TableProperties, Plus, Pencil, Trash2, Save,
  CheckCircle, AlertCircle, X, Search, Sparkles
} from 'lucide-react';

function GestionMesas({ apiUrl }) {
  const [mesas, setMesas] = useState([]);
  const [cantidadNuevas, setCantidadNuevas] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [confirmData, setConfirmData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const urlBase = apiUrl;

  useEffect(() => {
    cargarMesas();
  }, []);

  const cargarMesas = async () => {
    try {
      const res = await fetch(`${urlBase}/api/mesas`);
      const data = await res.json();
      setMesas(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error cargando mesas:", error);
    } finally {
      setCargando(false);
    }
  };

  const generarMesasMasivas = async (e) => {
    e.preventDefault();
    if (!cantidadNuevas || parseInt(cantidadNuevas, 10) <= 0) return;
    try {
      const res = await fetch(`${urlBase}/api/mesas/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cantidad: parseInt(cantidadNuevas, 10) })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje || 'Mesas generadas exitosamente.');
        setCantidadNuevas('');
        cargarMesas();
      } else {
        toastAviso(data.error || 'Error al generar mesas.');
      }
    } catch (error) {
      toastError("Error al generar mesas.");
    }
  };

  const iniciarEdicion = (mesa) => {
    setEditandoId(mesa.id);
    setNombreEditado(mesa.nombre_numero);
  };

  const guardarEdicion = async (id) => {
    try {
      const res = await fetch(`${urlBase}/api/mesas/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_numero: nombreEditado })
      });
      if (res.ok) {
        setEditandoId(null);
        toastAviso('Identificador de mesa actualizado.');
        cargarMesas();
      } else {
        toastError("Error al actualizar el nombre de la mesa.");
      }
    } catch (error) {
      toastError("Error de conexión.");
    }
  };

  const eliminarMesa = async (id, nombre, estado) => {
    if (estado === 'Ocupada') {
      toastAviso("No puedes eliminar una mesa que se encuentra ocupada actualmente.");
      return;
    }
    setConfirmData({
      mensaje: `¿Seguro que deseas eliminar la "${nombre}"?`,
      onConfirm: async () => {
        try {
          const res = await fetch(`${urlBase}/api/mesas/${id}`, { method: 'DELETE' });
          const data = await res.json();
          if (res.ok) {
            toastAviso('Mesa eliminada del salón.');
            cargarMesas();
          } else {
            toastAviso(data.error || 'Error al eliminar mesa.');
          }
        } catch (error) {
          toastError("Error al eliminar la mesa.");
        }
      }
    });
  };

  const mesasFiltradas = mesas.filter((m) => {
    const q = busqueda.toLowerCase();
    return (
      String(m.id).includes(q) ||
      (m.nombre_numero || '').toLowerCase().includes(q) ||
      (m.estado || '').toLowerCase().includes(q)
    );
  });

  const totalOcupadas = mesas.filter(m => m.estado === 'Ocupada').length;
  const totalDisponibles = mesas.filter(m => m.estado !== 'Ocupada').length;

  if (cargando) {
    return (
      <div className="admin-empty">
        <TableProperties size={36} style={{ color: 'var(--gold)', animation: 'pulse 1.5s infinite' }} />
        <p style={{ color: 'var(--text-muted)' }}>Cargando distribución del salón...</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
        
        {/* Banner de Estado del Salón Horizontal */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', width: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', padding: '14px 18px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(245, 184, 61, 0.15)', color: 'var(--gold, #f5b842)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <TableProperties size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total de Mesas</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff' }}>{mesas.length}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', padding: '14px 18px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mesas Libres</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#22c55e' }}>{totalDisponibles}</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', padding: '14px 18px', background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <AlertCircle size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mesas Ocupadas</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ef4444' }}>{totalOcupadas}</div>
            </div>
          </div>
        </div>

        {/* Sección 1: Generador Rápido de Mesas */}
        <div className="admin-section">
          <h3 className="admin-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Plus size={18} style={{ color: 'var(--gold)' }} />
            <span>Generar Mesas Masivamente</span>
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Crea bloques correlativos de mesas de forma instantánea para tu restaurante.
          </p>

          <form onSubmit={generarMesasMasivas} style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Cantidad de mesas (Ej: 10)"
              value={cantidadNuevas}
              onChange={(e) => setCantidadNuevas(sanitizarEntero(e.target.value))}
              className="admin-input"
              style={{ width: '220px' }}
              required
            />
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Sparkles size={16} />
              <span>Crear Mesas</span>
            </button>
          </form>
        </div>

        {/* Sección 2: Listado y Edición Individual de Mesas */}
        <div className="admin-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 className="admin-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TableProperties size={18} style={{ color: 'var(--gold)' }} />
                <span>Identificadores y Distribución del Salón ({mesasFiltradas.length})</span>
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Personaliza nombres comerciales para tus zonas como "Terraza VIP", "Barra 1" o "Mesa 12".
              </p>
            </div>

            <div style={{ position: 'relative', width: '100%', maxWidth: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Buscar mesa..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="admin-input"
                style={{ paddingLeft: '32px', fontSize: '0.8rem', height: '34px' }}
              />
            </div>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nº / ID</th>
                  <th>Identificador Comercial</th>
                  <th>Estado en Salón</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {mesasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)' }}>
                      No hay mesas registradas en el plano.
                    </td>
                  </tr>
                ) : (
                  mesasFiltradas.map((mesa) => (
                    <tr key={mesa.id}>
                      <td style={{ fontWeight: 800, color: 'var(--gold)', fontSize: '0.82rem' }}>
                        #{mesa.id}
                      </td>
                      <td>
                        {editandoId === mesa.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                              type="text"
                              value={nombreEditado}
                              onChange={(e) => setNombreEditado(e.target.value)}
                              className="admin-input"
                              style={{ height: '32px', maxWidth: '200px', fontSize: '0.85rem' }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => guardarEdicion(mesa.id)}
                              className="admin-btn admin-btn-primary"
                              style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                            >
                              <Save size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditandoId(null)}
                              className="admin-btn admin-btn-secondary"
                              style={{ padding: '4px 8px', fontSize: '0.76rem' }}
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                            {mesa.nombre_numero}
                          </strong>
                        )}
                      </td>
                      <td>
                        <span className={`admin-badge ${mesa.estado === 'Ocupada' ? 'admin-badge-danger' : 'admin-badge-success'}`}>
                          {mesa.estado || 'Disponible'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                          {editandoId !== mesa.id && (
                            <button
                              type="button"
                              onClick={() => iniciarEdicion(mesa)}
                              className="admin-btn admin-btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Pencil size={13} />
                              <span>Renombrar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => eliminarMesa(mesa.id, mesa.nombre_numero, mesa.estado)}
                            className="admin-btn"
                            style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ff4d4f', padding: '4px 10px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
    </>
  );
}

export default GestionMesas;
