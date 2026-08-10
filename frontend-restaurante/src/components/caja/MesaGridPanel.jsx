import React from 'react';

function MesaGridPanel({ mesas, mesaSeleccionada, onSeleccionarMesa, onAbrirMesaLibre }) {
  const mesasOcupadas = mesas.filter(m => m.estado === 'Ocupada');

  return (
    <div className="mesa-grid-panel">
      <div className="mesa-grid-panel__header">
        <h3>Mesas Ocupadas ({mesasOcupadas.length})</h3>
        <button className="mesa-grid-panel__open-btn" onClick={onAbrirMesaLibre}>
          Abrir Mesa Libre
        </button>
      </div>

      <div className="mesa-grid-panel__grid">
        {mesasOcupadas.length === 0 ? (
          <div className="mesa-grid-panel__empty">
            No hay mesas ocupadas en este momento.
          </div>
        ) : (
          mesasOcupadas.map(mesa => (
            <div
              key={mesa.id}
              className={`mesa-grid-panel__card ${mesaSeleccionada?.id === mesa.id ? 'mesa-grid-panel__card--selected' : ''}`}
              onClick={() => onSeleccionarMesa(mesa)}
            >
              <span className="mesa-grid-panel__card-name">{mesa.nombre_numero}</span>
              <span className="mesa-grid-panel__card-badge">
                Ocupada
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default MesaGridPanel;
