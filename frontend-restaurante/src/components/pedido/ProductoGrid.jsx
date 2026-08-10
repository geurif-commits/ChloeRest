import React from 'react';

const CATEGORIAS = [
  { key: 'Todos', label: '🍽️ Todo el Menú' },
  { key: 'Cocina', label: '🍳 Cocina' },
  { key: 'Bar', label: '🍸 Bar' },
];

function ProductoGrid({
  productos,
  cargando,
  categoriaActiva,
  busqueda,
  onBuscarChange,
  onCategoriaChange,
  onAgregarProducto,
  onVolver,
  formatearRD,
  isMobile,
  mobileTab,
}) {
  const productosFiltrados = productos.filter(p => {
    const coincideCat = categoriaActiva === 'Todos' || p.categoria === categoriaActiva;
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return coincideCat && coincideBusqueda;
  });

  return (
    <div
      className="pedido-catalogo"
      style={{ display: !isMobile || mobileTab === 'menu' ? 'flex' : 'none', height: isMobile ? 'auto' : '100vh' }}
    >
      {!isMobile && (
        <header className="pedido-header">
          <button onClick={onVolver}>⬅ Volver a Mesas</button>
          <input
            type="text"
            placeholder="🔍 Buscar plato o bebida..."
            value={busqueda}
            onChange={(e) => onBuscarChange(e.target.value)}
          />
        </header>
      )}

      <div className="pedido-categorias">
        {CATEGORIAS.map(({ key, label }) => (
          <button
            key={key}
            className={categoriaActiva === key ? 'is-active' : ''}
            onClick={() => onCategoriaChange(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 'var(--space-lg, 25px)', overflowY: 'auto', boxSizing: 'border-box' }}>
        {cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--gold-light, #EBCB72)', fontSize: '1.2rem', padding: '40px' }}>
            Cargando catálogo completo...
          </p>
        ) : (
          <div className="pedido-grid">
            {productosFiltrados.map(prod => (
              <div
                key={prod.id}
                onClick={() => onAgregarProducto(prod)}
                className="pedido-producto"
              >
                <div className="pedido-producto__img">
                  {prod.imagen_url ? (
                    <img src={prod.imagen_url} alt={prod.nombre} />
                  ) : (
                    <span className="pedido-producto__placeholder">🍽️</span>
                  )}
                </div>
                <h4 className="pedido-producto__name">{prod.nombre}</h4>
                <span className="pedido-producto__price">RD$ {formatearRD(prod.precio)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductoGrid;
