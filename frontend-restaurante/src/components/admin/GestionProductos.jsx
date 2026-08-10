import { useState, useEffect, useRef } from 'react';
import { obtenerSesion } from '../../api.js';
import { sanitizarDecimal } from '../../utils/input.js';
import { toastAviso, toastError } from '../Toast.jsx';
import ConfirmModal from '../ConfirmModal';
import './admin.css';

function GestionProductos({ apiUrl }) {
  const [productos, setProductos] = useState([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [idEditando, setIdEditando] = useState(null);
  const [nuevoProducto, setNuevoProducto] = useState({ nombre: '', precio: '', imagen_url: '', categoria: 'Cocina' });
  const [archivoImagen, setArchivoImagen] = useState(null);
  const [archivoImportacion, setArchivoImportacion] = useState(null);
  const [archivoImportacionValido, setArchivoImportacionValido] = useState(true);
  const [importandoProductos, setImportandoProductos] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccessMessage, setImportSuccessMessage] = useState('');
  const [importErrorDetalles, setImportErrorDetalles] = useState([]);
  const [importCsvHeader, setImportCsvHeader] = useState([]);
  const [confirmData, setConfirmData] = useState(null);
  const fileInputRef = useRef(null);
  const importFileInputRef = useRef(null);

  const cargarProductos = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/productos`, {
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
      });
      setProductos(await res.json());
    } catch (e) { console.error("Error productos"); }
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  const manejarCambioInput = (e) => setNuevoProducto({ ...nuevoProducto, [e.target.name]: e.target.value });

  const manejarArchivo = (e) => {
    setArchivoImagen(e.target.files[0]);
    setNuevoProducto({ ...nuevoProducto, imagen_url: '' });
  };

  const prepararEdicion = (prod) => {
    setModoEdicion(true);
    setIdEditando(prod.id);
    setNuevoProducto({
      nombre: prod.nombre,
      precio: prod.precio,
      imagen_url: prod.imagen_url || '',
      categoria: prod.categoria || 'Cocina'
    });
    setArchivoImagen(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const cancelarEdicion = () => {
    setModoEdicion(false);
    setIdEditando(null);
    setNuevoProducto({ nombre: '', precio: '', imagen_url: '', categoria: 'Cocina' });
    setArchivoImagen(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const guardarProducto = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('nombre', nuevoProducto.nombre);
    formData.append('precio', nuevoProducto.precio);
    formData.append('categoria', nuevoProducto.categoria);
    if (nuevoProducto.imagen_url) formData.append('imagen_url', nuevoProducto.imagen_url);
    if (archivoImagen) formData.append('imagen_archivo', archivoImagen);

    try {
      const url = modoEdicion ? `${apiUrl}/api/productos/${idEditando}` : `${apiUrl}/api/productos`;
      const res = await fetch(url, {
        method: modoEdicion ? 'PUT' : 'POST',
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` },
        body: formData
      });
      if (res.ok) {
        toastAviso((await res.json()).mensaje);
        cancelarEdicion();
        cargarProductos();
      } else {
        const data = await res.json();
        toastAviso(data.error || 'Error guardando producto.');
      }
    } catch (e) {
      toastError("Error guardando producto.");
    }
  };

  const eliminarProducto = async (id, nombre) => {
    setConfirmData({
      mensaje: `¿Seguro que deseas eliminar "${nombre}"?`,
      onConfirm: async () => {
        await fetch(`${apiUrl}/api/productos/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
        });
        cargarProductos();
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
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values.map((value) => value.trim().replace(/^"|"$/g, ''));
  };

  const manejarArchivoImportacion = (e) => {
    const archivo = e.target.files[0] || null;
    setImportError('');
    setImportSuccessMessage('');
    setImportErrorDetalles([]);
    setImportCsvHeader([]);
    setArchivoImportacion(archivo);
    setArchivoImportacionValido(true);

    if (!archivo) return;

    if (!archivo.name.toLowerCase().endsWith('.csv')) {
      setImportError('Selecciona un archivo CSV válido.');
      setArchivoImportacionValido(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
      if (!lines.length) {
        setImportError('El archivo CSV está vacío.');
        setArchivoImportacionValido(false);
        return;
      }
      const header = parseCsvLine(lines[0]).map((value) => value.toLowerCase());
      const expected = ['nombre', 'precio', 'categoria', 'imagen_url'];
      const missingColumns = expected.filter((col) => !header.includes(col));
      if (missingColumns.length) {
        setImportError(`Columnas faltantes: ${missingColumns.join(', ')}.`);
        setArchivoImportacionValido(false);
        return;
      }
      setImportCsvHeader(header);
      setArchivoImportacionValido(true);
    };
    reader.onerror = () => {
      setImportError('No se pudo leer el archivo CSV.');
      setArchivoImportacionValido(false);
    };
    reader.readAsText(archivo, 'UTF-8');
  };

  const importarProductos = async () => {
    if (!archivoImportacion) return setImportError('Selecciona un archivo CSV primero.');
    setImportandoProductos(true);
    setImportError('');
    setImportSuccessMessage('');
    setImportErrorDetalles([]);
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
      const successLabel = `✅ Importación completada: ${inserciones} productos agregados.`;
      if (skipped) {
        setImportError('Algunos registros no se importaron por errores. Revisa los detalles.');
        setImportErrorDetalles(invalidRows);
        setImportSuccessMessage(`${successLabel} ${skipped} fila(s) omitida(s).`);
      } else {
        setImportSuccessMessage(`${successLabel} No hubo errores.`);
      }

      if (!skipped) {
        toastAviso(successLabel);
      } else {
        toastAviso(`${successLabel} ${skipped} fila(s) omitida(s).`);
      }
      setArchivoImportacion(null);
      if (importFileInputRef.current) importFileInputRef.current.value = '';
      cargarProductos();
    } catch (error) {
      setImportError(error.message);
    } finally {
      setImportandoProductos(false);
    }
  };

  return (
    <>
      <div className="admin-grid-layout">
        <div className="admin-panel-lista">
          <h3>Productos Actuales</h3>
          <div className="tabla-contenedor">
            <table className="admin-tabla">
              <thead><tr><th>Foto</th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Acciones</th></tr></thead>
              <tbody>
                {productos.map(prod => (
                  <tr key={prod.id}>
                    <td>{prod.imagen_url ? <img src={prod.imagen_url} alt="img" className="tabla-miniatura" /> : <span className="tabla-miniatura-placeholder">🍽️</span>}</td>
                    <td>{prod.nombre}</td>
                    <td>
                      <span className={`badge-categoria ${prod.categoria === 'Bar' ? 'bar' : 'cocina'}`}>
                        {prod.categoria || 'Cocina'}
                      </span>
                    </td>
                    <td className="tabla-precio">${Number(prod.precio).toFixed(2)}</td>
                    <td>
                      <button className="btn-accion edit" onClick={() => prepararEdicion(prod)}>✏️</button>
                      <button className="btn-accion delete" onClick={() => eliminarProducto(prod.id, prod.nombre)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel-formulario">
          <h3>{modoEdicion ? 'Editar Producto' : 'Crear Nuevo Producto'}</h3>
          <form onSubmit={guardarProducto}>
            <div className="form-group"><label>Nombre</label><input type="text" name="nombre" className="form-input" value={nuevoProducto.nombre} onChange={manejarCambioInput} required /></div>
            <div className="form-group"><label>Precio ($)</label><input type="text" inputMode="decimal" name="precio" className="form-input" value={nuevoProducto.precio} onChange={(e) => manejarCambioInput({ target: { name: 'precio', value: sanitizarDecimal(e.target.value) } })} required /></div>

            <div className="form-group">
              <label>Categoría (Destino del pedido)</label>
              <select name="categoria" className="form-input" value={nuevoProducto.categoria} onChange={manejarCambioInput}>
                <option value="Cocina">Cocina 🍳</option>
                <option value="Bar">Bar 🍸</option>
              </select>
            </div>

            <hr className="form-divisor" /><label className="form-label-destacada">Imagen del Producto</label>
            <div className="form-group"><label>1. Subir desde la PC</label><input type="file" accept="image/*" className="form-input-file" onChange={manejarArchivo} ref={fileInputRef} /></div>
            <div className="form-group"><label>2. O pegar Link</label><input type="url" name="imagen_url" className="form-input" value={nuevoProducto.imagen_url} onChange={manejarCambioInput} disabled={!!archivoImagen} /></div>
            <div className="form-acciones">
              <button type="submit" className="btn-guardar-admin">{modoEdicion ? '💾 Actualizar' : '💾 Guardar'}</button>
              {modoEdicion && <button type="button" className="btn-cancelar" onClick={cancelarEdicion}>❌</button>}
            </div>
          </form>

          <hr className="form-divisor" />
          <h3>Importación Masiva</h3>
          <p className="import-texto-ayuda">Descarga la plantilla CSV y carga productos en masa:</p>
          <a href="/productos-import-template.csv" download className="btn-guardar-admin btn-descargar-plantilla">📄 Descargar plantilla CSV</a>
          <div className="form-group"><label>Archivo CSV</label><input type="file" accept=".csv,text/csv" className="form-input-file" onChange={manejarArchivoImportacion} ref={importFileInputRef} /></div>
          {importError && <p className="import-msg-error">{importError}</p>}
          {importCsvHeader.length > 0 && (
            <p className="import-msg-header">Encabezados detectados: {importCsvHeader.join(', ')}</p>
          )}
          {importSuccessMessage && <p className="import-msg-success">{importSuccessMessage}</p>}
          {importErrorDetalles.length > 0 && (
            <div className="import-detalles-error">
              <strong>Errores en el archivo CSV:</strong>
              <ul>
                {importErrorDetalles.map((fila) => (
                  <li key={`${fila.linea}-${fila.error}`}>
                    Línea {fila.linea}: {fila.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="form-acciones">
            <button type="button" className="btn-guardar-admin" onClick={importarProductos} disabled={importandoProductos || !archivoImportacion || !archivoImportacionValido}>{importandoProductos ? 'Importando...' : 'Importar Productos'}</button>
          </div>
        </div>
      </div>

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
