import { useState, useEffect } from 'react';
import TicketTermico from './TicketTermico';
import ProductoGrid from './pedido/ProductoGrid.jsx';
import PedidoTicket from './pedido/PedidoTicket.jsx';
import { obtenerSesion } from '../api.js';
import { sanitizarDecimal } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';
import './pedido-modern.css';
import './pedido/pedido.css';

function MenuPedido({ mesa, usuario, alVolver, apiUrl }) {
  const urlBase = apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [productos, setProductos] = useState([]);
  const [comandaNueva, setComandaNueva] = useState([]);
  const [cuentaActual, setCuentaActual] = useState([]);
  const [cargando, setCargando] = useState(true);
  
  // Filtros de categoría y búsqueda
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');
  const [busqueda, setBusqueda] = useState('');
  
  // Configuración del negocio (Nombre, RNC, ITBIS / Propina)
  const [configNegocio, setConfigNegocio] = useState({ 
    nombre: 'ChloeRestaurant',
    rnc: '130000001',
    direccion: 'República Dominicana',
    telefono: '',
    logo_url: '',
    cobrar_itbis: true, 
    cobrar_propina: true 
  });

  // Estado para impresión de Pre-cheque por Camareros
  const [prechequeData, setPrechequeData] = useState(null);
  
  const [mobileTab, setMobileTab] = useState('menu');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
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

  const METODOS_PAGO = ['Efectivo', 'Tarjeta', 'Transferencia'];

  const esCajero = usuario.rol === 'Cajero' || usuario.rol === 'Administrador';

  const formatearRD = (val) => {
    return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const cargarDatos = async () => {
    try {
      const resMenu = await fetch(`${urlBase}/api/productos`);
      if (!resMenu.ok) throw new Error("Error al conectar con el servidor de productos.");
      setProductos(await resMenu.json());

      const resCuenta = await fetch(`${urlBase}/api/mesas/${mesa.id}/cuenta`);
      if (!resCuenta.ok) throw new Error("Error al conectar con el servidor de cuentas.");
      setCuentaActual(await resCuenta.json());
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
        nombre: data.nombre_comercial || data.nombre || 'ChloeRestaurant',
        rnc: data.rnc || '130000001',
        direccion: data.direccion || 'República Dominicana',
        telefono: data.telefono || '',
        logo_url: data.logo_url || '',
        cobrar_itbis: data.cobrar_itbis ?? true,
        cobrar_propina: data.cobrar_propina ?? true
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
    setComandaNueva((prev) => {
      const existe = prev.find(item => item.id === prod.id);
      if (existe) {
        return prev.map(item => item.id === prod.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, { ...prod, cantidad: 1 }];
    });
  };

  const restarProducto = (id) => {
    setComandaNueva((prev) => {
      const existe = prev.find(item => item.id === id);
      if (existe.cantidad === 1) {
        return prev.filter(item => item.id !== id);
      }
      return prev.map(item => item.id === id ? { ...item, cantidad: item.cantidad - 1 } : item);
    });
  };

  const enviarComanda = async () => {
    if (comandaNueva.length === 0) return;

    try {
      const res = await fetch(`${urlBase}/api/mesas/${mesa.id}/pedidos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          camarero_id: usuario.id,
          productos: comandaNueva.map(item => ({
            producto_id: item.id,
            cantidad: item.cantidad
          }))
        })
      });

      if (res.ok) {
        setComandaNueva([]);
        cargarDatos();
        toastAviso("🛎️ Comanda enviada a Cocina/Bar correctamente.");
      } else {
        const errorData = await res.json();
        toastAviso(`❌ Error al enviar comanda: ${errorData.error}`);
      }
    } catch (error) {
      toastAviso("⚠️ Error de conexión con el servidor.");
    }
  };

  const anularProductoEnviado = async (itemCuenta) => {
    const motivo = window.prompt(`Anular ${itemCuenta.nombre} (Mesa ${mesa.nombre_numero}).\nIngrese el motivo de anulación:`);
    if (motivo === null) return;
    if (!motivo.trim()) return toastAviso("⚠️ Debes especificar el motivo de la anulación.");

    const supervisorPin = window.prompt("Ingrese el PIN de supervisor para autorizar la anulación:");
    if (supervisorPin === null) return;

    try {
      const authRes = await fetch(`${urlBase}/api/autorizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${obtenerSesion()}` },
        body: JSON.stringify({ detalle_id: itemCuenta.id, pin: supervisorPin })
      });

      if (!authRes.ok) {
        const authData = await authRes.json();
        return toastAviso(`❌ Error de autorización: ${authData.error || 'No autorizado'}`);
      }

      const authData = await authRes.json();
      const token = authData.token;

      const res = await fetch(`${urlBase}/api/cuenta_detalles/${itemCuenta.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${obtenerSesion()}`,
          'X-Supervisor-Authorization': token
        },
        body: JSON.stringify({ motivo: motivo.trim() })
      });

      const data = await res.json();
      if (res.ok) {
        toastAviso("✅ Producto anulado de la cuenta.");
        cargarDatos();
      } else {
        toastAviso(`❌ Error al anular: ${data.error}`);
      }
    } catch (error) {
      toastAviso("⚠️ Error de conexión con el servidor.");
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
    } catch (error) {
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
      itbis: configNegocio.cobrar_itbis ? totalOriginal * 0.18 : 0,
      propina: configNegocio.cobrar_propina ? totalOriginal * 0.10 : 0,
      total: totalOriginal + (configNegocio.cobrar_itbis ? totalOriginal * 0.18 : 0) + (configNegocio.cobrar_propina ? totalOriginal * 0.10 : 0),
      fecha: new Date().toLocaleString()
    });
  };

  const manejarCambioMontoRecibido = (valor) => {
    setMontoRecibido(sanitizarDecimal(valor));
  };

  const procesarFacturaDirecta = async () => {
    if (metodoPago === 'Efectivo') {
      if (!montoRecibido || parseFloat(montoRecibido) < totalAPagar) {
        return toastAviso("⚠️ El monto recibido es insuficiente para completar el pago.");
      }
    } else if (metodoPago === 'Tarjeta') {
      if (!tarjetaUltimos4 || tarjetaUltimos4.length !== 4) {
        return toastAviso("⚠️ Ingresa los últimos 4 dígitos de la tarjeta.");
      }
    }

    try {
      const res = await fetch(`${urlBase}/api/mesas/${mesa.id}/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
    } catch (error) {
      toastAviso("⚠️ Error al procesar la factura.");
    }
  };

  // Cálculos de totales
  const totalOriginal = cuentaActual.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
  const totalNueva = comandaNueva.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
  const subtotalFactura = totalOriginal + totalNueva;

  const itbis = configNegocio.cobrar_itbis ? subtotalFactura * 0.18 : 0;
  const propinaLey = configNegocio.cobrar_propina ? subtotalFactura * 0.10 : 0;
  const totalAPagar = subtotalFactura + itbis + propinaLey;
  const granTotal = totalOriginal + totalNueva;

  const cambio = montoRecibido ? parseFloat(montoRecibido) - totalAPagar : 0;

  return (
    <div className="pedido-workspace" style={{
      display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100vw', height: '100vh', background: 'var(--bg-primary, #0a0a0f)', 
      color: 'var(--text-primary, #fff)', fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box',
      position: 'fixed', top: 0, left: 0, zIndex: 1000
    }}>
      
      {isMobile && (
        <>
          <div className="pedido-mobile-header">
            <button onClick={alVolver}>⬅ Volver a Mesas</button>
            <input 
              type="text" 
              placeholder="🔍 Buscar plato o bebida..." 
              value={busqueda} 
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <div className="pedido-mobile-tab-bar">
            <button className={mobileTab === 'menu' ? 'active' : ''} onClick={() => setMobileTab('menu')}>Menú</button>
            <button className={mobileTab === 'cuenta' ? 'active' : ''} onClick={() => setMobileTab('cuenta')}>
              Cuenta <span className="pedido-mobile-tab-badge">{comandaNueva.length + cuentaActual.length}</span>
            </button>
          </div>
        </>
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
        formatearRD={formatearRD}
        isMobile={isMobile}
        mobileTab={mobileTab}
      />

      <PedidoTicket
        mesa={mesa}
        usuario={usuario}
        cuentaActual={cuentaActual}
        comandaNueva={comandaNueva}
        granTotal={granTotal}
        esCajero={esCajero}
        onAgregar={agregarProducto}
        onRestar={restarProducto}
        onAnular={anularProductoEnviado}
        onEnviar={enviarComanda}
        onPreCheque={imprimirPrechequeMesa}
        onTrasladar={trasladarMesa}
        onCobrar={() => setMostrandoCobro(true)}
        onVolver={alVolver}
        formatearRD={formatearRD}
        isMobile={isMobile}
        mobileTab={mobileTab}
      />

      {/* MODAL IMPRESIÓN PRE-CHEQUE PARA CAMAREROS */}
      {prechequeData && (
        <TicketTermico 
          datosFactura={prechequeData}
          esPrecheque={true}
          alCerrar={() => setPrechequeData(null)}
        />
      )}

      {/* MODAL DE COBRO Y FACTURACIÓN FISCAL */}
      {mostrandoCobro && (
        <div style={{position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999}}>
          <div style={{background: 'var(--bg-secondary, #14141b)', border: '2px solid var(--accent, #00f576)', borderRadius: '16px', padding: '25px', width: 'min(460px, 95vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}}>
            <h2 style={{color: '#00f576', marginTop: 0}}>Cobrar {mesa.nombre_numero}</h2>
            
            <div style={{background: '#0a0a0f', padding: '14px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #2a2a38', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.9rem'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', color: '#9494ad'}}><span>Subtotal:</span><strong>RD$ {formatearRD(subtotalFactura)}</strong></div>
              {configNegocio.cobrar_itbis && (
                <div style={{display: 'flex', justifyContent: 'space-between', color: '#9494ad'}}><span>ITBIS (18%):</span><strong>RD$ {formatearRD(itbis)}</strong></div>
              )}
              {configNegocio.cobrar_propina && (
                <div style={{display: 'flex', justifyContent: 'space-between', color: '#9494ad'}}><span>Propina Ley (10%):</span><strong>RD$ {formatearRD(propinaLey)}</strong></div>
              )}
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', color: '#00f576', borderTop: '1px solid #2a2a38', paddingTop: '8px', fontWeight: '800'}}><span>Total a Pagar:</span><strong>RD$ {formatearRD(totalAPagar)}</strong></div>
            </div>

            {/* Configuración Fiscal DGII */}
            <div style={{marginBottom: '15px', textAlign: 'left'}}>
              <label style={{color: '#00f576', fontSize: '0.85rem', fontWeight: 'bold', display: 'block', marginBottom: '5px'}}>🏛️ Comprobante Fiscal DGII</label>
              <select value={tipoComprobante} onChange={(e) => setTipoComprobante(e.target.value)} style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px'}}>
                <option value="B02">B02 - Consumidor Final</option>
                <option value="B01">B01 - Crédito Fiscal</option>
                <option value="e-CF">e-CF - Factura Electrónica</option>
              </select>

              {tipoComprobante !== 'B02' && (
                <div style={{marginTop: '10px'}}>
                  <label style={{fontSize: '0.8rem', color: '#9494ad', display: 'block', marginBottom: '4px'}}>RNC o Cédula del Cliente</label>
                  <input type="text" placeholder="Ej: 131000001" value={rncCliente} onChange={(e) => setRncCliente(e.target.value)} style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px'}} />
                </div>
              )}
            </div>

            <div style={{display: 'flex', gap: '8px', marginBottom: '15px'}}>
              {METODOS_PAGO.map(m => (
                <button 
                  key={m} 
                  type="button"
                  onClick={() => setMetodoPago(m)}
                  style={{flex: 1, padding: '10px', background: metodoPago === m ? '#00f576' : '#1a1a24', color: metodoPago === m ? '#000' : '#fff', border: '1px solid #2a2a38', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}
                >
                  {m === 'Efectivo' ? '💵 ' : m === 'Tarjeta' ? '💳 ' : '🏦 '}{m}
                </button>
              ))}
            </div>

            {metodoPago === 'Tarjeta' && (
              <div style={{background: '#0a0a0f', padding: '10px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #2a2a38', textAlign: 'left'}}>
                <label style={{fontSize: '0.8rem', color: '#00f576', display: 'block', marginBottom: '5px', fontWeight: 'bold'}}>💳 Detalles de Tarjeta</label>
                <div style={{display: 'flex', gap: '10px'}}>
                  <div style={{flex: 1}}>
                    <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '3px'}}>Marca</label>
                    <select value={tarjetaMarca} onChange={(e) => setTarjetaMarca(e.target.value)} style={{width: '100%', padding: '8px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}}>
                      <option value="Visa">Visa</option>
                      <option value="Mastercard">Mastercard</option>
                      <option value="American Express">American Express</option>
                      <option value="Otra">Otra</option>
                    </select>
                  </div>
                  <div style={{flex: 1}}>
                    <label style={{fontSize: '0.75rem', color: '#9494ad', display: 'block', marginBottom: '3px'}}>Últimos 4 Dígitos</label>
                    <input type="text" maxLength="4" placeholder="Ej: 4321" value={tarjetaUltimos4} onChange={(e) => setTarjetaUltimos4(e.target.value)} style={{width: '100%', padding: '8px', background: '#14141b', color: '#fff', border: '1px solid #2a2a38', borderRadius: '6px', fontSize: '0.85rem'}} />
                  </div>
                </div>
              </div>
            )}

            {metodoPago === 'Efectivo' && (
              <div style={{marginBottom: '20px', textAlign: 'left'}}>
                <label style={{fontSize: '0.85rem', color: '#9494ad', display: 'block', marginBottom: '5px'}}>Monto Recibido ($)</label>
                <input 
                  type="text" 
                  inputMode="decimal" 
                  pattern="[0-9]*[.,]?[0-9]*" 
                  placeholder="0.00" 
                  value={montoRecibido} 
                  onChange={(e) => manejarCambioMontoRecibido(e.target.value)} 
                  style={{width: '100%', padding: '10px', background: '#0a0a0f', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px'}} 
                />
                {montoRecibido && cambio >= 0 && (
                  <p style={{color: '#00f576', marginTop: '6px', fontWeight: 'bold'}}>Cambio a devolver: RD$ {formatearRD(cambio)}</p>
                )}
              </div>
            )}

            <div style={{display: 'flex', gap: '8px'}}>
              <button onClick={() => setMostrandoCobro(false)} style={{flex: 1, padding: '12px', background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'}}>Cancelar</button>
              <button onClick={procesarFacturaDirecta} style={{flex: 1.5, padding: '12px', background: 'linear-gradient(135deg, #00f576, #00b852)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: '800', cursor: 'pointer'}}>Facturar e Imprimir</button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

export default MenuPedido;

