import { useState, useEffect } from 'react';

import HistorialFacturas from './HistorialFacturas';
import TicketTermico from './TicketTermico';
import CobroModal from './CobroModal';
import AperturaModal from './AperturaModal';
import ConfirmModal from './ConfirmModal';
import { sanitizarDecimal, redondearMoneda } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';
import './caja-modern.css';
import './caja/caja.css';

import CajaSidebar from './caja/CajaSidebar';
import MesaGridPanel from './caja/MesaGridPanel';
import CuentaDetallePanel from './caja/CuentaDetallePanel';
import CierreView from './caja/CierreView';

function PantallaCaja({ usuario, alCerrarSesion, apiUrl }) {
  const urlBase = apiUrl || import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const [mesas, setMesas] = useState([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);
  const [cuentaMesa, setCuentaMesa] = useState([]);
  const [cierreCajaData, setCierreCajaData] = useState(null);
  const [vistaActual, setVistaActual] = useState('mesas');

  const [configNegocio, setConfigNegocio] = useState({
    nombre: 'ChloeRestaurant',
    rnc: '130000001',
    direccion: 'Av. Principal, La Romana',
    telefono: '809-000-0000',
    logo_url: '',
    cobrar_itbis: true,
    cobrar_propina: true
  });

  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [monedaPago, setMonedaPago] = useState('DOP');
  const [tasaUsd, setTasaUsd] = useState(60.00);
  const [tasaEur, setTasaEur] = useState(65.00);

  const [tipoComprobante, setTipoComprobante] = useState('B02');
  const [rncCliente, setRncCliente] = useState('');
  const [tarjetaUltimos4, setTarjetaUltimos4] = useState('');
  const [tarjetaMarca, setTarjetaMarca] = useState('Visa');

  const [mostrandoModalCobro, setMostrandoModalCobro] = useState(false);
  const [montoEntregado, setMontoEntregado] = useState('');

  const [ultimaFacturaEmitida, setUltimaFacturaEmitida] = useState(null);
  const [ticketPrechequeModal, setTicketPrechequeModal] = useState(null);

  const [efectivoFisico, setEfectivoFisico] = useState('');
  const [usdFisicoArqueo, setUsdFisicoArqueo] = useState('');
  const [eurFisicoArqueo, setEurFisicoArqueo] = useState('');
  const [notasArqueo, setNotasArqueo] = useState('');

  const [cajaAbierta, setCajaAbierta] = useState(true);
  const [montoApertura, setMontoApertura] = useState('');
  const [notasApertura, setNotasApertura] = useState('');
  const [mostrandoModalApertura, setMostrandoModalApertura] = useState(false);
  const [guardandoApertura, setGuardandoApertura] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const formatearRD = (val) => {
    return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const agruparArticulos = (listaItems = []) => {
    const mapa = new Map();
    listaItems.forEach((item) => {
      const nombre = (item.nombre || item.producto || item.descripcion || 'Articulo').trim();
      const precio = Number(item.precio || item.precio_unitario || 0);
      const cantidad = Number(item.cantidad || 1);
      const key = `${nombre.toLowerCase()}_${precio}`;
      if (mapa.has(key)) {
        const exist = mapa.get(key);
        mapa.set(key, { ...exist, cantidad: exist.cantidad + cantidad });
      } else {
        mapa.set(key, { nombre, precio, cantidad });
      }
    });
    return Array.from(mapa.values());
  };

  const cargarTasasDivisas = async () => {
    try {
      const res = await fetch(`${urlBase}/api/divisas`);
      if (res.ok) {
        const data = await res.json();
        setTasaUsd(data.tasa_usd || 60.00);
        setTasaEur(data.tasa_eur || 65.00);
      }
    } catch (err) {
      console.error("Error al cargar tasas de divisas:", err);
    }
  };

  const guardarTasasDivisas = async () => {
    const usd = parseFloat(tasaUsd);
    const eur = parseFloat(tasaEur);
    if (isNaN(usd) || usd <= 0) return toastAviso("Ingrese una tasa valida para el Dolar (USD).");
    if (isNaN(eur) || eur <= 0) return toastAviso("Ingrese una tasa valida para el Euro (EUR).");

    try {
      const res = await fetch(`${urlBase}/api/divisas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tasa_usd: usd, tasa_eur: eur })
      });
      const data = await res.json();
      if (res.ok) {
        toastExito(data.mensaje || 'Tasas de cambio de divisas (USD / EUR) actualizadas.');
      } else {
        toastError(data.error || data.mensaje || 'Error al actualizar tasas de divisas.');
      }
    } catch (err) {
      toastError(`Error de red al actualizar tasas de divisas: ${err.message}`);
    }
  };

  const verificarEstadoCaja = async () => {
    try {
      const res = await fetch(`${urlBase}/api/caja/estado`);
      if (res.ok) {
        const data = await res.json();
        setCajaAbierta(data.abierta);
        if (data.abierta) {
          setMontoApertura(data.monto_inicial.toString());
        } else {
          setMostrandoModalApertura(true);
        }
      }
    } catch (err) {
      console.error("Error al verificar estado de caja:", err);
    }
  };

  const registrarAperturaCaja = async (e) => {
    if (e) e.preventDefault();
    const monto = parseFloat(montoApertura);
    if (isNaN(monto) || monto < 0) return toastAviso("Digita un monto inicial valido (mayor o igual a 0).");

    setGuardandoApertura(true);
    try {
      const res = await fetch(`${urlBase}/api/caja/apertura`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monto_inicial: monto,
          notas: notasApertura
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastExito(`Apertura de caja registrada correctamente. Fondo Inicial: RD$ ${formatearRD(monto)}`);
        setCajaAbierta(true);
        setMostrandoModalApertura(false);
      } else {
        toastError(data.error || 'Error al registrar la apertura de caja.');
      }
    } catch (err) {
      toastError("Error de conexion al registrar la apertura de caja.");
    } finally {
      setGuardandoApertura(false);
    }
  };

  const cargarMesas = async () => {
    try {
      const res = await fetch(`${urlBase}/api/mesas`);
      if (!res.ok) throw new Error("No se pudo conectar con el servidor de mesas.");
      const data = await res.json();
      setMesas(data);
    } catch (error) {
      console.error("Error al cargar mesas:", error);
    }
  };

  const cargarConfiguracionNegocio = async () => {
    try {
      const res = await fetch(`${urlBase}/api/negocio/config`);
      const data = await res.json();
      setConfigNegocio({
        nombre: data.nombre_comercial || data.nombre || 'ChloeRestaurant',
        rnc: data.rnc || '130000001',
        direccion: data.direccion || 'Republica Dominicana',
        telefono: data.telefono || '',
        logo_url: data.logo_url || '',
        cobrar_itbis: data.cobrar_itbis ?? true,
        cobrar_propina: data.cobrar_propina ?? true
      });
    } catch (error) {
      console.error("Error al cargar configuracion del negocio:", error);
    }
  };

  useEffect(() => {
    cargarMesas();
    cargarConfiguracionNegocio();
    verificarEstadoCaja();
    cargarTasasDivisas();
  }, []);

  const seleccionarMesa = async (mesa) => {
    setMesaSeleccionada(mesa);
    if (mesa.estado === 'Ocupada') {
      try {
        const res = await fetch(`${urlBase}/api/mesas/${mesa.id}/cuenta`);
        const data = await res.json();
        setCuentaMesa(data);
      } catch (error) {
        console.error("Error al cargar cuenta de la mesa:", error);
      }
    } else {
      setCuentaMesa([]);
    }
  };

  const abrirMesaLibre = async () => {
    const mesasLibres = mesas.filter(m => m.estado === 'Disponible');
    if (mesasLibres.length === 0) {
      toastAviso("No hay mesas libres disponibles en este momento.");
      return;
    }
    const mesaAElegir = mesasLibres[0];
    setConfirmData({ mensaje: `Deseas abrir la ${mesaAElegir.nombre_numero} y auto-asignartela?`, onConfirm: async () => {
      try {
        const res = await fetch(`${urlBase}/api/mesas/${mesaAElegir.id}/abrir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camarero_id: usuario.id })
        });
        if (res.ok) {
          await cargarMesas();
          seleccionarMesa(mesaAElegir);
        } else {
        const errData = await res.json();
        toastError(`Error al abrir la mesa: ${errData.error}`);
      }
    } catch (error) {
      toastError("Error de conexion con el servidor de mesas.");
    }
    }});
  };

  const subtotal = redondearMoneda(cuentaMesa.reduce((acc, item) => acc + (Number(item.precio) * Number(item.cantidad)), 0));
  const itbis = redondearMoneda(configNegocio.cobrar_itbis ? subtotal * 0.18 : 0);
  const propina = redondearMoneda(configNegocio.cobrar_propina ? subtotal * 0.10 : 0);
  const total = redondearMoneda(subtotal + itbis + propina);

  const montoEntregadoNum = parseFloat(montoEntregado || '0');
  let montoEntregadoDOP = montoEntregadoNum;
  if (monedaPago === 'USD') montoEntregadoDOP = redondearMoneda(montoEntregadoNum * tasaUsd);
  if (monedaPago === 'EUR') montoEntregadoDOP = redondearMoneda(montoEntregadoNum * tasaEur);
  const cambioDevolver = montoEntregado !== '' ? redondearMoneda(montoEntregadoDOP - total) : 0;

  const confirmarCobroFinal = async () => {
    if (metodoPago === 'Efectivo') {
      if (montoEntregadoDOP < total) {
        return toastAviso("El monto entregado es menor al total a pagar.");
      }
    } else if (metodoPago === 'Tarjeta') {
      if (!tarjetaUltimos4 || tarjetaUltimos4.length !== 4) {
        return toastAviso("Ingresa los ultimos 4 digitos de la tarjeta.");
      }
    }

    try {
      const res = await fetch(`${urlBase}/api/cuentas/${mesaSeleccionada.id}/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metodo_pago: metodoPago,
          moneda_pago: monedaPago,
          monto_extranjero: monedaPago !== 'DOP' ? montoEntregadoNum : 0,
          tasa_cambio: monedaPago === 'USD' ? tasaUsd : (monedaPago === 'EUR' ? tasaEur : 1),
          tipo_comprobante: tipoComprobante,
          rnc_cedula_cliente: rncCliente,
          monto_entregado: montoEntregadoDOP,
          cambio: cambioDevolver > 0 ? cambioDevolver : 0,
          tarjeta_ultimos_4: tarjetaUltimos4,
          tarjeta_marca: tarjetaMarca
        })
      });

      const data = await res.json();
      if (res.ok) {
        setUltimaFacturaEmitida({
          nombreNegocio: configNegocio.nombre,
          rncNegocio: configNegocio.rnc,
          direccionNegocio: configNegocio.direccion,
          telefonoNegocio: configNegocio.telefono,
          logoUrl: configNegocio.logo_url,
          ncfGenerado: data.ncf || data.comprobante,
          tipoComprobante,
          mesa: mesaSeleccionada.nombre_numero,
          cajero: usuario.nombre,
          camarero: mesaSeleccionada.camarero || usuario.nombre,
          items: cuentaMesa,
          subtotal,
          itbis,
          propina,
          total,
          metodoPago,
          rncCliente,
          fecha: new Date().toLocaleString()
        });

        toastExito(`Factura emitida correctamente. NCF/Comprobante: ${data.ncf}. Total: RD$ ${formatearRD(total)}`);
        setMostrandoModalCobro(false);
        setMesaSeleccionada(null);
        setCuentaMesa([]);
        setMontoEntregado('');
        setRncCliente('');
        setTarjetaUltimos4('');
        setMonedaPago('DOP');
        cargarMesas();
      } else {
        toastError(data.error);
      }
    } catch (error) {
      toastError("Error de conexion al procesar el cobro.");
    }
  };

  const realizarArqueo = async () => {
    const dop = parseFloat(efectivoFisico || '0');
    const usd = parseFloat(usdFisicoArqueo || '0');
    const eur = parseFloat(eurFisicoArqueo || '0');

    if (dop === 0 && usd === 0 && eur === 0) return toastAviso("Ingresa el efectivo contado en gaveta (RD$, USD$ o EUR).");

    try {
      const res = await fetch(`${urlBase}/api/caja/arqueo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario_id: usuario.id,
          efectivo_contado: dop,
          usd_contado: usd,
          tasa_usd: tasaUsd,
          eur_contado: eur,
          tasa_eur: tasaEur,
          notas: notasArqueo
        })
      });
      const data = await res.json();
      if (res.ok) {
        toastExito(`Arqueo guardado. Total Contado (RD$): RD$ ${formatearRD(data.resumen.efectivoContado)}. Diferencia: RD$ ${formatearRD(data.resumen.diferencia)}`);
        setEfectivoFisico('');
        setUsdFisicoArqueo('');
        setEurFisicoArqueo('');
        setNotasArqueo('');
      } else {
        toastError(data.error);
      }
    } catch (err) {
      toastError("Error de red al guardar el arqueo de caja.");
    }
  };

  const cargarCierreCaja = async () => {
    try {
      const res = await fetch(`${urlBase}/api/reportes/cierre`);
      const data = await res.json();
      setCierreCajaData(data);
      setVistaActual('cierre');
    } catch (error) {
      toastError("Error al generar el reporte de caja.");
    }
  };

  const imprimirPreCheque = () => {
    if (!mesaSeleccionada) return toastAviso("Selecciona una mesa ocupada de la lista para imprimir su Estado de Cuenta.");
    if (cuentaMesa.length === 0) return toastAviso("La mesa seleccionada no tiene productos en consumo.");

    setTicketPrechequeModal({
      nombreNegocio: configNegocio.nombre,
      rncNegocio: configNegocio.rnc,
      direccionNegocio: configNegocio.direccion,
      telefonoNegocio: configNegocio.telefono,
      logoUrl: configNegocio.logo_url,
      mesa: mesaSeleccionada.nombre_numero,
      cajero: usuario.nombre,
      camarero: mesaSeleccionada.camarero || usuario.nombre,
      items: cuentaMesa,
      subtotal,
      itbis,
      propina,
      total,
      fecha: new Date().toLocaleString()
    });
  };

  const imprimirCorteCaja = () => {
    document.body.classList.add('imprimiendo-corte');
    window.print();
    document.body.classList.remove('imprimiendo-corte');
  };

  const fechaActual = new Date().toLocaleDateString();
  const horaActual = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <>
    <div className="caja-workspace">

      <CajaSidebar
        vistaActual={vistaActual}
        onCambiarVista={setVistaActual}
        onCerrarSesion={alCerrarSesion}
        usuario={usuario}
        onCierreCaja={cargarCierreCaja}
      />

      <main className="caja-main">
        <header className="caja-main__header">
          <h1>{vistaActual === 'mesas' ? 'Control de Cuentas y Mesas' : 'Cuadre y Arqueo de Caja'}</h1>
          <button
            onClick={() => setMostrandoModalApertura(true)}
            style={{
              background: 'var(--bg-card)', color: 'var(--gold)', border: '1px solid var(--gold)',
              padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-sm)'
            }}
          >
            Fondo Inicial: RD$ {formatearRD(montoApertura)}
          </button>
        </header>

        <div className="caja-main__content">

          {vistaActual === 'mesas' && (
            <div className="caja-panels">
              <MesaGridPanel
                mesas={mesas}
                mesaSeleccionada={mesaSeleccionada}
                onSeleccionarMesa={seleccionarMesa}
                onAbrirMesaLibre={abrirMesaLibre}
              />
              <CuentaDetallePanel
                mesaSeleccionada={mesaSeleccionada}
                cuentaMesa={cuentaMesa}
                configNegocio={configNegocio}
                onCobrar={() => setMostrandoModalCobro(true)}
                onVerHistorial={() => setVistaActual('historial')}
                onImprimirPreCheque={imprimirPreCheque}
              />
            </div>
          )}

          {vistaActual === 'cierre' && (
            <CierreView
              cierreCajaData={cierreCajaData}
              tasaUsd={tasaUsd}
              tasaEur={tasaEur}
              onTasaUsdChange={setTasaUsd}
              onTasaEurChange={setTasaEur}
              onGuardarTasas={guardarTasasDivisas}
              efectivoFisico={efectivoFisico}
              usdFisicoArqueo={usdFisicoArqueo}
              eurFisicoArqueo={eurFisicoArqueo}
              notasArqueo={notasArqueo}
              onEfectivoChange={setEfectivoFisico}
              onUsdChange={setUsdFisicoArqueo}
              onEurChange={setEurFisicoArqueo}
              onNotasChange={setNotasArqueo}
              onArqueo={realizarArqueo}
              onImprimir={imprimirCorteCaja}
            />
          )}

          {vistaActual === 'historial' && (
            <HistorialFacturas alVolver={() => setVistaActual('mesas')} apiUrl={urlBase} />
          )}

        </div>
      </main>

      <div className="ticket-termico-impresion">
        <div style={{textAlign: 'center', marginBottom: '10px'}}>
          {configNegocio.logo_url && <img src={configNegocio.logo_url} alt="Logo" style={{maxHeight: '40px', marginBottom: '5px'}} />}
          <h3 style={{margin: '0 0 2px 0', fontSize: '14px', fontWeight: 'bold'}}>{configNegocio.nombre}</h3>
          <p style={{margin: 0, fontSize: '10px'}}>RNC: {configNegocio.rnc}</p>
          <h4 style={{margin: '5px 0 0 0', fontSize: '12px', borderTop: '1px dashed #000', paddingTop: '4px', fontWeight: 'bold'}}>*** ESTADO DE CUENTA ***</h4>
          <p style={{margin: 0, fontSize: '9px', fontStyle: 'italic'}}>(DOCUMENTO NO VALIDO COMO COMPROBANTE FISCAL)</p>
          <p style={{margin: '4px 0 0 0', fontSize: '11px'}}>Mesa: <strong>{mesaSeleccionada ? mesaSeleccionada.nombre_numero : 'N/A'}</strong></p>
        </div>

        <div style={{borderBottom: '1px dashed #000', paddingBottom: '5px', marginBottom: '8px', fontSize: '10px'}}>
          <span>Fecha: {fechaActual} Hora: {horaActual}</span><br/>
          <span>Mozo/Cajero: {usuario.nombre}</span>
        </div>

        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '11px'}}>
          <thead>
            <tr style={{borderBottom: '1px solid #000'}}>
              <th style={{textAlign: 'center', width: '30px'}}>Cant.</th>
              <th style={{textAlign: 'left'}}>Descripcion</th>
              <th style={{textAlign: 'right'}}>Total</th>
            </tr>
          </thead>
          <tbody>
            {agruparArticulos(cuentaMesa).map((item, idx) => {
              const subTotItem = Number(item.precio) * Number(item.cantidad);
              return (
                <tr key={idx} style={{borderBottom: '1px dotted #ccc'}}>
                  <td style={{textAlign: 'center', verticalAlign: 'top', paddingTop: '3px', fontWeight: 'bold'}}>{item.cantidad}</td>
                  <td style={{textAlign: 'left', verticalAlign: 'top', paddingTop: '3px'}}>
                    <div style={{fontWeight: 'bold'}}>{item.nombre}</div>
                    <div style={{fontSize: '9px', color: '#444'}}>@ RD$ {formatearRD(item.precio)}</div>
                  </td>
                  <td style={{textAlign: 'right', verticalAlign: 'top', paddingTop: '3px', fontWeight: 'bold'}}>RD$ {formatearRD(subTotItem)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{borderTop: '1px dashed #000', marginTop: '10px', paddingTop: '5px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between'}}>
            <span>Subtotal:</span>
            <strong>RD$ {formatearRD(subtotal)}</strong>
          </div>
          {configNegocio.cobrar_itbis && (
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>ITBIS (18%):</span>
              <strong>RD$ {formatearRD(itbis)}</strong>
            </div>
          )}
          {configNegocio.cobrar_propina && (
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>Propina Legal (10%):</span>
              <strong>RD$ {formatearRD(propina)}</strong>
            </div>
          )}
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold', borderTop: '2px solid #000', paddingTop: '4px', marginTop: '4px'}}>
            <span>TOTAL A PAGAR:</span>
            <span>RD$ {formatearRD(total)}</span>
          </div>
        </div>
      </div>

      {mostrandoModalCobro && mesaSeleccionada && (
        <CobroModal
          config={{
            mesa: mesaSeleccionada,
            cuentaMesa,
            configNegocio,
            metodoPago, setMetodoPago,
            monedaPago, setMonedaPago,
            montoEntregado, setMontoEntregado,
            tarjetaUltimos4, setTarjetaUltimos4,
            tarjetaMarca, setTarjetaMarca,
            tasaUsd, tasaEur,
            subtotal, itbis, propina, total,
            onCobroExitoso: confirmarCobroFinal,
            formatearRD
          }}
          onClose={() => { setMostrandoModalCobro(false); setMontoEntregado(""); }}
        />
      )}

      {mostrandoModalApertura && (
        <AperturaModal
          montoApertura={montoApertura}
          setMontoApertura={setMontoApertura}
          notasApertura={notasApertura}
          setNotasApertura={setNotasApertura}
          cajaAbierta={cajaAbierta}
          guardandoApertura={guardandoApertura}
          onSubmit={registrarAperturaCaja}
          onClose={() => setMostrandoModalApertura(false)}
        />
      )}

      {ticketPrechequeModal && (
        <TicketTermico
          datosFactura={ticketPrechequeModal}
          esPrecheque={true}
          alCerrar={() => setTicketPrechequeModal(null)}
        />
      )}

      {ultimaFacturaEmitida && (
        <TicketTermico
          datosFactura={ultimaFacturaEmitida}
          esPrecheque={false}
          alCerrar={() => setUltimaFacturaEmitida(null)}
        />
      )}

      {confirmData && <ConfirmModal mensaje={confirmData.mensaje} onConfirm={async () => { await confirmData.onConfirm(); setConfirmData(null); }} onCancel={() => setConfirmData(null)} />}

    </div>
    </>
  );
}

export default PantallaCaja;
