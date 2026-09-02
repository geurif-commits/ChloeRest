import { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard, TableProperties, Package, ChefHat, Warehouse,
  BarChart3, FileText, CreditCard, Users, Building2, Receipt,
  Palette, Image, Monitor, LogOut, ChevronRight, Store,
  Sparkles, ArrowLeft, Menu, X, Clock, Shield, CircleDollarSign,
  Grid, Compass, Home, Layers
} from 'lucide-react';
import './admin/admin.css';
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
      second: '2-digit',
      hour12: true
    });
    const fecha = ahora.toLocaleDateString('es-DO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const fechaFormat = fecha.charAt(0).toUpperCase() + fecha.slice(1);
    return { hora: hora12, fecha: fechaFormat };
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
    }, 1000);
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

  const listaTodosModulos = useMemo(() => {
    const arr = [];
    GRUPOS_NAVEGACION.forEach(g => {
      g.items.forEach(it => {
        arr.push({ ...it, grupoTitulo: g.titulo });
      });
    });
    return arr;
  }, []);

  return (
    <div className="admin-layout" style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#07090f' }}>
      
      {/* ── Overlay Fondo Móvil / Drawer ── */}
      {menuMovilAbierto && (
        <div
          onClick={() => setMenuMovilAbierto(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 1050,
          }}
        />
      )}

      {/* ── Sidebar de Navegación Lateral (Desktop y Drawer Móvil) ── */}
      <aside
        className={`admin-sidebar ${menuMovilAbierto ? 'admin-sidebar--mobile-open' : ''}`}
        style={{
          width: '270px',
          flexShrink: 0,
          background: 'rgba(12, 17, 29, 0.98)',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1100,
          transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Encabezado del Sidebar */}
        <div style={{ padding: '18px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: logoComercio ? '#fff' : 'linear-gradient(135deg, #f5b842 0%, #b8862a 100%)',
              color: '#080c14',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 15px rgba(245, 184, 61, 0.3)',
              fontWeight: 900,
              overflow: 'hidden',
              flexShrink: 0
            }}>
              {logoComercio ? (
                <img src={logoComercio} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <Store size={20} />
              )}
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <span style={{
                fontSize: '0.92rem',
                fontWeight: 800,
                color: '#fff',
                display: 'block',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {nombreComercio}
              </span>
              <span style={{ fontSize: '0.68rem', color: 'var(--gold, #f5b842)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Panel Administrativo
              </span>
            </div>
          </div>

          <button
            type="button"
            className="admin-close-mobile-btn"
            onClick={() => setMenuMovilAbierto(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Lista de Módulos Agrupados */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {GRUPOS_NAVEGACION.map((grupo) => (
            <div key={grupo.titulo} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'rgba(255, 255, 255, 0.35)', letterSpacing: '0.08em', padding: '0 10px 4px', textTransform: 'uppercase' }}>
                {grupo.titulo}
              </span>
              {grupo.items.map((item) => {
                const ItemIcono = item.icono;
                const esActivo = pestana === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => seleccionarModulo(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '9px 12px',
                      borderRadius: '10px',
                      border: esActivo ? '1px solid rgba(245, 184, 61, 0.35)' : '1px solid transparent',
                      background: esActivo ? 'rgba(245, 184, 61, 0.14)' : 'transparent',
                      color: esActivo ? 'var(--gold, #f5b842)' : '#94a3b8',
                      fontWeight: esActivo ? 700 : 500,
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.18s ease',
                      width: '100%'
                    }}
                  >
                    <ItemIcono size={17} style={{ color: esActivo ? 'var(--gold, #f5b842)' : '#64748b', flexShrink: 0 }} />
                    <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.etiqueta}
                    </span>
                    {esActivo && <ChevronRight size={14} style={{ color: 'var(--gold, #f5b842)' }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer del Sidebar: Usuario y Salida */}
        <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(0, 0, 0, 0.2)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(245, 184, 61, 0.2)',
              color: 'var(--gold, #f5b842)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '0.82rem'
            }}>
              {usuario.nombre?.charAt(0)?.toUpperCase() || 'A'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: '0.8rem', color: '#fff', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {usuario.nombre || 'Administrador'}
              </strong>
              <small style={{ fontSize: '0.68rem', color: 'var(--gold, #f5b842)' }}>
                {usuario.rol || 'Administrador'}
              </small>
            </div>
          </div>

          <button
            type="button"
            onClick={alVolver}
            className="admin-btn admin-btn-secondary"
            style={{
              width: '100%',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '0.8rem'
            }}
          >
            <ArrowLeft size={14} />
            <span>Volver a Caja / POS</span>
          </button>
        </div>
      </aside>

      {/* ── Contenido Principal & Header Unificado con Barra Rápida de Opciones ── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        
        {/* Topbar Superior Limpia y Minimalista */}
        <header
          style={{
            height: '60px',
            flexShrink: 0,
            background: 'rgba(12, 17, 29, 0.96)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          {/* Izquierda: Botón Menú Móvil + Título del Módulo Activo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              className="admin-menu-toggle-btn"
              onClick={() => setMenuMovilAbierto(true)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                color: '#fff',
                padding: '7px 10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 600
              }}
              title="Abrir Menú"
            >
              <Menu size={16} />
              <span>Menú</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'rgba(245, 184, 61, 0.15)',
                color: 'var(--gold, #f5b842)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconoActual size={17} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                  {moduloActual.titulo}
                </h1>
                <span style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', display: 'block' }}>
                  {moduloActual.grupo} • {moduloActual.desc || 'Panel de Administración'}
                </span>
              </div>
            </div>
          </div>

          {/* Derecha: Reloj 12h & Fecha + Estado En Línea + Botón Volver a Caja */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'nowrap' }}>
            {/* Reloj en formato 12 Horas con Fecha del Día con diseño idéntico al de En Línea */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'rgba(245, 184, 61, 0.12)',
              border: '1px solid rgba(245, 184, 61, 0.3)',
              fontSize: '0.72rem',
              color: 'var(--gold, #f5b842)',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              <Clock size={12} style={{ color: 'var(--gold, #f5b842)', flexShrink: 0 }} />
              <span>{tiempoActual.fecha}</span>
              <span style={{ opacity: 0.35 }}>•</span>
              <span style={{ fontFamily: 'monospace', letterSpacing: '0.3px' }}>{tiempoActual.hora}</span>
            </div>

            {/* Estado En Línea */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontSize: '0.72rem',
              color: '#10b981',
              fontWeight: 700,
              whiteSpace: 'nowrap'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
              <span>En Línea</span>
            </div>

            <button
              type="button"
              onClick={alVolver}
              className="admin-btn admin-btn-primary"
              style={{
                padding: '7px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                fontWeight: 700
              }}
              title="Volver a la vista del Punto de Venta"
            >
              <ArrowLeft size={14} />
              <span className="admin-btn-text-full">Volver a Caja</span>
            </button>
          </div>
        </header>

        {/* Canvas de Contenido del Módulo */}
        <div
          className="admin-content"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            background: 'radial-gradient(circle at 50% 0%, rgba(245, 184, 61, 0.04), transparent 40%), #07090f'
          }}
        >
          {pestana === 'dashboard' && <DashboardGerencial apiUrl={urlBase} />}
          {pestana === 'mesas' && <GestionMesas apiUrl={urlBase} />}
          {pestana === 'productos' && <GestionProductos apiUrl={urlBase} />}
          {pestana === 'recetas' && <GestionRecetas apiUrl={urlBase} />}
          {pestana === 'inventario' && <Inventario alVolver={() => setPestana('dashboard')} apiUrl={urlBase} />}
          {pestana === 'reportes' && <ReporteResumen apiUrl={urlBase} />}
          {pestana === 'historial' && <HistorialFacturas alVolver={() => setPestana('reportes')} apiUrl={urlBase} />}
          {pestana === 'tipo_pago' && <ReporteTipoPago apiUrl={urlBase} />}
          {pestana === 'usuarios' && <GestionUsuarios apiUrl={urlBase} usuarioIdActual={usuario.id} />}
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

