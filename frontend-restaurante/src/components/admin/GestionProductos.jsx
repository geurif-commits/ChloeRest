import { useState, useEffect, useRef } from 'react';
import { obtenerSesion } from '../../api.js';
import { sanitizarDecimal } from '../../utils/input.js';
import { toastAviso, toastError } from '../Toast.jsx';
import ConfirmModal from '../ConfirmModal';
import { Package, Plus, Tag, Upload, Pencil, Trash2, X, Check, Search, Download, Sparkles } from 'lucide-react';
import './admin.css';

const TABS = [
  { id: 'productos', etiqueta: 'Productos', icono: Package },
  { id: 'crear', etiqueta: 'Crear', icono: Plus },
  { id: 'categorias', etiqueta: 'Categorias', icono: Tag },
  { id: 'importar', etiqueta: 'Subida Masiva', icono: Upload },
];

export function generarFotoGastronomica(nombre) {
  if (!nombre) return '';
  const n = String(nombre).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n.includes('mofongo')) return 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80';
  if (n.includes('chillo') || n.includes('pescado') || n.includes('mero') || n.includes('salmon') || n.includes('colirrubia') || n.includes('dorado')) return 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=500&auto=format&fit=crop&q=80';
  if (n.includes('camaron') || n.includes('marisco') || n.includes('langosta') || n.includes('pulpo') || n.includes('lambi') || n.includes('paella') || n.includes('cazuela')) return 'https://images.unsplash.com/photo-1559742811-822873691df8?w=500&auto=format&fit=crop&q=80';
  if (n.includes('pollo') || n.includes('pechuga') || n.includes('alita') || n.includes('pechurina') || n.includes('dedito')) return 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=500&auto=format&fit=crop&q=80';
  if (n.includes('pasta') || n.includes('alfredo') || n.includes('pesto') || n.includes('bolonesa')) return 'https://images.unsplash.com/photo-1621996346565-e3d5d6281699?w=500&auto=format&fit=crop&q=80';
  if (n.includes('ensalada') || n.includes('cesar') || n.includes('verde')) return 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=80';
  if (n.includes('cerveza') || n.includes('presidente') || n.includes('corona') || n.includes('miller') || n.includes('modelo')) return 'https://images.unsplash.com/photo-1608270199042-3d8e578c772c?w=500&auto=format&fit=crop&q=80';
  if (n.includes('mojito') || n.includes('cocktail') || n.includes('margarita') || n.includes('pina colada') || n.includes('trago') || n.includes('cuba libre') || n.includes('smirnoff')) return 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=80';
  if (n.includes('jugo') || n.includes('chinola') || n.includes('fresa') || n.includes('limonada') || n.includes('agua') || n.includes('refresco') || n.includes('coca') || n.includes('gatorade') || n.includes('red bull')) return 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=500&auto=format&fit=crop&q=80';
  if (n.includes('postre') || n.includes('tres leches') || n.includes('flan') || n.includes('bizcocho') || n.includes('brownie') || n.includes('helado')) return 'https://images.unsplash.com/photo-1551024601-bec78aea704b?w=500&auto=format&fit=crop&q=80';
  if (n.includes('cafe') || n.includes('espresso') || n.includes('cappuccino')) return 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=500&auto=format&fit=crop&q=80';
  if (n.includes('carne') || n.includes('churrasco') || n.includes('corte') || n.includes('ribeye') || n.includes('chuleta') || n.includes('chivo')) return 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=80';
  if (n.includes('croqueta') || n.includes('picadera') || n.includes('toston') || n.includes('papa') || n.includes('ceviche') || n.includes('sopa')) return 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=500&auto=format&fit=crop&q=80';
  return `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80`;
}

const EMPTY_PRODUCTO = {
  nombre: '',
  descripcion: '',
  precio: '',
  imagen_url: '',
  categoria: '',
  tipo_destino: 'cocina',
  tipo_plato: 'plato_fuerte',
  es_entrada: false,
  es_plato_fuerte: true,
  es_postre: false,
  es_guarnicion: false,
  aplica_itbis: true,
  tasa_itbis: 18,
  aplica_propina: true,
  tasa_propina: 10,
  requiere_guarnicion: false,
  requiere_termino: false
};

