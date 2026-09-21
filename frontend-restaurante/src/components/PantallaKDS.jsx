import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, Martini, Bell, LogOut, Timer, Flame, Salad, StickyNote, Check, CheckCheck, CircleCheckBig } from 'lucide-react';
import { toastError, toastExito } from './Toast.jsx';
import './kd.css';
import ConfirmModal from './ConfirmModal';
import { obtenerSesion, obtenerTicketSse } from '../api.js';
import { obtenerDeviceId } from '../utils/dispositivo.js';

let contextoAudio = null;

function reproducirAlertaComanda() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    contextoAudio ||= new AudioCtx();
    const ctx = contextoAudio;
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    // Silenciado si el navegador aún no tiene interacción
  }
}

function PantallaKDS({ tipo = 'Cocina', alSalir, apiUrl }) {
  const [pedidosPorMesa, setPedidosPorMesa] = useState({});
  const [actualizadoEn, setActualizadoEn] = useState(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [confirmData, setConfirmData] = useState(null);
  const conteoPrevio = useRef(0);
  const idsPrevios = useRef(new Set());
  const kdsInicializado = useRef(false);
  const esBar = tipo === 'Bar';

  const cargarPedidos = useCallback(async () => {
    try {
      const token = obtenerSesion();
      const devId = obtenerDeviceId();
      const headers = { 'X-Device-ID': devId };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/kds/${tipo}/pedidos`, {
        headers,
      });
      if (res.status === 401) {
        window.dispatchEvent(new CustomEvent('pos-sesion-vencida'));
        return;
      }
      if (!res.ok) throw new Error(`No se pudieron cargar los pedidos (error ${res.status}).`);
      const data = await res.json();
      const agrupados = data.reduce((acc, item) => {
        if (!acc[item.mesa]) acc[item.mesa] = [];
        acc[item.mesa].push(item);
        return acc;
      }, {});

       const totalItems = data.length;
       const idsActuales = new Set(data.map((item) => item.detalle_id));
       const hayNuevo = kdsInicializado.current && [...idsActuales].some((id) => !idsPrevios.current.has(id));
       if (hayNuevo) {
         reproducirAlertaComanda();
       }
       conteoPrevio.current = totalItems;
       idsPrevios.current = idsActuales;
       kdsInicializado.current = true;

      setPedidosPorMesa(agrupados);
      setActualizadoEn(new Date());
      setErrorCarga('');
    } catch (error) {
      console.error('Error cargando pedidos KDS', error);
      setErrorCarga(error instanceof Error && error.message !== 'Failed to fetch' ? error.message : 'Sin conexión con el servidor. Reintentando…');
    }
  }, [apiUrl, tipo]);

  useEffect(() => {
    let eventSource = null;
    let pollingInterval = null;
    let reconnectTimeout = null;
    let conectado = true;

    const conectarSSE = async () => {
      if (!conectado) return;
      try {
        if (eventSource) eventSource.close();
        const ticket = await obtenerTicketSse(apiUrl);
        if (!ticket || !conectado) return;
        const sseUrl = `${apiUrl}/api/kds/stream?ticket=${encodeURIComponent(ticket)}`;
        eventSource = new EventSource(sseUrl);

        eventSource.onmessage = () => {
          cargarPedidos();
        };

        eventSource.onerror = () => {
          eventSource?.close();
          if (conectado) {
            reconnectTimeout = window.setTimeout(conectarSSE, 3000);
          }
        };
      } catch {
        /* Polling de respaldo mantiene la pantalla operativa */
      }
    };

    cargarPedidos();
    conectarSSE();
    pollingInterval = window.setInterval(cargarPedidos, 5000);

    return () => {
      conectado = false;
      if (pollingInterval) clearInterval(pollingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
    };
  }, [apiUrl, cargarPedidos]);

  const despacharItem = async (idDetalle) => {
    try {
      const token = obtenerSesion();
      const devId = obtenerDeviceId();
      const headers = { 'X-Device-ID': devId };
      if (token) headers['Authorization'] = `Bearer ${token}`;

       const res = await fetch(`${apiUrl}/api/kds/despachar/${idDetalle}`, {
        method: 'PUT',
        headers,
      });
      if (!res.ok) throw new Error('No se pudo despachar el pedido.');
      toastExito('Artículo marcado como listo.');
      await cargarPedidos();
    } catch {
      toastError('No fue posible marcar el pedido como listo.');
    }
  };

  const despacharMesaCompleta = async (items) => {
    const mensaje = esBar ? '¿Marcar todas las bebidas de esta mesa como listas?' : '¿Marcar todos los platos de esta mesa como listos?';
    setConfirmData({
      mensaje,
      onConfirm: async () => {
        try {
          const token = obtenerSesion();
          const devId = obtenerDeviceId();
          const headers = { 'X-Device-ID': devId };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          await Promise.all(items.map(async (item) => {
             const res = await fetch(`${apiUrl}/api/kds/despachar/${item.detalle_id}`, {
              method: 'PUT',
              headers,
            });
            if (!res.ok) throw new Error();
          }));
          toastExito('Comanda de mesa completada.');
          await cargarPedidos();
        } catch {
          toastError('Algunos artículos no se pudieron actualizar.');
        }
      }
    });
  };

  const minutosEspera = (horaIso) => Math.max(0, Math.floor((Date.now() - new Date(horaIso)) / 60000));
  const pedidos = useMemo(() => Object.entries(pedidosPorMesa).map(([mesa, items]) => ({
    mesa,
    items,
    minutos: minutosEspera(items[0]?.hora_pedido || new Date().toISOString())
  })).sort((a, b) => b.minutos - a.minutos), [pedidosPorMesa]);

  const pendientes = pedidos.reduce((total, pedido) => total + pedido.items.length, 0);

  const IconoTipo = esBar ? Martini : ChefHat;

  return (
    <>
      <main className={`kd ${esBar ? 'kd--bar' : 'kd--cocina'}`}>
        <header className="kd-head">
          <div className="kd-head__brand">
            <span className="kd-head__mark"><IconoTipo size={26} strokeWidth={1.8} /></span>
            <div>
              <span className="px-eyebrow">{esBar ? 'Servicio de bebidas' : 'Producción de cocina'}</span>
              <h1>{esBar ? 'Bar y coctelería' : 'Cocina y comandas'}</h1>
            </div>
          </div>
          <div className="kd-head__tools">
            <div className="kd-metric"><strong>{pedidos.length}</strong><span>Mesas</span></div>
            <div className="kd-metric kd-metric--hot"><strong>{pendientes}</strong><span>Pendientes</span></div>
            <span className="kd-live"><i />En vivo</span>
            <button type="button" className="px-btn px-btn--icon" onClick={() => { reproducirAlertaComanda(); toastExito('Sonido de campana activado.'); }} title="Probar sonido de comanda" aria-label="Probar sonido de comanda"><Bell size={18} /></button>
            <button type="button" className="px-btn" onClick={alSalir}><LogOut size={16} /> Salir</button>
          </div>
        </header>

        <div className="kd-sub">
          <span>Pedidos ordenados por tiempo de espera</span>
          <span>{actualizadoEn ? `Actualizado ${actualizadoEn.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Actualizando…'}</span>
        </div>

        {errorCarga && <div className="kd-alert" role="alert">{errorCarga}</div>}

        <section className="kd-body">
          {pedidos.length === 0 ? (
            <div className="kd-empty">
              <span className="kd-empty__icon"><CircleCheckBig size={34} strokeWidth={1.6} /></span>
              <h2>{esBar ? 'No hay bebidas pendientes' : 'No hay pedidos pendientes'}</h2>
              <p>{esBar ? 'El bar está al día.' : 'La cocina está al día.'}</p>
            </div>
          ) : (
            <div className="kd-grid">
              {pedidos.map(({ mesa, items, minutos }) => {
                const prioridad = minutos >= 20 ? 'critica' : minutos >= 10 ? 'atencion' : 'normal';
                return (
                  <article key={mesa} className={`kd-order kd-order--${prioridad}`}>
                    <header className="kd-order__head">
                      <div>
                        <span>Mesa</span>
                        <h2>{mesa}</h2>
                      </div>
                      <strong className="kd-order__time"><Timer size={17} />{minutos} min</strong>
                    </header>
                    <ul className="kd-order__items">
                      {items.map((item) => (
                        <li key={item.detalle_id} className="kd-item">
                          <span className="kd-item__qty">{Number(item.cantidad)}×</span>
                          <div className="kd-item__main">
                            <strong>{item.producto}</strong>
                            {(item.notas || item.guarnicion || item.termino) && (
                              <div className="kd-item__mods">
                                {item.termino && <span><Flame size={12} />{item.termino}</span>}
                                {item.guarnicion && <span><Salad size={12} />{item.guarnicion}</span>}
                                {item.notas && <span><StickyNote size={12} />{item.notas}</span>}
                              </div>
                            )}
                          </div>
                          <button type="button" className="kd-item__done" onClick={() => despacharItem(item.detalle_id)} aria-label={`Marcar ${item.producto} como listo`}>
                            <Check size={16} strokeWidth={2.6} /> Listo
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button type="button" className="kd-order__complete" onClick={() => despacharMesaCompleta(items)}>
                      <CheckCheck size={18} /> Despachar mesa completa
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
      {confirmData && (
        <ConfirmModal
          mensaje={confirmData.mensaje}
          onConfirm={async () => {
            await confirmData.onConfirm();
            setConfirmData(null);
          }}
          onCancel={() => setConfirmData(null)}
        />
      )}
    </>
  );
}

export default PantallaKDS;
