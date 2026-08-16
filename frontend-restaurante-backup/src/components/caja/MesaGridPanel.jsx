import React from 'react';

function MesaGridPanel({
  mesas,
  onSeleccionarMesa,
  onAbrirMesaLibre
}) {
  const mesasOcupadas = mesas.filter(
    (m) => m.estado === 'Ocupada'
  );

  return (
    <section className="mesa-grid-panel">

      <div className="mesa-grid-panel__header">

        <div className="mesa-grid-panel__title">
          <h3>
            Mesas Ocupadas ({mesasOcupadas.length})
          </h3>

          <span className="mesa-grid-panel__status">
            {mesasOcupadas.length === 0
              ? 'Sin mesas en consumo'
              : `${mesasOcupadas.length} mesa${
                  mesasOcupadas.length !== 1
                    ? 's'
                    : ''
                } activa${
                  mesasOcupadas.length !== 1
                    ? 's'
                    : ''
                }`}
          </span>
        </div>

        <button
          type="button"
          className="mesa-grid-panel__open-btn"
          onClick={onAbrirMesaLibre}
        >
          + Abrir Mesa Libre
        </button>

      </div>

      <div className="mesa-grid-panel__grid">

        {mesasOcupadas.length === 0 ? (

          <div className="mesa-grid-panel__empty">

            <span className="mesa-grid-panel__empty-icon">
              🍽️
            </span>

            <div>
              <strong>
                No hay mesas ocupadas
              </strong>

              <span>
                Las mesas en consumo aparecerán aquí.
              </span>
            </div>

          </div>

        ) : (

          mesasOcupadas.map((mesa) => (

            <button
              type="button"
              key={mesa.id}
              className="mesa-grid-panel__card"
              onClick={() =>
                onSeleccionarMesa(mesa)
              }
            >

              <span className="mesa-grid-panel__card-name">
                {mesa.nombre_numero}
              </span>

              <span className="mesa-grid-panel__card-waiter">
                {mesa.camarero_nombre ||
                  mesa.camarero ||
                  'Sin asignar'}
              </span>

              <span className="mesa-grid-panel__card-badge">
                Ocupada
              </span>

            </button>

          ))

        )}

      </div>

    </section>
  );
}

export default MesaGridPanel;