function GestionProductos({ apiUrl }) {
  const [pestana, setPestana] = useState('productos');
  const [productos, setProductos] = useState([]);
  const [categoriasMenu, setCategoriasMenu] = useState([]);
  const [guarnicionesMenu, setGuarnicionesMenu] = useState([]);
  const [terminosMenu, setTerminosMenu] = useState([]);
  const [subPestanaOpciones, setSubPestanaOpciones] = useState('categorias');
  const [confirmData, setConfirmData] = useState(null);

  const [acordeonOpcionesAbierto, setAcordeonOpcionesAbierto] = useState(true);
  const [editAcordeonAbierto, setEditAcordeonAbierto] = useState(true);

  const [nuevoProducto, setNuevoProducto] = useState(EMPTY_PRODUCTO);
  const [archivoImagen, setArchivoImagen] = useState(null);
  const fileInputRef = useRef(null);

  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_PRODUCTO);
  const [editArchivo, setEditArchivo] = useState(null);
  const editFileRef = useRef(null);

  const [opcionNombre, setOpcionNombre] = useState('');
  const [opcionGrupo, setOpcionGrupo] = useState('alimentos');
  const [editandoOpcionId, setEditandoOpcionId] = useState(null);
  const [editandoOpcionNombre, setEditandoOpcionNombre] = useState('');
  const [editandoOpcionGrupo, setEditandoOpcionGrupo] = useState('alimentos');

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
        const cats = Array.isArray(data.categorias) ? data.categorias : [];
        setCategoriasMenu(cats);
        setGuarnicionesMenu(Array.isArray(data.guarniciones) ? data.guarniciones : []);
        setTerminosMenu(Array.isArray(data.terminos) ? data.terminos : []);

        if (cats.length > 0) {
          setNuevoProducto(prev => (!prev.categoria || prev.categoria === 'Cocina' || prev.categoria === 'Bar') ? { ...prev, categoria: cats[0].nombre } : prev);
        }
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
    formData.append('tipo_destino', nuevoProducto.tipo_destino || 'cocina');
    formData.append('tipo_plato', nuevoProducto.tipo_plato || 'plato_fuerte');
    formData.append('es_entrada', String(nuevoProducto.es_entrada || nuevoProducto.tipo_plato === 'entrada'));
    formData.append('es_plato_fuerte', String(nuevoProducto.es_plato_fuerte || nuevoProducto.tipo_plato === 'plato_fuerte'));
    formData.append('es_postre', String(nuevoProducto.es_postre || nuevoProducto.tipo_plato === 'postre'));
    formData.append('es_guarnicion', String(nuevoProducto.es_guarnicion || nuevoProducto.tipo_plato === 'guarnicion'));
    formData.append('aplica_itbis', String(nuevoProducto.aplica_itbis));
    formData.append('tasa_itbis', String(nuevoProducto.aplica_itbis ? nuevoProducto.tasa_itbis || 18 : 0));
    formData.append('aplica_propina', String(nuevoProducto.aplica_propina));
    formData.append('tasa_propina', String(nuevoProducto.aplica_propina ? nuevoProducto.tasa_propina || 10 : 0));
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
    const tipoDestino = prod.tipo_destino || (['Bar', 'Bebidas'].includes(prod.categoria) ? 'bar' : 'cocina');
    let tipoPlato = prod.tipo_plato || 'plato_fuerte';
    if (prod.es_entrada) tipoPlato = 'entrada';
    if (prod.es_postre) tipoPlato = 'postre';
    if (prod.es_guarnicion) tipoPlato = 'guarnicion';
    if (tipoDestino === 'bar') tipoPlato = 'bebida';

    setEditForm({
      nombre: prod.nombre,
      descripcion: prod.descripcion || '',
      precio: prod.precio,
      imagen_url: prod.imagen_url || '',
      categoria: prod.categoria || (tipoDestino === 'bar' ? 'Bar' : 'Cocina'),
      tipo_destino: tipoDestino,
      tipo_plato: tipoPlato,
      es_entrada: Boolean(prod.es_entrada || tipoPlato === 'entrada'),
      es_plato_fuerte: Boolean(prod.es_plato_fuerte || tipoPlato === 'plato_fuerte'),
      es_postre: Boolean(prod.es_postre || tipoPlato === 'postre'),
      es_guarnicion: Boolean(prod.es_guarnicion || tipoPlato === 'guarnicion'),
      aplica_itbis: prod.aplica_itbis !== false && Number(prod.tasa_itbis) !== 0,
      tasa_itbis: prod.tasa_itbis || 18,
      aplica_propina: prod.aplica_propina !== false && Number(prod.tasa_propina) !== 0,
      tasa_propina: prod.tasa_propina || 10,
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
    formData.append('tipo_destino', editForm.tipo_destino || 'cocina');
    formData.append('tipo_plato', editForm.tipo_plato || 'plato_fuerte');
    formData.append('es_entrada', String(editForm.es_entrada || editForm.tipo_plato === 'entrada'));
    formData.append('es_plato_fuerte', String(editForm.es_plato_fuerte || editForm.tipo_plato === 'plato_fuerte'));
    formData.append('es_postre', String(editForm.es_postre || editForm.tipo_plato === 'postre'));
    formData.append('es_guarnicion', String(editForm.es_guarnicion || editForm.tipo_plato === 'guarnicion'));
    formData.append('aplica_itbis', String(editForm.aplica_itbis));
    formData.append('tasa_itbis', String(editForm.aplica_itbis ? editForm.tasa_itbis || 18 : 0));
    formData.append('aplica_propina', String(editForm.aplica_propina));
    formData.append('tasa_propina', String(editForm.aplica_propina ? editForm.tasa_propina || 10 : 0));
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
    if (!catNombre.trim()) return toastAviso('Escribe el nombre de la categoría.');
    try {
      const res = await fetch(`${apiUrl}/api/menu-configuracion/categorias`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: catNombre.trim(), grupo: catGrupo })
      });
      if (res.ok) {
        toastAviso('✅ Categoría creada exitosamente.');
        setCatNombre('');
        cargarCategorias();
      } else {
        const err = await res.json().catch(() => ({}));
        toastError(err.error || 'Error creando categoría.');
      }
    } catch (e) {
      toastError('Error de conexión al crear categoría.');
    }
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
      const header = parseCsvLine(lines[0]).map((v) => v.toLowerCase().trim());
      const required = ['nombre', 'precio'];
      const missing = required.filter((col) => !header.includes(col));
      if (missing.length) { setImportError(`Columnas obligatorias faltantes: ${missing.join(', ')}.`); setArchivoImportacionValido(false); return; }
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
      <div className="admin-tabs">
        {TABS.map((t) => {
          const Icon = t.icono;
          return (
            <button key={t.id} className={`admin-tab ${pestana === t.id ? 'activo' : ''}`} onClick={() => setPestana(t.id)}>
              <Icon size={15} strokeWidth={2} /> {t.etiqueta}
            </button>
          );
        })}
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
                    <td>{prod.imagen_url ? <img src={prod.imagen_url} alt="img" className="tabla-miniatura" /> : <span className="tabla-miniatura-placeholder"><Package size={20} /></span>}</td>
                    <td>{prod.nombre}</td>
                    <td><span className={`badge-categoria ${prod.categoria === 'Bar' ? 'bar' : 'cocina'}`}>{prod.categoria || 'Cocina'}</span></td>
                    <td className="tabla-precio">${Number(prod.precio).toFixed(2)}</td>
                    <td>
                      <button className="btn-accion edit" onClick={() => abrirEdicion(prod)} title="Editar"><Pencil size={14} /></button>
                      <button className="btn-accion delete" onClick={() => eliminarProducto(prod.id, prod.nombre)} title="Eliminar"><Trash2 size={14} /></button>
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
          <h3 style={{ margin: '0 0 16px', color: 'var(--text-primary)', fontSize: '1.2rem' }}>Crear Nuevo Producto</h3>
          <form onSubmit={guardarProducto} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group"><label>Nombre del Plato o Bebida</label><input type="text" name="nombre" className={inputClass} value={nuevoProducto.nombre} onChange={manejarCambioInput} placeholder="Ej. Mofongo de Camarones Especial" required /></div>
            <div className="form-group"><label>Descripción</label><textarea name="descripcion" className={inputClass} rows={2} placeholder="Opcional. Breve descripción de ingredientes que se muestra en el menú." value={nuevoProducto.descripcion || ''} onChange={manejarCambioInput} /></div>
            <div className="form-group"><label>Precio de Venta (RD$)</label><input type="text" inputMode="decimal" name="precio" className={inputClass} value={nuevoProducto.precio} onChange={(e) => manejarCambioInput({ target: { name: 'precio', value: sanitizarDecimal(e.target.value) } })} placeholder="0.00" required /></div>
            
            {/* ── SELECTOR DE DESTINO E IMPRESORA (ALIMENTOS VS BEBIDAS) ── */}
            <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.03))', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.86rem', fontWeight: 700, marginBottom: '10px' }}>
                🖨️ Tipo de Producto & Destino de Impresión
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setNuevoProducto({
                      ...nuevoProducto,
                      tipo_destino: 'cocina',
                      tipo_plato: nuevoProducto.tipo_plato === 'bebida' ? 'plato_fuerte' : nuevoProducto.tipo_plato,
                      categoria: nuevoProducto.categoria === 'Bar' ? 'Cocina' : nuevoProducto.categoria
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '10px',
                    background: nuevoProducto.tipo_destino === 'cocina' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: `2px solid ${nuevoProducto.tipo_destino === 'cocina' ? '#10b981' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: `2px solid ${nuevoProducto.tipo_destino === 'cocina' ? '#10b981' : '#666'}`, background: nuevoProducto.tipo_destino === 'cocina' ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: '13px', fontWeight: 'bold' }}>
                    {nuevoProducto.tipo_destino === 'cocina' ? '✓' : ''}
                  </div>
                  <div>
                    <strong style={{ display: 'block', color: nuevoProducto.tipo_destino === 'cocina' ? 'var(--kpi-green)' : 'var(--text-primary)', fontSize: '0.9rem' }}>🍳 Alimento</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Impresora / KDS de Cocina</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNuevoProducto({
                      ...nuevoProducto,
                      tipo_destino: 'bar',
                      tipo_plato: 'bebida',
                      categoria: nuevoProducto.categoria === 'Cocina' ? 'Bar' : nuevoProducto.categoria
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '10px',
                    background: nuevoProducto.tipo_destino === 'bar' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                    border: `2px solid ${nuevoProducto.tipo_destino === 'bar' ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ width: '20px', height: '20px', borderRadius: '4px', border: `2px solid ${nuevoProducto.tipo_destino === 'bar' ? '#3b82f6' : '#666'}`, background: nuevoProducto.tipo_destino === 'bar' ? '#3b82f6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>
                    {nuevoProducto.tipo_destino === 'bar' ? '✓' : ''}
                  </div>
                  <div>
                    <strong style={{ display: 'block', color: nuevoProducto.tipo_destino === 'bar' ? 'var(--kpi-blue)' : 'var(--text-primary)', fontSize: '0.9rem' }}>🍹 Bebida / Trago</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Impresora / KDS de Bar</span>
                  </div>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Categoría del Menú</label>
              <select name="categoria" className={inputClass} value={nuevoProducto.categoria} onChange={manejarCambioInput}>
                {categoriasMenu.length === 0 ? (
                  <option value="">-- No hay categorías (crea una en 'Categorías & Opciones') --</option>
                ) : (
                  categoriasMenu.map((cat) => (
                    <option key={cat.id} value={cat.nombre}>
                      {cat.nombre} {cat.grupo === 'bebidas' ? '(Bebidas)' : '(Alimentos)'}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* ── RECUADRO DESPLEGABLE DE CLASIFICACIÓN Y REGLAS DE COMANDA ── */}
            <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.03))', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setAcordeonOpcionesAbierto(!acordeonOpcionesAbierto)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--bg-card-hover)',
                  border: 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  fontSize: '0.88rem'
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚙️ Clasificación del Plato & Opciones Avanzadas
                </span>
                <span style={{ color: 'var(--kpi-gold)', fontSize: '0.8rem' }}>
                  {acordeonOpcionesAbierto ? '▲ Ocultar' : '▼ Desplegar Opciones'}
                </span>
              </button>

              {acordeonOpcionesAbierto && (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                  
                  {/* 1. Clasificación del Plato */}
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
                      Clasificación del Producto en Carta:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
                      {[
                        { id: 'entrada', label: '🍲 Entrada' },
                        { id: 'plato_fuerte', label: '🥩 Plato Fuerte' },
                        { id: 'postre', label: '🍰 Postre' },
                        { id: 'guarnicion', label: '🍟 Guarnición' }
                      ].map((tipo) => {
                        const activo = nuevoProducto.tipo_plato === tipo.id;
                        return (
                          <button
                            key={tipo.id}
                            type="button"
                            onClick={() => {
                              setNuevoProducto({
                                ...nuevoProducto,
                                tipo_plato: tipo.id,
                                es_entrada: tipo.id === 'entrada',
                                es_plato_fuerte: tipo.id === 'plato_fuerte',
                                es_postre: tipo.id === 'postre',
                                es_guarnicion: tipo.id === 'guarnicion'
                              });
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '9px 10px',
                              borderRadius: '8px',
                              background: activo ? 'rgba(245, 184, 61, 0.18)' : 'var(--bg-card-hover)',
                              border: `1.5px solid ${activo ? 'var(--kpi-gold)' : 'var(--border-light)'}`,
                              color: activo ? 'var(--kpi-gold)' : 'var(--text-primary)',
                              fontSize: '0.82rem',
                              fontWeight: activo ? 700 : 500,
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ width: '16px', height: '16px', borderRadius: '3px', border: `1.5px solid ${activo ? 'var(--gold, #f5b842)' : '#666'}`, background: activo ? 'var(--gold, #f5b842)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: '11px', fontWeight: 'bold' }}>
                              {activo ? '✓' : ''}
                            </div>
                            <span>{tipo.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 2. Requisitos de Comanda y Modificadores */}
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
                      Personalización al tomar el pedido:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg-card-hover)', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={nuevoProducto.requiere_guarnicion}
                          onChange={(e) => setNuevoProducto({ ...nuevoProducto, requiere_guarnicion: e.target.checked })}
                          style={{ width: '17px', height: '17px', accentColor: 'var(--gold, #f5b842)' }}
                        />
                        <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600 }}>🍟 Solicitar Guarnición</span>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg-card-hover)', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={nuevoProducto.requiere_termino}
                          onChange={(e) => setNuevoProducto({ ...nuevoProducto, requiere_termino: e.target.checked })}
                          style={{ width: '17px', height: '17px', accentColor: 'var(--gold, #f5b842)' }}
                        />
                        <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600 }}>🥩 Solicitar Término de Cocción</span>
                      </label>
                    </div>
                  </div>

                  {/* 3. Impuestos Fiscales y Ley */}
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>
                      Impuestos y Ley:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg-card-hover)', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={nuevoProducto.aplica_itbis}
                          onChange={(e) => setNuevoProducto({ ...nuevoProducto, aplica_itbis: e.target.checked })}
                          style={{ width: '17px', height: '17px', accentColor: '#10b981' }}
                        />
                        <div>
                          <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>🏛️ ITBIS Fiscal (18%)</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{nuevoProducto.aplica_itbis ? 'Gravado con 18%' : 'Exento (0%)'}</span>
                        </div>
                      </label>

                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg-card-hover)', borderRadius: '8px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={nuevoProducto.aplica_propina}
                          onChange={(e) => setNuevoProducto({ ...nuevoProducto, aplica_propina: e.target.checked })}
                          style={{ width: '17px', height: '17px', accentColor: 'var(--gold, #f5b842)' }}
                        />
                        <div>
                          <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>⚖️ Propina Legal (10%)</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{nuevoProducto.aplica_propina ? 'Ley 16-92 (10%)' : 'Exenta (0%)'}</span>
                        </div>
                      </label>
                    </div>
                  </div>

                </div>
              )}
            </div>

            <hr className="form-divisor" />
            <label className="form-label-destacada">Fotografía del Producto (Adaptada al Menú)</label>
            
            <div className="form-group"><label>1. Subir archivo de imagen desde tu PC</label><input type="file" accept="image/*" className="form-input-file" onChange={manejarArchivo} ref={fileInputRef} /></div>
            
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                <label style={{ margin: 0 }}>2. O pegar Enlace URL / Buscar</label>
                <button
                  type="button"
                  onClick={() => {
                    if (!nuevoProducto.nombre?.trim()) return toastAviso('Escribe primero el nombre del producto para buscar su foto.');
                    const foto = generarFotoGastronomica(nuevoProducto.nombre);
                    setNuevoProducto({ ...nuevoProducto, imagen_url: foto });
                    setArchivoImagen(null);
                    toastAviso('✨ Foto gastronómica asignada con éxito.');
                  }}
                  style={{
                    background: 'rgba(245, 184, 61, 0.15)',
                    border: '1px solid rgba(245, 184, 61, 0.35)',
                    color: 'var(--kpi-gold)',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Sparkles size={13} /> Auto-Buscar Foto en Línea
                </button>
              </div>
              <input type="url" name="imagen_url" className={inputClass} value={nuevoProducto.imagen_url} onChange={manejarCambioInput} disabled={!!archivoImagen} placeholder="https://..." />
              {nuevoProducto.imagen_url && (
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={nuevoProducto.imagen_url} alt="Vista previa" style={{ width: '54px', height: '36px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vista previa adaptada al contenedor</span>
                </div>
              )}
            </div>

            <div className="form-acciones" style={{ marginTop: '8px' }}>
              <button type="submit" className="btn-guardar-admin">Guardar Producto</button>
            </div>
          </form>
        </div>
      )}

      {pestana === 'categorias' && (
        <div className="admin-panel-formulario">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.2rem' }}>Configuración de Menú y Comandas</h3>
            
            {/* Sub-pestañas de configuración */}
            <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-base, #07090D)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => { setSubPestanaOpciones('categorias'); setEditandoOpcionId(null); }}
                style={{
                  background: subPestanaOpciones === 'categorias' ? 'var(--gold, #f5b842)' : 'transparent',
                  color: subPestanaOpciones === 'categorias' ? '#000' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                📂 Categorías ({categoriasMenu.length})
              </button>

              <button
                type="button"
                onClick={() => { setSubPestanaOpciones('guarniciones'); setEditandoOpcionId(null); }}
                style={{
                  background: subPestanaOpciones === 'guarniciones' ? 'var(--gold, #f5b842)' : 'transparent',
                  color: subPestanaOpciones === 'guarniciones' ? '#000' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🍟 Guarniciones ({guarnicionesMenu.length})
              </button>

              <button
                type="button"
                onClick={() => { setSubPestanaOpciones('terminos'); setEditandoOpcionId(null); }}
                style={{
                  background: subPestanaOpciones === 'terminos' ? 'var(--gold, #f5b842)' : 'transparent',
                  color: subPestanaOpciones === 'terminos' ? '#000' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🥩 Términos del Plato ({terminosMenu.length})
              </button>
            </div>
          </div>

          {/* Formulario de Creación según la subpestaña activa */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ flex: 1, minWidth: '180px', marginBottom: 0 }}>
              <label>
                {subPestanaOpciones === 'categorias' && 'Nombre de la Categoría'}
                {subPestanaOpciones === 'guarniciones' && 'Nueva Guarnición (Ej. Tostones, Puré, Papas)'}
                {subPestanaOpciones === 'terminos' && 'Nuevo Término (Ej. Término Medio, 3/4, Bien Cocido)'}
              </label>
              <input
                type="text"
                className={inputClass}
                value={opcionNombre}
                onChange={(e) => setOpcionNombre(e.target.value)}
                placeholder={
                  subPestanaOpciones === 'categorias' ? 'Ej. Pastas, Mariscos...' :
                  subPestanaOpciones === 'guarniciones' ? 'Ej. Tostones con Ajo, Papas Fritas...' :
                  'Ej. Término Medio (Medium)...'
                }
              />
            </div>

            {subPestanaOpciones === 'categorias' && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Grupo</label>
                <select className={inputClass} value={opcionGrupo} onChange={(e) => setOpcionGrupo(e.target.value)}>
                  <option value="alimentos">Alimentos (Cocina)</option>
                  <option value="bebidas">Bebidas (Bar)</option>
                </select>
              </div>
            )}

            <button
              type="button"
              className="btn-guardar-admin"
              onClick={async () => {
                if (!opcionNombre.trim()) return toastAviso('Escribe un nombre.');
                const tipo = subPestanaOpciones;
                const body = tipo === 'categorias' ? { nombre: opcionNombre.trim(), grupo: opcionGrupo } : { nombre: opcionNombre.trim() };
                try {
                  const res = await fetch(`${apiUrl}/api/menu-configuracion/${tipo}`, {
                    method: 'POST',
                    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                  });
                  if (res.ok) {
                    toastAviso(`✅ ${tipo === 'categorias' ? 'Categoría' : tipo === 'guarniciones' ? 'Guarnición' : 'Término'} guardada exitosamente.`);
                    setOpcionNombre('');
                    cargarCategorias();
                  } else {
                    const err = await res.json().catch(() => ({}));
                    toastError(err.error || 'Error al crear elemento');
                  }
                } catch (e) {
                  toastError('Error de conexión con el servidor.');
                }
              }}
              disabled={!opcionNombre.trim()}
            >
              <Plus size={14} /> Crear
            </button>
          </div>

          {/* Listado de Opciones */}
          <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
            {subPestanaOpciones === 'categorias' && (
              <>
                {categoriasMenu.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No hay categorías creadas aún.</p>}
                {categoriasMenu.map((cat) => (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.045)', background: 'var(--bg-base, #07090D)', marginBottom: '6px' }}>
                    {editandoOpcionId === cat.id ? (
                      <>
                        <input type="text" className={inputClass} style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }} value={editandoOpcionNombre} onChange={(e) => setEditandoOpcionNombre(e.target.value)} />
                        <select className={inputClass} style={{ width: '130px', padding: '6px 10px', fontSize: '0.85rem' }} value={editandoOpcionGrupo} onChange={(e) => setEditandoOpcionGrupo(e.target.value)}>
                          <option value="alimentos">Alimentos</option>
                          <option value="bebidas">Bebidas</option>
                        </select>
                        <button className="btn-accion edit" onClick={async () => {
                          if (!editandoOpcionNombre.trim()) return;
                          const res = await fetch(`${apiUrl}/api/menu-configuracion/categorias/${cat.id}`, {
                            method: 'PUT',
                            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nombre: editandoOpcionNombre.trim(), grupo: editandoOpcionGrupo })
                          });
                          if (res.ok) { toastAviso('Actualizado'); setEditandoOpcionId(null); cargarCategorias(); }
                        }} title="Guardar"><Check size={14} /></button>
                        <button className="btn-accion" onClick={() => setEditandoOpcionId(null)} title="Cancelar"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>{cat.nombre}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-elevated, #192238)', padding: '2px 8px', borderRadius: '4px' }}>{cat.grupo}</span>
                        <button className="btn-accion edit" onClick={() => { setEditandoOpcionId(cat.id); setEditandoOpcionNombre(cat.nombre); setEditandoOpcionGrupo(cat.grupo || 'alimentos'); }} title="Editar"><Pencil size={14} /></button>
                        <button className="btn-accion delete" onClick={() => eliminarCategoria(cat.id, cat.nombre)} title="Eliminar"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}

            {subPestanaOpciones === 'guarniciones' && (
              <>
                {guarnicionesMenu.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No hay guarniciones registradas aún. Agrega las guarniciones que ofrece tu cocina (ej. Tostones, Papas Fritas, Moro, etc.).</p>}
                {guarnicionesMenu.map((guar) => (
                  <div key={guar.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.045)', background: 'var(--bg-base, #07090D)', marginBottom: '6px' }}>
                    {editandoOpcionId === guar.id ? (
                      <>
                        <input type="text" className={inputClass} style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }} value={editandoOpcionNombre} onChange={(e) => setEditandoOpcionNombre(e.target.value)} />
                        <button className="btn-accion edit" onClick={async () => {
                          if (!editandoOpcionNombre.trim()) return;
                          const res = await fetch(`${apiUrl}/api/menu-configuracion/guarniciones/${guar.id}`, {
                            method: 'PUT',
                            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nombre: editandoOpcionNombre.trim() })
                          });
                          if (res.ok) { toastAviso('Guarnición actualizada'); setEditandoOpcionId(null); cargarCategorias(); }
                        }} title="Guardar"><Check size={14} /></button>
                        <button className="btn-accion" onClick={() => setEditandoOpcionId(null)} title="Cancelar"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>🍟 {guar.nombre}</span>
                        <button className="btn-accion edit" onClick={() => { setEditandoOpcionId(guar.id); setEditandoOpcionNombre(guar.nombre); }} title="Editar"><Pencil size={14} /></button>
                        <button className="btn-accion delete" onClick={() => {
                          setConfirmData({
                            mensaje: `¿Eliminar la guarnición "${guar.nombre}"?`,
                            onConfirm: async () => {
                              await fetch(`${apiUrl}/api/menu-configuracion/guarniciones/${guar.id}`, { method: 'DELETE', headers: authHeaders() });
                              cargarCategorias();
                            }
                          });
                        }} title="Eliminar"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}

            {subPestanaOpciones === 'terminos' && (
              <>
                {terminosMenu.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No hay términos de cocción registrados aún. Agrega los términos habituales (ej. Término Medio, 3/4, Bien Cocido, etc.).</p>}
                {terminosMenu.map((term) => (
                  <div key={term.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.045)', background: 'var(--bg-base, #07090D)', marginBottom: '6px' }}>
                    {editandoOpcionId === term.id ? (
                      <>
                        <input type="text" className={inputClass} style={{ flex: 1, padding: '6px 10px', fontSize: '0.85rem' }} value={editandoOpcionNombre} onChange={(e) => setEditandoOpcionNombre(e.target.value)} />
                        <button className="btn-accion edit" onClick={async () => {
                          if (!editandoOpcionNombre.trim()) return;
                          const res = await fetch(`${apiUrl}/api/menu-configuracion/terminos/${term.id}`, {
                            method: 'PUT',
                            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                            body: JSON.stringify({ nombre: editandoOpcionNombre.trim() })
                          });
                          if (res.ok) { toastAviso('Término actualizado'); setEditandoOpcionId(null); cargarCategorias(); }
                        }} title="Guardar"><Check size={14} /></button>
                        <button className="btn-accion" onClick={() => setEditandoOpcionId(null)} title="Cancelar"><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600 }}>🥩 {term.nombre}</span>
                        <button className="btn-accion edit" onClick={() => { setEditandoOpcionId(term.id); setEditandoOpcionNombre(term.nombre); }} title="Editar"><Pencil size={14} /></button>
                        <button className="btn-accion delete" onClick={() => {
                          setConfirmData({
                            mensaje: `¿Eliminar el término "${term.nombre}"?`,
                            onConfirm: async () => {
                              await fetch(`${apiUrl}/api/menu-configuracion/terminos/${term.id}`, { method: 'DELETE', headers: authHeaders() });
                              cargarCategorias();
                            }
                          });
                        }} title="Eliminar"><Trash2 size={14} /></button>
                      </>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {pestana === 'importar' && (
        <div className="admin-panel-formulario" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Importación Masiva de Productos</h3>
            <p className="import-texto-ayuda" style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
              Descarga la plantilla CSV oficial en blanco con los parámetros del sistema, edítala y súbela:
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <a href="/productos-import-template.csv" download className="btn-guardar-admin btn-descargar-plantilla" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Download size={15} /> Descargar Plantilla en Blanco (.CSV)
            </a>
          </div>

          {/* Guía de Parámetros del Sistema */}
          <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.03))', borderRadius: '10px', padding: '16px', border: '1px solid var(--border-subtle)' }}>
            <strong style={{ color: 'var(--kpi-gold)', fontSize: '0.85rem', display: 'block', marginBottom: '8px' }}>
              📋 Parámetros Exactos de la Plantilla CSV:
            </strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', fontSize: '0.78rem' }}>
              <div><code style={{ color: 'var(--text-primary)' }}>nombre</code>: <span style={{ color: 'var(--kpi-green)' }}>(Obligatorio)</span> Nombre del producto.</div>
              <div><code style={{ color: 'var(--text-primary)' }}>precio</code>: <span style={{ color: 'var(--kpi-green)' }}>(Obligatorio)</span> Precio en RD$ (ej. 650.00).</div>
              <div><code style={{ color: 'var(--text-primary)' }}>categoria</code>: <span>(Opcional)</span> Alimentos, Bar, Postres...</div>
              <div><code style={{ color: 'var(--text-primary)' }}>tasa_itbis</code>: <span>(Opcional)</span> 18 (por defecto) o 0 (exento).</div>
              <div><code style={{ color: 'var(--text-primary)' }}>aplica_propina</code>: <span>(Opcional)</span> 10 (por defecto), 0 o NO.</div>
              <div><code style={{ color: 'var(--text-primary)' }}>imagen_url</code>: <span>(Opcional)</span> Enlace URL a la foto.</div>
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Seleccionar Archivo CSV para Cargar</label>
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

          <div className="form-acciones" style={{ marginTop: '8px' }}>
            <button type="button" className="btn-guardar-admin" onClick={importarProductos} disabled={importandoProductos || !archivoImportacion || !archivoImportacionValido}>
              {importandoProductos ? 'Importando...' : 'Iniciar Importación Masiva'}
            </button>
          </div>
        </div>
      )}

      {editModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setEditModal(null)}>
          <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '24px', width: 'min(100%, 480px)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--kpi-gold)' }}>Editar Producto</h3>
              <button onClick={() => setEditModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={guardarEdicion} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group"><label>Nombre</label><input type="text" className={inputClass} value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} required /></div>
              <div className="form-group"><label>Descripción</label><textarea className={inputClass} rows={2} value={editForm.descripcion || ''} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} /></div>
              <div className="form-group"><label>Precio (RD$)</label><input type="text" inputMode="decimal" className={inputClass} value={editForm.precio} onChange={(e) => setEditForm({ ...editForm, precio: sanitizarDecimal(e.target.value) })} required /></div>
              
              {/* ── SELECTOR DE DESTINO E IMPRESORA (ALIMENTOS VS BEBIDAS) EN EDICIÓN ── */}
              <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.03))', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
                <label style={{ display: 'block', color: 'var(--text-primary)', fontSize: '0.84rem', fontWeight: 700, marginBottom: '8px' }}>
                  🖨️ Tipo de Producto & Destino de Impresión
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditForm({
                        ...editForm,
                        tipo_destino: 'cocina',
                        tipo_plato: editForm.tipo_plato === 'bebida' ? 'plato_fuerte' : editForm.tipo_plato,
                        categoria: editForm.categoria === 'Bar' ? 'Cocina' : editForm.categoria
                      });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px',
                      borderRadius: '8px',
                      background: editForm.tipo_destino === 'cocina' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.02)',
                      border: `2px solid ${editForm.tipo_destino === 'cocina' ? '#10b981' : 'rgba(255,255,255,0.08)'}`,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${editForm.tipo_destino === 'cocina' ? '#10b981' : '#666'}`, background: editForm.tipo_destino === 'cocina' ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: '12px', fontWeight: 'bold' }}>
                      {editForm.tipo_destino === 'cocina' ? '✓' : ''}
                    </div>
                    <div>
                      <strong style={{ display: 'block', color: editForm.tipo_destino === 'cocina' ? 'var(--kpi-green)' : 'var(--text-primary)', fontSize: '0.85rem' }}>🍳 Alimento</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cocina</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditForm({
                        ...editForm,
                        tipo_destino: 'bar',
                        tipo_plato: 'bebida',
                        categoria: editForm.categoria === 'Cocina' ? 'Bar' : editForm.categoria
                      });
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px',
                      borderRadius: '8px',
                      background: editForm.tipo_destino === 'bar' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                      border: `2px solid ${editForm.tipo_destino === 'bar' ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${editForm.tipo_destino === 'bar' ? '#3b82f6' : '#666'}`, background: editForm.tipo_destino === 'bar' ? '#3b82f6' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>
                      {editForm.tipo_destino === 'bar' ? '✓' : ''}
                    </div>
                    <div>
                      <strong style={{ display: 'block', color: editForm.tipo_destino === 'bar' ? 'var(--kpi-blue)' : 'var(--text-primary)', fontSize: '0.85rem' }}>🍹 Bebida / Trago</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Bar</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Categoría del Menú</label>
                <select className={inputClass} value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}>
                  {categoriasMenu.length === 0 ? (
                    <option value="">-- No hay categorías registradas --</option>
                  ) : (
                    categoriasMenu.map((cat) => (
                      <option key={cat.id} value={cat.nombre}>
                        {cat.nombre} {cat.grupo === 'bebidas' ? '(Bebidas)' : '(Alimentos)'}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* ── RECUADRO DESPLEGABLE DE CLASIFICACIÓN Y REGLAS EN EDICIÓN ── */}
              <div style={{ background: 'var(--bg-input, rgba(255,255,255,0.03))', borderRadius: '10px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setEditAcordeonAbierto(!editAcordeonAbierto)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: 'var(--bg-card-hover)',
                    border: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: '0.84rem'
                  }}
                >
                  <span>⚙️ Clasificación del Plato & Opciones Avanzadas</span>
                  <span style={{ color: 'var(--kpi-gold)', fontSize: '0.76rem' }}>
                    {editAcordeonAbierto ? '▲ Ocultar' : '▼ Desplegar'}
                  </span>
                </button>

                {editAcordeonAbierto && (
                  <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                    
                    {/* 1. Clasificación */}
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Clasificación en Carta:
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px' }}>
                        {[
                          { id: 'entrada', label: '🍲 Entrada' },
                          { id: 'plato_fuerte', label: '🥩 Plato Fuerte' },
                          { id: 'postre', label: '🍰 Postre' },
                          { id: 'guarnicion', label: '🍟 Guarnición' }
                        ].map((tipo) => {
                          const activo = editForm.tipo_plato === tipo.id;
                          return (
                            <button
                              key={tipo.id}
                              type="button"
                              onClick={() => {
                                setEditForm({
                                  ...editForm,
                                  tipo_plato: tipo.id,
                                  es_entrada: tipo.id === 'entrada',
                                  es_plato_fuerte: tipo.id === 'plato_fuerte',
                                  es_postre: tipo.id === 'postre',
                                  es_guarnicion: tipo.id === 'guarnicion'
                                });
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 8px',
                                borderRadius: '6px',
                                background: activo ? 'rgba(245, 184, 61, 0.18)' : 'var(--bg-card-hover)',
                                border: `1.5px solid ${activo ? 'var(--kpi-gold)' : 'var(--border-light)'}`,
                                color: activo ? 'var(--kpi-gold)' : 'var(--text-primary)',
                                fontSize: '0.78rem',
                                fontWeight: activo ? 700 : 500,
                                cursor: 'pointer'
                              }}
                            >
                              <div style={{ width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${activo ? 'var(--gold, #f5b842)' : '#666'}`, background: activo ? 'var(--gold, #f5b842)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontSize: '10px', fontWeight: 'bold' }}>
                                {activo ? '✓' : ''}
                              </div>
                              <span>{tipo.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. Requisitos de Comanda */}
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Requisitos de comanda:
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-card-hover)', borderRadius: '6px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editForm.requiere_guarnicion}
                            onChange={(e) => setEditForm({ ...editForm, requiere_guarnicion: e.target.checked })}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--gold, #f5b842)' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>🍟 Solicitar Guarnición</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-card-hover)', borderRadius: '6px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editForm.requiere_termino}
                            onChange={(e) => setEditForm({ ...editForm, requiere_termino: e.target.checked })}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--gold, #f5b842)' }}
                          />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600 }}>🥩 Solicitar Término</span>
                        </label>
                      </div>
                    </div>

                    {/* 3. Impuestos Fiscales */}
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>
                        Impuestos y Ley:
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-card-hover)', borderRadius: '6px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editForm.aplica_itbis}
                            onChange={(e) => setEditForm({ ...editForm, aplica_itbis: e.target.checked })}
                            style={{ width: '16px', height: '16px', accentColor: '#10b981' }}
                          />
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>🏛️ ITBIS (18%)</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{editForm.aplica_itbis ? 'Gravado (18%)' : 'Exento'}</span>
                          </div>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-card-hover)', borderRadius: '6px', border: '1px solid var(--border-light)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={editForm.aplica_propina}
                            onChange={(e) => setEditForm({ ...editForm, aplica_propina: e.target.checked })}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--gold, #f5b842)' }}
                          />
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 600, display: 'block' }}>⚖️ Propina (10%)</span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{editForm.aplica_propina ? 'Ley (10%)' : 'Exenta'}</span>
                          </div>
                        </label>
                      </div>
                    </div>

                  </div>
                )}
              </div>

              <hr className="form-divisor" /><label className="form-label-destacada">Imagen del Producto</label>
              <div className="form-group"><label>Subir desde la PC</label><input type="file" accept="image/*" className="form-input-file" onChange={(e) => setEditArchivo(e.target.files[0])} ref={editFileRef} /></div>
              
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                  <label style={{ margin: 0 }}>O pegar Enlace URL / Buscar</label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editForm.nombre?.trim()) return toastAviso('Escribe primero el nombre del producto.');
                      const foto = generarFotoGastronomica(editForm.nombre);
                      setEditForm({ ...editForm, imagen_url: foto });
                      setEditArchivo(null);
                      toastAviso('✨ Foto gastronómica asignada.');
                    }}
                    style={{
                      background: 'rgba(245, 184, 61, 0.15)',
                      border: '1px solid rgba(245, 184, 61, 0.35)',
                      color: 'var(--kpi-gold)',
                      borderRadius: '8px',
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Sparkles size={13} /> Auto-Buscar Foto
                  </button>
                </div>
                <input type="url" className={inputClass} value={editForm.imagen_url} onChange={(e) => setEditForm({ ...editForm, imagen_url: e.target.value })} disabled={!!editArchivo} />
                {editForm.imagen_url && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img src={editForm.imagen_url} alt="Vista previa" style={{ width: '54px', height: '36px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-subtle)' }} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Vista previa adaptada</span>
                  </div>
                )}
              </div>

              <div className="form-acciones">
                <button type="submit" className="btn-guardar-admin">Actualizar</button>
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
