import { useState, useEffect } from 'react';
import { sanitizarDecimal } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';

function Inventario({ alVolver, apiUrl }) {
  const urlBase = apiUrl;
  const [ingredientes, setIngredientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  // Estados para nuevo ingrediente
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Bebidas 🥤');
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
    'Bebidas 🥤',
    'Carnes y Proteínas 🥩',
    'Vegetales y Frutas 🥗',
    'Abarrotes y Especias 🧂',
    'Lácteos y Derivados 🧀',
    'Limpieza y Despachos 🧹'
  ];

  useEffect(() => {
    cargarInventario();
  }, []);

  const cargarInventario = async () => {
    try {
      const res = await fetch(`${urlBase}/api/inventario`);
      if (!res.ok) throw new Error("Error al conectar con el servidor de inventario.");
      const data = await res.json();
      setIngredientes(data);
    } catch (error) {
      console.error("Error:", error);
      toastAviso("⚠️ Error de red al cargar el inventario.");
    } finally {
      setCargando(false);
    }
  };

  const cargarMovimientos = async () => {
    try {
      const res = await fetch(`${urlBase}/api/inventario/movimientos`);
      if (res.ok) {
        const data = await res.json();
        setMovimientos(data);
        setViendoMovimientos(true);
      }
    } catch (error) {
      console.error("Error al cargar movimientos:", error);
    }
  };

  const registrarIngrediente = async (e) => {
    e.preventDefault();
    if (!nombre || stockActual === '') {
      return toastAviso("⚠️ Por favor completa los campos obligatorios.");
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
        toastAviso(`✅ ${data.mensaje}\n🏷️ Número de Artículo Asignado: ${data.numero_articulo}`);
        setNombre('');
        setCategoria('Bebidas 🥤');
        setStockActual('');
        setUnidadMedida('Unidades');
        cargarInventario();
      } else {
        toastAviso(`❌ ${data.error}`);
      }
    } catch (error) {
      toastAviso("⚠️ Error de red al registrar el insumo.");
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
        toastAviso(`✅ ${data.mensaje}`);
        setItemAjuste(null);
        setCantidadAjuste('');
        setMotivoAjuste('');
        cargarInventario();
      } else {
        toastAviso(`❌ ${data.error}`);
      }
    } catch (error) {
      toastAviso("⚠️ Error de red al realizar ajuste.");
    }
  };

  if (cargando) {
    return (
      <div style={{height: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00f576', fontFamily: 'sans-serif'}}>
        <h2>Cargando almacén e inventario...</h2>
      </div>
    );
  }

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box'}}>
      
      {/* HEADER */}
      <header style={{padding: '20px 30px', background: '#14141b', borderBottom: '1px solid #2a2a38', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
          {alVolver && (
            <button onClick={alVolver} style={{background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem'}}>
              ⬅ Volver
            </button>
          )}
          <h1 style={{margin: 0, fontSize: '1.4rem', fontWeight: '800'}}>📦 Control de Inventario y Almacén</h1>
        </div>
        <button
          onClick={() => {
            if (viendoMovimientos) setViendoMovimientos(false);
            else cargarMovimientos();
          }}
          style={{ background: '#1a1a24', border: '1px solid #00f576', color: '#00f576', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {viendoMovimientos ? '📋 Ver Existencias' : '📊 Historial de Movimientos'}
        </button>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{flex: 1, padding: '25px', display: 'flex', gap: '25px', overflow: 'hidden', boxSizing: 'border-box'}}>
        
        {viendoMovimientos ? (
          /* HISTORIAL DE MOVIMIENTOS */
          <div style={{ flex: 1, background: '#14141b', padding: '20px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <h3 style={{ color: '#00f576', margin: '0 0 15px 0' }}>📋 Historial de Entradas, Salidas y Mermas</h3>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ color: '#9494ad', textAlign: 'left', borderBottom: '1px solid #2a2a38' }}>
                    <th style={{ paddingBottom: '10px' }}>Fecha</th>
                    <th style={{ paddingBottom: '10px' }}>Insumo</th>
                    <th style={{ paddingBottom: '10px' }}>Tipo</th>
                    <th style={{ paddingBottom: '10px' }}>Cantidad</th>
                    <th style={{ paddingBottom: '10px' }}>Motivo</th>
                    <th style={{ paddingBottom: '10px' }}>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#5e5e73' }}>Sin movimientos registrados.</td></tr>
                  ) : (
                    movimientos.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '10px 0', color: '#9494ad' }}>{new Date(m.fecha).toLocaleString()}</td>
                        <td style={{ padding: '10px 0', fontWeight: 'bold' }}>{m.ingrediente_nombre}</td>
                        <td style={{ padding: '10px 0' }}>
                          <span style={{
                            padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold',
                            background: m.tipo_movimiento === 'Entrada' ? 'rgba(0,245,118,0.15)' : 'rgba(255,51,102,0.15)',
                            color: m.tipo_movimiento === 'Entrada' ? '#00f576' : '#ff3366'
                          }}>
                            {m.tipo_movimiento}
                          </span>
                        </td>
                        <td style={{ padding: '10px 0', fontWeight: 'bold' }}>{Number(m.cantidad)} {m.unidad_medida}</td>
                        <td style={{ padding: '10px 0', color: '#9494ad' }}>{m.motivo || '-'}</td>
                        <td style={{ padding: '10px 0', color: '#9494ad' }}>{m.usuario_nombre || 'Sistema'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            {/* COLUMNA IZQUIERDA: FORMULARIO NUEVO INGREDIENTE */}
            <div style={{width: '380px', background: '#14141b', padding: '20px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', gap: '15px', height: 'fit-content', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'}}>
              <h3 style={{color: '#00f576', margin: 0, fontSize: '1.1rem'}}>➕ Registrar Insumo / Ingrediente</h3>
              
              <div style={{background: 'rgba(0, 245, 118, 0.08)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#00f576'}}>
                ℹ️ El <strong>Número de Artículo</strong> se asignará automáticamente al guardar.
              </div>

              <form onSubmit={registrarIngrediente} style={{display: 'flex', flexDirection: 'column', gap: '12px'}}>
                <div>
                  <label style={{fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Nombre del Insumo</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Pechuga de Pollo, Tomates..." 
                    value={nombre} 
                    onChange={(e) => setNombre(e.target.value)} 
                    required 
                    style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} 
                  />
                </div>

                <div>
                  <label style={{fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Categoría</label>
                  <select 
                    value={categoria} 
                    onChange={(e) => setCategoria(e.target.value)} 
                    style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}}
                  >
                    {categoriasDisponibles.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div style={{display: 'flex', gap: '10px'}}>
                  <div style={{flex: 1}}>
                    <label style={{fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Stock Inicial</label>
                    <input 
                      type="text" 
                      inputMode="decimal" 
                      placeholder="0.00" 
                      value={stockActual} 
                      onChange={(e) => setStockActual(sanitizarDecimal(e.target.value))} 
                      required 
                      style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} 
                    />
                  </div>

                  <div style={{flex: 1}}>
                    <label style={{fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Unidad</label>
                    <select 
                      value={unidadMedida} 
                      onChange={(e) => setUnidadMedida(e.target.value)} 
                      style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}}
                    >
                      <option value="Unidades">Unidades</option>
                      <option value="Gramos">Gramos</option>
                      <option value="Kilogramos">Kilogramos</option>
                      <option value="Libras">Libras</option>
                      <option value="Mililitros">Mililitros</option>
                      <option value="Litros">Litros</option>
                      <option value="Onzas">Onzas</option>
                    </select>
                  </div>
                </div>

                <button type="submit" style={{marginTop: '5px', background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '11px', borderRadius: '8px', fontWeight: '800', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 4px 15px rgba(0,245,118,0.2)'}}>
                  💾 Guardar Insumo con Autonumeración
                </button>
              </form>
            </div>

            {/* COLUMNA DERECHA: TABLA DE INVENTARIO ACTUAL */}
            <div style={{flex: 1, background: '#14141b', padding: '20px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.3)', overflow: 'hidden'}}>
              <h3 style={{color: '#ffb703', margin: '0 0 15px 0', fontSize: '1.1rem'}}>📋 Existencias Actuales en Almacén ({ingredientes.length})</h3>

              <div style={{flex: 1, overflowY: 'auto', paddingRight: '5px'}}>
                <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem'}}>
                  <thead>
                    <tr style={{color: '#9494ad', textAlign: 'left', borderBottom: '1px solid #2a2a38'}}>
                      <th style={{paddingBottom: '10px'}}>Nº Artículo</th>
                      <th style={{paddingBottom: '10px'}}>Ingrediente / Insumo</th>
                      <th style={{paddingBottom: '10px'}}>Categoría</th>
                      <th style={{paddingBottom: '10px'}}>Existencia</th>
                      <th style={{paddingBottom: '10px'}}>Estado Stock</th>
                      <th style={{textAlign: 'right', paddingBottom: '10px'}}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ingredientes.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{textAlign: 'center', padding: '40px', color: '#5e5e73', fontStyle: 'italic'}}>
                          No hay ingredientes registrados en el inventario.
                        </td>
                      </tr>
                    ) : (
                      ingredientes.map((item) => {
                        const stockNum = Number(item.stock_actual);
                        const stockBajo = stockNum <= 5; 

                        return (
                          <tr key={item.id} style={{borderBottom: '1px solid rgba(255,255,255,0.03)'}}>
                            <td style={{padding: '10px 0', color: '#00f576', fontWeight: 'bold'}}>{item.numero_articulo || `#${item.id}`}</td>
                            <td style={{padding: '10px 0', fontWeight: 'bold'}}>{item.nombre}</td>
                            <td style={{padding: '10px 0'}}>
                              <span style={{background: '#1a1a24', border: '1px solid #2a2a38', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem', color: '#9494ad'}}>
                                {item.categoria || 'General'}
                              </span>
                            </td>
                            <td style={{padding: '10px 0', color: stockBajo ? '#ff3366' : '#fff', fontWeight: '800'}}>
                              {stockNum.toLocaleString()} <span style={{fontSize: '0.75rem', color: '#9494ad', fontWeight: 'normal'}}>{item.unidad_medida}</span>
                            </td>
                            <td style={{padding: '10px 0'}}>
                              <span style={{
                                fontSize: '0.75rem', fontWeight: '700', padding: '4px 8px', borderRadius: '10px',
                                background: stockBajo ? 'rgba(255,51,102,0.15)' : 'rgba(0,245,118,0.15)',
                                color: stockBajo ? '#ff3366' : '#00f576'
                              }}>
                                {stockBajo ? '⚠️ Stock Bajo' : '✅ Óptimo'}
                              </span>
                            </td>
                            <td style={{textAlign: 'right', padding: '10px 0'}}>
                              <button
                                onClick={() => setItemAjuste(item)}
                                style={{ background: '#1a1a24', border: '1px solid #00f576', color: '#00f576', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                              >
                                ⚡ Ajustar / Compra
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
          </>
        )}

      </main>

      {/* MODAL AJUSTE DE INVENTARIO */}
      {itemAjuste && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#14141b', padding: '25px', borderRadius: '16px', border: '1px solid #2a2a38', width: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <h3 style={{ color: '#00f576', margin: 0 }}>⚡ Ajustar Stock: {itemAjuste.nombre}</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#9494ad' }}>
              Stock actual: <strong>{itemAjuste.stock_actual} {itemAjuste.unidad_medida}</strong>
            </p>

            <form onSubmit={procesarAjuste} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Tipo Movimiento</label>
                <select value={tipoMovimiento} onChange={(e) => setTipoMovimiento(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}>
                  <option value="Entrada">➕ Entrada / Compra a Proveedor</option>
                  <option value="Salida">➖ Salida / Merma / Rotura</option>
                  <option value="Ajuste">✏️ Ajuste Físico (Fijar exacto)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Cantidad ({itemAjuste.unidad_medida})</label>
                <input type="text" inputMode="decimal" placeholder="Ej: 10" value={cantidadAjuste} onChange={(e) => setCantidadAjuste(sanitizarDecimal(e.target.value))} required style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }} />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Motivo / Referencia</label>
                <input type="text" placeholder="Ej: Factura Proveedor #1029" value={motivoAjuste} onChange={(e) => setMotivoAjuste(e.target.value)} style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }} />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{ flex: 1, background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '11px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Guardar Movimiento
                </button>
                <button type="button" onClick={() => setItemAjuste(null)} style={{ background: '#2a2a38', color: '#fff', border: 'none', padding: '11px', borderRadius: '8px', cursor: 'pointer' }}>
                  Cancelar
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
