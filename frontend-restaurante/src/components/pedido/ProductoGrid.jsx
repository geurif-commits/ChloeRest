import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Search, X, Plus, Utensils, Sun, Moon } from 'lucide-react';
import { obtenerSesion } from '../../api.js';
import { useTemaLocal } from '../../utils/tema.js';
import SafeImage from '../SafeImage.jsx';
import './pedido.css';

const bebidasClave = ['bar', 'bebida', 'cerveza', 'ron', 'whiskey', 'vino', 'vodka', 'jugo', 'coctel', 'refresco', 'agua', 'licor'];

const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
  cantidades = {},
}) {
  const [categoriasMenu, setCategoriasMenu] = useState([]);
  const [tipo, setTipo] = useState('comida');
  const { esOscuro, alternar: alternarTema } = useTemaLocal();

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

  const { alimentos, bebidas } = useMemo(() => {
    const todas = [...new Set([
      ...categoriasMenu.map((c) => c.nombre),
      ...productos.map((p) => p.categoria)
    ].filter(Boolean))];
    const tipos = new Map(categoriasMenu.map((c) => [c.nombre, normalizar(c.tipo || c.tipo_destino)]));
    const esBebida = (cat) => {
      const t = tipos.get(cat);
      if (t) return t === 'bar' || t === 'bebida' || t === 'bebidas';
      const nombre = normalizar(cat);
      if (/ceviche|sopa|ensalada|entrada|principal|pasta|pizza|criollo|mofongo|postre/.test(nombre)) return false;
      return bebidasClave.some((k) => new RegExp(`\\b${k}\\b`).test(nombre));
    };
    return { alimentos: todas.filter((c) => !esBebida(c)), bebidas: todas.filter(esBebida) };
  }, [categoriasMenu, productos]);

  const conteo = useMemo(
    () => productos.reduce((acc, p) => { acc[p.categoria] = (acc[p.categoria] || 0) + 1; return acc; }, {}),
    [productos]
  );

  const lista = tipo === 'comida' ? alimentos : bebidas;
  const seleccionada = lista.includes(categoriaActiva) ? categoriaActiva : (lista[0] || '');

  // Si la categoría activa pertenece a otro tipo, el selector sigue a la categoría.
  useEffect(() => {
    if (!categoriaActiva) return;
    if (alimentos.includes(categoriaActiva) && tipo !== 'comida') setTipo('comida');
    else if (bebidas.includes(categoriaActiva) && tipo !== 'bebida') setTipo('bebida');
  }, [categoriaActiva, alimentos, bebidas]);

  const cambiarTipo = (nuevo) => {
    setTipo(nuevo);
    onCategoriaChange((nuevo === 'comida' ? alimentos : bebidas)[0] || '');
  };

  const buscando = busqueda.trim().length > 0;
  const mostrados = buscando
    ? productos.filter((p) => {
      const t = normalizar(busqueda.trim());
      return normalizar(p.nombre).includes(t) || normalizar(p.categoria).includes(t);
    })
    : productos.filter((p) => p.categoria === seleccionada);

  const renderProducto = (prod, i) => {
    const enCarrito = cantidades[prod.id] || 0;
    return (
      <button
        key={prod.id}
        type="button"
        onClick={() => onAgregarProducto(prod)}
        className="po-item"
        style={{ '--i': Math.min(i, 30) }}
        aria-label={`Agregar ${prod.nombre}`}
      >
        {enCarrito > 0 && <span className="po-item__qty">{enCarrito}</span>}
        {prod.imagen_url && <span className="po-item__media"><SafeImage src={prod.imagen_url} alt="" /></span>}
        <span className="po-item__name">{prod.nombre}</span>
        {prod.descripcion && <span className="po-item__desc">{prod.descripcion}</span>}
        <span className="po-item__foot">
          <span className="po-item__price">RD$ {formatearRD(prod.precio)}</span>
          <span className="po-item__add" aria-hidden="true"><Plus size={18} strokeWidth={2.4} /></span>
        </span>
      </button>
    );
  };

  return (
    <section className="po-catalog" style={{ display: !isMobile || mobileTab === 'menu' ? 'flex' : 'none' }}>
      {!isMobile && (
        <header className="po-bar">
          <button type="button" className="po-btn" onClick={onVolver}><ArrowLeft size={18} />Mesas</button>
          <label className="po-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Buscar plato o bebida"
              value={busqueda}
              onChange={(e) => onBuscarChange(e.target.value)}
              aria-label="Buscar plato o bebida"
            />
            {busqueda && <button type="button" className="po-search__clear" onClick={() => onBuscarChange('')} aria-label="Limpiar búsqueda"><X size={14} /></button>}
          </label>
          <button type="button" className="po-btn po-btn--icon" onClick={alternarTema} aria-label={esOscuro ? 'Tema claro' : 'Tema oscuro'}>
            {esOscuro ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </header>
      )}

      <div className="po-body">
        <nav className="po-rail" aria-label="Categorías">
          <div className="po-seg" role="group" aria-label="Tipo de menú">
            <button type="button" aria-pressed={tipo === 'comida'} onClick={() => cambiarTipo('comida')}>Comida</button>
            <button type="button" aria-pressed={tipo === 'bebida'} onClick={() => cambiarTipo('bebida')}>Bebidas</button>
          </div>
          {lista.map((cat) => (
            <button key={cat} type="button" className="po-cat" aria-current={!buscando && cat === seleccionada ? 'true' : undefined} onClick={() => { if (buscando) onBuscarChange(''); onCategoriaChange(cat); }}>
              <span>{cat}</span><small>{conteo[cat] || 0}</small>
            </button>
          ))}
          {!lista.length && <p className="po-rail__empty">Sin categorías</p>}
        </nav>

        <div className="po-items">
          {cargando ? (
            <div className="po-empty"><Utensils size={28} /><p>Cargando catálogo…</p></div>
          ) : (
            <>
              <h2 className="po-items__title">
                {buscando ? `${mostrados.length} resultado${mostrados.length === 1 ? '' : 's'} para “${busqueda.trim()}”` : (seleccionada || 'Menú')}
              </h2>
              {mostrados.length === 0 ? (
                <div className="po-empty"><Search size={28} /><p>{buscando ? 'No se encontraron productos.' : 'Aún no hay productos en esta categoría.'}</p></div>
              ) : (
                <div className="po-items__grid">{mostrados.map(renderProducto)}</div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default ProductoGrid;
