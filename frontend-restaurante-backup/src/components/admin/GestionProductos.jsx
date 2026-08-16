import { useState, useEffect, useRef } from 'react';
import { obtenerSesion } from '../../api.js';
import { sanitizarDecimal } from '../../utils/input.js';
import { toastAviso, toastError } from '../Toast.jsx';
import ConfirmModal from '../ConfirmModal';
import './admin.css';

const TABS = [
  { id: 'productos', etiqueta: 'Productos', icono: '◇' },
  { id: 'crear', etiqueta: 'Crear', icono: '＋' },
  { id: 'categorias', etiqueta: 'Categorías', icono: '🏷️' },
  { id: 'importar', etiqueta: 'Subida Masiva', icono: '📄' },
];

const EMPTY_PRODUCTO = { nombre: '', descripcion: '', precio: '', imagen_url: '', categoria: 'Cocina', es_plato_fuerte: false, requiere_guarnicion: false, requiere_termino: false };

function GestionProductos({ apiUrl }) {
  const [pestana, setPestana] = useState('productos');
  const [productos, setProductos] = useState([]);
  const [categoriasMenu, setCategoriasMenu] = useState([]);
  const [confirmData, setConfirmData] = useState(null);

  const [nuevoProducto, setNuevoProducto] = useState(EMPTY_PRODUCTO);
  const [archivoImagen, setArchivoImagen] = useState(null);
  const fileInputRef = useRef(null);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_PRODUCTO);
  const [editArchivo, setEditArchivo] = useState(null);
  const editFileRef = useRef(null);

  const [catNombre, setCatNombre] = useState('');
  const [catGrupo, setCatGrupo] = useState('alimentos');
  const [editandoCatId, setEditandoCatId] = useState(null);
  const [editandoCatNombre, setEditandoCatNombre] = useState('');
  const [editandoCatGrupo, setEditandoCatGrupo] = useState('alimentos');

  const [archivoImportacion, setArchivoImportacion] = useState(null);
  const [archivoImportacionValido, setArchivoImportacionValido] = useState(true);
  const [importandoProductos, setImportandoProductos] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccessMessage, setImportSuccessMessage] = useState('');
  const [importErrorDetalles, setImportErrorDetalles] = useState([]);
  const [importCsvHeader, setImportCsvHeader] = useState([]);
  const importFileInputRef = useRef(null);

  const authHeaders = () => ({ 'Authorization': `Bearer ${obtenerSesion()}` });

  const cargarCategorias = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/menu-configuracion`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setCategoriasMenu(Array.isArray(data.categorias) ? data.categorias : []);
      }
    } catch (e) { console.error("Error categorías"); }
  };

  const cargarProductos = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/productos`, { headers: authHeaders() });
      setProductos(await res.json());
    } catch (e) { console.error("Error productos"); }
  };

  useEffect(() => { cargarProductos(); cargarCategorias(); }, []);

  const manejarCambioInput = (e) => setNuevoProducto({ ...nuevoProducto, [e.target.name]: e.target.value });

  const manejarArchivo = (e) => {
    setArchivoImagen(e.target.files[0]);
    setNuevoProducto({ ...nuevoProducto, imagen_url: '' });
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('nombre', nuevoProducto.nombre);
    formData.append('descripcion', nuevoProducto.descripcion || '');
    formData.append('precio', nuevoProducto.precio);
    formData.append('categoria', nuevoProducto.categoria);
    formData.append('es_plato_fuerte', String(nuevoProducto.es_plato_fuerte));
    formData.append('requiere_guarnicion', String(nuevoProducto.requiere_guarnicion));
    formData.append('requiere_termino', String(nuevoProducto.requiere_termino));
    if (nuevoProducto.imagen_url) formData.append('imagen_url', nuevoProducto.imagen_url);
    if (archivoImagen) formData.append('imagen_archivo', archivoImagen);
    try {
      const res = await fetch(`${apiUrl}/api/productos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` },
        body: formData
      });
      if (res.ok) {
        toastAviso((await res.json()).mensaje);
        setNuevoProducto(EMPTY_PRODUCTO);
        setArchivoImagen(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        cargarProductos();
      } else {
        const data = await res.json();
        toastAviso(data.error || 'Error guardando producto.');
      }
    } catch (e) { toastError("Error guardando producto."); }
  };

  const abrirEdicion = (prod) => {
    setEditForm({
      nombre: prod.nombre,
      descripcion: prod.descripcion || '',
      precio: prod.precio,
      imagen_url: prod.imagen_url || '',
      categoria: prod.categoria || 'Cocina',
      es_plato_fuerte: Boolean(prod.es_plato_fuerte),
      requiere_guarnicion: Boolean(prod.requiere_guarnicion),
      requiere_termino: Boolean(prod.requiere_termino),
    });
    setEditModal(prod);
    setEditArchivo(null);
    if (editFileRef.current) editFileRef.current.value = '';
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    if (!editModal) return;
    const formData = new FormData();
    formData.append('nombre', editForm.nombre);
    formData.append('descripcion', editForm.descripcion || '');
    formData.append('precio', editForm.precio);
    formData.append('categoria', editForm.categoria);
    formData.append('es_plato_fuerte', String(editForm.es_plato_fuerte));
    formData.append('requiere_guarnicion', String(editForm.requiere_guarnicion));
    formData.append('requiere_termino', String(editForm.requiere_termino));
    if (editForm.imagen_url) formData.append('imagen_url', editForm.imagen_url);
    if (editArchivo) formData.append('imagen_archivo', editArchivo);
    try {
      const res = await fetch(`${apiUrl}/api/productos/${editModal.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` },
        body: formData
      });
      if (res.ok) {
        toastAviso((await res.json()).mensaje);
        setEditModal(null);
        cargarProductos();
      } else {
        const data = await res.json();
        toastAviso(data.error || 'Error actualizando producto.');
      }
    } catch (e) { toastError("Error actualizando producto."); }
  };

  const eliminarProducto = (id, nombre) => {
    setConfirmData({
      mensaje: `¿Seguro que deseas eliminar "${nombre}"?`,
      onConfirm: async () => {
        await fetch(`${apiUrl}/api/productos/${id}`, { method: 'DELETE', headers: authHeaders() });
        cargarProductos();
      }
    });
  };

  const crearCategoria = async () => {
    if (!catNombre.trim()) return;
    const res = await fetch(`${apiUrl}/api/menu-configuracion/categorias`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: catNombre.trim(), grupo: catGrupo })
    });
    if (res.ok) { toastAviso('Categoría creada'); setCatNombre(''); cargarCategorias(); }
    else { toastError('Error creando categoría'); }
  };

  const guardarEdicionCategoria = async (id) => {
    if (!editandoCatNombre.trim()) return;
    const res = await fetch(`${apiUrl}/api/menu-configuracion/categorias/${id}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: editandoCatNombre.trim(), grupo: editandoCatGrupo })
    });
    if (res.ok) { toastAviso('Categoría actualizada'); setEditandoCatId(null); cargarCategorias(); }
    else { toastError('Error actualizando categoría'); }
  };

  const eliminarCategoria = (id, nombre) => {
    setConfirmData({
      mensaje: `¿Eliminar la categoría "${nombre}"? Los productos existentes conservarán su categoría.`,
      onConfirm: async () => {
        await fetch(`${apiUrl}/api/menu-configuracion/categorias/${id}`, { method: 'DELETE', headers: authHeaders() });
        cargarCategorias();
      }
    });
  };

  const parseCsvLine = (line) => {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
        else { inQuotes = !inQuotes; }
      } else if (char === ',' && !inQuotes) { values.push(current); current = ''; }
      else { current += char; }
    }
    values.push(current);
    return values.map((v) => v.trim().replace(/^"|"$/g, ''));
  };

  const manejarArchivoImportacion = (e) => {
    const archivo = e.target.files[0] || null;
    setImportError(''); setImportSuccessMessage(''); setImportErrorDetalles([]); setImportCsvHeader([]);
    setArchivoImportacion(archivo); setArchivoImportacionValido(true);
    if (!archivo) return;
    if (!archivo.name.toLowerCase().endsWith('.csv')) { setImportError('Selecciona un archivo CSV válido.'); setArchivoImportacionValido(false); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      if (!lines.length) { setImportError('El archivo CSV está vacío.'); setArchivoImportacionValido(false); return; }
      const header = parseCsvLine(lines[0]).map((v) => v.toLowerCase());
      const expected = ['nombre', 'precio', 'categoria', 'imagen_url'];
      const missing = expected.filter((col) => !header.includes(col));
      if (missing.length) { setImportError(`Columnas faltantes: ${missing.join(', ')}.`); setArchivoImportacionValido(false); return; }
      setImportCsvHeader(header); setArchivoImportacionValido(true);
    };
    reader.onerror = () => { setImportError('No se pudo leer el archivo CSV.'); setArchivoImportacionValido(false); };
    reader.readAsText(archivo, 'UTF-8');
  };

  const importarProductos = async () => {
    if (!archivoImportacion) return setImportError('Selecciona un archivo CSV primero.');
    setImportandoProductos(true); setImportError(''); setImportSuccessMessage(''); setImportErrorDetalles([]);
    try {
      const formData = new FormData();
      formData.append('archivo_csv', archivoImportacion);
      const res = await fetch(`${apiUrl}/api/productos/importar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error importando productos.');
      const inserciones = data.insertados || 0;
      const invalidRows = data.invalidRows || [];
      const skipped = invalidRows.length;
      const label = `Importación completada: ${inserciones} productos agregados.`;
      if (skipped) { setImportError('Algunos registros no se importaron por errores.'); setImportErrorDetalles(invalidRows); setImportSuccessMessage(`${label} ${skipped} fila(s) omitida(s).`); }
      else { setImportSuccessMessage(`${label} No hubo errores.`); }
      toastAviso(skipped ? `${label} ${skipped} fila(s) omitida(s).` : label);
      setArchivoImportacion(null);
      if (importFileInputRef.current) importFileInputRef.current.value = '';
      cargarProductos();
    } catch (error) { setImportError(error.message); }
    finally { setImportandoProductos(false); }
  };

  const inputClass = 'form-input';

  return (
    <>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
        {TABS.map((t) => (
          <button key={t.id} className={pestana === t.id ? 'activo' : ''} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: '1px solid var(--border-color)', borderRadius: '8px', color: pestana === t.id ? '#efd08d' : 'var(--text-secondary)', background: pestana === t.id ? 'rgba(214,164,77,.13)' : 'var(--bg-secondary)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setPestana(t.id)}>
            <span>{t.icono}</span> {t.etiqueta}
          </button>
        ))}
      </div>

      {pestana === 'productos' && (
        <div className="admin-panel-formulario">
          <h3>Productos Actuales ({productos.length})</h3>
          <div className="tabla-contenedor">
            <table className="admin-tabla">
              <thead><tr><th>Foto</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Acciones</th></tr></thead>
              <tbody>
                {productos.map(prod => (
                  <tr key={prod.id}>
                    <td>{prod.imagen_url ? <img src={prod.imagen_url} alt="img" className="tabla-miniatura" /> : <span className="tabla-miniatura-placeholder">🍽️</span>}</td>
                    <td>{prod.nombre}</td>
                    <td><span className={`badge-categoria ${prod.categoria === 'Bar' ? 'bar' : 'cocina'}`}>{prod.categoria || 'Cocina'}</span></td>
                    <td className="tabla-precio">${Number(prod.precio).toFixed(2)}</td>
                    <td>
                      <button className="btn-accion edit" onClick={() => abrirEdicion(prod)} title="Editar">✏️</button>
                      <button className="btn-accion delete" onClick={() => eliminarProducto(prod.id, prod.nombre)} title="Eliminar">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pestana === 'crear' && (
        <div className="admin-panel-formulario">
          <h3>Crear Nuevo Producto</h3>
          <form onSubmit={guardarProducto}>
            <div className="form-group"><label>Nombre</label><input type="text" name="nombre" className={inputClass} value={nuevoProducto.nombre} onChange={manejarCambioInput} required /></div>
            <div className="form-group"><label>Descripción</label><textarea name="descripcion" className={inputClass} rows={2} placeholder="Opcional. Breve descripción que se muestra en el menú." value={nuevoProducto.descripcion || ''} onChange={manejarCambioInput} /></div>
            <div className="form-group"><label>Precio ($)</label><input type="text" inputMode="decimal" name="precio" className={inputClass} value={nuevoProducto.precio} onChange={(e) => manejarCambioInput({ target: { name: 'precio', value: sanitizarDecimal(e.target.value) } })} required /></div>
            <div className="form-group">
              <label>Categoría (Destino del pedido)</label>
              <select name="categoria" className={inputClass} value={nuevoProducto.categoria} onChange={manejarCambioInput}>
                {categoriasMenu.map((cat) => (<option key={cat.id} value={cat.nombre}>{cat.nombre} {cat.grupo === 'bebidas' ? '🍸' : '🍳'}</option>))}
                {!categoriasMenu.some((c) => c.nombre === 'Cocina') && <option value="Cocina">Cocina 🍳</option>}
                {!categoriasMenu.some((c) => c.nombre === 'Bar') && <option value="Bar">Bar 🍸</option>}
              </select>
              {categoriasMenu.length === 0 && <small style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No hay categorías creadas. Ve a la pestaña Categorías.</small>}
            </div>
            <div className="form-group" style={{ background: 'var(--bg-base, #07090D)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.045)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><input type="checkbox" checked={nuevoProducto.es_plato_fuerte} onChange={(e) => setNuevoProducto({ ...nuevoProducto, es_plato_fuerte: e.target.checked })} /> Plato fuerte</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><input type="checkbox" checked={nuevoProducto.requiere_guarnicion} onChange={(e) => setNuevoProducto({ ...nuevoProducto, requiere_guarnicion: e.target.checked })} /> Solicitar guarnición</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={nuevoProducto.requiere_termino} onChange={(e) => setNuevoProducto({ ...nuevoProducto, requiere_termino: e.target.checked })} /> Solicitar término de cocción</label>
            </div>
            <hr className="form-divisor" /><label className="form-label-destacada">Imagen del Producto</label>
            <div className="form-group"><label>1. Subir desde la PC</label><input type="file" accept="image/*" className="form-input-file" onChange={manejarArchivo} ref={fileInputRef} /></div>
            <div className="form-group"><label>2. O pegar Link</label><input type="url" name="imagen_url" className={inputClass} value={nuevoProducto.imagen_url} onChange={manejarCambioInput} disabled={!!archivoImagen} /></div>
            <div className="form-acciones"><button type="submit" className="btn-guardar-admin">💾 Guardar</button></div>
          </form>
        </div>
      )}

      {pestana === 'categorias' && (
        <div className="admin-panel-formulario">
          <h3>Gestionar Categorías ({categoriasMenu.length})</h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '180px', marginBottom: 0 }}>
              <label>Nombre</label>
              <input type="text" className={inputClass} value={catNombre} onChange={(e) => setCatNombre(e.target.value)} placeholder="Nueva categoría..." />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Grupo</label>
              <select className={inputClass} value={catGrupo} onChange={(e) => setCatGrupo(e.target.value)}>
                <option value="alimentos">Alimentos</option>
                <option value="bebidas">Bebidas</option>
              </select>
            </div>
            <button type="button" className="btn-guardar-admin" onClick={crearCategoria} disabled={!catNombre.trim()}>+ Crear</button>
          </div>
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {categoriasMenu.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No hay categorías creadas aún.</p>}
            {categoriasMenu.map((cat) => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.045)', background: 'var(--bg-base, #07090D)', marginBottom: '6px' }}>
                {editandoCatId === cat.id ? (
                  <>
                    <input type="text" className={inputClass} style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }} value={editandoCatNombre} onChange={(e) => setEditandoCatNombre(e.target.value)} />
                    <select className={inputClass} style={{ width: '120px', padding: '6px 10px', fontSize: '0.85rem' }} value={editandoCatGrupo} onChange={(e) => setEditandoCatGrupo(e.target.value)}>
                      <option value="alimentos">Alimentos</option>
                      <option value="bebidas">Bebidas</option>
                    </select>
                    <button className="btn-accion edit" onClick={() => guardarEdicionCategoria(cat.id)} title="Guardar">✓</button>
                    <button className="btn-accion" onClick={() => setEditandoCatId(null)} title="Cancelar">✕</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>{cat.nombre}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-elevated, #192238)', padding: '2px 8px', borderRadius: '4px' }}>{cat.grupo}</span>
                    <button className="btn-accion edit" onClick={() => { setEditandoCatId(cat.id); setEditandoCatNombre(cat.nombre); setEditandoCatGrupo(cat.grupo || 'alimentos'); }} title="Editar">✏️</button>
                    <button className="btn-accion delete" onClick={() => eliminarCategoria(cat.id, cat.nombre)} title="Eliminar">🗑️</button>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {pestana === 'importar' && (
        <div className="admin-panel-formulario">
          <h3>Importación Masiva de Productos</h3>
          <p className="import-texto-ayuda">Descarga la plantilla CSV, completa los datos y carga productos en masa:</p>
          <a href="/productos-import-template.csv" download className="btn-guardar-admin btn-descargar-plantilla">📄 Descargar plantilla CSV</a>
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label>Archivo CSV</label>
            <input type="file" accept=".csv,text/csv" className="form-input-file" onChange={manejarArchivoImportacion} ref={importFileInputRef} />
          </div>
          {importError && <p className="import-msg-error">{importError}</p>}
          {importCsvHeader.length > 0 && <p className="import-msg-header">Encabezados detectados: {importCsvHeader.join(', ')}</p>}
          {importSuccessMessage && <p className="import-msg-success">{importSuccessMessage}</p>}
          {importErrorDetalles.length > 0 && (
            <div className="import-detalles-error">
              <strong>Errores en el archivo CSV:</strong>
              <ul>{importErrorDetalles.map((fila) => (<li key={`${fila.linea}-${fila.error}`}>Línea {fila.linea}: {fila.error}</li>))}</ul>
            </div>
          )}
          <div className="form-acciones">
            <button type="button" className="btn-guardar-admin" onClick={importarProductos} disabled={importandoProductos || !archivoImportacion || !archivoImportacionValido}>{importandoProductos ? 'Importando...' : 'Importar Productos'}</button>
          </div>
        </div>
      )}

      {editModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setEditModal(null)}>
          <div style={{ background: 'var(--bg-secondary, #111827)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', width: 'min(100%, 480px)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--accent)' }}>Editar Producto</h3>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={guardarEdicion}>
              <div className="form-group"><label>Nombre</label><input type="text" className={inputClass} value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} required /></div>
              <div className="form-group"><label>Descripción</label><textarea className={inputClass} rows={2} value={editForm.descripcion || ''} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} /></div>
              <div className="form-group"><label>Precio ($)</label><input type="text" inputMode="decimal" className={inputClass} value={editForm.precio} onChange={(e) => setEditForm({ ...editForm, precio: sanitizarDecimal(e.target.value) })} required /></div>
              <div className="form-group">
                <label>Categoría</label>
                <select className={inputClass} value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}>
                  {categoriasMenu.map((cat) => (<option key={cat.id} value={cat.nombre}>{cat.nombre}</option>))}
                </select>
              </div>
              <div className="form-group" style={{ background: 'var(--bg-base, #07090D)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.045)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><input type="checkbox" checked={editForm.es_plato_fuerte} onChange={(e) => setEditForm({ ...editForm, es_plato_fuerte: e.target.checked })} /> Plato fuerte</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}><input type="checkbox" checked={editForm.requiere_guarnicion} onChange={(e) => setEditForm({ ...editForm, requiere_guarnicion: e.target.checked })} /> Solicitar guarnición</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="checkbox" checked={editForm.requiere_termino} onChange={(e) => setEditForm({ ...editForm, requiere_termino: e.target.checked })} /> Solicitar término de cocción</label>
              </div>
              <hr className="form-divisor" /><label className="form-label-destacada">Imagen del Producto</label>
              <div className="form-group"><label>Subir desde la PC</label><input type="file" accept="image/*" className="form-input-file" onChange={(e) => setEditArchivo(e.target.files[0])} ref={editFileRef} /></div>
              <div className="form-group"><label>O pegar Link</label><input type="url" className={inputClass} value={editForm.imagen_url} onChange={(e) => setEditForm({ ...editForm, imagen_url: e.target.value })} disabled={!!editArchivo} /></div>
              <div className="form-acciones">
                <button type="submit" className="btn-guardar-admin">💾 Actualizar</button>
                <button type="button" className="btn-cancelar" onClick={() => setEditModal(null)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmData && (
        <ConfirmModal
          mensaje={confirmData.mensaje}
          onConfirm={async () => { await confirmData.onConfirm(); setConfirmData(null); }}
          onCancel={() => setConfirmData(null)}
        />
      )}
    </>
  );
}

export default GestionProductos;
