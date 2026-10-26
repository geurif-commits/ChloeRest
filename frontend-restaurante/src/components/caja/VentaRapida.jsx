import { useEffect, useState } from 'react';
import { Plus, Minus, Trash2, CreditCard, ShoppingBag, StickyNote, Flame, LockKeyhole } from 'lucide-react';
import ProductoGrid from '../pedido/ProductoGrid.jsx';
import PersonalizarPlato from '../pedido/PersonalizarPlato.jsx';
import useOpcionesPlato from '../pedido/useOpcionesPlato.js';
import ConfirmModal from '../ConfirmModal';
import { calcularTotales, formatearRD, porcentajePropina } from '../../utils/dinero.js';
import { toastAviso, toastError } from '../Toast.jsx';
import '../pedido/pedido.css';
import './VentaRapida.css';

/**
 * Venta rápida (mostrador / para llevar): se arma la venta con el mismo catálogo del comandero y se cobra con
 * el cobro de siempre (NCF, métodos de pago, descuento, inventario). Aquí solo se arma la venta; el cobro y el
 * ticket los resuelve la caja (`onCobrar`). Los precios se muestran del catálogo, pero el servidor cobra siempre
 * con los de la base.
 */
function VentaRapida({ usuario, apiUrl, configNegocio, cajaAbierta, reinicio, onCobrar, onVolver }) {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [carrito, setCarrito] = useState([]);
  const [cliente, setCliente] = useState({ nombre: '', telefono: '' });
  const [enviarACocina, setEnviarACocina] = useState(true);
  const [productoPersonalizando, setProductoPersonalizando] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const { guarniciones, terminos } = useOpcionesPlato(apiUrl);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/productos`);
        if (!res.ok) throw new Error('catálogo');
        const lista = await res.json();
        if (activo) setProductos(lista);
      } catch {
        if (activo) toastError('No se pudo cargar el catálogo de productos.');
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, [apiUrl]);

  // Tras un cobro exitoso la caja cambia `reinicio` y la venta empieza de cero.
  useEffect(() => {
    setCarrito([]);
    setCliente({ nombre: '', telefono: '' });
    setEnviarACocina(true);
    setBusqueda('');
  }, [reinicio]);

  const agregar = (producto) => {
    if (producto.requiere_guarnicion || producto.requiere_termino) {
      setProductoPersonalizando(producto);
      return;
    }
    const itemKey = `prod-${producto.id}`;
    setCarrito((prev) => (prev.some((i) => i.itemKey === itemKey)
      ? prev.map((i) => (i.itemKey === itemKey ? { ...i, cantidad: i.cantidad + 1 } : i))
      : [...prev, { ...producto, itemKey, cantidad: 1 }]));
  };

  const agregarPersonalizado = ({ guarnicion, termino, notas }) => {
    const producto = productoPersonalizando;
    const itemKey = `custom-${producto.id}-${guarnicion || ''}-${termino || ''}-${notas || ''}`;
    setCarrito((prev) => (prev.some((i) => i.itemKey === itemKey)
      ? prev.map((i) => (i.itemKey === itemKey ? { ...i, cantidad: i.cantidad + 1 } : i))
      : [...prev, { ...producto, itemKey, guarnicion, termino, notas, cantidad: 1 }]));
    setProductoPersonalizando(null);
  };

  const sumar = (itemKey) => setCarrito((prev) => prev.map((i) => (i.itemKey === itemKey ? { ...i, cantidad: i.cantidad + 1 } : i)));
  const restar = (itemKey) => setCarrito((prev) => prev.flatMap((i) => {
    if (i.itemKey !== itemKey) return [i];
    return i.cantidad > 1 ? [{ ...i, cantidad: i.cantidad - 1 }] : [];
  }));

  const unidades = carrito.reduce((suma, i) => suma + i.cantidad, 0);
  const { subtotal, itbis, propina, total } = calcularTotales(carrito, {
    cobrarItbis: configNegocio?.cobrar_itbis,
    cobrarPropina: configNegocio?.cobrar_propina,
    porcentajePropina: porcentajePropina(configNegocio),
  });
  const cantidades = carrito.reduce((acc, i) => ({ ...acc, [i.id]: (acc[i.id] || 0) + i.cantidad }), {});

  const cobrar = () => {
    if (carrito.length === 0 || !cajaAbierta) return;
    const nombre = cliente.nombre.trim();
    const telefono = cliente.telefono.trim();
    if (Boolean(nombre) !== Boolean(telefono)) {
      toastAviso('Para registrar al cliente indica nombre y teléfono, o deja ambos vacíos.');
      return;
    }
    onCobrar({ lineas: carrito, cliente: nombre ? { nombre, telefono } : null, enviarACocina });
  };

  const pedirConfirmacion = (mensaje, accion) => setConfirmacion({ mensaje, accion });
  const salir = () => {
    if (carrito.length === 0) { onVolver(); return; }
    pedirConfirmacion('Hay una venta sin cobrar. ¿Salir y descartarla?', onVolver);
  };

  return (
    <div className="po">
      <ProductoGrid
        productos={productos}
        cargando={cargando}
        categoriaActiva={categoriaActiva}
        busqueda={busqueda}
        onBuscarChange={setBusqueda}
        onCategoriaChange={setCategoriaActiva}
        onAgregarProducto={agregar}
        onVolver={salir}
        apiUrl={apiUrl}
        formatearRD={formatearRD}
        isMobile={false}
        mobileTab="menu"
        cantidades={cantidades}
        etiquetaVolver="Caja"
      />

      <aside className="po-ticket" aria-label="Venta rápida">
        <header className="po-ticket__head">
          <div>
            <h2>Venta rápida</h2>
            <p>Para llevar · {usuario?.nombre}</p>
          </div>
          <span className="po-ticket__cap" aria-hidden="true"><ShoppingBag size={19} /></span>
        </header>

        <div className="po-ticket__body">
          <section>
            <p className="po-label po-label--new"><span>Venta</span><span>{unidades} {unidades === 1 ? 'artículo' : 'artículos'}</span></p>
            {carrito.length === 0 ? (
              <div className="po-blank"><ShoppingBag size={22} /><span>Toca un producto del menú para añadirlo.</span></div>
            ) : (
              carrito.map((item) => (
                <div key={item.itemKey} className="po-line">
                  <div className="po-line__row"><span>{item.nombre}</span><span>RD$ {formatearRD(Number(item.precio) * item.cantidad)}</span></div>
                  {(item.guarnicion || item.termino) && <span className="po-line__note">{[item.guarnicion, item.termino].filter(Boolean).join(' · ')}</span>}
                  {item.notas && <span className="po-line__note"><StickyNote size={13} />{item.notas}</span>}
                  <div className="po-step">
                    <button type="button" onClick={() => restar(item.itemKey)} aria-label={`Quitar uno de ${item.nombre}`}>{item.cantidad > 1 ? <Minus size={16} /> : <Trash2 size={15} />}</button>
                    <output>{item.cantidad}</output>
                    <button type="button" onClick={() => sumar(item.itemKey)} aria-label={`Aumentar ${item.nombre}`}><Plus size={16} /></button>
                  </div>
                </div>
              ))
            )}
          </section>

          <details className="vr-cliente">
            <summary>Cliente (opcional)</summary>
            <div className="vr-cliente__campos">
              <label htmlFor="vr-cliente-nombre">Nombre</label>
              <input id="vr-cliente-nombre" className="po-input" type="text" maxLength={200} autoComplete="off" value={cliente.nombre} onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))} />
              <label htmlFor="vr-cliente-telefono">Teléfono</label>
              <input id="vr-cliente-telefono" className="po-input" type="tel" inputMode="tel" maxLength={30} autoComplete="off" value={cliente.telefono} onChange={(e) => setCliente((c) => ({ ...c, telefono: e.target.value }))} />
            </div>
          </details>
        </div>

        <footer className="po-ticket__foot">
          <div className="po-totals">
            <div><span>Subtotal</span><span>RD$ {formatearRD(subtotal)}</span></div>
            {itbis > 0 && <div><span>ITBIS</span><span>RD$ {formatearRD(itbis)}</span></div>}
            {propina > 0 && <div><span>Propina {porcentajePropina(configNegocio)} %</span><span>RD$ {formatearRD(propina)}</span></div>}
            <div className="po-totals__grand"><span>Total</span><strong>RD$ {formatearRD(total)}</strong></div>
          </div>

          <label className="vr-opcion">
            <input type="checkbox" checked={enviarACocina} onChange={(e) => setEnviarACocina(e.target.checked)} />
            <span>
              <strong><Flame size={14} aria-hidden="true" /> Enviar a cocina y bar</strong>
              <small>Desmárcalo si se entrega al momento (por ejemplo, una bebida embotellada).</small>
            </span>
          </label>

          {!cajaAbierta && (
            <p className="vr-aviso" role="alert"><LockKeyhole size={16} aria-hidden="true" />La caja está cerrada. Ábrela desde Caja para poder cobrar.</p>
          )}

          <button type="button" className="po-send" onClick={cobrar} disabled={carrito.length === 0 || !cajaAbierta}>
            <CreditCard size={19} />
            {carrito.length === 0 ? 'Agrega productos para cobrar' : `Cobrar RD$ ${formatearRD(total)}`}
          </button>
          {carrito.length > 0 && (
            <button type="button" className="po-btn vr-vaciar" onClick={() => pedirConfirmacion('¿Vaciar la venta actual?', () => setCarrito([]))}>
              <Trash2 size={16} />Vaciar venta
            </button>
          )}
        </footer>
      </aside>

      {productoPersonalizando && (
        <PersonalizarPlato
          producto={productoPersonalizando}
          guarniciones={guarniciones}
          terminos={terminos}
          formatearRD={formatearRD}
          textoAgregar="Agregar a la venta"
          onConfirmar={agregarPersonalizado}
          onCerrar={() => setProductoPersonalizando(null)}
        />
      )}

      {confirmacion && (
        <ConfirmModal
          mensaje={confirmacion.mensaje}
          onConfirm={() => { const { accion } = confirmacion; setConfirmacion(null); accion(); }}
          onCancel={() => setConfirmacion(null)}
        />
      )}
    </div>
  );
}

export default VentaRapida;
