import { useState, useEffect, useCallback } from 'react';
import { sanitizarEntero } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';
import { fechaLegible } from '../utils/comprobantes.js';
import {
  FileText, Send, History, Settings, Save, ArrowLeft, Pencil, Trash2,
  Plus, AlertCircle, CheckCircle, Clock, RefreshCw, Download, BarChart3, TriangleAlert
} from 'lucide-react';

const TIPOS_ELECTRONICOS = [
  { codigo: 'E32', nombre: 'E32 · Factura de consumo electrónica' },
  { codigo: 'E31', nombre: 'E31 · Factura de crédito fiscal electrónica' },
  { codigo: 'E45', nombre: 'E45 · Comprobante gubernamental electrónico' },
  { codigo: 'E44', nombre: 'E44 · Regímenes especiales electrónico' },
  { codigo: 'E34', nombre: 'E34 · Nota de crédito electrónica' },
];
const TIPOS_NCF = [
  { codigo: 'B02', nombre: 'B02 · Consumidor final (NCF)' },
  { codigo: 'B01', nombre: 'B01 · Crédito fiscal (NCF)' },
  { codigo: 'B14', nombre: 'B14 · Regímenes especiales (NCF)' },
  { codigo: 'B15', nombre: 'B15 · Gubernamental (NCF)' },
];
const esElectronico = (tipo) => /^E\d{2}$/.test(String(tipo));
/** e-NCF: E + tipo + 10 dígitos (13 caracteres). NCF tradicional: prefijo + 8 dígitos. */
const formatearComprobante = (prefijo, numero) => `${prefijo}${String(numero ?? 0).padStart(esElectronico(prefijo) ? 10 : 8, '0')}`;

