import { useState, useEffect } from 'react';
import { sanitizarDecimal } from '../utils/input.js';
import { toastAviso } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';
import {
  ChefHat, Plus, Trash2, Search, ArrowLeft, UtensilsCrossed,
  Package, Layers, AlertCircle, Save, CheckCircle
} from 'lucide-react';

function GestionRecetas({ alVolver, apiUrl }) {
  const urlBase = apiUrl;
  const [productos, setProductos] = useState([]);
  const [ingredientes, setIngredientes] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [recetaActual, setRecetaActual] = useState([]);
  const [confirmData, setConfirmData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [busquedaPlato, setBusquedaPlato] = useState('');

  // Campos para agregar insumo a la receta
  const [ingredienteId, setIngredienteId] = useState('');
  const [cantidadNecesaria, setCantidadNecesaria] = useState('');

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const [resProd, resIng] = await Promise.all([
        fetch(`${urlBase}/api/productos`),
        fetch(`${urlBase}/api/inventario`)
      ]);
      const dataProd = await resProd.json();
      const dataIng = await resIng.json();
      const prods = Array.isArray(dataProd) ? dataProd : [];
      const ings = Array.isArray(dataIng) ? dataIng : [];
      setProductos(prods);
      setIngredientes(ings);
      if (prods.length > 0) {
        seleccionarProducto(prods[0]);
      }
    } catch (error) {
      console.error("Error al cargar productos e insumos:", error);
    } finally {
      setCargando(false);
    }
  };

  const seleccionarProducto = async (prod) => {
    setProductoSeleccionado(prod);
    try {
      const res = await fetch(`${urlBase}/api/productos/${prod.id}/receta`);
      if (res.ok) {
        const data = await res.json();
        setRecetaActual(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error cargando receta:", error);
    }
  };

  const agregarIngredienteReceta = async (e) => {
    e.preventDefault();
    if (!productoSeleccionado || !ingredienteId || !cantidadNecesaria) return;

    try {
      const res = await fetch(`${urlBase}/api/productos/${productoSeleccionado.id}/receta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingrediente_id: Number(ingredienteId),
          cantidad_necesaria: parseFloat(cantidadNecesaria)
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje || 'Insumo agregado a la receta.');
        setIngredienteId('');
        setCantidadNecesaria('');
        seleccionarProducto(productoSeleccionado);
      } else {
        toastAviso(data.error || 'Error al guardar insumo en receta.');
      }
    } catch (error) {
      toastAviso("Error al guardar ingrediente en receta.");
    }
  };

  const eliminarIngredienteReceta = async (ingId) => {
    setConfirmData({
      mensaje: '¿Quitar este insumo de la receta del plato?',
      onConfirm: async () => {
        try {
          const res = await fetch(`${urlBase}/api/productos/${productoSeleccionado.id}/receta/${ingId}`, { method: 'DELETE' });
          if (res.ok) {
            toastAviso('Insumo removido de la receta.');
            seleccionarProducto(productoSeleccionado);
          }
        } catch (error) {
          toastAviso("Error al eliminar ingrediente de receta.");
        }
      }
    });
  };

  const productosFiltrados = productos.filter((p) => {
    const q = busquedaPlato.toLowerCase();
    return (
      (p.nombre || '').toLowerCase().includes(q) ||
      (p.categoria || '').toLowerCase().includes(q)
    );
  });

  if (cargando) {
    return (
      <div className="admin-empty">
        <ChefHat size={36} style={{ color: 'var(--gold)', animation: 'pulse 1.5s infinite' }} />
        <p style={{ color: 'var(--text-muted)' }}>Cargando escandallo y recetas...</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {alVolver && (
              <button onClick={alVolver} className="admin-btn admin-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <ArrowLeft size={16} /> Volver
              </button>
            )}
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ChefHat size={22} style={{ color: 'var(--gold)' }} />
              <span>Escandallo, Recetas y Control de Costos</span>
            </h2>
          </div>
        </div>

        {/* Panel Dividido en 2 Columnas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'start', width: '100%' }}>
          
          {/* Columna 1: Selección de Platos del Menú */}
          <div className="admin-section" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 className="admin-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UtensilsCrossed size={18} style={{ color: 'var(--gold)' }} />
                <span>Platos del Menú ({productosFiltrados.length})</span>
              </h3>

              <div style={{ position: 'relative', width: '100%', maxWidth: '200px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  placeholder="Filtrar platos..."
                  value={busquedaPlato}
                  onChange={(e) => setBusquedaPlato(e.target.value)}
                  className="admin-input"
                  style={{ paddingLeft: '30px', fontSize: '0.8rem', height: '34px' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
              {productosFiltrados.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  No se encontraron platos en el menú.
                </div>
              ) : (
                productosFiltrados.map((prod) => {
                  const seleccionado = productoSeleccionado?.id === prod.id;
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => seleccionarProducto(prod)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: seleccionado ? 'rgba(245, 184, 61, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                        border: seleccionado ? '1px solid rgba(245, 184, 61, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: seleccionado ? 'var(--gold)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {prod.nombre}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                          RD$ {Number(prod.precio || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <span className="admin-badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
                        {prod.categoria || 'General'}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Columna 2: Receta e Insumos del Plato */}
          {productoSeleccionado ? (
            <div className="admin-section" style={{ minWidth: 0 }}>
              <div style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--gold)' }}>
                    Receta: {productoSeleccionado.nombre}
                  </h3>
                  <span className="admin-badge admin-badge-success" style={{ fontSize: '0.72rem' }}>
                    {recetaActual.length} Insumo(s)
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Al cobrar este plato, el sistema descontará automáticamente del inventario las porciones configuradas.
                </p>
              </div>

              {/* Formulario Agregar Insumo */}
              <form onSubmit={agregarIngredienteReceta} style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.07)', padding: '14px', borderRadius: '10px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div className="admin-form-group">
                    <label className="admin-label">Seleccionar Insumo de Almacén</label>
                    <select
                      value={ingredienteId}
                      onChange={(e) => setIngredienteId(e.target.value)}
                      className="admin-select"
                      required
                    >
                      <option value="">-- Insumo a descontar --</option>
                      {ingredientes.map((ing) => (
                        <option key={ing.id} value={ing.id}>
                          {ing.nombre} (Stock: {ing.stock_actual} {ing.unidad_medida})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-label">Porción por Plato</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej: 0.25"
                      value={cantidadNecesaria}
                      onChange={(e) => setCantidadNecesaria(sanitizarDecimal(e.target.value))}
                      className="admin-input"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="admin-btn admin-btn-primary"
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} />
                  <span>Agregar a la Receta</span>
                </button>
              </form>

              {/* Tabla de Insumos de la Receta */}
              <div style={{ overflowX: 'auto', width: '100%' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Insumo</th>
                      <th>Porción Requerida</th>
                      <th>Stock en Almacén</th>
                      <th style={{ textAlign: 'right' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recetaActual.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                          Este plato aún no tiene insumos asignados en su receta.
                        </td>
                      </tr>
                    ) : (
                      recetaActual.map((item) => (
                        <tr key={item.id || item.ingrediente_id}>
                          <td style={{ fontWeight: 700, color: 'var(--gold)' }}>
                            {item.ingrediente_nombre}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {Number(item.cantidad_necesaria)} {item.unidad_medida}
                          </td>
                          <td style={{ color: 'var(--text-muted)' }}>
                            {item.stock_actual} {item.unidad_medida}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => eliminarIngredienteReceta(item.ingrediente_id)}
                              className="admin-btn"
                              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ff4d4f', padding: '4px 10px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Trash2 size={13} />
                              <span>Quitar</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="admin-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px', color: 'var(--text-dim)' }}>
              Selecciona un plato para editar su receta e insumos.
            </div>
          )}

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

export default GestionRecetas;
