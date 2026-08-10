import React from 'react';

function CajaSidebar({ vistaActual, onCambiarVista, onCerrarSesion, usuario, onCierreCaja }) {
  return (
    <aside className="caja-sidebar">
      <div>
        <div className="caja-sidebar__brand">
          <h2>Estación de Caja</h2>
          <p>Cajero/a: <strong>{usuario.nombre}</strong></p>
        </div>

        <nav className="caja-sidebar__nav">
          <button
            className={`caja-sidebar__nav-btn ${vistaActual === 'mesas' ? 'caja-sidebar__nav-btn--active' : ''}`}
            onClick={() => onCambiarVista('mesas')}
          >
            Monitoreo de Mesas
          </button>
          <button
            className={`caja-sidebar__nav-btn ${vistaActual === 'historial' ? 'caja-sidebar__nav-btn--active' : ''}`}
            onClick={() => onCambiarVista('historial')}
          >
            Historial de Facturas
          </button>
          <button
            className={`caja-sidebar__nav-btn ${vistaActual === 'cierre' ? 'caja-sidebar__nav-btn--active' : ''}`}
            onClick={onCierreCaja}
          >
            Cuadre y Cierre de Caja
          </button>
        </nav>
      </div>

      <button className="caja-sidebar__logout" onClick={onCerrarSesion}>
        Cerrar Sesion
      </button>
    </aside>
  );
}

export default CajaSidebar;
