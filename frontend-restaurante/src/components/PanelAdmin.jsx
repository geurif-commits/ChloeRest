import { useState, useEffect } from 'react';
import {
  LayoutDashboard, TableProperties, Package, ChefHat, Warehouse,
  BarChart3, FileText, CreditCard, Users, Building2, Receipt,
  Palette, Image, Monitor, ChevronRight, Store,
  ArrowLeft, Menu, X, Clock, CalendarClock, ChevronDown
} from 'lucide-react';
import './admin/admin.css';
import './admin/admin-shell.css';
import ConfiguracionNegocio from './ConfiguracionNegocio';
import DashboardGerencial from './DashboardGerencial';
import GestionMesas from './GestionMesas';
import Inventario from './Inventario';
import GestionRecetas from './GestionRecetas';
import GestionNCF from './GestionNCF';
import HistorialFacturas from './HistorialFacturas';
import ReporteTipoPago from './ReporteTipoPago';
import GestionProductos from './admin/GestionProductos';
import GestionUsuarios from './admin/GestionUsuarios';
import ReporteResumen from './admin/ReporteResumen';
import TemaSettings from './admin/TemaSettings';
import LogoFondoSettings from './admin/LogoFondoSettings';
import GestionDispositivos from './admin/GestionDispositivos';
import GestionAsistencia from './admin/GestionAsistencia';

const GRUPOS_NAVEGACION = [
  {
    titulo: 'PRINCIPAL',
    items: [
      { id: 'dashboard', etiqueta: 'Centro de Mando', icono: LayoutDashboard, desc: 'Métricas, KPIs y accesos directos' },
    ]
  },
  {
    titulo: 'OPERACIONES & SALÓN',
    items: [
      { id: 'mesas', etiqueta: 'Salón y Mesas', icono: TableProperties, desc: 'Distribución y estados de mesas' },
      { id: 'productos', etiqueta: 'Catálogo de Menú', icono: Package, desc: 'Platos, bebidas y precios' },
      { id: 'recetas', etiqueta: 'Recetas e Insumos', icono: ChefHat, desc: 'Fichas técnicas y costos de platos' },
      { id: 'inventario', etiqueta: 'Control de Stock', icono: Warehouse, desc: 'Almacén y existencias' },
    ]
  },
  {
    titulo: 'VENTAS & FACTURACIÓN',
    items: [
      { id: 'reportes', etiqueta: 'Reporte de Ventas', icono: BarChart3, desc: 'Resumen de ingresos y turnos' },
      { id: 'historial', etiqueta: 'Historial Facturas', icono: FileText, desc: 'Comprobantes y órdenes cerradas' },
      { id: 'tipo_pago', etiqueta: 'Métodos de Pago', icono: CreditCard, desc: 'Efectivo, tarjetas y transferencias' },
    ]
  },
  {
    titulo: 'EQUIPO & FISCAL',
    items: [
      { id: 'usuarios', etiqueta: 'Personal y Accesos', icono: Users, desc: 'Camareros, cajeros y roles' },
      { id: 'asistencia', etiqueta: 'Turnos y Asistencia', icono: CalendarClock, desc: 'Entradas, salidas y horas trabajadas' },
      { id: 'negocio', etiqueta: 'Datos de la Empresa', icono: Building2, desc: 'RNC, estaciones y tickets' },
      { id: 'secuencias_ncf', etiqueta: 'Comprobantes DGII', icono: Receipt, desc: 'Secuencias NCF oficiales' },
    ]
  },
  {
    titulo: 'SISTEMA & TERMINALES',
    items: [
      { id: 'tema', etiqueta: 'Tema y Colores', icono: Palette, desc: 'Paletas y ambientación visual' },
      { id: 'logo_fondo', etiqueta: 'Logotipo y Fondo', icono: Image, desc: 'Branding e imagen de pantalla' },
      { id: 'dispositivos', etiqueta: 'Terminales POS', icono: Monitor, desc: 'Dispositivos autorizados' },
    ]
  },
];

