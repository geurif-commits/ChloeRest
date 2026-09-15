import React, { useState, useEffect } from 'react';
import { obtenerSesion } from '../../api.js';
import SafeImage from '../SafeImage.jsx';

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

  const buscando = busqueda.trim().length > 0;

  const productosFiltrados = productos.filter((p) => {
    const coincideCat = !categoriaActiva || p.categoria === categoriaActiva;
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase());
    return coincideCat && coincideBusqueda;
  });

  const resultadosBusqueda = productos.filter((p) => {
    const termino = busqueda.trim().toLowerCase();
    return (
      p.nombre.toLowerCase().includes(termino) ||
      (p.categoria || '').toLowerCase().includes(termino)
    );
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
        <span className="pedido-categorias__emoji" aria-hidden="true">{getEmoji(cat)}</span>
        <span className="pedido-categorias__nombre">{cat}</span>
      </button>
    );
  };

  const renderProductoCarta = (prod) => (
    <div key={prod.id} onClick={() => onAgregarProducto(prod)} className="pedido-producto">
      <div className="pedido-producto__img">
        {prod.imagen_url ? <SafeImage src={prod.imagen_url} alt={prod.nombre} className="pedido-producto__image" /> : <SafeImage src="/favicon.svg" alt="" className="pedido-producto__image pedido-producto__image--fallback" />}
      </div>
      <div className="pedido-producto__info">
        <h4 className="pedido-producto__name">{prod.nombre}</h4>
        <span className="pedido-producto__price">RD$ {formatearRD(prod.precio)}</span>
      </div>
    </div>
  );

  const renderSeccion = (titulo, items) => {
    if (!items.length) return null;
    const esAlimentos = titulo === 'Alimentos';
    return (
      <section className={`pedido-split__col ${esAlimentos ? 'pedido-split__col--alimentos' : 'pedido-split__col--bebidas'}`}>
        <p className="pedido-split__col-title">{titulo}</p>
        <div className="pedido-categorias pedido-categorias--split">
          {items.map(renderCategoriaBtn)}
        </div>
      </section>
    );
  };

  const renderBusqueda = () => {
    const termino = busqueda.trim();
    return (
      <div>
        <div className="pedido-detalle-head">
          <div>
            <p className="pedido-detalle-head__label">Búsqueda global</p>
            <h3 className="pedido-detalle-head__title">
              {resultadosBusqueda.length} resultado{resultadosBusqueda.length === 1 ? '' : 's'} para "{termino}"
            </h3>
          </div>
          <button className="pedido-detalle-head__back" onClick={() => onBuscarChange('')}>
            ✕ Limpiar búsqueda
          </button>
        </div>
        {resultadosBusqueda.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted, #9EA6B7)', padding: '30px 0', fontSize: '0.95rem' }}>
            No se encontraron productos para "{termino}".
          </p>
        ) : (
          <div className="pedido-grid pedido-grid--categoria">
            {resultadosBusqueda.map(renderProductoCarta)}
          </div>
        )}
      </div>
    );
  };

  const renderDetalle = () => {
    const enAlimentos = alimentos.includes(categoriaActiva);
    const titulo = enAlimentos ? 'Alimentos' : 'Bebidas';
    return (
      <div>
        <div className="pedido-detalle-head">
          <div>
            <p className="pedido-detalle-head__label">{titulo}</p>
            <h3 className="pedido-detalle-head__title">{categoriaActiva}</h3>
          </div>
          <button className="pedido-detalle-head__back" onClick={() => onCategoriaChange('')}>
            ← Volver a categorías
          </button>
        </div>
        <div className="pedido-grid pedido-grid--categoria">
          {productosFiltrados.map(renderProductoCarta)}
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

      <div style={{ flex: 1, padding: 'var(--space-md, 14px)', overflowY: 'auto', boxSizing: 'border-box' }}>
        {cargando ? (
          <p style={{ textAlign: 'center', color: 'var(--gold-light, #EBCB72)', fontSize: '1.2rem', padding: '40px' }}>
            Cargando catálogo completo...
          </p>
        ) : buscando ? (
          renderBusqueda()
        ) : categoriaActiva ? (
          renderDetalle()
        ) : (
          <div className="pedido-split">
            {renderSeccion('Alimentos', alimentos)}
            {renderSeccion('Bebidas', bebidas)}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProductoGrid;
