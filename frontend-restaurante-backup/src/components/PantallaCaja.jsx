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

import MesaGridPanel from './caja/MesaGridPanel';
import CierreView from './caja/CierreView';

function PantallaCaja({ usuario, alCerrarSesion, apiUrl }) {
  const urlBase = apiUrl;

  const [mesas, setMesas] = useState([]);
  const [mesaSeleccionada, setMesaSeleccionada] = useState(null);
  const [cuentaMesa, setCuentaMesa] = useState([]);
  const [cierreCajaData, setCierreCajaData] = useState(null);
  const [vistaActual, setVistaActual] = useState('mesas');

  // Estados para selección de camarero al abrir mesa
  const [mostrandoSelectorCamarero, setMostrandoSelectorCamarero] =
    useState(false);
  const [mesaParaAbrir, setMesaParaAbrir] = useState(null);
  const [listaCamareros, setListaCamareros] = useState([]);
  const [camareroSeleccionado, setCamareroSeleccionado] = useState(null);

  // Estados para verificación PIN al acceder a mesa ocupada
  const [mostrandoPinVerificacion, setMostrandoPinVerificacion] =
    useState(false);
  const [mesaParaVerificar, setMesaParaVerificar] = useState(null);
  const [pinVerificacion, setPinVerificacion] = useState('');
  const [verificandoPin, setVerificandoPin] = useState(false);

  const [configNegocio, setConfigNegocio] = useState({
    nombre: 'ChloeRestaurant',
    rnc: '130000001',
    direccion: 'Av. Principal, La Romana',
    telefono: '809-000-0000',
    logo_url: '',
    cobrar_itbis: true,
    cobrar_propina: true
  });

  const [cuentasBancarias, setCuentasBancarias] = useState([]);

  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [monedaPago, setMonedaPago] = useState('DOP');
  const [tasaUsd, setTasaUsd] = useState(60.00);
  const [tasaEur, setTasaEur] = useState(65.00);

  const [tipoComprobante, setTipoComprobante] = useState('B02');
  const [rncCliente, setRncCliente] = useState('');
  const [tarjetaUltimos4, setTarjetaUltimos4] = useState('');
  const [tarjetaMarca, setTarjetaMarca] = useState('Visa');

  const [pagoMixto, setPagoMixto] = useState(false);
  const [metodoPago2, setMetodoPago2] = useState('');
  const [montoPago2, setMontoPago2] = useState('');
  const [bancoPago2, setBancoPago2] = useState('');

  const [ultimaFacturaEmitida, setUltimaFacturaEmitida] = useState(null);
  const [ticketPrechequeModal, setTicketPrechequeModal] = useState(null);
  const [mostrandoTicket, setMostrandoTicket] = useState(false);
  const [montoEntregado, setMontoEntregado] = useState('');

  const [efectivoFisico, setEfectivoFisico] = useState('');
  const [usdFisicoArqueo, setUsdFisicoArqueo] = useState('');
  const [eurFisicoArqueo, setEurFisicoArqueo] = useState('');
  const [notasArqueo, setNotasArqueo] = useState('');

  const [cajaAbierta, setCajaAbierta] = useState(true);
  const [montoApertura, setMontoApertura] = useState('');
  const [notasApertura, setNotasApertura] = useState('');
  const [mostrandoModalApertura, setMostrandoModalApertura] =
    useState(false);
  const [guardandoApertura, setGuardandoApertura] = useState(false);
  const [confirmData, setConfirmData] = useState(null);
  const [cierreReciente, setCierreReciente] = useState(null);

  const formatearRD = (val) => {
    return Number(val || 0).toLocaleString('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const agruparArticulos = (listaItems = []) => {
    const mapa = new Map();

    listaItems.forEach((item) => {
      const nombre = (
        item.nombre ||
        item.producto ||
        item.descripcion ||
        'Articulo'
      ).trim();

      const precio = Number(
        item.precio ||
        item.precio_unitario ||
        0
      );

      const cantidad = Number(item.cantidad || 1);

      const key = `${nombre.toLowerCase()}_${precio}`;

      if (mapa.has(key)) {
        const exist = mapa.get(key);

        mapa.set(key, {
          ...exist,
          cantidad: exist.cantidad + cantidad
        });
      } else {
        mapa.set(key, {
          nombre,
          precio,
          cantidad
        });
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
      console.error(
        'Error al cargar tasas de divisas:',
        err
      );
    }
  };

  const guardarTasasDivisas = async () => {
    const usd = parseFloat(tasaUsd);
    const eur = parseFloat(tasaEur);

    if (isNaN(usd) || usd <= 0) {
      return toastAviso(
        'Ingrese una tasa valida para el Dolar (USD).'
      );
    }

    if (isNaN(eur) || eur <= 0) {
      return toastAviso(
        'Ingrese una tasa valida para el Euro (EUR).'
      );
    }

    try {
      const res = await fetch(`${urlBase}/api/divisas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          tasa_usd: usd,
          tasa_eur: eur
        })
      });

      const data = await res.json();

      if (res.ok) {
        toastExito(
          data.mensaje ||
            'Tasas de cambio de divisas (USD / EUR) actualizadas.'
        );
      } else {
        toastError(
          data.error ||
            data.mensaje ||
            'Error al actualizar tasas de divisas.'
        );
      }
    } catch (err) {
      toastError(
        `Error de red al actualizar tasas de divisas: ${err.message}`
      );
    }
  };

  const verificarEstadoCaja = async () => {
    try {
      const res = await fetch(`${urlBase}/api/caja/estado`);

      if (res.ok) {
        const data = await res.json();

        setCajaAbierta(data.abierta);

        if (data.abierta) {
          setMontoApertura(
            data.monto_inicial.toString()
          );
        } else {
          setMostrandoModalApertura(true);
        }
      }
    } catch (err) {
      console.error(
        'Error al verificar estado de caja:',
        err
      );
    }
  };

  const registrarAperturaCaja = async (e) => {
    if (e) e.preventDefault();

    const monto = parseFloat(montoApertura);

    if (isNaN(monto) || monto < 0) {
      return toastAviso(
        'Digita un monto inicial valido (mayor o igual a 0).'
      );
    }

    setGuardandoApertura(true);

    try {
      const res = await fetch(`${urlBase}/api/caja/apertura`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          monto_inicial: monto,
          notas: notasApertura
        })
      });

      const data = await res.json();

      if (res.ok) {
        toastExito(
          `Apertura de caja registrada correctamente. Fondo Inicial: RD$ ${formatearRD(monto)}`
        );

        setCajaAbierta(true);
        setMostrandoModalApertura(false);

        // Actualizar el resumen inmediatamente después
        // de abrir la caja.
        await cargarResumenCaja();
      } else {
        toastError(
          data.error ||
            'Error al registrar la apertura de caja.'
        );
      }
    } catch (err) {
      toastError(
        'Error de conexion al registrar la apertura de caja.'
      );
    } finally {
      setGuardandoApertura(false);
    }
  };

  const cargarMesas = async () => {
    try {
      const res = await fetch(`${urlBase}/api/mesas`);

      if (!res.ok) {
        throw new Error(
          'No se pudo conectar con el servidor de mesas.'
        );
      }

      const data = await res.json();
      setMesas(data);
    } catch (error) {
      console.error(
        'Error al cargar mesas:',
        error
      );
    }
  };

  const cargarConfiguracionNegocio = async () => {
    try {
      const res = await fetch(
        `${urlBase}/api/negocio/config`
      );

      const data = await res.json();

      setConfigNegocio({
        nombre:
          data.nombre_comercial ||
          data.nombre ||
          'ChloeRestaurant',

        rnc:
          data.rnc ||
          '130000001',

        direccion:
          data.direccion ||
          'Republica Dominicana',

        telefono:
          data.telefono ||
          '',

        logo_url:
          data.logo_url ||
          '',

        cobrar_itbis:
          data.cobrar_itbis ?? true,

        cobrar_propina:
          data.cobrar_propina ?? true
      });
    } catch (error) {
      console.error(
        'Error al cargar configuracion del negocio:',
        error
      );
    }
  };

  /*
   * IMPORTANTE:
   * Esta función solamente carga los datos del resumen.
   *
   * NO cambia vistaActual.
   *
   * De esta forma las tarjetas aparecen desde el primer
   * momento en Centro de Cuentas sin tener que entrar
   * primero en Cierre de Caja.
   */
  const cargarResumenCaja = async () => {
    try {
      const res = await fetch(
        `${urlBase}/api/reportes/cierre`
      );

      if (!res.ok) {
        throw new Error(
          'No se pudo cargar el resumen de caja.'
        );
      }

      const data = await res.json();

      setCierreCajaData(data);
    } catch (error) {
      console.error(
        'Error al cargar resumen de caja:',
        error
      );
    }
  };

  useEffect(() => {
    cargarMesas();
    cargarConfiguracionNegocio();
    verificarEstadoCaja();
    cargarTasasDivisas();
    cargarCuentasBancarias();

    // Cargar las estadísticas inmediatamente.
    // Ya NO es necesario visitar Cierre de Caja.
    cargarResumenCaja();
  }, []);

  const cargarCuentasBancarias = async () => {
    try {
      const res = await fetch(
        `${urlBase}/api/cuentas-bancarias`
      );

      if (res.ok) {
        const data = await res.json();
        setCuentasBancarias(data);
      }
    } catch {}
  };

  const seleccionarMesa = async (mesa) => {
    if (mesa.estado === 'Ocupada' && usuario?.rol !== 'Cajero' && usuario?.rol !== 'Administrador') {
      setMesaParaVerificar(mesa);
      setMostrandoPinVerificacion(true);
      setPinVerificacion('');
    } else {
      setMesaSeleccionada(mesa);
      try {
        const resCuenta = await fetch(`${urlBase}/api/mesas/${mesa.id}/cuenta`);
        const cuentaData = await resCuenta.json();
        setCuentaMesa(cuentaData);
      } catch (error) {
        console.error('Error al cargar cuenta de la mesa:', error);
      }
    }
  };

  const verificarPinMesa = async () => {
    if (!pinVerificacion || pinVerificacion.length < 4) {
      return toastAviso(
        'Ingresa tu PIN de acceso.'
      );
    }

    setVerificandoPin(true);

    try {
      const res = await fetch(
        `${urlBase}/api/login/camarero`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            pin: pinVerificacion
          })
        }
      );

      const data = await res.json();

      if (res.ok) {
        setMostrandoPinVerificacion(false);
        setPinVerificacion('');

        setMesaSeleccionada(mesaParaVerificar);

        try {
          const resCuenta = await fetch(
            `${urlBase}/api/mesas/${mesaParaVerificar.id}/cuenta`
          );

          const cuentaData =
            await resCuenta.json();

          setCuentaMesa(cuentaData);
        } catch (error) {
          console.error(
            'Error al cargar cuenta de la mesa:',
            error
          );
        }

        setMesaParaVerificar(null);
      } else {
        toastError(
          'PIN incorrecto. No puedes acceder a esta mesa.'
        );

        setPinVerificacion('');
      }
    } catch {
      toastError(
        'Error de conexión al verificar PIN.'
      );
    } finally {
      setVerificandoPin(false);
    }
  };

  const abrirMesaLibre = async () => {
    const mesasLibres = mesas.filter(
      (m) => m.estado === 'Disponible'
    );

    if (mesasLibres.length === 0) {
      toastAviso(
        'No hay mesas libres disponibles en este momento.'
      );

      return;
    }

    try {
      const res = await fetch(
        `${urlBase}/api/usuarios`
      );

      if (res.ok) {
        const data = await res.json();

        const camareros = data.filter(
          (u) =>
            u.rol === 'Camarero' &&
            u.estado === 'Activo'
        );

        setListaCamareros(camareros);
      }
    } catch {}

    setMesaParaAbrir(mesasLibres[0]);
    setCamareroSeleccionado(null);
    setMostrandoSelectorCamarero(true);
  };

  const confirmarAbrirMesa = async () => {
    if (!camareroSeleccionado) {
      return toastAviso(
        'Selecciona un camarero para asignar la mesa.'
      );
    }

    try {
      const res = await fetch(
        `${urlBase}/api/mesas/${mesaParaAbrir.id}/abrir`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            camarero_id:
              camareroSeleccionado.id
          })
        }
      );

      if (res.ok) {
        toastExito(
          `${mesaParaAbrir.nombre_numero} asignada a ${camareroSeleccionado.nombre}`
        );

        setMostrandoSelectorCamarero(false);
        setMesaParaAbrir(null);
        setCamareroSeleccionado(null);

        await cargarMesas();
      } else {
        const errData = await res.json();

        toastError(
          `Error al abrir la mesa: ${errData.error}`
        );
      }
    } catch (error) {
      toastError(
        'Error de conexion con el servidor de mesas.'
      );
    }
  };

  const subtotal = redondearMoneda(
    cuentaMesa.reduce(
      (acc, item) =>
        acc +
        Number(item.precio) *
          Number(item.cantidad),
      0
    )
  );

  const itbis = redondearMoneda(
    configNegocio.cobrar_itbis
      ? subtotal * 0.18
      : 0
  );

  const propina = redondearMoneda(
    configNegocio.cobrar_propina
      ? subtotal * 0.10
      : 0
  );

  const total = redondearMoneda(
    subtotal + itbis + propina
  );

  const montoEntregadoNum =
    parseFloat(montoEntregado || '0');

  let montoEntregadoDOP =
    montoEntregadoNum;

  if (monedaPago === 'USD') {
    montoEntregadoDOP =
      redondearMoneda(
        montoEntregadoNum * tasaUsd
      );
  }

  if (monedaPago === 'EUR') {
    montoEntregadoDOP =
      redondearMoneda(
        montoEntregadoNum * tasaEur
      );
  }

  const cambioDevolver =
    montoEntregado !== ''
      ? redondearMoneda(
          montoEntregadoDOP - total
        )
      : 0;

  const confirmarCobroFinal = async (
    datosMixto = {}
  ) => {
    if (!datosMixto.pagoMixto) {
      if (metodoPago === 'Efectivo') {
        if (montoEntregadoDOP < total) {
          return toastAviso(
            'El monto entregado es menor al total a pagar.'
          );
        }
      } else if (metodoPago === 'Tarjeta') {
        if (
          !tarjetaUltimos4 ||
          tarjetaUltimos4.length !== 4
        ) {
          return toastAviso(
            'Ingresa los ultimos 4 digitos de la tarjeta.'
          );
        }
      }
    }

    try {
      const res = await fetch(
        `${urlBase}/api/cuentas/${mesaSeleccionada.id}/cerrar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            metodo_pago: metodoPago,
            moneda_pago: monedaPago,

            monto_extranjero:
              monedaPago !== 'DOP'
                ? montoEntregadoNum
                : 0,

            tasa_cambio:
              monedaPago === 'USD'
                ? tasaUsd
                : monedaPago === 'EUR'
                  ? tasaEur
                  : 1,

            tipo_comprobante:
              tipoComprobante,

            rnc_cedula_cliente:
              rncCliente,

            monto_entregado:
              montoEntregadoDOP,

            cambio:
              cambioDevolver > 0
                ? cambioDevolver
                : 0,

            tarjeta_ultimos_4:
              tarjetaUltimos4,

            tarjeta_marca:
              tarjetaMarca,

            metodo_pago_2:
              datosMixto.metodoPago2 ||
              null,

            monto_pago_2:
              datosMixto.montoPago2 || 0,

            banco_pago_2:
              datosMixto.bancoPago2 ||
              null
          })
        }
      );

      const data = await res.json();

      if (res.ok) {
        setUltimaFacturaEmitida({
          nombreNegocio:
            configNegocio.nombre,

          rncNegocio:
            configNegocio.rnc,

          direccionNegocio:
            configNegocio.direccion,

          telefonoNegocio:
            configNegocio.telefono,

          logoUrl:
            configNegocio.logo_url,

          ncfGenerado:
            data.ncf ||
            data.comprobante,

          tipoComprobante,

          mesa:
            mesaSeleccionada.nombre_numero,

          cajero:
            usuario.nombre,

          camarero:
            mesaSeleccionada.camarero ||
            usuario.nombre,

          items:
            cuentaMesa,

          subtotal,
          itbis,
          propina,
          total,

          metodoPago,
          rncCliente,

          fecha:
            new Date().toLocaleString()
        });

        toastExito(
          `Factura emitida correctamente. NCF/Comprobante: ${data.ncf}. Total: RD$ ${formatearRD(total)}`
        );

        setMesaSeleccionada(null);
        setCuentaMesa([]);
        setMontoEntregado('');
        setRncCliente('');
        setTarjetaUltimos4('');
        setMonedaPago('DOP');

        await cargarMesas();

        // IMPORTANTE:
        // Actualizamos las tarjetas inmediatamente
        // después del cobro.
        await cargarResumenCaja();
      } else {
        toastError(data.error);
      }
    } catch (error) {
      toastError(
        'Error de conexion al procesar el cobro.'
      );
    }
  };

  const realizarArqueo = async () => {
    const dop = parseFloat(
      efectivoFisico || '0'
    );

    const usd = parseFloat(
      usdFisicoArqueo || '0'
    );

    const eur = parseFloat(
      eurFisicoArqueo || '0'
    );

    if (
      dop === 0 &&
      usd === 0 &&
      eur === 0
    ) {
      return toastAviso(
        'Ingresa el efectivo contado en gaveta (RD$, USD$ o EUR).'
      );
    }

    try {
      const res = await fetch(
        `${urlBase}/api/caja/arqueo`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            usuario_id: usuario.id,
            efectivo_contado: dop,
            usd_contado: usd,
            tasa_usd: tasaUsd,
            eur_contado: eur,
            tasa_eur: tasaEur,
            notas: notasArqueo
          })
        }
      );

      const data = await res.json();

      if (res.ok) {
        toastExito(
          `Arqueo guardado. Total Contado (RD$): RD$ ${formatearRD(data.resumen.efectivoContado)}. Diferencia: RD$ ${formatearRD(data.resumen.diferencia)}`
        );

        setEfectivoFisico('');
        setUsdFisicoArqueo('');
        setEurFisicoArqueo('');
        setNotasArqueo('');
      } else {
        toastError(data.error);
      }
    } catch (err) {
      toastError(
        'Error de red al guardar el arqueo de caja.'
      );
    }
  };

  /*
   * Esta función SÍ cambia a la vista Cierre.
   * Se usa únicamente cuando el usuario pulsa
   * "Cierre de Caja".
   */
  const cargarCierreCaja = async () => {
    try {
      const res = await fetch(
        `${urlBase}/api/reportes/cierre`
      );

      const data = await res.json();

      setCierreCajaData(data);
      setVistaActual('cierre');
    } catch (error) {
      toastError(
        'Error al generar el reporte de caja.'
      );
    }
  };

  const imprimirPreCheque = () => {
    if (!mesaSeleccionada) {
      return toastAviso(
        'Selecciona una mesa ocupada de la lista para imprimir su Estado de Cuenta.'
      );
    }

    if (cuentaMesa.length === 0) {
      return toastAviso(
        'La mesa seleccionada no tiene productos en consumo.'
      );
    }

    setTicketPrechequeModal({
      nombreNegocio:
        configNegocio.nombre,

      rncNegocio:
        configNegocio.rnc,

      direccionNegocio:
        configNegocio.direccion,

      telefonoNegocio:
        configNegocio.telefono,

      logoUrl:
        configNegocio.logo_url,

      mesa:
        mesaSeleccionada.nombre_numero,

      cajero:
        usuario.nombre,

      camarero:
        mesaSeleccionada.camarero ||
        usuario.nombre,

      items:
        cuentaMesa,

      subtotal,
      itbis,
      propina,
      total,

      fecha:
        new Date().toLocaleString()
    });
  };

  const imprimirCorteCaja = () => {
    document.body.classList.add(
      'imprimiendo-corte'
    );

    window.print();

    document.body.classList.remove(
      'imprimiendo-corte'
    );
  };

  const fechaActual =
    new Date().toLocaleDateString();

  const horaActual =
    new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

  return (
    <>
      <style>{`
        .caja-workspace {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          height: 100vh !important;
          min-height: 0 !important;
          overflow: hidden !important;
        }

        .caja-topbar {
          width: 100%;
          min-height: 64px;
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: #0f1728;
          border-bottom: 1px solid #263149;
          box-sizing: border-box;
          overflow-x: auto;
          scrollbar-width: thin;
        }

        .caja-topbar__brand {
          flex: 0 0 auto;
          color: #f5c542;
          font-size: 1rem;
          font-weight: 800;
          margin-right: 8px;
          padding-right: 16px;
          border-right: 1px solid #2a354d;
          white-space: nowrap;
        }

        .caja-topbar__user {
          flex: 0 0 auto;
          color: #8fa0bd;
          font-size: 1rem;
          white-space: nowrap;
          margin-right: 4px;
        }

        .caja-topbar__tab {
          flex: 0 0 auto;
          border: 1px solid #2c3a55;
          background: #17233a;
          color: #d8e0ee;
          border-radius: 9px;
          padding: 10px 15px;
          min-height: 40px;
          font-size: 1rem;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
          transition: 0.18s ease;
        }

        .caja-topbar__tab:hover {
          background: #20304d;
          border-color: #425574;
        }

        .caja-topbar__tab--active {
          color: #f5c542;
          border-color: #f5c542;
          background: rgba(245, 197, 66, 0.10);
        }

        .caja-topbar__logout {
          flex: 0 0 auto;
          margin-left: auto;
          border: 1px solid #ff4d5a;
          background: #ff4d5a;
          color: #fff;
          border-radius: 9px;
          padding: 10px 16px;
          min-height: 40px;
          font-size: 0.82rem;
          font-weight: 800;
          cursor: pointer;
          white-space: nowrap;
        }

        .caja-main--horizontal {
          width: 100% !important;
          min-width: 0 !important;
          height: calc(100vh - 64px) !important;
          min-height: 0 !important;
          flex: 1 1 auto !important;
        }

        /*
         * RESUMEN 1 x 4
         *
         * Las cuatro tarjetas permanecen en una sola
         * línea en escritorio.
         */
        .caja-summary-grid {
          width: 100%;
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 0 0 14px;
        }

        .caja-summary-card {
          min-width: 0;
          min-height: 92px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 6px;

          background: #14141b;
          padding: 12px 14px;

          border-radius: 10px;
          border: 1px solid #2a2a38;

          text-align: center;
          box-sizing: border-box;
        }

        .caja-summary-card--total {
          border-color: #00f576;
        }

        .caja-summary-card__label {
          color: #9494ad;
          font-size: 1.58rem;
          display: block;
          margin-bottom: 0;
        }

        .caja-summary-card__value {
          color: #00f576;
          font-weight: 800;
          font-size: 1.58rem;
        }

        /*
         * MesaGridPanel ocupa todo el ancho.
         */
        .caja-mesas-section {
          width: 100%;
          min-width: 0;
          flex: 1 1 auto;
        }

        .caja-mesas-section .mesa-grid-panel {
          width: 100%;
          max-width: none;
        }

        @media (max-width: 850px) {
          .caja-summary-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 500px) {
          .caja-summary-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 760px) {
          .caja-topbar {
            padding: 8px 12px;
          }

          .caja-topbar__brand,
          .caja-topbar__user {
            display: none;
          }

          .caja-topbar__logout {
            margin-left: 0;
          }
        }
      `}</style>

      <div className="caja-workspace">

        {/* =========================
            BARRA SUPERIOR
        ========================== */}
        <nav
          className="caja-topbar"
          aria-label="Navegación de caja"
        >
          <div className="caja-topbar__brand">
            Centro de Caja
          </div>

          <div className="caja-topbar__user">
            Cajero:{' '}
            {usuario?.nombre || 'Usuario'}
          </div>

          <button
            type="button"
            className={`caja-topbar__tab ${
              vistaActual === 'mesas'
                ? 'caja-topbar__tab--active'
                : ''
            }`}
            onClick={() =>
              setVistaActual('mesas')
            }
          >
            Centro de Cuentas
          </button>

          <button
            type="button"
            className={`caja-topbar__tab ${
              vistaActual === 'historial'
                ? 'caja-topbar__tab--active'
                : ''
            }`}
            onClick={() =>
              setVistaActual('historial')
            }
          >
            Historial de Facturas
          </button>

          {/* Fondo Inicial se mantiene arriba */}
          <button
            type="button"
            className="caja-topbar__tab"
            onClick={() => {
              setVistaActual('mesas');
              setMostrandoModalApertura(true);
            }}
          >
            Fondo Inicial: RD${' '}
            {formatearRD(montoApertura)}
          </button>

          <button
            type="button"
            className={`caja-topbar__tab ${
              vistaActual === 'cierre'
                ? 'caja-topbar__tab--active'
                : ''
            }`}
            onClick={cargarCierreCaja}
          >
            Cierre de Caja
          </button>

          <button
            type="button"
            className="caja-topbar__logout"
            onClick={alCerrarSesion}
          >
            🚪 Salir
          </button>
        </nav>

        {/* =========================
            CONTENIDO PRINCIPAL
        ========================== */}
        <main className="caja-main caja-main--horizontal">

          <div className="caja-main__content">

            {/* =========================
                CENTRO DE CUENTAS
            ========================== */}
            {vistaActual === 'mesas' && (
              <div
                className="caja-panels"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  justifyContent: 'flex-start',
                  width: '100%',
                  gap: '0'
                }}
              >

                {/* =========================
                    ESTADÍSTICAS 1 x 4
                ========================== */}
                {cierreCajaData && (
                  <div className="caja-summary-grid">

                    <div className="caja-summary-card">
                      <span className="caja-summary-card__label">
                        Ventas Netas
                      </span>

                      <span
                        className="caja-summary-card__value"
                      >
                        RD${' '}
                        {formatearRD(
                          cierreCajaData
                            .totalesGenerales
                            ?.subtotal
                        )}
                      </span>
                    </div>

                    <div className="caja-summary-card">
                      <span className="caja-summary-card__label">
                        ITBIS Recaudado
                      </span>

                      <span
                        className="caja-summary-card__value"
                      >
                        RD${' '}
                        {formatearRD(
                          cierreCajaData
                            .totalesGenerales
                            ?.itbis
                        )}
                      </span>
                    </div>

                    <div className="caja-summary-card">
                      <span className="caja-summary-card__label">
                        Propina Legal
                      </span>

                      <span
                        className="caja-summary-card__value"
                      >
                        RD${' '}
                        {formatearRD(
                          cierreCajaData
                            .totalesGenerales
                            ?.propina
                        )}
                      </span>
                    </div>

                    <div
                      className="
                        caja-summary-card
                        caja-summary-card--total
                      "
                    >
                      <span className="caja-summary-card__label">
                        Total Ingresos
                      </span>

                      <span
                        className="caja-summary-card__value"
                      >
                        RD${' '}
                        {formatearRD(
                          cierreCajaData
                            .totalesGenerales
                            ?.total
                        )}
                      </span>
                    </div>

                  </div>
                )}

                {/* =========================
                    MESAS OCUPADAS
                ========================== */}
                <div className="caja-mesas-section">
                  <MesaGridPanel
                    mesas={mesas}
                    onSeleccionarMesa={
                      seleccionarMesa
                    }
                    onAbrirMesaLibre={
                      abrirMesaLibre
                    }
                  />
                </div>

              </div>
            )}

            {/* =========================
                CIERRE DE CAJA
            ========================== */}
            {vistaActual === 'cierre' && (
              <CierreView
                cierreCajaData={cierreCajaData}
                tasaUsd={tasaUsd}
                tasaEur={tasaEur}
                onTasaUsdChange={setTasaUsd}
                onTasaEurChange={setTasaEur}
                onGuardarTasas={
                  guardarTasasDivisas
                }
                efectivoFisico={
                  efectivoFisico
                }
                usdFisicoArqueo={
                  usdFisicoArqueo
                }
                eurFisicoArqueo={
                  eurFisicoArqueo
                }
                notasArqueo={
                  notasArqueo
                }
                onEfectivoChange={
                  setEfectivoFisico
                }
                onUsdChange={
                  setUsdFisicoArqueo
                }
                onEurChange={
                  setEurFisicoArqueo
                }
                onNotasChange={
                  setNotasArqueo
                }
                onArqueo={
                  realizarArqueo
                }
                onImprimir={
                  imprimirCorteCaja
                }
                onCerrarCaja={
                  async () => {
                    try {
                      const res =
                        await fetch(
                          `${urlBase}/api/caja/cierre`,
                          {
                            method: 'POST',
                            headers: {
                              'Content-Type':
                                'application/json'
                            },
                            body: JSON.stringify({
                              efectivo_contado:
                                parseFloat(
                                  efectivoFisico
                                ) || 0,

                              notas:
                                notasArqueo
                            })
                          }
                        );

                      const data =
                        await res.json();

                      if (res.ok) {
                        toastExito(
                          'Caja cerrada correctamente. Reporte del turno generado.'
                        );

                        setCajaAbierta(
                          false
                        );

                        setCierreReciente(
                          data.cierre
                        );

                        await cargarResumenCaja();
                      } else {
                        toastError(
                          data.error ||
                            'Error al cerrar la caja.'
                        );
                      }
                    } catch {
                      toastError(
                        'Error de conexión al cerrar la caja.'
                      );
                    }
                  }
                }
                cierreReciente={
                  cierreReciente
                }
                apiUrl={urlBase}
              />
            )}

            {/* =========================
                HISTORIAL
            ========================== */}
            {vistaActual === 'historial' && (
              <HistorialFacturas
                alVolver={() =>
                  setVistaActual('mesas')
                }
                apiUrl={urlBase}
              />
            )}

          </div>
        </main>

        {/* =========================
            TICKET DE IMPRESIÓN
        ========================== */}
        <div className="ticket-termico-impresion">

          <div
            style={{
              textAlign: 'center',
              marginBottom: '10px'
            }}
          >
            {configNegocio.logo_url && (
              <img
                src={configNegocio.logo_url}
                alt="Logo"
                style={{
                  maxHeight: '40px',
                  marginBottom: '5px'
                }}
              />
            )}

            <h3
              style={{
                margin: '0 0 2px 0',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              {configNegocio.nombre}
            </h3>

            <p
              style={{
                margin: 0,
                fontSize: '10px'
              }}
            >
              RNC: {configNegocio.rnc}
            </p>

            <h4
              style={{
                margin: '5px 0 0 0',
                fontSize: '12px',
                borderTop:
                  '1px dashed #000',
                paddingTop: '4px',
                fontWeight: 'bold'
              }}
            >
              *** ESTADO DE CUENTA ***
            </h4>

            <p
              style={{
                margin: 0,
                fontSize: '9px',
                fontStyle: 'italic'
              }}
            >
              (DOCUMENTO NO VALIDO COMO
              COMPROBANTE FISCAL)
            </p>

            <p
              style={{
                margin:
                  '4px 0 0 0',
                fontSize: '11px'
              }}
            >
              Mesa:{' '}
              <strong>
                {mesaSeleccionada
                  ? mesaSeleccionada.nombre_numero
                  : 'N/A'}
              </strong>
            </p>
          </div>

          <div
            style={{
              borderBottom:
                '1px dashed #000',
              paddingBottom: '5px',
              marginBottom: '8px',
              fontSize: '10px'
            }}
          >
            <span>
              Fecha: {fechaActual}{' '}
              Hora: {horaActual}
            </span>

            <br />

            <span>
              Mozo/Cajero:{' '}
              {usuario.nombre}
            </span>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse:
                'collapse',
              fontSize: '11px'
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom:
                    '1px solid #000'
                }}
              >
                <th
                  style={{
                    textAlign: 'center',
                    width: '30px'
                  }}
                >
                  Cant.
                </th>

                <th
                  style={{
                    textAlign: 'left'
                  }}
                >
                  Descripcion
                </th>

                <th
                  style={{
                    textAlign: 'right'
                  }}
                >
                  Total
                </th>
              </tr>
            </thead>

            <tbody>
              {agruparArticulos(
                cuentaMesa
              ).map((item, idx) => {
                const subTotItem =
                  Number(item.precio) *
                  Number(item.cantidad);

                return (
                  <tr
                    key={idx}
                    style={{
                      borderBottom:
                        '1px dotted #ccc'
                    }}
                  >
                    <td
                      style={{
                        textAlign: 'center',
                        verticalAlign:
                          'top',
                        paddingTop: '3px',
                        fontWeight:
                          'bold'
                      }}
                    >
                      {item.cantidad}
                    </td>

                    <td
                      style={{
                        textAlign: 'left',
                        verticalAlign:
                          'top',
                        paddingTop: '3px'
                      }}
                    >
                      <div
                        style={{
                          fontWeight:
                            'bold'
                        }}
                      >
                        {item.nombre}
                      </div>

                      <div
                        style={{
                          fontSize:
                            '9px',
                          color:
                            '#444'
                        }}
                      >
                        @ RD${' '}
                        {formatearRD(
                          item.precio
                        )}
                      </div>
                    </td>

                    <td
                      style={{
                        textAlign:
                          'right',
                        verticalAlign:
                          'top',
                        paddingTop:
                          '3px',
                        fontWeight:
                          'bold'
                      }}
                    >
                      RD${' '}
                      {formatearRD(
                        subTotItem
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div
            style={{
              borderTop:
                '1px dashed #000',
              marginTop: '10px',
              paddingTop: '5px',
              display: 'flex',
              flexDirection:
                'column',
              gap: '3px',
              fontSize: '11px'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between'
              }}
            >
              <span>
                Subtotal:
              </span>

              <strong>
                RD${' '}
                {formatearRD(
                  subtotal
                )}
              </strong>
            </div>

            {configNegocio.cobrar_itbis && (
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between'
                }}
              >
                <span>
                  ITBIS (18%):
                </span>

                <strong>
                  RD${' '}
                  {formatearRD(
                    itbis
                  )}
                </strong>
              </div>
            )}

            {configNegocio.cobrar_propina && (
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between'
                }}
              >
                <span>
                  Propina Legal
                  (10%):
                </span>

                <strong>
                  RD${' '}
                  {formatearRD(
                    propina
                  )}
                </strong>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                fontSize:
                  '14px',
                fontWeight:
                  'bold',
                borderTop:
                  '2px solid #000',
                paddingTop:
                  '4px',
                marginTop:
                  '4px'
              }}
            >
              <span>
                TOTAL A PAGAR:
              </span>

              <span>
                RD${' '}
                {formatearRD(
                  total
                )}
              </span>
            </div>
          </div>
        </div>

        {/* =========================
            MODAL DE COBRO (Detalles → Pago)
        ========================== */}
        {mesaSeleccionada &&
          !ticketPrechequeModal &&
          vistaActual === 'mesas' && (
            <CobroModal
              config={{
                mesa:
                  mesaSeleccionada,

                cuentaMesa,

                configNegocio,

                metodoPago,
                setMetodoPago,

                monedaPago,
                setMonedaPago,

                montoEntregado,
                setMontoEntregado,

                tarjetaUltimos4,
                setTarjetaUltimos4,

                tarjetaMarca,
                setTarjetaMarca,

                tasaUsd,
                tasaEur,

                subtotal,
                itbis,
                propina,
                total,

                onCobroExitoso:
                  confirmarCobroFinal,

                onImprimirPreCheque:
                  imprimirPreCheque,

                formatearRD,

                cuentasBancarias
              }}
              onClose={() => {
                setMesaSeleccionada(null);
                setCuentaMesa([]);
                setMontoEntregado('');
              }}
            />
          )}

        {/* =========================
            MODAL APERTURA
        ========================== */}
        {mostrandoModalApertura && (
          <AperturaModal
            montoApertura={
              montoApertura
            }
            setMontoApertura={
              setMontoApertura
            }
            notasApertura={
              notasApertura
            }
            setNotasApertura={
              setNotasApertura
            }
            cajaAbierta={
              cajaAbierta
            }
            guardandoApertura={
              guardandoApertura
            }
            onSubmit={
              registrarAperturaCaja
            }
            onClose={() =>
              setMostrandoModalApertura(
                false
              )
            }
          />
        )}

        {/* =========================
            PRECHEQUE
        ========================== */}
        {ticketPrechequeModal && (
          <TicketTermico
            datosFactura={
              ticketPrechequeModal
            }
            esPrecheque={true}
            alCerrar={() =>
              setTicketPrechequeModal(
                null
              )
            }
          />
        )}

        {/* =========================
            FACTURA
        ========================== */}
        {ultimaFacturaEmitida && (
          <TicketTermico
            datosFactura={
              ultimaFacturaEmitida
            }
            esPrecheque={false}
            alCerrar={() =>
              setUltimaFacturaEmitida(
                null
              )
            }
          />
        )}

        {/* =========================
            CONFIRM MODAL
        ========================== */}
        {confirmData && (
          <ConfirmModal
            mensaje={
              confirmData.mensaje
            }
            onConfirm={async () => {
              await confirmData.onConfirm();
              setConfirmData(null);
            }}
            onCancel={() =>
              setConfirmData(null)
            }
          />
        )}

        {/* =========================
            MODAL SELECCION CAMARERO
        ========================== */}
        {mostrandoSelectorCamarero &&
          mesaParaAbrir && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background:
                  'rgba(0,0,0,0.7)',
                display: 'flex',
                justifyContent:
                  'center',
                alignItems:
                  'center',
                zIndex: 9999
              }}
              onClick={() =>
                setMostrandoSelectorCamarero(
                  false
                )
              }
            >
              <div
                style={{
                  background:
                    '#14141b',
                  borderRadius:
                    '16px',
                  border:
                    '1px solid #2a2a38',
                  padding: '24px',
                  width: '400px',
                  maxWidth:
                    '90vw'
                }}
                onClick={(e) =>
                  e.stopPropagation()
                }
              >
                <h3
                  style={{
                    color:
                      '#00f576',
                    margin:
                      '0 0 16px 0',
                    fontSize:
                      '1.1rem'
                  }}
                >
                  🍽️ Abrir{' '}
                  {
                    mesaParaAbrir.nombre_numero
                  }
                </h3>

                <p
                  style={{
                    color:
                      '#9494ad',
                    fontSize:
                      '0.85rem',
                    margin:
                      '0 0 12px 0'
                  }}
                >
                  Selecciona el
                  camarero que
                  tomará la mesa:
                </p>

                <div
                  style={{
                    maxHeight:
                      '250px',
                    overflowY:
                      'auto',
                    display:
                      'flex',
                    flexDirection:
                      'column',
                    gap: '6px'
                  }}
                >
                  {listaCamareros.map(
                    (c) => (
                      <button
                        key={c.id}
                        onClick={() =>
                          setCamareroSeleccionado(
                            c
                          )
                        }
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: '10px',
                          padding:
                            '10px 12px',
                          background:
                            camareroSeleccionado?.id ===
                            c.id
                              ? 'rgba(0,245,118,0.15)'
                              : '#0a0a0f',
                          border:
                            camareroSeleccionado?.id ===
                            c.id
                              ? '1px solid #00f576'
                              : '1px solid #2a2a38',
                          borderRadius:
                            '8px',
                          cursor:
                            'pointer',
                          textAlign:
                            'left',
                          width:
                            '100%'
                        }}
                      >
                        <span
                          style={{
                            fontSize:
                              '1.2rem'
                          }}
                        >
                          👤
                        </span>

                        <span
                          style={{
                            color:
                              camareroSeleccionado?.id ===
                              c.id
                                ? '#00f576'
                                : '#fff',
                            fontWeight:
                              'bold',
                            fontSize:
                              '0.9rem'
                          }}
                        >
                          {c.nombre}
                        </span>
                      </button>
                    )
                  )}

                  {listaCamareros.length ===
                    0 && (
                    <p
                      style={{
                        color:
                          '#9494ad',
                        textAlign:
                          'center',
                        padding:
                          '20px'
                      }}
                    >
                      No hay
                      camareros
                      registrados.
                      Crea uno en
                      Gestión de
                      Usuarios.
                    </p>
                  )}
                </div>

                <div
                  style={{
                    display:
                      'flex',
                    gap: '8px',
                    marginTop:
                      '16px'
                  }}
                >
                  <button
                    onClick={() =>
                      setMostrandoSelectorCamarero(
                        false
                      )
                    }
                    style={{
                      flex: 1,
                      background:
                        'transparent',
                      border:
                        '1px solid #2a2a38',
                      color:
                        '#9494ad',
                      padding:
                        '10px',
                      borderRadius:
                        '8px',
                      cursor:
                        'pointer',
                      fontSize:
                        '0.9rem'
                    }}
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={
                      confirmarAbrirMesa
                    }
                    disabled={
                      !camareroSeleccionado
                    }
                    style={{
                      flex: 2,
                      background:
                        camareroSeleccionado
                          ? 'linear-gradient(135deg, #00f576, #00b852)'
                          : '#2a2a38',
                      color:
                        camareroSeleccionado
                          ? '#000'
                          : '#666',
                      border:
                        'none',
                      padding:
                        '10px',
                      borderRadius:
                        '8px',
                      fontWeight:
                        'bold',
                      cursor:
                        camareroSeleccionado
                          ? 'pointer'
                          : 'not-allowed',
                      fontSize:
                        '0.9rem'
                    }}
                  >
                    ✅ Asignar y Abrir Mesa
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* =========================
            MODAL PIN
        ========================== */}
        {mostrandoPinVerificacion &&
          mesaParaVerificar && (
            <div
              style={{
                position:
                  'fixed',
                inset: 0,
                background:
                  'rgba(0,0,0,0.7)',
                display: 'flex',
                justifyContent:
                  'center',
                alignItems:
                  'center',
                zIndex: 9999
              }}
              onClick={() => {
                setMostrandoPinVerificacion(
                  false
                );

                setPinVerificacion(
                  ''
                );
              }}
            >
              <div
                style={{
                  background:
                    '#14141b',
                  borderRadius:
                    '16px',
                  border:
                    '1px solid #2a2a38',
                  padding:
                    '24px',
                  width: '360px',
                  maxWidth:
                    '90vw',
                  textAlign:
                    'center'
                }}
                onClick={(e) =>
                  e.stopPropagation()
                }
              >
                <div
                  style={{
                    fontSize:
                      '2rem',
                    marginBottom:
                      '10px'
                  }}
                >
                  🔒
                </div>

                <h3
                  style={{
                    color:
                      '#ffb703',
                    margin:
                      '0 0 8px 0',
                    fontSize:
                      '1rem'
                  }}
                >
                  Acceso Restringido
                </h3>

                <p
                  style={{
                    color:
                      '#9494ad',
                    fontSize:
                      '0.85rem',
                    margin:
                      '0 0 16px 0'
                  }}
                >
                  Ingresa tu PIN
                  para acceder a{' '}
                  <strong
                    style={{
                      color:
                        '#fff'
                    }}
                  >
                    {
                      mesaParaVerificar.nombre_numero
                    }
                  </strong>
                </p>

                <input
                  type="password"
                  maxLength={6}
                  placeholder="••••••"
                  value={
                    pinVerificacion
                  }
                  onChange={(e) =>
                    setPinVerificacion(
                      e.target.value.replace(
                        /\D/g,
                        ''
                      )
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key ===
                      'Enter'
                    ) {
                      verificarPinMesa();
                    }
                  }}
                  autoFocus
                  style={{
                    width:
                      '120px',
                    padding:
                      '12px',
                    background:
                      '#0a0a0f',
                    color:
                      '#fff',
                    border:
                      '2px solid #2a2a38',
                    borderRadius:
                      '10px',
                    fontSize:
                      '1.5rem',
                    textAlign:
                      'center',
                    letterSpacing:
                      '8px',
                    marginBottom:
                      '16px'
                  }}
                />

                <div
                  style={{
                    display:
                      'flex',
                    gap: '8px'
                  }}
                >
                  <button
                    onClick={() => {
                      setMostrandoPinVerificacion(
                        false
                      );

                      setPinVerificacion(
                        ''
                      );
                    }}
                    style={{
                      flex: 1,
                      background:
                        'transparent',
                      border:
                        '1px solid #2a2a38',
                      color:
                        '#9494ad',
                      padding:
                        '10px',
                      borderRadius:
                        '8px',
                      cursor:
                        'pointer',
                      fontSize:
                        '0.9rem'
                    }}
                  >
                    Cancelar
                  </button>

                  <button
                    onClick={
                      verificarPinMesa
                    }
                    disabled={
                      verificandoPin
                    }
                    style={{
                      flex: 2,
                      background:
                        'linear-gradient(135deg, #ffb703, #e6a800)',
                      color:
                        '#000',
                      border:
                        'none',
                      padding:
                        '10px',
                      borderRadius:
                        '8px',
                      fontWeight:
                        'bold',
                      cursor:
                        'pointer',
                      fontSize:
                        '0.9rem'
                    }}
                  >
                    {verificandoPin
                      ? 'Verificando...'
                      : '🔓 Acceder'}
                  </button>
                </div>
              </div>
            </div>
          )}

      </div>
    </>
  );
}

export default PantallaCaja;