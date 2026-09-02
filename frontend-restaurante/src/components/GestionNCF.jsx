import { useState, useEffect } from 'react';
import { sanitizarEntero } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';
import {
  FileText, Send, History, Settings, Save, ArrowLeft, Pencil, Trash2,
  Plus, AlertCircle, CheckCircle, Clock, RefreshCw, Download, BarChart3, Database
} from 'lucide-react';

function GestionNCF({ alVolver, apiUrl }) {
  const urlBase = apiUrl;
  const [pestañaActiva, setPestañaActiva] = useState('secuencias');
  const [secuencias, setSecuencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [confirmData, setConfirmData] = useState(null);

  const [editId, setEditId] = useState(null);
  const [tipoComprobante, setTipoComprobante] = useState('B02');
  const [prefijo, setPrefijo] = useState('B02');
  const [secuenciaInicial, setSecuenciaInicial] = useState('1');
  const [secuenciaActual, setSecuenciaActual] = useState('1');
  const [secuenciaFinal, setSecuenciaFinal] = useState('1000');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [activa, setActiva] = useState(true);

  const [configEcf, setConfigEcf] = useState({
    rnc_emisor: '',
    razon_social_emisor: '',
    ambiente: 'Pruebas',
    url_servicio_dgii: 'https://ecf.dgii.gov.do/fe/autenticacion/api/autenticacion',
    client_id: '',
    client_secret: '',
    clave_certificado: '',
    estado_ecf: 'Pendiente de Certificación',
    proveedor_ecf: 'algoback',
    algoback_api_key: '',
    algoback_url: 'https://api-dgii.algoback.com/ecf/procesar-factura',
    algoback_ambiente: 'TEST'
  });
  const [guardandoEcf, setGuardandoEcf] = useState(false);

  const [cuentaIdEcf, setCuentaIdEcf] = useState('');
  const [enviandoEcf, setEnviandoEcf] = useState(false);
  const [historialEcf, setHistorialEcf] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [subPestañaEcf, setSubPestañaEcf] = useState('config');

  const [reporteAnio, setReporteAnio] = useState(new Date().getFullYear());
  const [reporteMes, setReporteMes] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [datos607, setDatos607] = useState(null);
  const [cargandoReporte, setCargandoReporte] = useState(false);

  const consultarReporte607 = async () => {
    setCargandoReporte(true);
    try {
      const res = await fetch(`${urlBase}/api/dgii/reporte-607?anio=${reporteAnio}&mes=${reporteMes}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error consultando reporte 607');
      setDatos607(data);
      toastExito(`Reporte 607 cargado: ${data.totalRegistros} ventas encontradas.`);
    } catch (err) {
      toastError(err.message);
    } finally {
      setCargandoReporte(false);
    }
  };

  const descargarReporte607Txt = () => {
    const token = localStorage.getItem('token') || '';
    window.open(`${urlBase}/api/dgii/reporte-607?anio=${reporteAnio}&mes=${reporteMes}&formato=txt&token=${token}`, '_blank');
  };

  const descargarReporte606Txt = () => {
    const token = localStorage.getItem('token') || '';
    window.open(`${urlBase}/api/dgii/reporte-606?anio=${reporteAnio}&mes=${reporteMes}&formato=txt&token=${token}`, '_blank');
  };

  useEffect(() => {
    cargarSecuencias();
    cargarConfigEcf();
    cargarHistorialEcf();
  }, []);

  const cargarHistorialEcf = async () => {
    setCargandoHistorial(true);
    try {
      const res = await fetch(urlBase + '/api/dgii/ecf/historial');
      if (res.ok) {
        const data = await res.json();
        setHistorialEcf(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error("Error al cargar historial e-CF:", error);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const enviarEcf = async () => {
    if (!cuentaIdEcf) return toastAviso("Ingresa el ID de la cuenta.");
    setEnviandoEcf(true);
    try {
      const res = await fetch(urlBase + '/api/dgii/ecf/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: parseInt(cuentaIdEcf, 10) })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje);
        setCuentaIdEcf('');
        cargarHistorialEcf();
      } else {
        toastAviso(data.error || 'Error al enviar e-CF.');
      }
    } catch (error) {
      toastAviso("Error de conexión al enviar e-CF.");
    } finally {
      setEnviandoEcf(false);
    }
  };

  const cargarSecuencias = async () => {
    try {
      const res = await fetch(urlBase + '/api/dgii/secuencias');
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
      const res = await fetch(urlBase + '/api/dgii/config');
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
      return toastAviso("Completa los campos obligatorios.");
    }
    try {
      const res = await fetch(urlBase + '/api/dgii/secuencias', {
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
        toastAviso(data.mensaje);
        limpiarFormulario();
        cargarSecuencias();
      } else {
        toastAviso(data.error);
      }
    } catch (error) {
      toastAviso("Error al guardar secuencia NCF.");
    }
  };

  const guardarConfigEcf = async (e) => {
    e.preventDefault();
    setGuardandoEcf(true);
    try {
      const res = await fetch(urlBase + '/api/dgii/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configEcf)
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje);
        cargarConfigEcf();
      } else {
        toastAviso(data.error || 'Error al guardar configuración e-CF.');
      }
    } catch (error) {
      toastAviso("Error de conexión al guardar configuración e-CF.");
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
        const res = await fetch(urlBase + '/api/dgii/secuencias/' + id, { method: 'DELETE' });
        if (res.ok) { cargarSecuencias(); }
      } catch (error) { toastAviso("Error al eliminar secuencia."); }
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
      <div className="admin-empty">
        <Clock size={40} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
        <p style={{ color: 'var(--text-muted)' }}>Cargando secuencias fiscales NCF...</p>
      </div>
    );
  }

  const getEstadoBadgeClass = (estado) => {
    if (estado === 'Aceptado') return 'admin-badge admin-badge-success';
    if (estado === 'Rechazado') return 'admin-badge admin-badge-danger';
    return 'admin-badge admin-badge-warning';
  };

  const formatMonto = (monto) => {
    if (!monto) return 'N/A';
    return 'RD$ ' + Number(monto).toFixed(2);
  };

  const ecfAmbienteBadgeClass = configEcf.algoback_ambiente === 'PROD'
    ? 'admin-badge admin-badge-success'
    : 'admin-badge admin-badge-warning';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {alVolver && (
        <button onClick={alVolver} className="admin-btn admin-btn-secondary" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> Volver
        </button>
      )}

      <div className="admin-tabs">
        <button
          className={'admin-tab' + (pestañaActiva === 'secuencias' ? ' activo' : '')}
          onClick={() => setPestañaActiva('secuencias')}
        >
          <FileText size={16} /> Secuencias NCF Tradicionales
        </button>
        <button
          className={'admin-tab' + (pestañaActiva === 'ecf' ? ' activo' : '')}
          onClick={() => setPestañaActiva('ecf')}
        >
          <Settings size={16} /> Facturación Electrónica e-CF
        </button>
        <button
          className={'admin-tab' + (pestañaActiva === 'reportes607' ? ' activo' : '')}
          onClick={() => setPestañaActiva('reportes607')}
        >
          <Download size={16} /> Reportes DGII (607 y 606)
        </button>
      </div>

      {pestañaActiva === 'secuencias' ? (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          <div className="admin-section" style={{ width: '380px', flexShrink: 0 }}>
            <h3 className="admin-section-title">
              {editId ? <><Pencil size={18} /> Editar Secuencia NCF</> : <><Plus size={18} /> Nueva Secuencia NCF</>}
            </h3>
            <form onSubmit={guardarSecuencia} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Tipo Comprobante</label>
                <select
                  className="admin-input"
                  value={tipoComprobante}
                  onChange={(e) => { setTipoComprobante(e.target.value); setPrefijo(e.target.value); }}
                >
                  <option value="B02">B02 - Consumidor Final</option>
                  <option value="B01">B01 - Crédito Fiscal (RNC)</option>
                  <option value="B14">B14 - Regímenes Especiales</option>
                  <option value="B15">B15 - Gubernamental</option>
                  <option value="E31">E31 - e-CF Crédito Fiscal</option>
                  <option value="E32">E32 - e-CF Consumo</option>
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Prefijo NCF</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Ej: B02 o E31"
                  value={prefijo}
                  onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="admin-form-row">
                <div className="admin-form-group" style={{ flex: 1 }}>
                  <label className="admin-label">Secuencia Actual</label>
                  <input
                    type="text"
                    className="admin-input"
                    inputMode="numeric"
                    value={secuenciaActual}
                    onChange={(e) => setSecuenciaActual(sanitizarEntero(e.target.value))}
                    required
                  />
                </div>
                <div className="admin-form-group" style={{ flex: 1 }}>
                  <label className="admin-label">Secuencia Final</label>
                  <input
                    type="text"
                    className="admin-input"
                    inputMode="numeric"
                    value={secuenciaFinal}
                    onChange={(e) => setSecuenciaFinal(sanitizarEntero(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Fecha Vencimiento Autorizada</label>
                <input
                  type="date"
                  className="admin-input"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                  required
                />
              </div>

              <div className="admin-form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                <input
                  type="checkbox"
                  id="activaCheck"
                  checked={activa}
                  onChange={(e) => setActiva(e.target.checked)}
                />
                <label htmlFor="activaCheck" style={{ fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-primary)' }}>Secuencia Activa</label>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" className="admin-btn admin-btn-primary" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Save size={16} /> {editId ? 'Actualizar' : 'Guardar NCF'}
                </button>
                {editId && (
                  <button type="button" onClick={limpiarFormulario} className="admin-btn admin-btn-secondary">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="admin-section" style={{ flex: 1 }}>
            <h3 className="admin-section-title" style={{ color: 'var(--gold)' }}>
              <FileText size={18} /> Secuencias NCF Registradas ({secuencias.length})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ paddingBottom: '10px' }}>Tipo</th>
                    <th style={{ paddingBottom: '10px' }}>Prefijo</th>
                    <th style={{ paddingBottom: '10px' }}>Sec. Actual</th>
                    <th style={{ paddingBottom: '10px' }}>Sec. Final</th>
                    <th style={{ paddingBottom: '10px' }}>Vencimiento</th>
                    <th style={{ paddingBottom: '10px' }}>Estado</th>
                    <th style={{ textAlign: 'right', paddingBottom: '10px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {secuencias.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="admin-empty" style={{ padding: '40px', fontStyle: 'italic' }}>
                        No hay secuencias NCF configuradas en el sistema.
                      </td>
                    </tr>
                  ) : (
                    secuencias.map((item) => {
                      var NCFEjemplo = item.prefijo + String(item.secuencia_actual).padStart(8, '0');
                      var fechaFmt = item.fecha_vencimiento ? new Date(item.fecha_vencimiento).toLocaleDateString() : 'N/A';
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '12px 0', fontWeight: 'bold' }}>{item.tipo_comprobante}</td>
                          <td style={{ padding: '12px 0', color: 'var(--green)', fontWeight: 'bold' }}>{item.prefijo}</td>
                          <td style={{ padding: '12px 0' }}>
                            <span className="admin-badge" style={{ fontFamily: 'monospace' }}>
                              {NCFEjemplo}
                            </span>
                          </td>
                          <td style={{ padding: '12px 0', color: 'var(--text-muted)' }}>{item.secuencia_final}</td>
                          <td style={{ padding: '12px 0', color: 'var(--text-muted)' }}>{fechaFmt}</td>
                          <td style={{ padding: '12px 0' }}>
                            <span className={'admin-badge ' + (item.activa ? 'admin-badge-success' : 'admin-badge-danger')}>
                              {item.activa ? <><CheckCircle size={12} /> Activa</> : <><AlertCircle size={12} /> Inactiva</>}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px 0' }}>
                            <button onClick={() => editar(item)} className="admin-btn admin-btn-secondary" style={{ padding: '5px 10px', fontSize: '0.8rem', marginRight: '6px' }}>
                              <Pencil size={14} /> Editar
                            </button>
                            <button onClick={() => eliminar(item.id)} className="admin-btn admin-btn-danger" style={{ padding: '5px 10px', fontSize: '0.8rem' }}>
                              <Trash2 size={14} />
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
      ) : (
        <div className="admin-section" style={{ overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '15px' }}>
            <div>
              <h2 className="admin-section-title" style={{ color: 'var(--blue)', margin: 0, fontSize: '1.3rem' }}>
                <Settings size={20} /> Facturación Electrónica e-CF (DGII)
              </h2>
              <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0', fontSize: '0.85rem' }}>
                Configura AlgoBack, envía comprobantes y consulta su estado.
              </p>
            </div>
            <span className={ecfAmbienteBadgeClass}>
              AlgoBack {configEcf.algoback_ambiente || 'TEST'}
            </span>
          </div>

          <div className="admin-tabs" style={{ marginBottom: '20px' }}>
            {[
              { key: 'config', label: 'config', icon: <Settings size={14} />, text: 'Configuración' },
              { key: 'enviar', label: 'enviar', icon: <Send size={14} />, text: 'Enviar e-CF' },
              { key: 'historial', label: 'historial', icon: <History size={14} />, text: 'Historial' }
            ].map(tab => (
              <button
                key={tab.key}
                className={'admin-tab' + (subPestañaEcf === tab.key ? ' activo' : '')}
                onClick={() => setSubPestañaEcf(tab.key)}
              >
                {tab.icon} {tab.text}
              </button>
            ))}
          </div>

          {subPestañaEcf === 'config' && (
            <form onSubmit={guardarConfigEcf} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="admin-form-row">
                <div className="admin-form-group" style={{ flex: 1 }}>
                  <label className="admin-label">RNC del Contribuyente (Emisor)</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: 130000001"
                    value={configEcf.rnc_emisor}
                    onChange={(e) => setConfigEcf({ ...configEcf, rnc_emisor: e.target.value })}
                    required
                  />
                </div>
                <div className="admin-form-group" style={{ flex: 1.5 }}>
                  <label className="admin-label">Razón Social Autorizada</label>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Ej: CHLOE RESTAURANTE SRL"
                    value={configEcf.razon_social_emisor}
                    onChange={(e) => setConfigEcf({ ...configEcf, razon_social_emisor: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ background: 'var(--bg-base)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ color: 'var(--blue)', margin: '0 0 12px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Settings size={16} /> AlgoBack - API Facturación Electrónica
                </h4>
                <div className="admin-form-row">
                  <div className="admin-form-group" style={{ flex: 1 }}>
                    <label className="admin-label">API Key de AlgoBack</label>
                    <input
                      type="password"
                      className="admin-input"
                      placeholder="sk_live_..."
                      value={configEcf.algoback_api_key}
                      onChange={(e) => setConfigEcf({ ...configEcf, algoback_api_key: e.target.value })}
                    />
                  </div>
                  <div className="admin-form-group" style={{ width: '140px' }}>
                    <label className="admin-label">Ambiente</label>
                    <select
                      className="admin-input"
                      value={configEcf.algoback_ambiente}
                      onChange={(e) => setConfigEcf({ ...configEcf, algoback_ambiente: e.target.value })}
                    >
                      <option value="TEST">TEST (Pruebas)</option>
                      <option value="PROD">PROD (Producción)</option>
                    </select>
                  </div>
                </div>
                <div className="admin-form-group" style={{ marginTop: '10px' }}>
                  <label className="admin-label">URL API AlgoBack</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={configEcf.algoback_url}
                    onChange={(e) => setConfigEcf({ ...configEcf, algoback_url: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ background: 'var(--bg-base)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: 'var(--blue)', marginTop: '2px', flexShrink: 0 }} />
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem', lineHeight: '1.4' }}>
                  Registrarse en <a href="https://algoback.com" target="_blank" rel="noopener" style={{ color: 'var(--blue)' }}>algoback.com</a> &#8594; subir certificado .p12 &#8594; generar API Key &#8594; pegar arriba. Los comprobantes se envían vía POST con tu API Key.
                </p>
              </div>

              <button
                type="submit"
                disabled={guardandoEcf}
                className="admin-btn admin-btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '13px', fontSize: '1rem' }}
              >
                {guardandoEcf ? 'Guardando...' : <><Save size={16} /> Guardar Configuración e-CF</>}
              </button>
            </form>
          )}

          {subPestañaEcf === 'enviar' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: 'var(--bg-base)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <h4 style={{ color: 'var(--green)', margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Send size={18} /> Enviar Comprobante e-CF a AlgoBack
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 15px 0' }}>
                  Ingresa el ID de una cuenta cerrada con tipo de comprobante <b style={{ color: 'var(--blue)' }}>e-CF</b> para enviarla como comprobante electrónico.
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'end' }}>
                  <div className="admin-form-group" style={{ flex: 1 }}>
                    <label className="admin-label">ID de la Cuenta</label>
                    <input
                      type="text"
                      className="admin-input"
                      inputMode="numeric"
                      placeholder="Ej: 123"
                      value={cuentaIdEcf}
                      onChange={(e) => setCuentaIdEcf(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={enviarEcf}
                    disabled={enviandoEcf || !cuentaIdEcf}
                    className="admin-btn admin-btn-primary"
                    style={{ padding: '11px 24px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: enviandoEcf ? 'not-allowed' : 'pointer', opacity: enviandoEcf ? 0.6 : 1 }}
                  >
                    {enviandoEcf ? <><Clock size={16} /> Enviando...</> : <><Send size={16} /> Enviar e-CF</>}
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-base)', padding: '15px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: 'var(--gold)', marginTop: '2px', flexShrink: 0 }} />
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem', lineHeight: '1.5' }}>
                  <b style={{ color: 'var(--gold)' }}>Flujo:</b> 1) El cajero cierra la cuenta seleccionando tipo <b>e-CF</b> &#8594; 2) Se genera NCF E31/E32 &#8594; 3) Desde aquí se envía a AlgoBack &#8594; 4) AlgoBack firma el XML y lo envía a la DGII &#8594; 5) Se recibe trackId y estado.
                </p>
              </div>
            </div>
          )}

          {subPestañaEcf === 'historial' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ color: 'var(--blue)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <History size={18} /> Historial de Comprobantes e-CF ({historialEcf.length})
                </h4>
                <button
                  onClick={cargarHistorialEcf}
                  className="admin-btn admin-btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  <RefreshCw size={14} /> Actualizar
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                      <th style={{ paddingBottom: '10px' }}>ID</th>
                      <th style={{ paddingBottom: '10px' }}>Tipo</th>
                      <th style={{ paddingBottom: '10px' }}>NCF</th>
                      <th style={{ paddingBottom: '10px' }}>Monto</th>
                      <th style={{ paddingBottom: '10px' }}>Estado</th>
                      <th style={{ paddingBottom: '10px' }}>Track ID</th>
                      <th style={{ paddingBottom: '10px' }}>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialEcf.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="admin-empty" style={{ padding: '40px', fontStyle: 'italic' }}>
                          No hay comprobantes e-CF registrados aún.
                        </td>
                      </tr>
                    ) : (
                      historialEcf.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '10px 0', color: 'var(--text-muted)' }}>#{item.id}</td>
                          <td style={{ padding: '10px 0', fontWeight: 'bold' }}>{item.tipo_cf}</td>
                          <td style={{ padding: '10px 0', color: 'var(--green)', fontFamily: 'monospace' }}>{item.ncf}</td>
                          <td style={{ padding: '10px 0' }}>
                            {formatMonto(item.monto_total)}
                          </td>
                          <td style={{ padding: '10px 0' }}>
                            <span className={getEstadoBadgeClass(item.estado)}>
                              {item.estado === 'Aceptado' && <CheckCircle size={12} />}
                              {item.estado === 'Rechazado' && <AlertCircle size={12} />}
                              {item.estado === 'Pendiente' && <Clock size={12} />}
                              {' '}{item.estado}
                            </span>
                          </td>
                          <td style={{ padding: '10px 0', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {item.track_id || '—'}
                          </td>
                          <td style={{ padding: '10px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {item.fecha_emision ? new Date(item.fecha_emision).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {pestañaActiva === 'reportes607' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="admin-section">
            <h3 className="admin-section-title">
              <Download size={18} /> Exportador Oficial DGII (Norma General 07-2018)
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Genera los archivos oficiales <strong>Formato 607</strong> (Ventas de Bienes y Servicios) y <strong>Formato 606</strong> (Compras y Gastos) en formato de texto plano delimitado por tuberías (<code>|</code>) listo para ser validado e importado en la herramienta oficial de la DGII.
            </p>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="admin-form-group" style={{ width: '140px' }}>
                <label className="admin-label">Año</label>
                <input
                  type="number"
                  className="admin-input"
                  value={reporteAnio}
                  onChange={(e) => setReporteAnio(e.target.value)}
                  min="2020"
                  max="2035"
                />
              </div>
              <div className="admin-form-group" style={{ width: '160px' }}>
                <label className="admin-label">Mes</label>
                <select
                  className="admin-input"
                  value={reporteMes}
                  onChange={(e) => setReporteMes(e.target.value)}
                >
                  <option value="01">01 - Enero</option>
                  <option value="02">02 - Febrero</option>
                  <option value="03">03 - Marzo</option>
                  <option value="04">04 - Abril</option>
                  <option value="05">05 - Mayo</option>
                  <option value="06">06 - Junio</option>
                  <option value="07">07 - Julio</option>
                  <option value="08">08 - Agosto</option>
                  <option value="09">09 - Septiembre</option>
                  <option value="10">10 - Octubre</option>
                  <option value="11">11 - Noviembre</option>
                  <option value="12">12 - Diciembre</option>
                </select>
              </div>

              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={consultarReporte607}
                disabled={cargandoReporte}
              >
                <BarChart3 size={16} /> {cargandoReporte ? 'Consultando...' : 'Consultar Período'}
              </button>

              <button
                type="button"
                className="admin-btn"
                style={{ background: '#10b981', color: '#fff', border: 'none' }}
                onClick={descargarReporte607Txt}
              >
                <Download size={16} /> Descargar 607 (.TXT)
              </button>

              <button
                type="button"
                className="admin-btn"
                style={{ background: '#3b82f6', color: '#fff', border: 'none' }}
                onClick={descargarReporte606Txt}
              >
                <Download size={16} /> Descargar 606 (.TXT)
              </button>
            </div>
          </div>

          {datos607 && (
            <div className="admin-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h4 style={{ margin: 0, fontSize: '1rem', color: '#fff' }}>
                  📊 Vista Previa de Ventas Reportadas (Período: {datos607.periodo}) — RNC Emisor: {datos607.rncEmisor || 'N/D'}
                </h4>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Total Registros: <strong>{datos607.totalRegistros}</strong>
                </span>
              </div>

              {datos607.registros.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No se registraron ventas con NCF en el período {reporteAnio}-{reporteMes}.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '8px' }}>#</th>
                        <th style={{ padding: '8px' }}>RNC/Cédula</th>
                        <th style={{ padding: '8px' }}>NCF</th>
                        <th style={{ padding: '8px' }}>Fecha</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Monto Facturado</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>ITBIS</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Propina Legal</th>
                        <th style={{ padding: '8px' }}>Forma Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos607.registros.map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{r.rnc_cedula || 'Consumidor Final'}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--gold, #f5b842)' }}>{r.ncf}</td>
                          <td style={{ padding: '8px' }}>{r.fecha_comprobante}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>RD$ {r.monto_facturado}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#00f576' }}>RD$ {r.itbis_facturado}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#38bdf8' }}>RD$ {r.propina_legal}</td>
                          <td style={{ padding: '8px' }}>
                            {Number(r.efectivo) > 0 ? 'Efectivo' : (Number(r.tarjeta) > 0 ? 'Tarjeta' : 'Transferencia')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {confirmData && <ConfirmModal mensaje={confirmData.mensaje} onConfirm={async () => { await confirmData.onConfirm(); setConfirmData(null); }} onCancel={() => setConfirmData(null)} />}
    </div>
  );
}

export default GestionNCF;
