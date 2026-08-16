import { useState, useEffect } from 'react';
import { obtenerSesion } from '../../api.js';
import { toastAviso } from '../Toast.jsx';
import ConfirmModal from '../ConfirmModal';
import './admin.css';

function GestionUsuarios({ apiUrl, usuarioIdActual }) {
  const [usuariosLista, setUsuariosLista] = useState([]);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [idEditando, setIdEditando] = useState(null);
  const [nuevoUsuario, setNuevoUsuario] = useState({ nombre: '', rol: 'Camarero', pin: '' });
  const [confirmData, setConfirmData] = useState(null);

  const cargarUsuarios = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/usuarios`, {
        headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
      });
      setUsuariosLista(await res.json());
    } catch (e) { console.error("Error usuarios"); }
  };

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const manejarCambioInput = (e) => setNuevoUsuario((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const prepararEdicion = (usu) => {
    setModoEdicion(true);
    setIdEditando(usu.id);
    setNuevoUsuario({ nombre: usu.nombre, rol: usu.rol, pin: '' });
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
      toastAviso('Completa el nombre antes de guardar.');
      return;
    }
    if (!modoEdicion && !pin) {
      toastAviso('Ingresa el PIN de acceso del nuevo usuario.');
      return;
    }
    if (pin && !/^[0-9]{4,12}$/.test(pin)) {
      toastAviso('El PIN debe contener entre 4 y 12 dígitos numéricos.');
      return;
    }

    try {
      const url = modoEdicion ? `${apiUrl}/api/usuarios/${idEditando}` : `${apiUrl}/api/usuarios`;
      const res = await fetch(url, {
        method: modoEdicion ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
        body: JSON.stringify({ nombre, rol, ...(pin ? { pin } : {}) })
      });
      const data = await res.json();
      if (!res.ok) {
        toastAviso(data.error || 'Error guardando usuario.');
        return;
      }
      toastAviso(data.mensaje || 'Usuario guardado correctamente.');
      cargarUsuarios();
    } catch (e) {
      console.error('Error guardando usuario:', e);
      toastAviso('Error guardando usuario. Verifica la conexión y vuelve a intentarlo.');
    } finally {
      setNuevoUsuario({ nombre: '', rol: 'Camarero', pin: '' });
      setIdEditando(null);
      setModoEdicion(false);
    }
  };

  const eliminarUsuario = async (id, nombre) => {
    setConfirmData({
      mensaje: `¿Seguro que deseas ELIMINAR el acceso a "${nombre}"?`,
      onConfirm: async () => {
        await fetch(`${apiUrl}/api/usuarios/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
        });
        cargarUsuarios();
      }
    });
  };

  return (
    <>
      <div className="admin-grid-layout">
        <div className="admin-panel-lista">
          <h3>Personal del Restaurante</h3>
          <div className="tabla-contenedor">
            <table className="admin-tabla">
              <thead><tr><th>ID</th><th>Nombre</th><th>Rol</th><th>PIN</th><th>Acciones</th></tr></thead>
              <tbody>
                {usuariosLista.map(usu => (
                  <tr key={usu.id}>
                    <td>#{usu.id}</td>
                    <td style={{ fontWeight: 'bold' }}>{usu.nombre}</td>
                    <td>
                      <span className={`badge-rol ${
                        usu.rol === 'Administrador' ? 'admin' :
                        usu.rol === 'Cajero' ? 'cajero' :
                        usu.rol === 'Capitán de Camareros' ? 'capitan' : 'default'
                      }`}>
                        {usu.rol}
                      </span>
                    </td>
                    <td className="pin-oculto">****</td>
                    <td>
                      <button className="btn-accion edit" onClick={() => prepararEdicion(usu)}>✏️</button>
                      {usu.id !== usuarioIdActual && (
                        <button className="btn-accion delete" onClick={() => eliminarUsuario(usu.id, usu.nombre)}>🗑️</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-panel-formulario">
          <h3>{modoEdicion ? 'Editar Usuario' : 'Registrar Personal'}</h3>
          <form onSubmit={guardarUsuario}>
            <div className="form-group">
              <label>Nombre Completo</label>
              <input type="text" name="nombre" className="form-input" placeholder="Ej: Juan Pérez" value={nuevoUsuario.nombre} onChange={manejarCambioInput} required />
            </div>

            <div className="form-group">
              <label>Rol en el Sistema</label>
              <select name="rol" className="form-input" value={nuevoUsuario.rol} onChange={manejarCambioInput}>
                <option value="Camarero">Camarero (Toma pedidos)</option>
                <option value="Capitán de Camareros">Capitán de Camareros (Puede anular)</option>
                <option value="Cajero">Cajero (Puede cobrar mesas)</option>
                <option value="Administrador">Administrador (Acceso Total)</option>
              </select>
            </div>

            <div className="form-group">
              <label>PIN de Acceso {modoEdicion ? '(dejar vacío = mantener actual)' : '(obligatorio)'}</label>
              <input type="password" name="pin" className="form-input" placeholder="Ej: 1234" maxLength="12" title="Debe contener entre 4 y 12 números" value={nuevoUsuario.pin} onChange={manejarCambioInput} required={!modoEdicion} />
              {modoEdicion && <span className="form-ayuda">Si dejas el PIN vacío se conserva el actual del empleado.</span>}
            </div>

            <div className="form-acciones">
              <button type="submit" className="btn-guardar-admin">{modoEdicion ? '💾 Actualizar' : '💾 Registrar'}</button>
              {modoEdicion && <button type="button" className="btn-cancelar" onClick={cancelarEdicion}>❌</button>}
            </div>
          </form>
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

export default GestionUsuarios;
