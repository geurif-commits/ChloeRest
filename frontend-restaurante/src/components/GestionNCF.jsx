import { useState, useEffect } from 'react';
import { sanitizarEntero } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';

function GestionNCF({ alVolver, apiUrl }) {
  const urlBase = apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const [pestañaActiva, setPestañaActiva] = useState('secuencias');
  const [secuencias, setSecuencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [confirmData, setConfirmData] = useState(null);

  // Formulario Secuencias NCF
  const [editId, setEditId] = useState(null);
  const [tipoComprobante, setTipoComprobante] = useState('B02');
  const [prefijo, setPrefijo] = useState('B02');
  const [secuenciaInicial, setSecuenciaInicial] = useState('1');
  const [secuenciaActual, setSecuenciaActual] = useState('1');
  const [secuenciaFinal, setSecuenciaFinal] = useState('1000');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [activa, setActiva] = useState(true);

  // Formulario Facturación Electrónica e-CF DGII
  const [configEcf, setConfigEcf] = useState({
    rnc_emisor: '',
    razon_social_emisor: '',
    ambiente: 'Pruebas',
    url_servicio_dgii: 'https://ecf.dgii.gov.do/fe/autenticacion/api/autenticacion',
    client_id: '',
    client_secret: '',
    clave_certificado: '',
    estado_ecf: 'Pendiente de Certificación'
  });
  const [guardandoEcf, setGuardandoEcf] = useState(false);

  useEffect(() => {
    cargarSecuencias();
    cargarConfigEcf();
  }, []);

  const cargarSecuencias = async () => {
    try {
      const res = await fetch(`${urlBase}/api/dgii/secuencias`);
      if (res.ok) {
        const data = await res.json();
        setSecuencias(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error al cargar secuencias NCF:", error);
    } finally {
      setCargando(false);
    }
  };

  const cargarConfigEcf = async () => {
    try {
      const res = await fetch(`${urlBase}/api/dgii/config`);
      if (res.ok) {
        const data = await res.json();
        setConfigEcf((prev) => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error("Error al cargar config e-CF DGII:", error);
    }
  };

  const guardarSecuencia = async (e) => {
    e.preventDefault();
    if (!tipoComprobante || !prefijo || !fechaVencimiento) {
      return toastAviso("⚠️ Completa los campos obligatorios.");
    }

    try {
      const res = await fetch(`${urlBase}/api/dgii/secuencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          tipo_comprobante: tipoComprobante,
          prefijo,
          secuencia_inicial: parseInt(secuenciaInicial || '1', 10),
          secuencia_actual: parseInt(secuenciaActual || '1', 10),
          secuencia_final: parseInt(secuenciaFinal || '99999999', 10),
          fecha_vencimiento: fechaVencimiento,
          activa
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(`✅ ${data.mensaje}`);
        limpiarFormulario();
        cargarSecuencias();
      } else {
        toastAviso(`❌ ${data.error}`);
      }
    } catch (error) {
      toastAviso("⚠️ Error al guardar secuencia NCF.");
    }
  };

  const guardarConfigEcf = async (e) => {
    e.preventDefault();
    setGuardandoEcf(true);
    try {
      const res = await fetch(`${urlBase}/api/dgii/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configEcf)
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(`✅ ${data.mensaje}`);
        cargarConfigEcf();
      } else {
        toastAviso(`❌ ${data.error || 'Error al guardar configuración e-CF.'}`);
      }
    } catch (error) {
      toastAviso("⚠️ Error de conexión al guardar configuración e-CF.");
    } finally {
      setGuardandoEcf(false);
    }
  };

  const editar = (item) => {
    setEditId(item.id);
    setTipoComprobante(item.tipo_comprobante);
    setPrefijo(item.prefijo);
    setSecuenciaInicial(item.secuencia_inicial);
    setSecuenciaActual(item.secuencia_actual);
    setSecuenciaFinal(item.secuencia_final);
    setFechaVencimiento(item.fecha_vencimiento ? item.fecha_vencimiento.split('T')[0] : '');
    setActiva(item.activa);
  };

  const eliminar = async (id) => {
    setConfirmData({ mensaje: '¿Eliminar esta secuencia fiscal NCF?', onConfirm: async () => {
      try {
        const res = await fetch(`${urlBase}/api/dgii/secuencias/${id}`, { method: 'DELETE' });
        if (res.ok) { cargarSecuencias(); }
      } catch (error) { toastAviso("⚠️ Error al eliminar secuencia."); }
    }});
  };

  const limpiarFormulario = () => {
    setEditId(null);
    setTipoComprobante('B02');
    setPrefijo('B02');
    setSecuenciaInicial('1');
    setSecuenciaActual('1');
    setSecuenciaFinal('1000');
    setFechaVencimiento('');
    setActiva(true);
  };

  if (cargando) {
    return (
      <div style={{ height: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00f576', fontFamily: 'sans-serif' }}>
        <h2>Cargando secuencias fiscales NCF...</h2>
      </div>
    );
  }

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0a0f', color: '#fff', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* HEADER */}
      <header style={{ padding: '15px 30px', background: '#14141b', borderBottom: '1px solid #2a2a38', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {alVolver && (
            <button onClick={alVolver} style={{ background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              ⬅ Volver
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>🧾 Administración Fiscal DGII (Rep. Dom.)</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setPestañaActiva('secuencias')}
            style={{
              background: pestañaActiva === 'secuencias' ? '#00f576' : '#1a1a24',
              color: pestañaActiva === 'secuencias' ? '#000' : '#fff',
              border: '1px solid #2a2a38', padding: '10px 18px', borderRadius: '10px',
              fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            📋 Secuencias NCF Tradicionales
          </button>
          <button
            onClick={() => setPestañaActiva('ecf')}
            style={{
              background: pestañaActiva === 'ecf' ? '#00e5ff' : '#1a1a24',
              color: pestañaActiva === 'ecf' ? '#000' : '#fff',
              border: '1px solid #2a2a38', padding: '10px 18px', borderRadius: '10px',
              fontWeight: 'bold', cursor: 'pointer'
            }}
          >
            ⚡ Facturación Electrónica e-CF
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ flex: 1, padding: '25px', display: 'flex', gap: '25px', overflow: 'hidden' }}>
        
        {pestañaActiva === 'secuencias' ? (
          <>
            {/* COLUMNA IZQUIERDA: FORMULARIO SECUENCIAS */}
            <div style={{ width: '380px', background: '#14141b', padding: '20px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', gap: '15px', height: 'fit-content' }}>
              <h3 style={{ color: '#00f576', margin: 0 }}>
                {editId ? '✏️ Editar Secuencia NCF' : '➕ Nueva Secuencia NCF'}
              </h3>

              <form onSubmit={guardarSecuencia} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Tipo Comprobante</label>
                  <select
                    value={tipoComprobante}
                    onChange={(e) => {
                      setTipoComprobante(e.target.value);
                      setPrefijo(e.target.value);
                    }}
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}
                  >
                    <option value="B02">B02 - Consumidor Final</option>
                    <option value="B01">B01 - Crédito Fiscal (RNC)</option>
                    <option value="B14">B14 - Regímenes Especiales</option>
                    <option value="B15">B15 - Gubernamental</option>
                    <option value="e-CF">e-CF - Comprobante Electrónico</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Prefijo NCF</label>
                  <input
                    type="text"
                    placeholder="Ej: B02 o E31"
                    value={prefijo}
                    onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
                    required
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Secuencia Actual</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={secuenciaActual}
                      onChange={(e) => setSecuenciaActual(sanitizarEntero(e.target.value))}
                      required
                      style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Secuencia Final</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={secuenciaFinal}
                      onChange={(e) => setSecuenciaFinal(sanitizarEntero(e.target.value))}
                      required
                      style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px' }}>Fecha Vencimiento Autorizada</label>
                  <input
                    type="date"
                    value={fechaVencimiento}
                    onChange={(e) => setFechaVencimiento(e.target.value)}
                    required
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                  <input
                    type="checkbox"
                    id="activaCheck"
                    checked={activa}
                    onChange={(e) => setActiva(e.target.checked)}
                  />
                  <label htmlFor="activaCheck" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>Secuencia Activa</label>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button type="submit" style={{ flex: 1, background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '11px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                    💾 {editId ? 'Actualizar' : 'Guardar NCF'}
                  </button>
                  {editId && (
                    <button type="button" onClick={limpiarFormulario} style={{ background: '#2a2a38', color: '#fff', border: 'none', padding: '11px', borderRadius: '8px', cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* COLUMNA DERECHA: TABLA DE SECUENCIAS */}
            <div style={{ flex: 1, background: '#14141b', padding: '20px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <h3 style={{ color: '#ffb703', margin: '0 0 15px 0' }}>📋 Secuencias NCF Registradas ({secuencias.length})</h3>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ color: '#9494ad', textAlign: 'left', borderBottom: '1px solid #2a2a38' }}>
                      <th style={{ paddingBottom: '10px' }}>Tipo</th>
                      <th style={{ paddingBottom: '10px' }}>Prefijo</th>
                      <th style={{ paddingBottom: '10px' }}>Secuencia Actual</th>
                      <th style={{ paddingBottom: '10px' }}>Secuencia Final</th>
                      <th style={{ paddingBottom: '10px' }}>Vencimiento</th>
                      <th style={{ paddingBottom: '10px' }}>Estado</th>
                      <th style={{ textAlign: 'right', paddingBottom: '10px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secuencias.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#5e5e73', fontStyle: 'italic' }}>
                          No hay secuencias NCF configuradas en el sistema.
                        </td>
                      </tr>
                    ) : (
                      secuencias.map((item) => {
                        const NCFEjemplo = `${item.prefijo}${String(item.secuencia_actual).padStart(8, '0')}`;
                        const fechaFmt = item.fecha_vencimiento ? new Date(item.fecha_vencimiento).toLocaleDateString() : 'N/A';
                        return (
                          <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <td style={{ padding: '12px 0', fontWeight: 'bold' }}>{item.tipo_comprobante}</td>
                            <td style={{ padding: '12px 0', color: '#00f576', fontWeight: 'bold' }}>{item.prefijo}</td>
                            <td style={{ padding: '12px 0' }}>
                              <span style={{ background: '#1a1a24', padding: '4px 8px', borderRadius: '6px', fontSize: '0.85rem' }}>
                                {NCFEjemplo}
                              </span>
                            </td>
                            <td style={{ padding: '12px 0', color: '#9494ad' }}>{item.secuencia_final}</td>
                            <td style={{ padding: '12px 0', color: '#9494ad' }}>{fechaFmt}</td>
                            <td style={{ padding: '12px 0' }}>
                              <span style={{
                                padding: '3px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 'bold',
                                background: item.activa ? 'rgba(0,245,118,0.15)' : 'rgba(255,51,102,0.15)',
                                color: item.activa ? '#00f576' : '#ff3366'
                              }}>
                                {item.activa ? '✅ Activa' : '❌ Inactiva'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px 0' }}>
                              <button onClick={() => editar(item)} style={{ background: 'transparent', border: '1px solid #00f576', color: '#00f576', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', marginRight: '6px', fontSize: '0.8rem' }}>
                                ✏️ Editar
                              </button>
                              <button onClick={() => eliminar(item.id)} style={{ background: 'transparent', border: '1px solid #ff3366', color: '#ff3366', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
                                🗑️
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
        ) : (
          /* SECCIÓN FACTURACIÓN ELECTRÓNICA e-CF (DGII) */
          <div style={{ flex: 1, background: '#14141b', padding: '30px', borderRadius: '18px', border: '1px solid #00e5ff', overflowY: 'auto', maxWidth: '850px', margin: '0 auto', boxShadow: '0 10px 30px rgba(0, 229, 255, 0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #2a2a38', paddingBottom: '15px' }}>
              <div>
                <h2 style={{ color: '#00e5ff', margin: 0, fontSize: '1.3rem' }}>⚡ Integración Facturación Electrónica e-CF (DGII)</h2>
                <p style={{ color: '#9494ad', margin: '5px 0 0 0', fontSize: '0.85rem' }}>
                  Configura tus credenciales y accesos una vez que la DGII autorice a tu empresa el uso de e-CF.
                </p>
              </div>
              <span style={{
                background: configEcf.ambiente === 'Producción' ? 'rgba(0,245,118,0.2)' : 'rgba(255,183,3,0.2)',
                color: configEcf.ambiente === 'Producción' ? '#00f576' : '#ffb703',
                padding: '6px 12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.85rem', border: '1px solid currentColor'
              }}>
                {configEcf.ambiente}
              </span>
            </div>

            <form onSubmit={guardarConfigEcf} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>RNC del Contribuyente (Emisor)</label>
                  <input 
                    type="text" 
                    placeholder="Ej: 130000001" 
                    value={configEcf.rnc_emisor}
                    onChange={(e) => setConfigEcf({ ...configEcf, rnc_emisor: e.target.value })}
                    required
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ flex: 1.5 }}>
                  <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Razón Social Autorizada</label>
                  <input 
                    type="text" 
                    placeholder="Ej: CHLOE RESTAURANTE SRL" 
                    value={configEcf.razon_social_emisor}
                    onChange={(e) => setConfigEcf({ ...configEcf, razon_social_emisor: e.target.value })}
                    required
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Ambiente DGII</label>
                  <select 
                    value={configEcf.ambiente}
                    onChange={(e) => setConfigEcf({ ...configEcf, ambiente: e.target.value })}
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                  >
                    <option value="Pruebas">Pruebas / Certificación (Cotejo DGII)</option>
                    <option value="Producción">Producción (Live DGII API)</option>
                  </select>
                </div>

                <div style={{ flex: 1.5 }}>
                  <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Estado de Facturación Electrónica</label>
                  <select 
                    value={configEcf.estado_ecf}
                    onChange={(e) => setConfigEcf({ ...configEcf, estado_ecf: e.target.value })}
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                  >
                    <option value="Pendiente de Certificación">Pendiente de Certificación</option>
                    <option value="En Fase de Pruebas">En Fase de Pruebas (Set de Pruebas)</option>
                    <option value="Certificado y Operativo">Certificado y Operativo (Emisión Live)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>URL WebService API DGII (Autenticación e-CF)</label>
                <input 
                  type="text" 
                  placeholder="https://ecf.dgii.gov.do/fe/autenticacion/api/autenticacion" 
                  value={configEcf.url_servicio_dgii}
                  onChange={(e) => setConfigEcf({ ...configEcf, url_servicio_dgii: e.target.value })}
                  style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Client ID (API DGII)</label>
                  <input 
                    type="text" 
                    placeholder="Proporcionado por DGII..." 
                    value={configEcf.client_id}
                    onChange={(e) => setConfigEcf({ ...configEcf, client_id: e.target.value })}
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Client Secret (API DGII)</label>
                  <input 
                    type="password" 
                    placeholder="Proporcionado por DGII..." 
                    value={configEcf.client_secret}
                    onChange={(e) => setConfigEcf({ ...configEcf, client_secret: e.target.value })}
                    style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ color: '#00e5ff', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Clave del Certificado Digital PFX/P12 (.p12)</label>
                <input 
                  type="password" 
                  placeholder="Contraseña del archivo de Firma Digital..." 
                  value={configEcf.clave_certificado}
                  onChange={(e) => setConfigEcf({ ...configEcf, clave_certificado: e.target.value })}
                  style={{ width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ background: '#0a0a0f', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a38', marginTop: '10px' }}>
                <h4 style={{ color: '#ffb703', margin: '0 0 5px 0', fontSize: '0.9rem' }}>ℹ️ Nota de Conformidad e-CF (República Dominicana)</h4>
                <p style={{ color: '#9494ad', margin: 0, fontSize: '0.8rem', lineHeight: '1.4' }}>
                  El estándar e-CF requiere firma XML con algoritmo RSA-SHA256 usando el certificado digital de tu empresa (emitido por Viafirma o Avansi). Una vez la DGII emita tu token comercial, ingresa las credenciales arriba para activar el envío en tiempo real de Comprobantes Electrónicos.
                </p>
              </div>

              <button 
                type="submit" 
                disabled={guardandoEcf}
                style={{ background: 'linear-gradient(135deg, #00e5ff, #0083b0)', color: '#000', border: 'none', padding: '13px', borderRadius: '10px', fontWeight: '800', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,229,255,0.3)', marginTop: '10px' }}
              >
                {guardandoEcf ? 'Guardando...' : '💾 Guardar Parámetros Facturación Electrónica e-CF'}
              </button>
            </form>
          </div>
        )}

      </main>
    </div>
    {confirmData && <ConfirmModal mensaje={confirmData.mensaje} onConfirm={async () => { await confirmData.onConfirm(); setConfirmData(null); }} onCancel={() => setConfirmData(null)} />}
    </>
  );
}

export default GestionNCF;

