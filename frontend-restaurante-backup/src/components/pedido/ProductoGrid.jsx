import React, { useState, useEffect } from 'react';
import { obtenerSesion } from '../../api.js';

const bebidasClave = ['bar', 'bebida', 'cerveza', 'ron', 'whiskey', 'vino', 'vodka', 'jugo', 'cóctel', 'coctel', 'refresco', 'agua', 'licor'];

const EMOJIS = {
  cocina: '🍳', acompañamientos: '🥗', 'platos fuertes': '🍖', ensaladas: '🥬',
  entrada: '🥪', pastas: '🍝', pizzas: '🍕', mariscos: '🐟', postres: '🍰', otros: '📦',
  bebidas: '🥤', jugos: '🧃', cócteles: '🍸', cocteles: '🍸', cerveza: '🍺',
  vinos: '🍷', licores: '🥃', 'café / té': '☕', 'cafe / te': '☕', refrescos: '🥤',
  aguas: '💧', bar: '🍸', barra: '🍸',
};

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
  apiUrl,
}) {
  const [categoriasMenu, setCategoriasMenu] = useState([]);

  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/menu-configuracion`, {
      headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && Array.isArray(data.categorias)) setCategoriasMenu(data.categorias);
      })
      .catch(() => {});
  }, [apiUrl]);

  const todasCategorias = [...new Set([
    ...categoriasMenu.map((c) => c.nombre),
    ...productos.map((p) => p.categoria)
  ].filter(Boolean))];

  const esBebida = (cat) => bebidasClave.some((t) => cat.toLowerCase().includes(t));
  const alimentos = todasCategorias.filter((cat) => !esBebida(cat));
  const bebidas = todasCategorias.filter(esBebida);

  const productosFiltrados = productos.filter((p) => {
    const coincideCat = !categoriaActiva || p.categoria === categoriaActiva;
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return coincideCat && coincideBusqueda;
  });

  const getEmoji = (cat) => EMOJIS[cat.toLowerCase()] || '🍽️';

  const renderCategoriaBtn = (cat) => {
    const activa = categoriaActiva === cat;
    return (
      <button
        key={cat}
        className={activa ? 'is-active' : ''}
        onClick={() => onCategoriaChange(cat)}
      >
        {getEmoji(cat)} {cat}
      </button>
    );
  };

  const renderSeccion = (titulo, items) => {
    if (!items.length) return null;
    const isActive = categoriaActiva && items.includes(categoriaActiva);

    if (isActive) {
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <p style={{ color: 'var(--gold-light, #EBCB72)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>{titulo}</p>
              <h3 style={{ color: 'var(--text-primary, #F9FAFB)', fontSize: '1.3rem', fontWeight: 800, margin: '4px 0 0 0', textTransform: 'capitalize' }}>{categoriaActiva}</h3>
            </div>
            <button
              onClick={() => onCategoriaChange('')}
              style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--gold-glow, rgba(212,175,55,0.25))', background: 'var(--gold-soft, rgba(212,175,55,0.08))', color: 'var(--gold-light, #EBCB72)', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
            >
              ← Volver a categorías
            </button>
          </div>
          <div className="pedido-grid">
            {productosFiltrados.map((prod) => (
              <div key={prod.id} onClick={() => onAgregarProducto(prod)} className="pedido-producto">
                <div className="pedido-producto__img">
                  {prod.imagen_url ? <img src={prod.imagen_url} alt={prod.nombre} /> : <span className="pedido-producto__placeholder">🍽️</span>}
                </div>
                <h4 className="pedido-producto__name">{prod.nombre}</h4>
                <span className="pedido-producto__price">RD$ {formatearRD(prod.precio)}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div>
        <p style={{ color: 'var(--text-muted, #9EA6B7)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>{titulo}</p>
        <div className="pedido-categorias">
          {items.map(renderCategoriaBtn)}
        </div>
      </div>
    );
  };

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
            placeholder="Buscar plato o bebida... 🔍"
            value={busqueda}
            onChange={(e) => onBuscarChange(e.target.value)}
          />
        </header>
      )}

      <div style={{ flex: 1, padding: 'var(--space-lg, 25px)', overflowY: 'auto', boxSizing: 'border-box' }}>
        {cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--gold-light, #EBCB72)', fontSize: '1.2rem', padding: '40px' }}>
            Cargando catálogo completo...
          </p>
        ) : (
          <>
            {renderSeccion('Categorías de alimentos', alimentos)}
            {alimentos.length > 0 && bebidas.length > 0 && (
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />
            )}
            {renderSeccion('Categorías de bebidas', bebidas)}
          </>
        )}
      </div>
    </div>
  );
}

export default ProductoGrid;
