import { useState } from 'react';
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

const SECCIONES = [
  { id: 'inicio', etiqueta: 'Inicio', icono: '◈', items: [
    { id: 'dashboard', etiqueta: 'Resumen', icono: '◌' },
  ]},
  { id: 'operacion', etiqueta: 'Operación', icono: '▦', items: [
    { id: 'mesas', etiqueta: 'Mesas', icono: '◫' },
    { id: 'productos', etiqueta: 'Productos', icono: '◇' },
    { id: 'recetas', etiqueta: 'Recetas', icono: '◉' },
    { id: 'inventario', etiqueta: 'Inventario', icono: '▤' },
  ]},
  { id: 'finanzas', etiqueta: 'Finanzas', icono: '◆', items: [
    { id: 'reportes', etiqueta: 'Ventas', icono: '◷' },
    { id: 'historial', etiqueta: 'Facturas', icono: '▤' },
    { id: 'tipo_pago', etiqueta: 'Pagos', icono: '◇' },
  ]},
  { id: 'organizacion', etiqueta: 'Organización', icono: '◫', items: [
    { id: 'usuarios', etiqueta: 'Personal', icono: '◉' },
    { id: 'negocio', etiqueta: 'Negocio', icono: '▣' },
    { id: 'secuencias_ncf', etiqueta: 'Fiscal', icono: '▤' },
  ]},
  { id: 'sistema', etiqueta: 'Sistema', icono: '⚙', items: [
    { id: 'tema', etiqueta: 'Tema', icono: '🎨' },
    { id: 'logo_fondo', etiqueta: 'Logo y Fondo', icono: '🖼️' },
  ]},
];

const TITULOS = {
  dashboard: 'Centro de mando', mesas: 'Mesas', inventario: 'Inventario', recetas: 'Recetas',
  secuencias_ncf: 'Fiscal / NCF', reportes: 'Ventas', historial: 'Facturas', tipo_pago: 'Pagos',
  productos: 'Productos', usuarios: 'Personal', negocio: 'Negocio',
  tema: 'Tema del Sistema', logo_fondo: 'Logo e Imagen de Fondo',
};

function PanelAdmin({ usuario, alVolver, apiUrl, alVerificarLicencia }) {
  const [pestana, setPestana] = useState('dashboard');
  const [seccionAbierta, setSeccionAbierta] = useState('inicio');
  const urlBase = apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const seccion = SECCIONES.find((s) => s.id === seccionAbierta) || SECCIONES[0];

  const navegar = (id) => { setPestana(id); const sec = SECCIONES.find((s) => s.items.some((i) => i.id === id)); if (sec) setSeccionAbierta(sec.id); };

  return (
    <>
    <div className="admin-container">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__top">
          <div className="admin-logo">
            <span className="admin-logo__mark">CR</span>
            <div><h2>Chloe Restaurant</h2><p>{usuario.nombre}</p></div>
          </div>
          <nav className="admin-nav">
            {SECCIONES.map((s) => (
              <button key={s.id} className={`admin-nav-btn ${s.id === seccionAbierta ? 'activo' : ''}`} onClick={() => { setSeccionAbierta(s.id); setPestana(s.items[0].id); }}>
                <span>{s.icono}</span><span className="admin-nav-btn__label">{s.etiqueta}</span>
              </button>
            ))}
          </nav>
        </div>
        <button className="btn-volver-admin" onClick={alVolver}>← Salir</button>
      </aside>

      <main className="admin-content">

        <nav className="admin-subnav">
          {seccion.items.map((item) => (
            <button key={item.id} className={pestana === item.id ? 'activo' : ''} onClick={() => setPestana(item.id)}>
              <span>{item.icono}</span>{item.etiqueta}
            </button>
          ))}
        </nav>

        <div className="admin-workspace">
          {pestana === 'dashboard' && <DashboardGerencial apiUrl={urlBase} />}
          {pestana === 'mesas' && <GestionMesas apiUrl={urlBase} />}
          {pestana === 'productos' && <GestionProductos apiUrl={urlBase} />}
          {pestana === 'recetas' && <GestionRecetas apiUrl={urlBase} />}
          {pestana === 'inventario' && <Inventario alVolver={null} apiUrl={urlBase} />}
          {pestana === 'reportes' && <ReporteResumen apiUrl={urlBase} />}
          {pestana === 'historial' && <HistorialFacturas alVolver={() => setPestana('reportes')} apiUrl={urlBase} />}
          {pestana === 'tipo_pago' && <ReporteTipoPago apiUrl={urlBase} />}
          {pestana === 'usuarios' && <GestionUsuarios apiUrl={urlBase} usuarioIdActual={usuario.id} />}
          {pestana === 'negocio' && <ConfiguracionNegocio alVolver={null} apiUrl={urlBase} alVerificarLicencia={alVerificarLicencia} />}
          {pestana === 'secuencias_ncf' && <GestionNCF apiUrl={urlBase} />}
          {pestana === 'tema' && <TemaSettings apiUrl={urlBase} />}
          {pestana === 'logo_fondo' && <LogoFondoSettings apiUrl={urlBase} />}
        </div>
      </main>
    </div>
    </>
  );
}

export default PanelAdmin;
