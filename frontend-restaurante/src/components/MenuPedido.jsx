import { useState, useEffect } from 'react';
import TicketTermico from './TicketTermico';
import ProductoGrid from './pedido/ProductoGrid.jsx';
import PedidoTicket from './pedido/PedidoTicket.jsx';
import { obtenerSesion } from '../api.js';
import { sanitizarDecimal } from '../utils/input.js';
import { calcularTotales, porcentajePropina, formatearRD as formatearDinero } from '../utils/dinero.js';
import { imprimirComanda } from '../utils/imprimirComanda.js';
import { toastAviso } from './Toast.jsx';
import { ArrowLeft, Search, Plus, Check, X, Banknote, CreditCard, Landmark, Receipt } from 'lucide-react';
import './pedido/pedido.css';

function MenuPedido({ mesa, usuario, alVolver, apiUrl }) {
  const urlBase = apiUrl;

  const [productos, setProductos] = useState([]);
  const [comandaNueva, setComandaNueva] = useState([]);
  const [cuentaActual, setCuentaActual] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [enviandoComanda, setEnviandoComanda] = useState(false);
  const [procesandoFactura, setProcesandoFactura] = useState(false);
  
  // Guarniciones y Términos disponibles
  const [guarnicionesDisponibles, setGuarnicionesDisponibles] = useState([]);
  const [terminosDisponibles, setTerminosDisponibles] = useState([]);

  // Estado de personalización de plato (Guarnición / Término / Notas)
  const [productoPersonalizando, setProductoPersonalizando] = useState(null);
  const [guarnicionSeleccionada, setGuarnicionSeleccionada] = useState('');
  const [terminoSeleccionado, setTerminoSeleccionado] = useState('');
  const [notaEspecial, setNotaEspecial] = useState('');
  
// Filtros de categoría y búsqueda
  const [categoriaActiva, setCategoriaActiva] = useState('');
  const [busqueda, setBusqueda] = useState('');
  
  // Configuración del negocio (Nombre, RNC, ITBIS / Propina)
  const [configNegocio, setConfigNegocio] = useState({ 
    nombre: 'Mi Negocio',
    rnc: '',
    direccion: 'República Dominicana',
    telefono: '',
    logo_url: '',
    cobrar_itbis: false,
    cobrar_propina: false,
    propina_porcentaje: 10,
    comanda_modo: 'kds',
    ticket_font_family: 'Inter',
    ticket_font_size: '12',
    ticket_logo_position: 'top',
    ticket_show_qr: true,
    ticket_margin: 'normal'
  });

  // Estado para impresión de Pre-cheque por Camareros
  const [prechequeData, setPrechequeData] = useState(null);
  const [anulacionPendiente, setAnulacionPendiente] = useState(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [pinSupervisor, setPinSupervisor] = useState('');
  const [procesandoAnulacion, setProcesandoAnulacion] = useState(false);
  
const [mobileTab, setMobileTab] = useState('menu');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  // Al entrar en una mesa (o cambiar de mesa) siempre se muestran las
  // categorías: sin filtros activos ni categoría heredada de otra mesa.
  useEffect(() => {
    setCategoriaActiva('');
    setBusqueda('');
    setMobileTab('menu');
  }, [mesa?.id]);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Estados para el cobro y NCF / e-CF
  const [mostrandoCobro, setMostrandoCobro] = useState(false);
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState('B02');
  const [rncCliente, setRncCliente] = useState('');
  const [tarjetaUltimos4, setTarjetaUltimos4] = useState('');
  const [tarjetaMarca, setTarjetaMarca] = useState('Visa');


  const esCajero = usuario.rol === 'Cajero' || usuario.rol === 'Administrador';

  const formatearRD = (val) => {
    return formatearDinero(val);
  };

  const cargarDatos = async () => {
    try {
      const resMenu = await fetch(`${urlBase}/api/productos`);
      if (!resMenu.ok) throw new Error("Error al conectar con el servidor de productos.");
      setProductos(await resMenu.json());

      const resCuenta = await fetch(`${urlBase}/api/mesas/${mesa.id}/cuenta`);
      if (!resCuenta.ok) throw new Error("Error al conectar con el servidor de cuentas.");
      setCuentaActual(await resCuenta.json());

      // Cargar Guarniciones y Términos de Cocina
      try {
        const resConfig = await fetch(`${urlBase}/api/menu-configuracion`, {
          headers: { 'Authorization': `Bearer ${obtenerSesion()}` }
        });
        if (resConfig.ok) {
          const cfg = await resConfig.json();
          const guarnicionesList = Array.isArray(cfg.guarniciones) && cfg.guarniciones.length > 0
            ? cfg.guarniciones.map(g => g.nombre)
            : ['Tostones', 'Papas Fritas', 'Arroz Blanco', 'Vegetales Salteados', 'Puré de Papas', 'Moro de Guandules'];
          const terminosList = Array.isArray(cfg.terminos) && cfg.terminos.length > 0
            ? cfg.terminos.map(t => t.nombre)
            : ['Término Medio (Medium)', 'Tres Cuartos (3/4)', 'Bien Cocido (Well Done)', 'Término Azul (Bleu)', 'Al Punto'];
          setGuarnicionesDisponibles(guarnicionesList);
          setTerminosDisponibles(terminosList);
        }
      } catch {
        setGuarnicionesDisponibles(['Tostones', 'Papas Fritas', 'Arroz Blanco', 'Vegetales Salteados', 'Puré de Papas']);
        setTerminosDisponibles(['Término Medio (Medium)', 'Tres Cuartos (3/4)', 'Bien Cocido (Well Done)']);
      }

      setCargando(false);
    } catch (error) {
      console.error(error);
      toastAviso("⚠️ Error de conexión con el servidor central.");
      setCargando(false);
    }
  };

  const cargarConfiguracionNegocio = async () => {
    try {
      const res = await fetch(`${urlBase}/api/negocio/config`);
      const data = await res.json();
      setConfigNegocio({
        nombre: data.nombre_comercial || data.nombre_negocio || data.nombre || 'Mi Negocio',
        rnc: data.rnc || '130000001',
        direccion: data.direccion || 'República Dominicana',
        telefono: data.telefono || '',
        logo_url: data.logo_url || '',
        cobrar_itbis: data.cobrar_itbis ?? false,
        cobrar_propina: data.cobrar_propina ?? false,
        propina_porcentaje: porcentajePropina(data),
        comanda_modo: data.comanda_modo || 'kds',
        ticket_font_family: data.ticket_font_family || 'Inter',
        ticket_font_size: data.ticket_font_size || '12',
        ticket_logo_position: data.ticket_logo_position || 'top',
        ticket_show_qr: data.ticket_show_qr ?? true,
        ticket_margin: data.ticket_margin || 'normal'
      });
    } catch (error) {
      console.error("Error cargando impuestos negocio:", error);
    }
  };

  useEffect(() => {
    cargarDatos();
    cargarConfiguracionNegocio();
  }, [mesa.id]);

  const agregarProducto = (prod) => {
    // Si el plato requiere guarnición o término, abrir modal de personalización
    if (prod.requiere_guarnicion || prod.requiere_termino) {
      setProductoPersonalizando(prod);
      setGuarnicionSeleccionada(prod.requiere_guarnicion ? (guarnicionesDisponibles[0] || 'Tostones') : '');
      setTerminoSeleccionado(prod.requiere_termino ? (terminosDisponibles[0] || 'Término Medio (Medium)') : '');
      setNotaEspecial('');
      return;
    }

    // Plato estándar sin personalización obligatoria
    setComandaNueva((prev) => {
      const itemKey = `prod-${prod.id}`;
      const existe = prev.find(item => (item.itemKey || `prod-${item.id}`) === itemKey);
      if (existe) {
        return prev.map(item => (item.itemKey || `prod-${item.id}`) === itemKey ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { ...prod, itemKey, cantidad: 1 }];
    });
  };

  const confirmarPersonalizacion = () => {
    if (!productoPersonalizando) return;
    const notasFormateadas = notaEspecial.trim() || null;
    const itemKey = `custom-${productoPersonalizando.id}-${guarnicionSeleccionada}-${terminoSeleccionado}-${notaEspecial.trim()}`;

    setComandaNueva((prev) => {
      const existe = prev.find(item => item.itemKey === itemKey);
      if (existe) {
        return prev.map(item => item.itemKey === itemKey ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [
        ...prev,
        {
          ...productoPersonalizando,
          itemKey,
          guarnicion: guarnicionSeleccionada || null,
          termino: terminoSeleccionado || null,
          notas: notasFormateadas || null,
          cantidad: 1
        }
      ];
    });

    toastAviso(`✅ ${productoPersonalizando.nombre} agregado con opciones`);
    setProductoPersonalizando(null);
  };

  const restarProducto = (itemKeyOrId) => {
    setComandaNueva((prev) => {
      const existe = prev.find(item => (item.itemKey || item.id) === itemKeyOrId || item.id === itemKeyOrId);
      if (!existe) return prev;
      if (existe.cantidad === 1) {
        return prev.filter(item => item !== existe);
      }
      return prev.map(item => item === existe ? { ...item, cantidad: item.cantidad - 1 } : item);
    });
  };

  const incrementarProducto = (item) => {
    setComandaNueva((prev) => prev.map((actual) => (
      (actual.itemKey || actual.id) === (item.itemKey || item.id)
        ? { ...actual, cantidad: actual.cantidad + 1 }
        : actual
    )));
  };

  const enviarComanda = async () => {
    if (enviandoComanda || comandaNueva.length === 0) return;
    setEnviandoComanda(true);

    try {
      const res = await fetch(`${urlBase}/api/mesas/${mesa.id}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
        body: JSON.stringify({
          camarero_id: usuario.id,
          productos: comandaNueva.map(item => ({
            producto_id: item.id,
            cantidad: item.cantidad,
            guarnicion: item.guarnicion || null,
            termino: item.termino || null,
            notas: item.notas || null
          }))
        })
      });

      if (res.ok) {
        setComandaNueva([]);
        await cargarDatos();
        const itemsParaImprimir = comandaNueva.map(item => {
          const detallesArray = [];
          if (item.guarnicion) detallesArray.push(`Guarnición: ${item.guarnicion}`);
          if (item.termino) detallesArray.push(`Término: ${item.termino}`);
          if (item.notas) detallesArray.push(item.notas);

          return {
            nombre: item.nombre,
            cantidad: item.cantidad,
            precio: item.precio,
            categoria: item.categoria,
            tipo_destino: item.tipo_destino || (['Bar', 'Bebidas'].includes(item.categoria) ? 'bar' : 'cocina'),
            notas: detallesArray.join(' | ')
          };
        });

        if (configNegocio.comanda_modo === 'impresora') {
          let impresorasEstacion = {};
          try { impresorasEstacion = JSON.parse(localStorage.getItem('chloe_impresoras') || '{}'); } catch {}
          const grupos = itemsParaImprimir.reduce((acc, item) => {
            const estacion = item.tipo_destino === 'bar' ? 'bar' : 'cocina';
            (acc[estacion] ||= []).push(item);
            return acc;
          }, {});
          try {
            await Promise.all(Object.entries(grupos).map(([estacion, productos]) => imprimirComanda({
              negocio: { nombre: configNegocio.nombre, direccion: configNegocio.direccion, telefono: configNegocio.telefono, logo_url: configNegocio.logo_url },
              mesa,
              camarero: usuario,
              productos,
              ticket: { ...configNegocio, printerName: impresorasEstacion[estacion] || '' }
            })));
          } catch {
            toastAviso('Comanda guardada, pero no se pudo imprimir. No la reenvíes; revisa la impresora.');
            return;
          }
          toastAviso("🛎️ Comanda enviada e impresa correctamente.");
        } else {
          toastAviso("🛎️ Comanda enviada a Cocina/Bar correctamente.");
        }

      } else {
        const errorData = await res.json();
        toastAviso(`❌ Error al enviar comanda: ${errorData.error}`);
      }
    } catch {
      toastAviso("⚠️ Error de conexión con el servidor.");
    } finally {
      setEnviandoComanda(false);
    }
  };

  const anularProductoEnviado = async (itemCuenta) => {
    setAnulacionPendiente(itemCuenta);
    setMotivoAnulacion('');
    setPinSupervisor('');
  };

  const confirmarAnulacion = async () => {
    if (!anulacionPendiente || procesandoAnulacion) return;
    if (!motivoAnulacion.trim()) return toastAviso('Debes especificar el motivo de la anulación.');
    if (!/^\d{6}$/.test(pinSupervisor)) return toastAviso('El PIN debe contener exactamente 6 dígitos.');
    setProcesandoAnulacion(true);

    try {
      const authRes = await fetch(`${urlBase}/api/autorizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
        body: JSON.stringify({ detalle_id: anulacionPendiente.id, pin: pinSupervisor })
      });

      if (!authRes.ok) {
        const authData = await authRes.json();
        return toastAviso(`❌ Error de autorización: ${authData.error || 'No autorizado'}`);
      }

      const authData = await authRes.json();
      const token = authData.token;

      const res = await fetch(`${urlBase}/api/cuenta_detalles/${anulacionPendiente.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${obtenerSesion()}`,
          'X-Supervisor-Authorization': token
        },
        body: JSON.stringify({ motivo: motivoAnulacion.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        toastAviso("✅ Producto anulado de la cuenta.");
        cargarDatos();
        setAnulacionPendiente(null);
      } else {
        toastAviso(`❌ Error al anular: ${data.error}`);
      }
    } catch {
      toastAviso("No se pudo validar la autorización. El producto no fue eliminado.");
    } finally {
      setProcesandoAnulacion(false);
    }
  };

  const trasladarMesa = async () => {
    const destinoStr = window.prompt("Ingrese el número o ID de la mesa destino:");
    if (!destinoStr) return;

    try {
      const resMesas = await fetch(`${urlBase}/api/mesas`);
      const listaMesas = await resMesas.json();
      const mesaDestino = listaMesas.find(m => m.nombre_numero.toLowerCase().includes(destinoStr.toLowerCase()) || m.id.toString() === destinoStr);

      if (!mesaDestino) return toastAviso("❌ Mesa destino no encontrada.");
      if (mesaDestino.id === mesa.id) return toastAviso("❌ Selecciona una mesa diferente a la actual.");

      const res = await fetch(`${urlBase}/api/mesas/trasladar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
        body: JSON.stringify({
          mesaOrigenId: mesa.id,
          mesaDestinoId: mesaDestino.id
        })
      });

      const data = await res.json();
      if (res.ok) {
        toastAviso(`✅ Mesa trasladada exitosamente a ${mesaDestino.nombre_numero}.`);
        alVolver();
      } else {
        toastAviso(`❌ Error: ${data.error}`);
      }
    } catch {
      toastAviso("⚠️ Error de conexión al trasladar mesa.");
    }
  };

  const imprimirPrechequeMesa = () => {
    if (cuentaActual.length === 0) {
      return toastAviso("⚠️ Esta mesa aún no tiene consumos registrados para imprimir un estado de cuenta.");
    }
    setPrechequeData({
      nombreNegocio: configNegocio.nombre,
      rncNegocio: configNegocio.rnc,
      direccionNegocio: configNegocio.direccion,
      telefonoNegocio: configNegocio.telefono,
      logoUrl: configNegocio.logo_url,
      mesa: mesa.nombre_numero,
      cajero: usuario.nombre,
      camarero: mesa.camarero || usuario.nombre,
      items: cuentaActual,
      subtotal: totalOriginal,
       ...calcularTotales(cuentaActual, { cobrarItbis: configNegocio.cobrar_itbis, cobrarPropina: configNegocio.cobrar_propina, porcentajePropina: porcentajePropina(configNegocio) }),
      fecha: new Date().toLocaleString(),
      ticketConfig: {
        font_family: configNegocio.ticket_font_family,
        font_size: configNegocio.ticket_font_size,
        logo_position: configNegocio.ticket_logo_position,
        show_qr: configNegocio.ticket_show_qr,
        margin: configNegocio.ticket_margin
      }
    });
  };

  const manejarCambioMontoRecibido = (valor) => {
    setMontoRecibido(sanitizarDecimal(valor));
  };

  const procesarFacturaDirecta = async () => {
    if (procesandoFactura) return;
    setProcesandoFactura(true);
    if (metodoPago === 'Efectivo') {
      if (!montoRecibido || parseFloat(montoRecibido) < totalAPagar) {
        setProcesandoFactura(false);
        return toastAviso("⚠️ El monto recibido es insuficiente para completar el pago.");
      }
    } else if (metodoPago === 'Tarjeta') {
      if (!tarjetaUltimos4 || tarjetaUltimos4.length !== 4) {
        setProcesandoFactura(false);
        return toastAviso("⚠️ Ingresa los últimos 4 dígitos de la tarjeta.");
      }
    }

    try {
      const res = await fetch(`${urlBase}/api/mesas/${mesa.id}/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
        body: JSON.stringify({
          metodo_pago: metodoPago,
          tipo_comprobante: tipoComprobante,
          rnc_cedula_cliente: rncCliente,
          monto_entregado: parseFloat(montoRecibido || 0),
          cambio: cambio > 0 ? cambio : 0,
          tarjeta_ultimos_4: tarjetaUltimos4,
          tarjeta_marca: tarjetaMarca
        })
      });

      const data = await res.json();
      if (res.ok) {
        toastAviso(`✅ Factura ${data.ncf || data.comprobante} procesada con éxito.\nTotal: RD$ ${formatearRD(totalAPagar)}`);
        alVolver();
      } else {
        toastAviso(`❌ ${data.error}`);
      }
    } catch {
      toastAviso("⚠️ Error al procesar la factura.");
    } finally {
      setProcesandoFactura(false);
    }
  };

  // Cálculos de totales
  const totalOriginal = calcularTotales(cuentaActual, { cobrarItbis: false, cobrarPropina: false }).subtotal;
  const totalesFactura = calcularTotales([...cuentaActual, ...comandaNueva], {
    cobrarItbis: configNegocio.cobrar_itbis,
    cobrarPropina: configNegocio.cobrar_propina,
    porcentajePropina: porcentajePropina(configNegocio),
  });
  const { subtotal: subtotalFactura, itbis, propina: propinaLey, total: totalAPagar } = totalesFactura;
  const granTotal = subtotalFactura;

  const cambio = montoRecibido ? parseFloat(montoRecibido) - totalAPagar : 0;

  const cantidadesPorProducto = comandaNueva.reduce((acc, item) => {
    acc[item.id] = (acc[item.id] || 0) + item.cantidad;
    return acc;
  }, {});

  const opcionesCobro = [
    { id: 'Efectivo', Icono: Banknote },
    { id: 'Tarjeta', Icono: CreditCard },
    { id: 'Transferencia', Icono: Landmark },
  ];

  return (
    <div className="po">
      {isMobile && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
          <div className="po-bar">
            <button type="button" className="px-btn px-btn--icon" onClick={alVolver} aria-label="Volver a mesas"><ArrowLeft size={17} /></button>
            <label className="po-search" style={{ margin: 0 }}>
              <Search size={17} />
              <input type="text" placeholder="Buscar plato o bebida" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar plato o bebida" />
            </label>
          </div>
          <div className="po-mobile-tabs">
            <button type="button" className={mobileTab === 'menu' ? 'is-active' : ''} onClick={() => setMobileTab('menu')}>Menú</button>
            <button type="button" className={mobileTab === 'cuenta' ? 'is-active' : ''} onClick={() => setMobileTab('cuenta')}>
              Cuenta <em>{comandaNueva.length + cuentaActual.length}</em>
            </button>
          </div>
        </div>
      )}

      <ProductoGrid
        productos={productos}
        cargando={cargando}
        categoriaActiva={categoriaActiva}
        busqueda={busqueda}
        onBuscarChange={setBusqueda}
        onCategoriaChange={setCategoriaActiva}
        onAgregarProducto={agregarProducto}
        onVolver={alVolver}
        apiUrl={urlBase}
        formatearRD={formatearRD}
        isMobile={isMobile}
        mobileTab={mobileTab}
        cantidades={cantidadesPorProducto}
      />

      <PedidoTicket
        mesa={mesa}
        usuario={usuario}
        cuentaActual={cuentaActual}
        comandaNueva={comandaNueva}
        granTotal={granTotal}
        subtotalFactura={subtotalFactura}
        itbis={itbis}
        propinaLey={propinaLey}
        propinaPorcentaje={porcentajePropina(configNegocio)}
        totalAPagar={totalAPagar}
        esCajero={esCajero}
        onIncrementar={incrementarProducto}
        onRestar={restarProducto}
        onAnular={anularProductoEnviado}
        onEnviar={enviarComanda}
        enviandoComanda={enviandoComanda}
        onPreCheque={imprimirPrechequeMesa}
        onTrasladar={trasladarMesa}
        onCobrar={() => setMostrandoCobro(true)}
        formatearRD={formatearRD}
        isMobile={isMobile}
        mobileTab={mobileTab}
        comandaModo={configNegocio.comanda_modo}
      />

      {/* PRE-CHEQUE */}
      {prechequeData && (
        <TicketTermico
          datosFactura={prechequeData}
          esPrecheque={true}
          alCerrar={() => setPrechequeData(null)}
        />
      )}

      {/* PERSONALIZACIÓN DE PLATO */}
      {productoPersonalizando && (
        <div className="po-modal" role="dialog" aria-modal="true" aria-label={`Opciones de ${productoPersonalizando.nombre}`} onClick={() => setProductoPersonalizando(null)}>
          <div className="po-modal__card" onClick={(e) => e.stopPropagation()}>
            <div className="po-modal__head">
              <div>
                <span className="px-eyebrow">Opciones del plato</span>
                <h3>{productoPersonalizando.nombre}</h3>
              </div>
              <span className="po-modal__price">RD$ {formatearRD(productoPersonalizando.precio)}</span>
            </div>

            {productoPersonalizando.requiere_guarnicion && (
              <div className="po-field">
                <span>Guarnición</span>
                <div className="po-options">
                  {guarnicionesDisponibles.map((guar) => (
                    <button key={guar} type="button" className={`po-option ${guarnicionSeleccionada === guar ? 'is-active' : ''}`} onClick={() => setGuarnicionSeleccionada(guar)}>
                      {guarnicionSeleccionada === guar && <Check size={15} />}{guar}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {productoPersonalizando.requiere_termino && (
              <div className="po-field">
                <span>Término de cocción</span>
                <div className="po-options">
                  {terminosDisponibles.map((term) => (
                    <button key={term} type="button" className={`po-option ${terminoSeleccionado === term ? 'is-active' : ''}`} onClick={() => setTerminoSeleccionado(term)}>
                      {terminoSeleccionado === term && <Check size={15} />}{term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="po-field">
              <label htmlFor="po-nota">Nota para cocina <small style={{ fontWeight: 500, color: 'var(--px-ink-3)' }}>(opcional)</small></label>
              <input
                id="po-nota"
                className="po-input"
                type="text"
                value={notaEspecial}
                onChange={(e) => setNotaEspecial(e.target.value)}
                placeholder="Sin sal, salsa aparte, bien frito…"
              />
            </div>

            <div className="po-modal__actions">
              <button type="button" className="px-btn px-btn--lg" onClick={() => setProductoPersonalizando(null)}>Cancelar</button>
              <button type="button" className="px-btn px-btn--gold px-btn--lg" onClick={confirmarPersonalizacion}><Plus size={18} />Agregar a la comanda</button>
            </div>
          </div>
        </div>
      )}

      {/* COBRO Y FACTURACIÓN FISCAL */}
      {mostrandoCobro && (
        <div className="po-modal" role="dialog" aria-modal="true" aria-label={`Cobrar ${mesa.nombre_numero}`}>
          <div className="po-modal__card">
            <div className="po-modal__head">
              <div>
                <span className="px-eyebrow">Facturación</span>
                <h3>Cobrar {mesa.nombre_numero}</h3>
              </div>
              <button type="button" className="px-btn px-btn--icon px-btn--sm" onClick={() => setMostrandoCobro(false)} aria-label="Cerrar"><X size={16} /></button>
            </div>

            <div className="po-sum">
              <div><span>Subtotal</span><strong>RD$ {formatearRD(subtotalFactura)}</strong></div>
              {configNegocio.cobrar_itbis && <div><span>ITBIS</span><strong>RD$ {formatearRD(itbis)}</strong></div>}
              {configNegocio.cobrar_propina && <div><span>Propina {porcentajePropina(configNegocio)}%</span><strong>RD$ {formatearRD(propinaLey)}</strong></div>}
              <div className="po-sum__total"><span>Total a pagar</span><strong>RD$ {formatearRD(totalAPagar)}</strong></div>
            </div>

            <div className="po-field">
              <label htmlFor="po-comprobante">Comprobante fiscal DGII</label>
              <select id="po-comprobante" className="po-input" value={tipoComprobante} onChange={(e) => setTipoComprobante(e.target.value)}>
                <option value="B02">B02 · Consumidor final</option>
                <option value="B01">B01 · Crédito fiscal</option>
                <option value="e-CF">e-CF · Factura electrónica</option>
              </select>
              {tipoComprobante !== 'B02' && (
                <input className="po-input" type="text" placeholder="RNC o cédula del cliente" value={rncCliente} onChange={(e) => setRncCliente(e.target.value)} aria-label="RNC o cédula del cliente" />
              )}
            </div>

            <div className="po-field">
              <span>Método de pago</span>
              <div className="po-options">
                {opcionesCobro.map(({ id, Icono }) => (
                  <button key={id} type="button" className={`po-option ${metodoPago === id ? 'is-active' : ''}`} onClick={() => setMetodoPago(id)}>
                    <Icono size={17} />{id}
                  </button>
                ))}
              </div>
            </div>

            {metodoPago === 'Tarjeta' && (
              <div className="po-field">
                <span>Detalles de la tarjeta</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <select className="po-input" value={tarjetaMarca} onChange={(e) => setTarjetaMarca(e.target.value)} aria-label="Marca">
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="American Express">American Express</option>
                    <option value="Otra">Otra</option>
                  </select>
                  <input className="po-input" type="text" inputMode="numeric" maxLength="4" placeholder="Últimos 4 dígitos" value={tarjetaUltimos4} onChange={(e) => setTarjetaUltimos4(e.target.value)} aria-label="Últimos 4 dígitos" />
                </div>
              </div>
            )}

            {metodoPago === 'Efectivo' && (
              <div className="po-field">
                <label htmlFor="po-recibido">Monto recibido</label>
                <input
                  id="po-recibido"
                  className="po-input"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  placeholder="0.00"
                  value={montoRecibido}
                  onChange={(e) => manejarCambioMontoRecibido(e.target.value)}
                />
                <div className="po-quick">
                  <button type="button" className="px-chip" onClick={() => setMontoRecibido(String(Number(totalAPagar).toFixed(2)))}>Exacto</button>
                  {[500, 1000, 2000, 5000].filter((v) => v >= totalAPagar).slice(0, 3).map((v) => (
                    <button key={v} type="button" className="px-chip" onClick={() => setMontoRecibido(String(v))}>RD$ {v.toLocaleString('es-DO')}</button>
                  ))}
                </div>
                {montoRecibido && cambio >= 0 && (
                  <p className="po-change"><span>Cambio a devolver</span><span>RD$ {formatearRD(cambio)}</span></p>
                )}
              </div>
            )}

            <div className="po-modal__actions">
              <button type="button" className="px-btn px-btn--lg" onClick={() => setMostrandoCobro(false)}>Cancelar</button>
              <button type="button" className="px-btn px-btn--gold px-btn--lg" disabled={procesandoFactura} onClick={procesarFacturaDirecta}>
                <Receipt size={18} />{procesandoFactura ? 'Procesando…' : 'Facturar e imprimir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANULACIÓN CON AUTORIZACIÓN */}
      {anulacionPendiente && (
        <div className="po-modal" role="presentation" onClick={() => !procesandoAnulacion && setAnulacionPendiente(null)}>
          <section className="po-modal__card" role="dialog" aria-modal="true" aria-labelledby="anulacion-title" onClick={(e) => e.stopPropagation()}>
            <div className="po-modal__head">
              <div>
                <span className="px-eyebrow" style={{ color: 'var(--px-bad)' }}>Requiere supervisor</span>
                <h3 id="anulacion-title">Anular {anulacionPendiente.nombre}</h3>
              </div>
            </div>
            <p style={{ margin: '0 0 18px', fontSize: '.86rem', color: 'var(--px-ink-3)', lineHeight: 1.5 }}>
              {mesa.nombre_numero}. Esta acción queda registrada en auditoría y necesita la autorización de un supervisor.
            </p>
            <div className="po-field">
              <label htmlFor="po-motivo">Motivo</label>
              <textarea id="po-motivo" className="po-input" value={motivoAnulacion} onChange={(e) => setMotivoAnulacion(e.target.value)} autoFocus rows={3} />
            </div>
            <div className="po-field">
              <label htmlFor="po-pin-sup">PIN de supervisor</label>
              <input
                id="po-pin-sup"
                className="po-input"
                value={pinSupervisor}
                onChange={(e) => setPinSupervisor(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                type="password"
                placeholder="••••••"
              />
            </div>
            <div className="po-modal__actions">
              <button type="button" className="px-btn px-btn--lg" onClick={() => setAnulacionPendiente(null)} disabled={procesandoAnulacion}>Cancelar</button>
              <button type="button" className="px-btn px-btn--danger px-btn--lg" style={{ flex: 1.4 }} onClick={confirmarAnulacion} disabled={procesandoAnulacion}>
                {procesandoAnulacion ? 'Validando…' : 'Confirmar anulación'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default MenuPedido;