function GestionNCF({ alVolver, apiUrl }) {
  const urlBase = apiUrl;
  const [pestañaActiva, setPestañaActiva] = useState('secuencias');
  const [secuencias, setSecuencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [confirmData, setConfirmData] = useState(null);

  const [editId, setEditId] = useState(null);
  const [tipoComprobante, setTipoComprobante] = useState('E32');
  const [prefijo, setPrefijo] = useState('E32');
  const [secuenciaInicial, setSecuenciaInicial] = useState('1');
  const [secuenciaActual, setSecuenciaActual] = useState('1');
  const [secuenciaFinal, setSecuenciaFinal] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [activa, setActiva] = useState(true);
  const [estadoFiscal, setEstadoFiscal] = useState(null);

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
    algoback_ambiente: 'TEST',
    direccion_emisor: '',
    telefono_emisor: '',
    email_emisor: '',
    regimen_fiscal: 'Ordinario',
    ecf_obligatorio_desde: '2026-11-15',
    email_mseller: '',
    password_mseller: '',
    api_key_mseller: ''
  });
  const [guardandoEcf, setGuardandoEcf] = useState(false);

  const [cuentaIdEcf, setCuentaIdEcf] = useState('');
  const [enviandoEcf, setEnviandoEcf] = useState(false);
  const [historialEcf, setHistorialEcf] = useState([]);
  const [, setCargandoHistorial] = useState(false);
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

  // Descarga autenticada por header (item 9): sin token en la URL.
  const descargarReporte = async (tipo) => {
    try {
      const res = await fetch(`${urlBase}/api/dgii/reporte-${tipo}?anio=${reporteAnio}&mes=${reporteMes}&formato=txt`);
      if (!res.ok) { toastError('No se pudo descargar el reporte.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-${tipo}-${reporteAnio}-${String(reporteMes).padStart(2, '0')}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toastError('Error de red al descargar el reporte.');
    }
  };

  const descargarReporte607Txt = () => descargarReporte('607');

  const descargarReporte606Txt = () => descargarReporte('606');

  const cargarHistorialEcf = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      const res = await fetch(urlBase + '/api/dgii/ecf/historial');
      if (res.ok) {
        const data = await res.json();
        setHistorialEcf(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error al cargar historial e-CF:', err);
    } finally {
      setCargandoHistorial(false);
    }
  }, [urlBase]);

  const enviarEcf = async (cuentaId = cuentaIdEcf) => {
    if (!cuentaId) return toastAviso("Ingresa el ID de la cuenta.");
    setEnviandoEcf(true);
    try {
      const res = await fetch(urlBase + '/api/dgii/ecf/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuenta_id: parseInt(cuentaId, 10) })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje);
        setCuentaIdEcf('');
        cargarHistorialEcf();
        cargarEstadoFiscal();
      } else {
        toastAviso(data.error || 'Error al enviar e-CF.');
      }
    } catch {
      toastAviso("Error de conexión al enviar e-CF.");
    } finally {
      setEnviandoEcf(false);
    }
  };

  const cargarSecuencias = useCallback(async () => {
    try {
      const res = await fetch(urlBase + '/api/dgii/secuencias');
      if (res.ok) {
        const data = await res.json();
        setSecuencias(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error al cargar secuencias:', err);
    } finally {
      setCargando(false);
    }
  }, [urlBase]);

  const cargarConfigEcf = useCallback(async () => {
    try {
      const res = await fetch(urlBase + '/api/dgii/config');
      if (res.ok) {
        const data = await res.json();
        const sinNulos = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v ?? '']));
        setConfigEcf((prev) => ({ ...prev, ...sinNulos }));
      }
    } catch (err) {
      console.error('Error al cargar config e-CF DGII:', err);
    }
  }, [urlBase]);

  // ¿Está el sistema listo para facturar solo con e-CF? Fecha de corte y lista de lo que falta.
  const cargarEstadoFiscal = useCallback(async () => {
    try {
      const res = await fetch(urlBase + '/api/dgii/estado-fiscal', { cache: 'no-store' });
      if (res.ok) setEstadoFiscal(await res.json());
    } catch (err) {
      console.error('Error al cargar el estado fiscal:', err);
    }
  }, [urlBase]);

  useEffect(() => {
    cargarSecuencias();
    cargarConfigEcf();
    cargarHistorialEcf();
    cargarEstadoFiscal();
  }, [cargarSecuencias, cargarConfigEcf, cargarHistorialEcf, cargarEstadoFiscal]);

  const guardarSecuencia = async (e) => {
    e.preventDefault();
    if (!tipoComprobante || !prefijo || !fechaVencimiento) {
      return toastAviso("Completa los campos obligatorios.");
    }
    const inicial = parseInt(secuenciaInicial || '1', 10);
    const actual = parseInt(secuenciaActual || secuenciaInicial || '1', 10);
    const final = parseInt(secuenciaFinal || '0', 10);
    if (esElectronico(tipoComprobante) && !final) {
      return toastAviso('Indica el rango de e-NCF que te autorizó la DGII (hasta qué número).');
    }
    if (final && final < inicial) return toastAviso('El número final no puede ser menor que el inicial.');
    try {
      const res = await fetch(urlBase + '/api/dgii/secuencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          tipo_comprobante: tipoComprobante,
          prefijo,
          secuencia_inicial: inicial,
          secuencia_actual: actual,
          secuencia_final: final || undefined,
          fecha_vencimiento: fechaVencimiento,
          activa
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastAviso(data.mensaje);
        limpiarFormulario();
        cargarSecuencias();
        cargarEstadoFiscal();
      } else {
        toastAviso(data.error);
      }
    } catch {
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
        // Dirección, teléfono y correo del emisor: la DGII exige la dirección en el e-CF.
        await fetch(urlBase + '/api/dgii/emisor', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rnc_emisor: configEcf.rnc_emisor,
            razon_social_emisor: configEcf.razon_social_emisor,
            direccion_emisor: configEcf.direccion_emisor,
            telefono_emisor: configEcf.telefono_emisor,
            email_emisor: configEcf.email_emisor,
            regimen_fiscal: configEcf.regimen_fiscal
          })
        });
        toastAviso(data.mensaje);
        cargarConfigEcf();
        cargarEstadoFiscal();
      } else {
        toastAviso(data.error || 'Error al guardar configuración e-CF.');
      }
    } catch {
      toastAviso("Error de conexión al guardar configuración e-CF.");
    } finally {
      setGuardandoEcf(false);
    }
  };

  const editar = (item) => {
    setEditId(item.id);
    setTipoComprobante(item.tipo_comprobante);
    setPrefijo(item.prefijo);
    setSecuenciaInicial(String(item.secuencia_inicial));
    setSecuenciaActual(String(item.secuencia_actual));
    setSecuenciaFinal(String(item.secuencia_final));
    setFechaVencimiento(item.fecha_vencimiento ? item.fecha_vencimiento.split('T')[0] : '');
    setActiva(item.activa);
  };

  const eliminar = async (id) => {
    setConfirmData({ mensaje: '¿Eliminar esta secuencia de comprobantes? Solo se puede si todavía no emitió ninguno.', onConfirm: async () => {
      try {
        const res = await fetch(urlBase + '/api/dgii/secuencias/' + id, { method: 'DELETE' });
        if (res.ok) { cargarSecuencias(); cargarEstadoFiscal(); }
        else { const d = await res.json().catch(() => ({})); toastAviso(d.error || 'No se pudo eliminar la secuencia.'); }
      } catch { toastAviso("Error al eliminar secuencia."); }
    }});
  };

  const limpiarFormulario = () => {
    setEditId(null);
    setTipoComprobante('E32');
    setPrefijo('E32');
    setSecuenciaInicial('1');
    setSecuenciaActual('1');
    setSecuenciaFinal('');
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
    if (estado === 'Aceptado' || estado === 'Aceptado Condicional') return 'admin-badge admin-badge-success';
    if (estado === 'Rechazado') return 'admin-badge admin-badge-danger';
    return 'admin-badge admin-badge-warning';
  };

  const formatMonto = (monto) => {
    if (!monto) return 'N/A';
    return 'RD$ ' + Number(monto).toFixed(2);
  };

  const ecfAmbienteBadgeClass = configEcf.proveedor_ecf === 'mseller'
    ? (configEcf.ambiente === 'Producción' || configEcf.ambiente === 'Certificacion' ? 'admin-badge admin-badge-success' : 'admin-badge admin-badge-warning')
    : configEcf.algoback_ambiente === 'PROD'
      ? 'admin-badge admin-badge-success'
      : 'admin-badge admin-badge-warning';

  const nombreProveedor = configEcf.proveedor_ecf === 'mseller' ? 'MSeller ECF' : 'AlgoBack';

  const corteFiscal = estadoFiscal?.corte;
  const problemasFiscales = estadoFiscal?.problemas || [];
  const erroresFiscales = problemasFiscales.filter((x) => x.nivel === 'error');
  const avisosFiscales = problemasFiscales.filter((x) => x.nivel === 'aviso');
  const tiposVisibles = corteFiscal?.obligatorio ? TIPOS_ELECTRONICOS : [...TIPOS_ELECTRONICOS, ...TIPOS_NCF];
  const electronicoForm = esElectronico(tipoComprobante);
  const previoInicial = formatearComprobante(prefijo || tipoComprobante, secuenciaInicial || 1);
  const previoFinal = secuenciaFinal ? formatearComprobante(prefijo || tipoComprobante, secuenciaFinal) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {estadoFiscal && (
        <div
          role="status"
          style={{
            padding: '12px 14px', borderRadius: '12px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)',
            display: 'flex', flexDirection: 'column', gap: '8px',
            borderLeft: `4px solid ${erroresFiscales.length ? 'var(--red, #ff5252)' : avisosFiscales.length ? 'var(--kpi-gold, #f59e0b)' : 'var(--green, #00e676)'}`
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.88rem', fontWeight: 700, flexWrap: 'wrap' }}>
            {erroresFiscales.length ? <TriangleAlert size={17} /> : <CheckCircle size={17} />}
            <span style={{ flex: '1 1 220px', minWidth: 0, overflowWrap: 'anywhere' }}>
              {corteFiscal.obligatorio
                ? `Facturación electrónica obligatoria desde el ${fechaLegible(corteFiscal.fechaCorte)}: el NCF tradicional ya no es válido.`
                : `El NCF tradicional deja de ser válido el ${fechaLegible(corteFiscal.fechaCorte)} (${corteFiscal.diasRestantes === 1 ? 'falta 1 día' : `faltan ${corteFiscal.diasRestantes} días`}). Desde esa fecha solo se factura con e-CF.`}
            </span>
            <span className={erroresFiscales.length ? 'admin-badge admin-badge-danger' : 'admin-badge admin-badge-success'}>
              {erroresFiscales.length ? `${erroresFiscales.length} por resolver` : 'Listo para e-CF'}
            </span>
          </div>
          {problemasFiscales.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: 0, overflowWrap: 'anywhere' }}>
              {problemasFiscales.map((x) => (
                <li key={x.codigo} style={{ color: x.nivel === 'error' ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  <b style={{ color: x.nivel === 'error' ? 'var(--red, #ff5252)' : 'var(--kpi-gold, #f59e0b)' }}>{x.nivel === 'error' ? 'Falta: ' : 'Aviso: '}</b>{x.mensaje}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
          <FileText size={16} /> Secuencias de comprobantes
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
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div className="admin-section" style={{ flex: '1 1 320px', maxWidth: '420px', minWidth: 0 }}>
            <h3 className="admin-section-title">
              {editId ? <><Pencil size={18} /> Editar secuencia</> : <><Plus size={18} /> Nueva secuencia</>}
            </h3>
            <form onSubmit={guardarSecuencia} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="admin-form-group">
                <label className="admin-label">Tipo de comprobante</label>
                <select
                  className="admin-input"
                  value={tipoComprobante}
                  onChange={(e) => { setTipoComprobante(e.target.value); setPrefijo(e.target.value); }}
                >
                  <optgroup label="Comprobantes electrónicos (e-CF)">
                    {tiposVisibles.filter((t) => esElectronico(t.codigo)).map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                  </optgroup>
                  {!corteFiscal?.obligatorio && (
                    <optgroup label={`NCF tradicional (válido hasta el ${fechaLegible(corteFiscal?.fechaCorte || '2026-11-15')})`}>
                      {tiposVisibles.filter((t) => !esElectronico(t.codigo)).map((t) => <option key={t.codigo} value={t.codigo}>{t.nombre}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">{electronicoForm ? 'Prefijo del e-NCF' : 'Prefijo NCF'}</label>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Ej: E32 o B02"
                  value={prefijo}
                  onChange={(e) => setPrefijo(e.target.value.toUpperCase())}
                  disabled={electronicoForm}
                  required
                />
                {electronicoForm && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '5px 0 0 0' }}>
                    El e-NCF es la letra E, el tipo y 10 dígitos (13 caracteres).
                  </p>
                )}
              </div>

              <div className="admin-form-row">
                <div className="admin-form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label className="admin-label">Desde (inicial)</label>
                  <input
                    type="text"
                    className="admin-input"
                    inputMode="numeric"
                    value={secuenciaInicial}
                    onChange={(e) => {
                      const valor = sanitizarEntero(e.target.value);
                      if (!editId && (secuenciaActual === secuenciaInicial || !secuenciaActual)) setSecuenciaActual(valor);
                      setSecuenciaInicial(valor);
                    }}
                    required
                  />
                </div>
                <div className="admin-form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label className="admin-label">Hasta (final)</label>
                  <input
                    type="text"
                    className="admin-input"
                    inputMode="numeric"
                    placeholder={electronicoForm ? 'Rango autorizado' : '99999999'}
                    value={secuenciaFinal}
                    onChange={(e) => setSecuenciaFinal(sanitizarEntero(e.target.value))}
                    required={electronicoForm}
                  />
                </div>
              </div>
              <div className="admin-form-group">
                <label className="admin-label">Próximo número a emitir</label>
                <input
                  type="text"
                  className="admin-input"
                  inputMode="numeric"
                  value={secuenciaActual}
                  onChange={(e) => setSecuenciaActual(sanitizarEntero(e.target.value))}
                  required
                />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '5px 0 0 0', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                  Primero: {previoInicial} · Último: {previoFinal}
                </p>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">{electronicoForm ? 'Vence el rango (según la DGII)' : 'Fecha vencimiento autorizada'}</label>
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

          <div className="admin-section" style={{ flex: '2 1 340px', minWidth: 0 }}>
            <h3 className="admin-section-title" style={{ color: 'var(--kpi-gold)' }}>
              <FileText size={18} /> Secuencias registradas ({secuencias.length})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ paddingBottom: '10px' }}>Tipo</th>
                    <th style={{ paddingBottom: '10px' }}>Próximo número</th>
                    <th style={{ paddingBottom: '10px' }}>Restan</th>
                    <th style={{ paddingBottom: '10px' }}>Hasta</th>
                    <th style={{ paddingBottom: '10px' }}>Vence</th>
                    <th style={{ paddingBottom: '10px' }}>Estado</th>
                    <th style={{ textAlign: 'right', paddingBottom: '10px' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {secuencias.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="admin-empty" style={{ padding: '40px', fontStyle: 'italic' }}>
                        No hay secuencias configuradas. Registra el rango de e-NCF que te autorizó la DGII.
                      </td>
                    </tr>
                  ) : (
                    secuencias.map((item) => {
                      const ncfEjemplo = formatearComprobante(item.prefijo, item.secuencia_actual);
                      const restantes = Number(item.secuencia_final) - Number(item.secuencia_actual) + 1;
                      const iso = item.fecha_vencimiento ? String(item.fecha_vencimiento).slice(0, 10) : '';
                      const diasParaVencer = iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${corteFiscal?.hoy || iso}T00:00:00Z`)) / 86400000) : null;
                      const tradicional = !esElectronico(item.tipo_comprobante);
                      const usada = Number(item.secuencia_actual) > Number(item.secuencia_inicial);
                      return (
                        <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '12px 8px 12px 0', fontWeight: 'bold' }}>
                            {item.tipo_comprobante}
                            {tradicional && <div style={{ fontSize: '0.68rem', fontWeight: 600, color: corteFiscal?.obligatorio ? 'var(--red, #ff5252)' : 'var(--kpi-gold, #f59e0b)' }}>{corteFiscal?.obligatorio ? 'Ya no válido' : `NCF · hasta ${fechaLegible(corteFiscal?.fechaCorte || '2026-11-15')}`}</div>}
                          </td>
                          <td style={{ padding: '12px 8px 12px 0' }}>
                            <span className="admin-badge" style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                              {restantes > 0 ? ncfEjemplo : 'Agotada'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 8px 12px 0', color: restantes < 1000 ? 'var(--kpi-gold, #f59e0b)' : 'var(--text-muted)', fontWeight: restantes < 1000 ? 700 : 400 }}>{Math.max(0, restantes).toLocaleString('es-DO')}</td>
                          <td style={{ padding: '12px 8px 12px 0', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{item.secuencia_final}</td>
                          <td style={{ padding: '12px 8px 12px 0', color: diasParaVencer !== null && diasParaVencer < 30 ? 'var(--kpi-gold, #f59e0b)' : 'var(--text-muted)', fontWeight: diasParaVencer !== null && diasParaVencer < 30 ? 700 : 400 }}>{iso ? fechaLegible(iso) : 'N/A'}</td>
                          <td style={{ padding: '12px 0' }}>
                            <span className={'admin-badge ' + (item.activa ? 'admin-badge-success' : 'admin-badge-danger')}>
                              {item.activa ? <><CheckCircle size={12} /> Activa</> : <><AlertCircle size={12} /> Inactiva</>}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', padding: '12px 0' }}>
                            <button onClick={() => editar(item)} className="admin-btn admin-btn-secondary" style={{ padding: '5px 10px', fontSize: '0.8rem', marginRight: '6px' }}>
                              <Pencil size={14} /> Editar
                            </button>
                            <button onClick={() => eliminar(item.id)} aria-label="Eliminar secuencia" disabled={usada} title={usada ? 'Ya emitió comprobantes: no se puede eliminar; desactívala si no la usas.' : 'Eliminar secuencia'} className="admin-btn admin-btn-danger" style={{ padding: '5px 10px', fontSize: '0.8rem', opacity: usada ? 0.4 : 1 }}>
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
                Configura el proveedor de facturación electrónica ({nombreProveedor}), envía comprobantes y consulta su estado.
              </p>
            </div>
            <span className={ecfAmbienteBadgeClass}>
              {configEcf.proveedor_ecf === 'mseller'
                ? `MSeller ${configEcf.ambiente || 'TesteCF'}`
                : `AlgoBack ${configEcf.algoback_ambiente || 'TEST'}`}
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

              <div className="admin-form-row">
                <div className="admin-form-group" style={{ flex: 2, minWidth: 0 }}>
                  <label className="admin-label">Dirección del emisor (obligatoria en el e-CF)</label>
                  <input
                    type="text"
                    className="admin-input"
                    maxLength={100}
                    placeholder="Calle, número, sector, ciudad"
                    value={configEcf.direccion_emisor}
                    onChange={(e) => setConfigEcf({ ...configEcf, direccion_emisor: e.target.value })}
                  />
                </div>
                <div className="admin-form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label className="admin-label">Teléfono</label>
                  <input
                    type="text"
                    className="admin-input"
                    value={configEcf.telefono_emisor}
                    onChange={(e) => setConfigEcf({ ...configEcf, telefono_emisor: e.target.value })}
                  />
                </div>
              </div>
              <div className="admin-form-row">
                <div className="admin-form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label className="admin-label">Correo del emisor</label>
                  <input
                    type="email"
                    className="admin-input"
                    value={configEcf.email_emisor}
                    onChange={(e) => setConfigEcf({ ...configEcf, email_emisor: e.target.value })}
                  />
                </div>
                <div className="admin-form-group" style={{ flex: 1, minWidth: 0 }}>
                  <label className="admin-label">El e-CF es obligatorio desde</label>
                  <input
                    type="date"
                    className="admin-input"
                    value={configEcf.ecf_obligatorio_desde || ''}
                    onChange={(e) => setConfigEcf({ ...configEcf, ecf_obligatorio_desde: e.target.value })}
                  />
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '5px 0 0 0' }}>
                    Desde esta fecha el NCF tradicional (B01, B02, B14, B15) deja de ser válido y el sistema solo emite e-CF.
                  </p>
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-label">Proveedor de Facturación Electrónica</label>
                <select
                  className="admin-input"
                  value={configEcf.proveedor_ecf}
                  onChange={(e) => setConfigEcf({ ...configEcf, proveedor_ecf: e.target.value })}
                >
                  <option value="algoback">AlgoBack</option>
                  <option value="mseller">MSeller ECF (2.º proveedor)</option>
                </select>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '5px 0 0 0' }}>
                  El proveedor seleccionado se usará para enviar y consultar los e-CF.
                </p>
              </div>

              {configEcf.proveedor_ecf !== 'mseller' && (
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
              )}

              {configEcf.proveedor_ecf === 'mseller' && (
                <div style={{ background: 'var(--bg-base)', padding: '15px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                  <h4 style={{ color: 'var(--blue)', margin: '0 0 12px 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Settings size={16} /> MSeller ECF - API Facturación Electrónica
                  </h4>
                  <div className="admin-form-row">
                    <div className="admin-form-group" style={{ flex: 1 }}>
                      <label className="admin-label">Email de MSeller</label>
                      <input
                        type="email"
                        className="admin-input"
                        placeholder="cuenta@mseller.app"
                        value={configEcf.email_mseller}
                        onChange={(e) => setConfigEcf({ ...configEcf, email_mseller: e.target.value })}
                      />
                    </div>
                    <div className="admin-form-group" style={{ flex: 1 }}>
                      <label className="admin-label">Password de MSeller</label>
                      <input
                        type="password"
                        className="admin-input"
                        placeholder="••••••••"
                        value={configEcf.password_mseller}
                        onChange={(e) => setConfigEcf({ ...configEcf, password_mseller: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="admin-form-group" style={{ marginTop: '10px' }}>
                    <label className="admin-label">Ambiente DGII</label>
                    <select
                      className="admin-input"
                      value={configEcf.ambiente || 'Pruebas'}
                      onChange={(e) => setConfigEcf({ ...configEcf, ambiente: e.target.value })}
                    >
                      <option value="Pruebas">Pruebas (TesteCF)</option>
                      <option value="Certificacion">Certificación (CerteCF)</option>
                      <option value="Producción">Producción (eCF)</option>
                    </select>
                  </div>
                  <div className="admin-form-group" style={{ marginTop: '10px' }}>
                    <label className="admin-label">API Key de MSeller</label>
                    <input
                      type="password"
                      className="admin-input"
                      placeholder="X-API-KEY. Ej: MSELLER-0000-..."
                      value={configEcf.api_key_mseller}
                      onChange={(e) => setConfigEcf({ ...configEcf, api_key_mseller: e.target.value })}
                    />
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', margin: '10px 0 0 0', lineHeight: '1.5' }}>
                    El entorno (TesteCF / CerteCF / eCF) se deriva del campo <b>Ambiente DGII</b> (Pruebas &#8594; TesteCF).
                    Al guardar, los campos en blanco conservan los valores ya guardados en el servidor.
                  </p>
                </div>
              )}

              <div style={{ background: 'var(--bg-base)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: 'var(--blue)', marginTop: '2px', flexShrink: 0 }} />
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem', lineHeight: '1.4' }}>
                  {configEcf.proveedor_ecf === 'mseller' ? (
                    <>Registrarse en <a href="https://mseller.app" target="_blank" rel="noopener" style={{ color: 'var(--blue)' }}>mseller.app</a> &#8594; crear cuenta y generar API Key &#8594; pegarla arriba. El envío se realiza contra <code style={{ color: 'var(--blue)' }}>ecf.api.mseller.app</code> usando tu token de autenticación.</>
                  ) : (
                    <>Registrarse en <a href="https://algoback.com" target="_blank" rel="noopener" style={{ color: 'var(--blue)' }}>algoback.com</a> &#8594; subir certificado .p12 &#8594; generar API Key &#8594; pegar arriba. Los comprobantes se envían vía POST con tu API Key.</>
                  )}
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
                  <Send size={18} /> Enviar Comprobante e-CF ({nombreProveedor})
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 15px 0' }}>
                  Los e-CF se envían solos al cobrar y el sistema reintenta los pendientes cada minuto. Aquí puedes reenviar a mano el de una cuenta cerrada (indica su ID).
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
                    onClick={() => enviarEcf()}
                    disabled={enviandoEcf || !cuentaIdEcf}
                    className="admin-btn admin-btn-primary"
                    style={{ padding: '11px 24px', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: enviandoEcf ? 'not-allowed' : 'pointer', opacity: enviandoEcf ? 0.6 : 1 }}
                  >
                    {enviandoEcf ? <><Clock size={16} /> Enviando...</> : <><Send size={16} /> Enviar e-CF</>}
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-base)', padding: '15px', borderRadius: '10px', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: 'var(--kpi-gold)', marginTop: '2px', flexShrink: 0 }} />
                <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.8rem', lineHeight: '1.5' }}>
                  <b style={{ color: 'var(--kpi-gold)' }}>Flujo:</b> 1) El cajero cobra eligiendo el tipo de e-CF (E32, E31, E45 o E44) &#8594; 2) El sistema toma el siguiente e-NCF de la secuencia &#8594; 3) Se envía a {nombreProveedor}, que firma el XML y lo manda a la DGII &#8594; 4) Se guardan el código de seguridad, la fecha de firma y el estado, y el ticket imprime el QR del timbre. Si el proveedor no responde, el ticket sale «pendiente de validación» y se reintenta solo.
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
                      <th style={{ paddingBottom: '10px' }}>Cód. seguridad</th>
                      <th style={{ paddingBottom: '10px' }}>Detalle</th>
                      <th style={{ paddingBottom: '10px' }}>Fecha</th>
                      <th style={{ paddingBottom: '10px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialEcf.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="admin-empty" style={{ padding: '40px', fontStyle: 'italic' }}>
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
                            {item.codigo_seguridad || '—'}
                          </td>
                          <td style={{ padding: '10px 8px 10px 0', color: item.estado === 'Rechazado' ? 'var(--red, #ff5252)' : 'var(--text-muted)', fontSize: '0.78rem', maxWidth: '260px', overflowWrap: 'anywhere' }}>
                            {item.ultimo_error ? `${item.ultimo_error}${Number(item.intentos) > 1 ? ` (${item.intentos} intentos)` : ''}` : '—'}
                          </td>
                          <td style={{ padding: '10px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {item.fecha_emision ? new Date(item.fecha_emision).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 0', textAlign: 'right' }}>
                            {['Pendiente', 'Procesando', 'Enviado'].includes(item.estado) && (
                              <button onClick={() => enviarEcf(item.cuenta_id)} disabled={enviandoEcf} className="admin-btn admin-btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
                                <RefreshCw size={12} /> Reenviar
                              </button>
                            )}
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
                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>
                  Vista Previa de Ventas Reportadas (Período: {datos607.periodo}) — RNC Emisor: {datos607.rncEmisor || 'N/D'}
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
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '8px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace' }}>{r.rnc_cedula || 'Consumidor Final'}</td>
                          <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--kpi-gold)' }}>{r.ncf}</td>
                          <td style={{ padding: '8px' }}>{r.fecha_comprobante}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>RD$ {r.monto_facturado}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--kpi-green)' }}>RD$ {r.itbis_facturado}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: 'var(--kpi-cyan)' }}>RD$ {r.propina_legal}</td>
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
