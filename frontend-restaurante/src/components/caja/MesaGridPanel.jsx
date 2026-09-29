import React from 'react';
import { Plus, UtensilsCrossed, UserRound, ArrowUpRight } from 'lucide-react';

function MesaGridPanel({
  mesas,
  onSeleccionarMesa,
  onAbrirMesaLibre
}) {
  const mesasOcupadas = mesas.filter(
    (m) => m.estado === 'Ocupada'
  );
  const n = mesasOcupadas.length;

  return (
    <section className="mesa-grid-panel">

      <div className="mesa-grid-panel__header">

        <div className="mesa-grid-panel__title">
          <span className="px-eyebrow">Cuentas abiertas</span>
          <h3>Mesas en consumo ({n})</h3>
          <span className="mesa-grid-panel__status">
            {n === 0
              ? 'Sin mesas en consumo'
              : `${n} mesa${n !== 1 ? 's' : ''} activa${n !== 1 ? 's' : ''} — toca una para cobrar`}
          </span>
        </div>

        <button
          type="button"
          className="px-btn px-btn--gold"
          onClick={onAbrirMesaLibre}
        >
          <Plus size={17} />
          Abrir mesa libre
        </button>

      </div>

      <div className="mesa-grid-panel__grid">

        {n === 0 ? (

          <div className="mesa-grid-panel__empty">
            <span className="mesa-grid-panel__empty-icon">
              <UtensilsCrossed size={28} />
            </span>
            <div>
              <strong>No hay mesas ocupadas</strong>
              <span>Las mesas en consumo aparecerán aquí para cobrarlas.</span>
            </div>
          </div>

        ) : (

          mesasOcupadas.map((mesa) => (
            <button
              type="button"
              key={mesa.id}
              className="mesa-grid-panel__card"
              onClick={() => onSeleccionarMesa(mesa)}
            >
              <span className="mesa-grid-panel__card-name">
                {mesa.nombre_numero}
              </span>

              <span className="mesa-grid-panel__card-waiter">
                <UserRound size={13} />
                {mesa.camarero_nombre || mesa.camarero || 'Sin asignar'}
              </span>

              <span className="mesa-grid-panel__card-badge">
                Ocupada
              </span>

              <span className="mesa-grid-panel__cta" aria-hidden="true">
                <ArrowUpRight size={18} />
              </span>
            </button>
          ))

        )}

      </div>

    </section>
  );
}

export default MesaGridPanel;
