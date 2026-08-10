import { useState, useEffect } from 'react';
import { sanitizarEntero } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';

function GestionMesas({ apiUrl }) {
  const [mesas, setMesas] = useState([]);
  const [cantidadNuevas, setCantidadNuevas] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const [confirmData, setConfirmData] = useState(null);
  const urlBase = apiUrl || 'http://localhost:3000';

  useEffect(() => {
    cargarMesas();
  }, []);

  const cargarMesas = async () => {
    try {
      const res = await fetch(`${urlBase}/api/mesas`);
      const data = await res.json();
      setMesas(data);
    } catch (error) {
      console.error("Error cargando mesas:", error);
    }
  };

  const generarMesasMasivas = async (e) => {
    e.preventDefault();
    if (!cantidadNuevas || cantidadNuevas <= 0) return;
    try {
      const res = await fetch(`${urlBase}/api/mesas/generar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cantidad: parseInt(cantidadNuevas) })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(`✅ ${data.mensaje}`);
        setCantidadNuevas('');
        cargarMesas();
      } else {
        toastAviso(`❌ ${data.error}`);
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
      toastAviso("⚠️ No puedes eliminar una mesa que se encuentra ocupada actualmente.");
      return;
    }
    setConfirmData({ mensaje: `¿Seguro que deseas eliminar la "${nombre}"?`, onConfirm: async () => {
      try {
        const res = await fetch(`${urlBase}/api/mesas/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          cargarMesas();
        } else {
          toastAviso(`❌ ${data.error}`);
        }
      } catch (error) {
        toastError("Error al eliminar la mesa.");
      }
    }});
  };

  return (
    <>
    <div style={{display: 'flex', flexDirection: 'column', gap: '20px', width: '100%'}}>
      
      {/* SECCIÓN 1: GENERADOR RÁPIDO */}
      <div style={{background: '#181820', padding: '20px', borderRadius: '10px', border: '1px solid #2a2a35'}}>
        <h3 style={{color: '#fff', marginTop: 0}}>➕ Generar Mesas Masivamente</h3>
        <form onSubmit={generarMesasMasivas} style={{display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px'}}>
          <input 
            type="text" 
            inputMode="numeric" 
            placeholder="Cantidad de mesas a crear" 
            value={cantidadNuevas} 
            onChange={(e) => setCantidadNuevas(sanitizarEntero(e.target.value))}
            style={{padding: '10px', background: '#121217', color: '#fff', border: '1px solid #3e3e4f', borderRadius: '6px', width: '220px'}}
            required
          />
          <button type="submit" style={{background: '#00e5ff', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'}}>
            Crear Mesas
          </button>
        </form>
      </div>

      {/* SECCIÓN 2: LISTADO Y EDICIÓN INDIVIDUAL */}
      <div style={{background: '#181820', padding: '20px', borderRadius: '10px', border: '1px solid #2a2a35'}}>
        <h3 style={{color: '#fff', marginTop: 0}}>🗺️ Personalizar Identificadores de Mesas</h3>
        <p style={{color: '#88889d', fontSize: '0.9rem'}}>Modifica los nombres genéricos (Ej: "Mesa 1") por nombres comerciales específicos como "Terraza 1", "VIP A" o "Barra 2".</p>

        <div style={{maxHeight: '400px', overflowY: 'auto', marginTop: '15px'}}>
          <table style={{width: '100%', borderCollapse: 'collapse', textAlign: 'left'}}>
            <thead>
              <tr style={{borderBottom: '1px solid #3e3e4f', color: '#00e5ff'}}>
                <th style={{padding: '10px'}}>ID</th>
                <th style={{padding: '10px'}}>Nombre / Identificador</th>
                <th style={{padding: '10px'}}>Estado Actual</th>
                <th style={{padding: '10px', textAlign: 'right'}}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {mesas.map((mesa) => (
                <tr key={mesa.id} style={{borderBottom: '1px solid #2a2a35'}}>
                  <td style={{padding: '12px', color: '#888'}}>#{mesa.id}</td>
                  <td style={{padding: '12px'}}>
                    {editandoId === mesa.id ? (
                      <input 
                        type="text" 
                        value={nombreEditado} 
                        onChange={(e) => setNombreEditado(e.target.value)}
                        style={{padding: '6px', background: '#121217', color: '#fff', border: '1px solid #00e5ff', borderRadius: '4px'}}
                      />
                    ) : (
                      <strong style={{color: '#fff'}}>{mesa.nombre_numero}</strong>
                    )}
                  </td>
                  <td style={{padding: '12px'}}>
                    <span style={{color: mesa.estado === 'Ocupada' ? '#ff5252' : '#00e676', fontWeight: 'bold'}}>
                      {mesa.estado}
                    </span>
                  </td>
                  <td style={{padding: '12px', textAlign: 'right', display: 'flex', gap: '8px', justifyContent: 'flex-end'}}>
                    {editandoId === mesa.id ? (
                      <button onClick={() => guardarEdicion(mesa.id)} style={{background: '#00e676', color: '#000', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>
                        💾 Guardar
                      </button>
                    ) : (
                      <button onClick={() => iniciarEdicion(mesa)} style={{background: '#ff9800', color: '#000', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>
                        ✏️ Renombrar
                      </button>
                    )}
                    <button onClick={() => eliminarMesa(mesa.id, mesa.nombre_numero, mesa.estado)} style={{background: '#ff5252', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    {confirmData && <ConfirmModal mensaje={confirmData.mensaje} onConfirm={async () => { await confirmData.onConfirm(); setConfirmData(null); }} onCancel={() => setConfirmData(null)} />}
    </>
  );
}

export default GestionMesas;