const METADATA_MODULOS = {
  dashboard: { titulo: 'Centro de Mando', grupo: 'PRINCIPAL', icono: LayoutDashboard },
  mesas: { titulo: 'Gestión de Salón y Mesas', grupo: 'OPERACIONES', icono: TableProperties },
  productos: { titulo: 'Catálogo de Menú y Precios', grupo: 'OPERACIONES', icono: Package },
  recetas: { titulo: 'Fichas Técnicas y Recetas', grupo: 'OPERACIONES', icono: ChefHat },
  inventario: { titulo: 'Control de Stock e Inventario', grupo: 'OPERACIONES', icono: Warehouse },
  reportes: { titulo: 'Reporte Gerencial de Ventas', grupo: 'FINANZAS', icono: BarChart3 },
  historial: { titulo: 'Historial de Facturación', grupo: 'FINANZAS', icono: FileText },
  tipo_pago: { titulo: 'Ventas por Método de Pago', grupo: 'FINANZAS', icono: CreditCard },
  usuarios: { titulo: 'Gestión de Personal y Accesos', grupo: 'ADMINISTRACIÓN', icono: Users },
  asistencia: { titulo: 'Turnos y Asistencia del Personal', grupo: 'ADMINISTRACIÓN', icono: CalendarClock },
  negocio: { titulo: 'Configuración de la Empresa', grupo: 'ADMINISTRACIÓN', icono: Building2 },
  secuencias_ncf: { titulo: 'Comprobantes Fiscales DGII (NCF)', grupo: 'ADMINISTRACIÓN', icono: Receipt },
  tema: { titulo: 'Tema y Colores del Sistema', grupo: 'SISTEMA', icono: Palette },
  logo_fondo: { titulo: 'Logotipo y Fondo de Pantalla', grupo: 'SISTEMA', icono: Image },
  dispositivos: { titulo: 'Terminales y Dispositivos POS', grupo: 'SISTEMA', icono: Monitor },
};

