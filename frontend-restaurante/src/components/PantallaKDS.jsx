import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toastError, toastExito } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';
import { obtenerSesion } from '../api.js';
import { obtenerDeviceId } from '../utils/dispositivo.js';

function reproducirAlertaComanda() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
  const [confirmData, setConfirmData] = useState(null);
  const conteoPrevio = useRef(0);
  const esBar = tipo === 'Bar';

  const cargarPedidos = useCallback(async () => {
    try {
      const token = obtenerSesion();
      const devId = obtenerDeviceId();
      const headers = { 'X-Device-ID': devId };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${apiUrl}/api/kds/${tipo}/pedidos?token=${encodeURIComponent(token || '')}&deviceId=${encodeURIComponent(devId || '')}`, {
        headers,
      });
      if (!res.ok) throw new Error('No se pudieron cargar los pedidos.');
      const data = await res.json();
      const agrupados = data.reduce((acc, item) => {
        if (!acc[item.mesa]) acc[item.mesa] = [];
        acc[item.mesa].push(item);
        return acc;
      }, {});

      const totalItems = data.length;
      if (totalItems > conteoPrevio.current && conteoPrevio.current > 0) {
        reproducirAlertaComanda();
      }
      conteoPrevio.current = totalItems;

      setPedidosPorMesa(agrupados);
      setActualizadoEn(new Date());
    } catch (error) {
      console.error('Error cargando pedidos KDS', error);
    }
  }, [apiUrl, tipo]);

  useEffect(() => {
    let eventSource = null;
    let pollingInterval = null;
    let reconnectTimeout = null;
    let conectado = true;

    const conectarSSE = () => {
      if (!conectado) return;
      try {
        if (eventSource) eventSource.close();
        const token = obtenerSesion();
        const devId = obtenerDeviceId();
        const sseUrl = `${apiUrl}/api/kds/stream?token=${encodeURIComponent(token || '')}&deviceId=${encodeURIComponent(devId || '')}`;
        eventSource = new EventSource(sseUrl);

        eventSource.onmessage = (e) => {
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

      const res = await fetch(`${apiUrl}/api/kds/despachar/${idDetalle}?token=${encodeURIComponent(token || '')}&deviceId=${encodeURIComponent(devId || '')}`, {
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
            const res = await fetch(`${apiUrl}/api/kds/despachar/${item.detalle_id}?token=${encodeURIComponent(token || '')}&deviceId=${encodeURIComponent(devId || '')}`, {
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

  return (
    <>
      <main className={`kds-board ${esBar ? 'kds-board--bar' : 'kds-board--cocina'}`}>
        <header className="kds-board__header">
          <div className="kds-board__brand">
            <span>{esBar ? '🍸' : '👨‍🍳'}</span>
            <div>
              <p>{esBar ? 'Servicio de Bebidas y Barra' : 'Producción de Cocina y Platos'}</p>
              <h1>{esBar ? 'KDS Bar & Coctelería' : 'KDS Cocina & Comandas'}</h1>
            </div>
          </div>
          <div className="kds-board__metrics">
            <div>
              <strong>{pedidos.length}</strong>
              <span>Mesas</span>
            </div>
            <div>
              <strong>{pendientes}</strong>
              <span>Pendientes</span>
            </div>
            <div className="kds-board__live">
              <i style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00f576', display: 'inline-block', marginRight: '6px' }} />
              En vivo
            </div>
            <button
              onClick={() => { reproducirAlertaComanda(); toastExito('Sonido de campana activado.'); }}
              title="Probar sonido de comanda"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer' }}
            >
              🔔
            </button>
            <button onClick={alSalir}>← Salir</button>
          </div>
        </header>

        <section className="kds-board__subheader">
          <span>Pedidos ordenados por tiempo de espera</span>
          <span>{actualizadoEn ? `Actualizado ${actualizadoEn.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Actualizando…'}</span>
        </section>

        <section className="kds-board__content">
          {pedidos.length === 0 ? (
            <div className="kds-board__empty">
              <span>{esBar ? '🍸' : '✨'}</span>
              <h2>{esBar ? 'No hay bebidas pendientes' : 'No hay pedidos pendientes'}</h2>
              <p>{esBar ? 'El bar está al día.' : 'La cocina está al día.'}</p>
            </div>
          ) : (
            <div className="kds-board__grid">
              {pedidos.map(({ mesa, items, minutos }) => {
                const prioridad = minutos >= 20 ? 'critica' : minutos >= 10 ? 'atencion' : 'normal';
                const colorTiempo = minutos >= 20 ? '#ef4444' : minutos >= 10 ? '#f5b842' : '#00f576';
                return (
                  <article key={mesa} className={`kds-order kds-order--${prioridad}`} style={{ borderTop: `4px solid ${colorTiempo}` }}>
                    <header>
                      <div>
                        <span>Mesa</span>
                        <h2>{mesa}</h2>
                      </div>
                      <strong className="kds-order__time" style={{ color: colorTiempo }}>
                        ⏱️ {minutos} min
                      </strong>
                    </header>
                    <ul>
                      {items.map((item) => (
                        <li key={item.detalle_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className="kds-order__qty" style={{ fontWeight: 800, color: 'var(--gold, #f5b842)' }}>{item.cantidad}×</span>
                              <strong>{item.producto}</strong>
                            </div>
                            {(item.notas || item.guarnicion || item.termino) && (
                              <div style={{ fontSize: '0.78rem', color: '#93c5fd', marginTop: '3px', paddingLeft: '22px' }}>
                                {item.termino && <span style={{ marginRight: '6px' }}>🥩 {item.termino}</span>}
                                {item.guarnicion && <span style={{ marginRight: '6px' }}>🥗 {item.guarnicion}</span>}
                                {item.notas && <span>📝 {item.notas}</span>}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => despacharItem(item.detalle_id)}
                            style={{ background: 'rgba(0,245,118,0.15)', color: '#00f576', border: '1px solid rgba(0,245,118,0.3)', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Listo ✓
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button className="kds-order__complete" onClick={() => despacharMesaCompleta(items)}>
                      ✓ Despachar mesa completa
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
