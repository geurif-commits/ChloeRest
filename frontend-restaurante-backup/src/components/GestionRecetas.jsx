import { useState, useEffect } from 'react';
import { sanitizarDecimal } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';

function GestionRecetas({ alVolver, apiUrl }) {
  const urlBase = apiUrl;
  const [productos, setProductos] = useState([]);
  const [ingredientes, setIngredientes] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [recetaActual, setRecetaActual] = useState([]);
  const [confirmData, setConfirmData] = useState(null);
  const [cargando, setCargando] = useState(true);

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
      setProductos(Array.isArray(dataProd) ? dataProd : []);
      setIngredientes(Array.isArray(dataIng) ? dataIng : []);
      if (dataProd.length > 0) {
        seleccionarProducto(dataProd[0]);
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
        setRecetaActual(data);
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
        setIngredienteId('');
        setCantidadNecesaria('');
        seleccionarProducto(productoSeleccionado);
      } else {
        toastAviso(`❌ ${data.error}`);
      }
    } catch (error) {
      toastAviso("⚠️ Error al guardar ingrediente en receta.");
    }
  };

  const eliminarIngredienteReceta = async (ingId) => {
    setConfirmData({ mensaje: '¿Quitar este ingrediente de la receta?', onConfirm: async () => {
      try {
        const res = await fetch(`${urlBase}/api/productos/${productoSeleccionado.id}/receta/${ingId}`, { method: 'DELETE' });
        if (res.ok) { seleccionarProducto(productoSeleccionado); }
      } catch (error) { toastAviso("⚠️ Error al guardar ingrediente en receta."); }
    }});
  };

  if (cargando) {
    return (
      <div style={{ height: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00f576', fontFamily: 'sans-serif' }}>
        <h2>Cargando recetas y escandallo...</h2>
      </div>
    );
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* HEADER */}
      <header style={{ padding: '20px 30px', background: '#14141b', borderBottom: '1px solid #2a2a38', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {alVolver && (
            <button onClick={alVolver} style={{ background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              ⬅ Volver
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>🍳 Escandallo y Recetas de Productos</h1>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ flex: 1, padding: '25px', display: 'flex', gap: '25px', overflow: 'hidden' }}>
        
        {/* COLUMNA IZQUIERDA: LISTA DE PRODUCTOS */}
        <div style={{ width: '320px', background: '#14141b', padding: '20px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <h3 style={{ color: '#00f576', margin: '0 0 15px 0' }}>🍔 Productos del Menú</h3>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {productos.map((prod) => {
              const seleccionado = productoSeleccionado?.id === prod.id;
              return (
                <div
                  key={prod.id}
                  onClick={() => seleccionarProducto(prod)}
                  style={{
                    padding: '12px 15px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background: seleccionado ? 'rgba(0, 245, 118, 0.15)' : '#1a1a24',
                    border: seleccionado ? '1px solid #00f576' : '1px solid #2a2a38',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{prod.nombre}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9494ad' }}>RD$ {Number(prod.precio).toFixed(2)}</div>
                  </div>
                  <span style={{ fontSize: '0.8rem', padding: '2px 6px', borderRadius: '4px', background: '#0a0a0f', color: '#00f576' }}>
                    {prod.categoria}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMNA DERECHA: RECETA DEL PRODUCTO SELECCIONADO */}
        {productoSeleccionado ? (
          <div style={{ flex: 1, background: '#14141b', padding: '20px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #2a2a38', paddingBottom: '15px' }}>
              <div>
                <h2 style={{ margin: 0, color: '#ffb703' }}>Receta: {productoSeleccionado.nombre}</h2>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#9494ad' }}>
                  Define los insumos que se descontarán automáticamente del almacén al cobrar este plato.
                </p>
              </div>
            </div>

            {/* FORMULARIO AGREGAR INGREDIENTE */}
            <form onSubmit={agregarIngredienteReceta} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px', background: '#1a1a24', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a38' }}>
              <div style={{ flex: 2 }}>
                <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Insumo / Ingrediente</label>
                <select
                  value={ingredienteId}
                  onChange={(e) => setIngredienteId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}
                >
                  <option value="">-- Seleccionar Insumo --</option>
                  {ingredientes.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.nombre} (Stock: {ing.stock_actual} {ing.unidad_medida})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Cantidad Requerida</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej: 0.250"
                  value={cantidadNecesaria}
                  onChange={(e) => setCantidadNecesaria(sanitizarDecimal(e.target.value))}
                  required
                  style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}
                />
              </div>

              <button type="submit" style={{ background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '11px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                ➕ Agregar Insumo
              </button>
            </form>

            {/* TABLA DE INGREDIENTES DE LA RECETA */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ color: '#9494ad', textAlign: 'left', borderBottom: '1px solid #2a2a38' }}>
                    <th style={{ paddingBottom: '10px' }}>Ingrediente</th>
                    <th style={{ paddingBottom: '10px' }}>Cantidad por Porción</th>
                    <th style={{ paddingBottom: '10px' }}>Stock Disponible</th>
                    <th style={{ textAlign: 'right', paddingBottom: '10px' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {recetaActual.length === 0 ? (
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'center', padding: '40px', color: '#5e5e73', fontStyle: 'italic' }}>
                        Este producto aún no tiene insumos asignados en su receta.
                      </td>
                    </tr>
                  ) : (
                    recetaActual.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '12px 0', fontWeight: 'bold', color: '#00f576' }}>{item.ingrediente_nombre}</td>
                        <td style={{ padding: '12px 0' }}>
                          <strong>{Number(item.cantidad_necesaria)}</strong> {item.unidad_medida}
                        </td>
                        <td style={{ padding: '12px 0', color: '#9494ad' }}>
                          {item.stock_actual} {item.unidad_medida}
                        </td>
                        <td style={{ textAlign: 'right', padding: '12px 0' }}>
                          <button
                            onClick={() => eliminarIngredienteReceta(item.ingrediente_id)}
                            style={{ background: 'rgba(255, 51, 102, 0.2)', color: '#ff3366', border: '1px solid #ff3366', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            🗑️ Quitar
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5e5e73' }}>
            Selecciona un producto para configurar su receta.
          </div>
        )}

      </main>
    </div>
    {confirmData && <ConfirmModal mensaje={confirmData.mensaje} onConfirm={async () => { await confirmData.onConfirm(); setConfirmData(null); }} onCancel={() => setConfirmData(null)} />}
    </>
  );
}

export default GestionRecetas;