export default function PanelAdmin({ usuario, alVolver, apiUrl, alVerificarLicencia, configSistema: configProp }) {
  const [pestana, setPestana] = useState('dashboard');
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const obtenerFechaHora12 = () => {
    const ahora = new Date();
    const hora12 = ahora.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const dd = String(ahora.getDate()).padStart(2, '0');
    const mm = String(ahora.getMonth() + 1).padStart(2, '0');
    return { hora: hora12, fecha: `${dd}/${mm}` };
  };

  const [tiempoActual, setTiempoActual] = useState(obtenerFechaHora12);
  const [configSistema, setConfigSistema] = useState(configProp || null);
  const urlBase = apiUrl;

  useEffect(() => {
    if (configProp) setConfigSistema(configProp);
  }, [configProp]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${urlBase}/api/configuracion/sistema`);
        if (res.ok) {
          const data = await res.json();
          setConfigSistema(data);
        }
      } catch {}
    })();

    const handleActualizacion = (e) => {
      if (e.detail) setConfigSistema(e.detail);
    };
    window.addEventListener('configuracion-sistema-actualizada', handleActualizacion);
    return () => window.removeEventListener('configuracion-sistema-actualizada', handleActualizacion);
  }, [urlBase]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTiempoActual(obtenerFechaHora12());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const moduloActual = METADATA_MODULOS[pestana] || METADATA_MODULOS.dashboard;
  const IconoActual = moduloActual.icono;

  const nombreComercio = configSistema?.nombre_negocio || usuario?.empresa_nombre || 'Mi Negocio';
  const logoComercio = configSistema?.logo_url
    ? (configSistema.logo_url.startsWith('http') ? configSistema.logo_url : `${urlBase}${configSistema.logo_url}`)
    : null;

  const seleccionarModulo = (id) => {
    setPestana(id);
    setMenuMovilAbierto(false);
  };

  // Acordeón: un solo grupo abierto; al elegir una categoría se recogen las demás.
  const grupoDeModulo = (id) => GRUPOS_NAVEGACION.find((g) => g.items.some((i) => i.id === id))?.titulo || GRUPOS_NAVEGACION[0].titulo;
  const [grupoAbierto, setGrupoAbierto] = useState(() => grupoDeModulo(pestana));
  useEffect(() => { setGrupoAbierto(grupoDeModulo(pestana)); }, [pestana]);


  return (
    <div className="adm admin-layout">

      {/* ── Overlay del drawer móvil ── */}
      {menuMovilAbierto && <div className="adm-scrim" onClick={() => setMenuMovilAbierto(false)} />}

      {/* ── Navegación lateral ── */}
      <aside className={`adm-side ${menuMovilAbierto ? 'is-open' : ''}`} aria-label="Navegación del panel">
        <div className="adm-brand">
          <span className={`adm-brand__mark ${logoComercio ? 'has-logo' : ''}`}>
            {logoComercio ? <img src={logoComercio} alt="Logo" /> : <Store size={20} />}
          </span>
          <div className="adm-brand__text">
            <strong>{nombreComercio}</strong>
            <span>Panel administrativo</span>
          </div>
          <button type="button" className="adm-close" onClick={() => setMenuMovilAbierto(false)} aria-label="Cerrar menú">
            <X size={19} />
          </button>
        </div>

        <nav className="adm-nav">
          {GRUPOS_NAVEGACION.map((grupo) => {
            const abierto = grupoAbierto === grupo.titulo;
            const tieneActivo = grupo.items.some((i) => i.id === pestana);
            const idPanel = 'adm-grp-' + grupo.titulo.replace(/[^A-Za-z]/g, '').toLowerCase();
            return (
              <div key={grupo.titulo} className={`adm-nav__group ${abierto ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className={`adm-nav__head ${tieneActivo ? 'has-active' : ''}`}
                  aria-expanded={abierto}
                  aria-controls={idPanel}
                  onClick={() => setGrupoAbierto(abierto ? null : grupo.titulo)}
                >
                  <span className="adm-nav__title">{grupo.titulo}</span>
                  <span className="adm-nav__count">{grupo.items.length}</span>
                  <ChevronDown size={15} className="adm-nav__caret" />
                </button>
                <div className="adm-nav__panel" id={idPanel} role="region" inert={!abierto}>
                  <div className="adm-nav__panel-inner">
                    {grupo.items.map((item) => {
                      const ItemIcono = item.icono;
                      const esActivo = pestana === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`adm-nav__item ${esActivo ? 'is-active' : ''}`}
                          aria-current={esActivo ? 'page' : undefined}
                          onClick={() => seleccionarModulo(item.id)}
                        >
                          <span className="adm-nav__icon"><ItemIcono size={17} strokeWidth={1.9} /></span>
                          <span className="adm-nav__label">{item.etiqueta}</span>
                          {esActivo && <ChevronRight size={15} className="adm-nav__chev" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="adm-user">
          <div className="adm-user__row">
            <span className="adm-user__avatar">{usuario.nombre?.charAt(0)?.toUpperCase() || 'A'}</span>
            <div>
              <strong>{usuario.nombre || 'Administrador'}</strong>
              <small>{usuario.rol || 'Administrador'}</small>
            </div>
          </div>
          <button type="button" className="px-btn adm-user__back" onClick={alVolver}>
            <ArrowLeft size={15} /> Volver a caja / POS
          </button>
        </div>
      </aside>

      {/* ── Contenido ── */}
      <main className="adm-main">
        <header className="adm-top">
          <div className="adm-top__left">
            <button type="button" className="adm-menu-btn" onClick={() => setMenuMovilAbierto(true)} aria-label="Abrir menú">
              <Menu size={18} />
            </button>
            <span className="adm-top__icon"><IconoActual size={19} /></span>
            <div className="adm-top__title">
              <h1>{moduloActual.titulo}</h1>
              <span>{moduloActual.grupo}</span>
            </div>
          </div>

          <div className="adm-top__right">
            <span className="adm-pill adm-pill--gold">
              <Clock size={13} />
              {tiempoActual.fecha}
              <i>·</i>
              <b>{tiempoActual.hora}</b>
            </span>
            <span className="adm-pill adm-pill--ok"><i className="adm-dot" />En línea</span>
            <button type="button" className="px-btn px-btn--gold adm-top__back" onClick={alVolver} title="Volver a la vista del punto de venta">
              <ArrowLeft size={16} />
              <span>Volver a caja</span>
            </button>
          </div>
        </header>

        <div className="adm-content admin-content">
          {pestana === 'dashboard' && <DashboardGerencial apiUrl={urlBase} />}
          {pestana === 'mesas' && <GestionMesas apiUrl={urlBase} />}
          {pestana === 'productos' && <GestionProductos apiUrl={urlBase} />}
          {pestana === 'recetas' && <GestionRecetas apiUrl={urlBase} />}
          {pestana === 'inventario' && <Inventario alVolver={() => setPestana('dashboard')} apiUrl={urlBase} />}
          {pestana === 'reportes' && <ReporteResumen apiUrl={urlBase} />}
          {pestana === 'historial' && <HistorialFacturas alVolver={() => setPestana('reportes')} apiUrl={urlBase} />}
          {pestana === 'tipo_pago' && <ReporteTipoPago apiUrl={urlBase} />}
          {pestana === 'usuarios' && <GestionUsuarios apiUrl={urlBase} usuarioIdActual={usuario.id} />}
          {pestana === 'asistencia' && <GestionAsistencia apiUrl={urlBase} />}
          {pestana === 'negocio' && <ConfiguracionNegocio alVolver={() => setPestana('dashboard')} apiUrl={urlBase} alVerificarLicencia={alVerificarLicencia} />}
          {pestana === 'secuencias_ncf' && <GestionNCF apiUrl={urlBase} />}
          {pestana === 'tema' && <TemaSettings apiUrl={urlBase} />}
          {pestana === 'logo_fondo' && <LogoFondoSettings apiUrl={urlBase} />}
          {pestana === 'dispositivos' && <GestionDispositivos apiUrl={urlBase} />}
        </div>
      </main>

    </div>
  );
}
