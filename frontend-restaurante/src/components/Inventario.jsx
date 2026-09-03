import { useState, useEffect } from 'react';
import { sanitizarDecimal } from '../utils/input.js';
import { toastAviso } from './Toast.jsx';
import {
  Warehouse, Plus, History, ArrowLeft, ArrowUpRight, ArrowDownRight,
  SlidersHorizontal, Package, AlertTriangle, CheckCircle, Search, Save, X
} from 'lucide-react';

function Inventario({ alVolver, apiUrl }) {
  const urlBase = apiUrl;
  const [ingredientes, setIngredientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  // Estados para nuevo ingrediente
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Bebidas');
  const [stockActual, setStockActual] = useState('');
  const [unidadMedida, setUnidadMedida] = useState('Unidades');

  // Modal Ajuste de Inventario
  const [itemAjuste, setItemAjuste] = useState(null);
  const [tipoMovimiento, setTipoMovimiento] = useState('Entrada');
  const [cantidadAjuste, setCantidadAjuste] = useState('');
  const [motivoAjuste, setMotivoAjuste] = useState('');

  // Vista Historial de Movimientos
  const [viendoMovimientos, setViendoMovimientos] = useState(false);
  const [movimientos, setMovimientos] = useState([]);

  const categoriasDisponibles = [
    'Bebidas',
    'Carnes y Proteínas',
    'Vegetales y Frutas',
    'Abarrotes y Especias',
    'Lácteos y Derivados',
    'Limpieza y Despachos',
    'General'
  ];

  useEffect(() => {
    cargarInventario();
  }, []);

  const cargarInventario = async () => {
    try {
      const res = await fetch(`${urlBase}/api/inventario`);
      if (!res.ok) throw new Error("Error al conectar con el servidor de inventario.");
      const data = await res.json();
      setIngredientes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error:", error);
      toastAviso("Error de red al cargar el inventario.");
    } finally {
      setCargando(false);
    }
  };

  const cargarMovimientos = async () => {
    try {
      const res = await fetch(`${urlBase}/api/inventario/movimientos`);
      if (res.ok) {
        const data = await res.json();
        setMovimientos(Array.isArray(data) ? data : []);
        setViendoMovimientos(true);
      }
    } catch (error) {
      console.error("Error al cargar movimientos:", error);
    }
  };

  const registrarIngrediente = async (e) => {
    e.preventDefault();
    if (!nombre || stockActual === '') {
      return toastAviso("Por favor completa los campos obligatorios.");
    }

    try {
      const res = await fetch(`${urlBase}/api/inventario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          categoria,
          stock_actual: parseFloat(stockActual),
          unidad_medida: unidadMedida
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje || 'Insumo registrado correctamente.');
        setNombre('');
        setCategoria('Bebidas');
        setStockActual('');
        setUnidadMedida('Unidades');
        cargarInventario();
      } else {
        toastAviso(data.error || 'Error al registrar insumo.');
      }
    } catch (error) {
      toastAviso("Error de red al registrar el insumo.");
    }
  };

  const procesarAjuste = async (e) => {
    e.preventDefault();
    if (!itemAjuste || !cantidadAjuste) return;

    try {
      const res = await fetch(`${urlBase}/api/inventario/${itemAjuste.id}/ajustar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_movimiento: tipoMovimiento,
          cantidad: parseFloat(cantidadAjuste),
          motivo: motivoAjuste
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje || 'Ajuste procesado.');
        setItemAjuste(null);
        setCantidadAjuste('');
        setMotivoAjuste('');
        cargarInventario();
      } else {
        toastAviso(data.error || 'Error al ajustar stock.');
      }
    } catch (error) {
      toastAviso("Error de red al realizar ajuste.");
    }
  };

  const ingredientesFiltrados = ingredientes.filter((it) => {
    const q = busqueda.toLowerCase();
    return (
      (it.nombre || '').toLowerCase().includes(q) ||
      (it.categoria || '').toLowerCase().includes(q) ||
      String(it.numero_articulo || it.id).toLowerCase().includes(q)
    );
  });

  if (cargando) {
    return (
      <div className="admin-empty">
        <Warehouse size={36} style={{ color: 'var(--kpi-gold)', animation: 'pulse 1.5s infinite' }} />
        <p style={{ color: 'var(--text-muted)' }}>Cargando almacén e inventario...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
      {/* Header y Filtros */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {alVolver && (
            <button onClick={alVolver} className="admin-btn admin-btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <ArrowLeft size={16} /> Volver
            </button>
          )}
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Warehouse size={22} style={{ color: 'var(--kpi-gold)' }} />
            <span>Control de Stock y Almacén</span>
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => {
              if (viendoMovimientos) setViendoMovimientos(false);
              else cargarMovimientos();
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <History size={16} />
            <span>{viendoMovimientos ? 'Ver Existencias de Almacén' : 'Historial de Movimientos'}</span>
          </button>
        </div>
      </div>

      {viendoMovimientos ? (
        /* HISTORIAL DE MOVIMIENTOS */
        <div className="admin-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 className="admin-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} style={{ color: 'var(--kpi-gold)' }} />
              <span>Registro de Entradas, Salidas y Mermas</span>
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
              {movimientos.length} movimiento(s)
            </span>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Insumo</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Motivo / Referencia</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
                      Sin movimientos registrados en almacén.
                    </td>
                  </tr>
                ) : (
                  movimientos.map((m) => (
                    <tr key={m.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {new Date(m.fecha).toLocaleString()}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {m.ingrediente_nombre}
                      </td>
                      <td>
                        <span className={`admin-badge ${m.tipo_movimiento === 'Entrada' ? 'admin-badge-success' : 'admin-badge-danger'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {m.tipo_movimiento === 'Entrada' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                          {m.tipo_movimiento}
                        </span>
                      </td>
                      <td style={{ fontWeight: 800, color: 'var(--kpi-gold)' }}>
                        {Number(m.cantidad).toLocaleString()} {m.unidad_medida}
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>
                        {m.motivo || '—'}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {m.usuario_nombre || 'Sistema'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISTA PRINCIPAL: FORMULARIO + LISTADO DE EXISTENCIAS */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', alignItems: 'start', width: '100%' }}>
          
          {/* Formulario de Alta de Insumo */}
          <div className="admin-section" style={{ minWidth: 0 }}>
            <h3 className="admin-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Plus size={18} style={{ color: 'var(--kpi-gold)' }} />
              <span>Registrar Insumo / Ingrediente</span>
            </h3>

            <div style={{ background: 'rgba(245, 184, 61, 0.08)', border: '1px solid rgba(245, 184, 61, 0.2)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.78rem', color: 'var(--kpi-gold)', marginBottom: '14px' }}>
              El <strong>Número de Artículo</strong> se genera y vincula automáticamente al guardar.
            </div>

            <form onSubmit={registrarIngrediente} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Nombre del Insumo / Ingrediente</label>
                <input
                  type="text"
                  placeholder="Ej: Pechuga de Pollo, Tomates, Arroz..."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="admin-input"
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Categoría de Almacén</label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="admin-select"
                >
                  {categoriasDisponibles.map((cat, idx) => (
                    <option key={idx} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="admin-form-group">
                  <label className="admin-label">Stock Inicial</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={stockActual}
                    onChange={(e) => setStockActual(sanitizarDecimal(e.target.value))}
                    className="admin-input"
                    required
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-label">Unidad de Medida</label>
                  <select
                    value={unidadMedida}
                    onChange={(e) => setUnidadMedida(e.target.value)}
                    className="admin-select"
                  >
                    <option value="Unidades">Unidades</option>
                    <option value="Gramos">Gramos (g)</option>
                    <option value="Kilogramos">Kilogramos (kg)</option>
                    <option value="Libras">Libras (lb)</option>
                    <option value="Mililitros">Mililitros (ml)</option>
                    <option value="Litros">Litros (L)</option>
                    <option value="Onzas">Onzas (oz)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="admin-btn admin-btn-primary"
                style={{ marginTop: '4px', width: '100%', justifyContent: 'center' }}
              >
                <Save size={16} />
                <span>Guardar Insumo en Almacén</span>
              </button>
            </form>
          </div>

          {/* Tabla de Existencias */}
          <div className="admin-section" style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 className="admin-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} style={{ color: 'var(--kpi-gold)' }} />
                <span>Existencias en Almacén ({ingredientesFiltrados.length})</span>
              </h3>

              <div style={{ position: 'relative', width: '100%', maxWidth: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                <input
                  type="text"
                  placeholder="Buscar insumo..."
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
                    <th>Artículo</th>
                    <th>Insumo</th>
                    <th>Categoría</th>
                    <th>Existencia</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredientesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)' }}>
                        No hay insumos registrados coincidentes.
                      </td>
                    </tr>
                  ) : (
                    ingredientesFiltrados.map((item) => {
                      const stockNum = Number(item.stock_actual);
                      const stockBajo = stockNum <= 5;

                      return (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 800, color: 'var(--kpi-gold)', fontSize: '0.8rem' }}>
                            {item.numero_articulo || `#${item.id}`}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.nombre}
                          </td>
                          <td>
                            <span className="admin-badge" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' }}>
                              {item.categoria || 'General'}
                            </span>
                          </td>
                          <td style={{ fontWeight: 800, color: stockBajo ? '#ff4d4f' : 'var(--text-primary)' }}>
                            {stockNum.toLocaleString()} <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400 }}>{item.unidad_medida}</span>
                          </td>
                          <td>
                            <span className={`admin-badge ${stockBajo ? 'admin-badge-danger' : 'admin-badge-success'}`}>
                              {stockBajo ? 'Stock Bajo' : 'Óptimo'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => setItemAjuste(item)}
                              className="admin-btn admin-btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <SlidersHorizontal size={13} />
                              <span>Ajustar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* Modal de Ajuste de Stock */}
      {itemAjuste && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className="admin-section" style={{ width: '100%', maxWidth: '440px', background: 'rgba(15, 20, 35, 0.98)', border: '1px solid rgba(245, 184, 61, 0.3)', boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--kpi-gold)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={18} />
                <span>Ajustar Stock: {itemAjuste.nombre}</span>
              </h3>
              <button
                type="button"
                onClick={() => setItemAjuste(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Stock actual en almacén: <strong style={{ color: 'var(--kpi-gold)' }}>{itemAjuste.stock_actual} {itemAjuste.unidad_medida}</strong>
            </p>

            <form onSubmit={procesarAjuste} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Tipo de Movimiento</label>
                <select
                  value={tipoMovimiento}
                  onChange={(e) => setTipoMovimiento(e.target.value)}
                  className="admin-select"
                >
                  <option value="Entrada">➕ Entrada / Compra a Proveedor</option>
                  <option value="Salida">➖ Salida / Merma / Desecho</option>
                  <option value="Ajuste">✏️ Ajuste Físico (Fijar valor exacto)</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Cantidad ({itemAjuste.unidad_medida})</label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Ej: 10"
                  value={cantidadAjuste}
                  onChange={(e) => setCantidadAjuste(sanitizarDecimal(e.target.value))}
                  className="admin-input"
                  required
                />
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Motivo o Referencia (Factura / Nota)</label>
                <input
                  type="text"
                  placeholder="Ej: Factura Proveedor #1042"
                  value={motivoAjuste}
                  onChange={(e) => setMotivoAjuste(e.target.value)}
                  className="admin-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '6px' }}>
                <button type="button" onClick={() => setItemAjuste(null)} className="admin-btn admin-btn-secondary" style={{ justifyContent: 'center' }}>
                  Cancelar
                </button>
                <button type="submit" className="admin-btn admin-btn-primary" style={{ justifyContent: 'center' }}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Inventario;
