import { useState, useEffect, useRef } from 'react';
import { toastAviso, toastError } from './Toast.jsx';

function ConfiguracionNegocio({ alVolver, apiUrl, alVerificarLicencia }) {
  const [formData, setFormData] = useState({
    nombre_comercial: '',
    razon_social: '',
    rnc: '',
    telefono: '',
    direccion: '',
    provincia: 'La Romana',
    regimen_fiscal: 'Ordinario',
    nombre_cocina: 'Cocina',
    nombre_bar: 'Bar',
    duracion_meses: 0,
    logo_url: '',
    cobrar_itbis: true,
    cobrar_propina: true
  });
  const [archivoLogo, setArchivoLogo] = useState(null);
  const [cargando, setCargando] = useState(true);
  const fileRef = useRef(null);
  const urlBase = apiUrl || 'http://localhost:3000';

  // Estados para activación de licencia
  const [claveMaestra, setClaveMaestra] = useState('');
  const [duracionActivar, setDuracionActivar] = useState('12');
  const [activando, setActivando] = useState(false);
  const [estadoLicencia, setEstadoLicencia] = useState(null);

  useEffect(() => {
    cargarConfiguracion();
    verificarLicencia();
  }, []);

  const verificarLicencia = async () => {
    try {
      const res = await fetch(`${urlBase}/api/licencia/verificar`);
      if (res.ok) {
        const data = await res.json();
        setEstadoLicencia(data);
      }
    } catch { /* sin conexión, mostrar licencia por defecto */ }
  };

  const licenciaActiva = estadoLicencia && !estadoLicencia.bloqueado && !estadoLicencia.esNuevo && estadoLicencia.tipo !== 'Vitalicia' && estadoLicencia.diasRestantes > 0;
  const licenciaVitalicia = estadoLicencia && !estadoLicencia.bloqueado && estadoLicencia.tipo === 'Vitalicia';
  const mostrarActivacion = !licenciaActiva && !licenciaVitalicia;

  const cargarConfiguracion = async () => {
    try {
      const res = await fetch(`${urlBase}/api/negocio/config`);
      if (res.ok) {
        const data = await res.json();
        setFormData({
          ...data,
          cobrar_itbis: data.cobrar_itbis ?? true,
          cobrar_propina: data.cobrar_propina ?? true
        });
      }
    } catch (error) {
      console.log("Cargando datos por defecto.");
    } finally {
      setCargando(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    });
  };

  const handleArchivo = (e) => {
    setArchivoLogo(e.target.files[0]);
  };

  const activarLicencia = async (e) => {
    e.preventDefault();
    if (!claveMaestra) return toastAviso("⚠️ Digita la clave maestra de activación.");
    setActivando(true);
    try {
      const res = await fetch(`${urlBase}/api/licencia/activar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duracion_meses: parseInt(duracionActivar, 10),
          clave_maestra: claveMaestra
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(`✅ ${data.mensaje}`);
        setClaveMaestra('');
        cargarConfiguracion();
        if (alVerificarLicencia) alVerificarLicencia();
      } else {
        toastAviso(`❌ ${data.error || 'Error al activar la licencia.'}`);
      }
    } catch (err) {
      toastAviso("⚠️ Error de conexión al activar la licencia.");
    } finally {
      setActivando(false);
    }
  };

  const guardarNegocio = async (e) => {
    e.preventDefault();
    const dataToSend = new FormData();
    dataToSend.append('nombre_comercial', formData.nombre_comercial);
    dataToSend.append('razon_social', formData.razon_social);
    dataToSend.append('rnc', formData.rnc);
    dataToSend.append('telefono', formData.telefono);
    dataToSend.append('direccion', formData.direccion);
    dataToSend.append('provincia', formData.provincia);
    dataToSend.append('regimen_fiscal', formData.regimen_fiscal);
    dataToSend.append('nombre_cocina', formData.nombre_cocina);
    dataToSend.append('nombre_bar', formData.nombre_bar);
    dataToSend.append('duracion_meses', formData.duracion_meses);
    dataToSend.append('cobrar_itbis', formData.cobrar_itbis);
    dataToSend.append('cobrar_propina', formData.cobrar_propina);
    
    if (archivoLogo) {
      dataToSend.append('logo_archivo', archivoLogo);
    } else if (formData.logo_url) {
      dataToSend.append('logo_url_link', formData.logo_url);
    }

    try {
      const res = await fetch(`${urlBase}/api/negocio/config`, {
        method: 'POST',
        body: dataToSend
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(`✅ ${data.mensaje}`);
        if (alVerificarLicencia) alVerificarLicencia();
        if (alVolver) alVolver();
      } else {
        toastAviso(`❌ ${data.error}`);
      }
    } catch (error) {
      toastError("Error de conexión al guardar configuración.");
    }
  };

  if (cargando) return <div className="menu-container"><p style={{color: '#fff', padding: '20px'}}>Cargando configuración...</p></div>;

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', background: '#0a0a0f', height: '100%', overflowY: 'auto', boxSizing: 'border-box'}}>
      <div style={{width: '100%', maxWidth: '650px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
        {alVolver && <button onClick={alVolver} className="btn-volver">⬅ Volver</button>}
        <h2 style={{color: '#fff', margin: 0, fontSize: '1.3rem'}}>🏢 Identidad y Parámetros Fiscales</h2>
        <div style={{width: '60px'}}></div>
      </div>

      <form onSubmit={guardarNegocio} style={{width: '100%', maxWidth: '650px', background: '#14141b', padding: '25px', borderRadius: '16px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'}}>
        
        {/* MÓDULO DE LICENCIA - Solo se muestra cuando no está activa */}
        {mostrarActivacion && (
          <div style={{background: '#0a0a0f', padding: '15px', borderRadius: '12px', border: '1px solid #00f576'}}>
            <label style={{color: '#00f576', fontWeight: 'bold', display: 'block', marginBottom: '8px', fontSize: '0.95rem'}}>
              🚀 Activación / Renovación de Licencia SaaS
            </label>
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                <div style={{flex: 1, minWidth: '200px'}}>
                  <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Duración Deseada</label>
                  <select 
                    value={duracionActivar} 
                    onChange={(e) => setDuracionActivar(e.target.value)}
                    style={{width: '100%', padding: '10px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}}
                  >
                    <option value="1">Plan Mensual (1 Mes)</option>
                    <option value="3">Plan Trimestral (3 Meses)</option>
                    <option value="6">Plan Semestral (6 Meses)</option>
                    <option value="12">Plan Anual (12 Meses)</option>
                    <option value="24">Plan Bianual (24 Meses)</option>
                    <option value="-1">Activación Vitalicia (De por vida)</option>
                  </select>
                </div>

                <div style={{flex: 1, minWidth: '200px'}}>
                  <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Clave Maestra de Activación</label>
                  <input 
                    type="password" 
                    placeholder="••••••••••••" 
                    value={claveMaestra} 
                    onChange={(e) => setClaveMaestra(e.target.value)}
                    style={{width: '100%', padding: '10px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}}
                  />
                </div>
              </div>

              <button 
                type="button" 
                onClick={activarLicencia}
                disabled={activando}
                style={{background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '11px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.9rem'}}
              >
                🚀 Activar Licencia Ahora
              </button>
            </div>
          </div>
        )}

        {/* Indicador de licencia activa */}
        {licenciaActiva && (
          <div style={{background: 'rgba(0,245,118,0.08)', padding: '12px 15px', borderRadius: '12px', border: '1px solid rgba(0,245,118,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px'}}>
            <span style={{color: '#00f576', fontWeight: 'bold', fontSize: '0.9rem'}}>✅ Licencia activa — {estadoLicencia.diasRestantes} días restantes</span>
            <button type="button" onClick={() => setEstadoLicencia({ ...estadoLicencia, _mostrarRenovar: true })} style={{background: 'transparent', border: '1px solid #00f576', color: '#00f576', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600'}}>Renovar</button>
          </div>
        )}

        {licenciaVitalicia && (
          <div style={{background: 'rgba(0,245,118,0.08)', padding: '12px 15px', borderRadius: '12px', border: '1px solid rgba(0,245,118,0.25)'}}>
            <span style={{color: '#00f576', fontWeight: 'bold', fontSize: '0.9rem'}}>✅ Licencia Vitalicia — Sin expiración</span>
          </div>
        )}

        {/* Formulario de renovación (oculto hasta que se presione "Renovar") */}
        {licenciaActiva && estadoLicencia._mostrarRenovar && (
          <div style={{background: '#0a0a0f', padding: '15px', borderRadius: '12px', border: '1px solid #ffb703'}}>
            <label style={{color: '#ffb703', fontWeight: 'bold', display: 'block', marginBottom: '8px', fontSize: '0.95rem'}}>🔄 Renovar Licencia</label>
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
              <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                <div style={{flex: 1, minWidth: '200px'}}>
                  <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Nueva Duración</label>
                  <select value={duracionActivar} onChange={(e) => setDuracionActivar(e.target.value)} style={{width: '100%', padding: '10px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}}>
                    <option value="1">1 Mes</option>
                    <option value="3">3 Meses</option>
                    <option value="6">6 Meses</option>
                    <option value="12">12 Meses</option>
                    <option value="24">24 Meses</option>
                    <option value="-1">Vitalicia</option>
                  </select>
                </div>
                <div style={{flex: 1, minWidth: '200px'}}>
                  <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Clave Maestra</label>
                  <input type="password" placeholder="••••••••" value={claveMaestra} onChange={(e) => setClaveMaestra(e.target.value)} style={{width: '100%', padding: '10px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} />
                </div>
              </div>
              <div style={{display: 'flex', gap: '8px'}}>
                <button type="button" onClick={activarLicencia} disabled={activando} style={{flex: 1, background: 'linear-gradient(135deg, #ffb703, #e6a800)', color: '#000', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem'}}>
                  {activando ? 'Activando...' : '🔄 Renovar Ahora'}
                </button>
                <button type="button" onClick={() => setEstadoLicencia({ ...estadoLicencia, _mostrarRenovar: false })} style={{background: 'transparent', border: '1px solid #2a2a38', color: '#9494ad', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem'}}>Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* LOGO DEL NEGOCIO */}
        <div style={{textAlign: 'center', background: '#0a0a0f', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a38'}}>
          <label style={{color: '#00f576', display: 'block', marginBottom: '10px', fontWeight: 'bold', fontSize: '0.9rem'}}>Logo del Establecimiento</label>
          {formData.logo_url && !archivoLogo && (
            <img src={formData.logo_url} alt="Logo actual" style={{width: '70px', height: '70px', objectFit: 'contain', marginBottom: '10px', background: '#fff', borderRadius: '6px'}} />
          )}
          <input type="file" accept="image/*" onChange={handleArchivo} ref={fileRef} style={{color: '#fff', fontSize: '0.85rem'}} />
        </div>

        <div>
          <label style={{color: '#00f576', display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.85rem'}}>Nombre Comercial</label>
          <input type="text" name="nombre_comercial" value={formData.nombre_comercial} onChange={handleChange} required style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} />
        </div>

        <div>
          <label style={{color: '#00f576', display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.85rem'}}>Razón Social</label>
          <input type="text" name="razon_social" value={formData.razon_social} onChange={handleChange} required style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} />
        </div>

        <div style={{display: 'flex', gap: '12px'}}>
          <div style={{flex: 1}}>
            <label style={{color: '#00f576', display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.85rem'}}>RNC</label>
            <input type="text" name="rnc" value={formData.rnc} onChange={handleChange} required maxLength="11" style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} />
          </div>
          <div style={{flex: 1}}>
            <label style={{color: '#00f576', display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.85rem'}}>Teléfono</label>
            <input type="text" name="telefono" value={formData.telefono} onChange={handleChange} required style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} />
          </div>
        </div>

        <div>
          <label style={{color: '#00f576', display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '0.85rem'}}>Dirección Física</label>
          <input type="text" name="direccion" value={formData.direccion} onChange={handleChange} required style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.9rem'}} />
        </div>

        {/* CONFIGURACIÓN DE IMPUESTOS Y PROPINA (DGII / R.D.) */}
        <div style={{background: '#0a0a0f', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a38'}}>
          <label style={{color: '#ffb703', fontWeight: 'bold', display: 'block', marginBottom: '10px', fontSize: '0.9rem'}}>⚖️ Configuración de Impuestos y Cargos</label>
          <div style={{display: 'flex', gap: '20px'}}>
            <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem'}}>
              <input 
                type="checkbox" 
                name="cobrar_itbis"
                checked={formData.cobrar_itbis} 
                onChange={handleChange} 
                style={{width: '16px', height: '16px', accentColor: '#00f576'}}
              />
              Cobrar ITBIS (18%)
            </label>

            <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem'}}>
              <input 
                type="checkbox" 
                name="cobrar_propina"
                checked={formData.cobrar_propina} 
                onChange={handleChange} 
                style={{width: '16px', height: '16px', accentColor: '#00f576'}}
              />
              Cobrar Propina Legal (10%)
            </label>
          </div>
        </div>

        {/* PERSONALIZACIÓN DE NOMBRES DE MÓDULOS */}
        <div style={{background: '#0a0a0f', padding: '15px', borderRadius: '12px', border: '1px solid #2a2a38'}}>
          <label style={{color: '#ffb703', fontWeight: 'bold', display: 'block', marginBottom: '8px', fontSize: '0.9rem'}}>🏷️ Personalización de Módulos (Áreas de Producción)</label>
          <div style={{display: 'flex', gap: '12px'}}>
            <div style={{flex: 1}}>
              <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Nombre para "Cocina"</label>
              <input type="text" name="nombre_cocina" value={formData.nombre_cocina} onChange={handleChange} placeholder="Ej: Plancha" style={{width: '100%', padding: '8px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.85rem'}} />
            </div>
            <div style={{flex: 1}}>
              <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>Nombre para "Bar"</label>
              <input type="text" name="nombre_bar" value={formData.nombre_bar} onChange={handleChange} placeholder="Ej: Barra" style={{width: '100%', padding: '8px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontSize: '0.85rem'}} />
            </div>
          </div>
        </div>

        <button type="submit" style={{marginTop: '10px', background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', padding: '13px', borderRadius: '10px', fontWeight: '800', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,245,118,0.3)'}}>
          💾 Guardar Identidad y Configuración
        </button>

      </form>
    </div>
  );
}

export default ConfiguracionNegocio;
