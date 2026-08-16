import { useCallback, useEffect, useMemo, useState } from 'react';
import { toastError } from './Toast.jsx';
import ConfirmModal from './ConfirmModal';

function PantallaKDS({ tipo = 'Cocina', alSalir, apiUrl }) {
  const [pedidosPorMesa, setPedidosPorMesa] = useState({});
  const [actualizadoEn, setActualizadoEn] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const esBar = tipo === 'Bar';

  const cargarPedidos = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/api/kds/${tipo}/pedidos`);
      if (!res.ok) throw new Error('No se pudieron cargar los pedidos.');
      const data = await res.json();
      const agrupados = data.reduce((acc, item) => {
        if (!acc[item.mesa]) acc[item.mesa] = [];
        acc[item.mesa].push(item);
        return acc;
      }, {});
      setPedidosPorMesa(agrupados);
      setActualizadoEn(new Date());
    } catch (error) {
      console.error('Error cargando pedidos KDS', error);
    }
  }, [apiUrl, tipo]);

  useEffect(() => {
    let eventSource;
    let pollingInterval;
    let reconnectTimeout;
    let conectado = true;
    const conectarSSE = () => {
      try {
        eventSource = new EventSource(`${apiUrl}/api/kds/stream`);
        eventSource.onmessage = cargarPedidos;
        eventSource.onerror = () => {
          eventSource?.close();
          if (conectado) reconnectTimeout = window.setTimeout(conectarSSE, 10000);
        };
      } catch { /* El polling mantiene la pantalla operativa. */ }
    };
    cargarPedidos();
    conectarSSE();
    pollingInterval = window.setInterval(cargarPedidos, 15000);
    return () => { conectado = false; clearInterval(pollingInterval); clearTimeout(reconnectTimeout); eventSource?.close(); };
  }, [apiUrl, cargarPedidos]);

  const despacharItem = async (idDetalle) => {
    try {
      const res = await fetch(`${apiUrl}/api/kds/despachar/${idDetalle}`, { method: 'PUT' });
      if (!res.ok) throw new Error('No se pudo despachar el pedido.');
      await cargarPedidos();
    } catch { toastError('No fue posible marcar el pedido como listo.'); }
  };

  const despacharMesaCompleta = async (items) => {
    const mensaje = esBar ? '¿Marcar todas las bebidas de esta mesa como listas?' : '¿Marcar todos los platos de esta mesa como listos?';
    setConfirmData({ mensaje, onConfirm: async () => {
      try {
        await Promise.all(items.map(async (item) => {
          const res = await fetch(`${apiUrl}/api/kds/despachar/${item.detalle_id}`, { method: 'PUT' });
          if (!res.ok) throw new Error();
        }));
        await cargarPedidos();
      } catch { toastError('Algunos artículos no se pudieron actualizar.'); }
    }});
  };

  const minutosEspera = (horaIso) => Math.max(0, Math.floor((Date.now() - new Date(horaIso)) / 60000));
  const pedidos = useMemo(() => Object.entries(pedidosPorMesa).map(([mesa, items]) => ({ mesa, items, minutos: minutosEspera(items[0].hora_pedido) })).sort((a, b) => b.minutos - a.minutos), [pedidosPorMesa]);
  const pendientes = pedidos.reduce((total, pedido) => total + pedido.items.length, 0);

  return <><main className={`kds-board ${esBar ? 'kds-board--bar' : 'kds-board--cocina'}`}>
    <header className="kds-board__header">
      <div className="kds-board__brand"><span>{esBar ? '◇' : '♨'}</span><div><p>{esBar ? 'Servicio de bebidas' : 'Producción de cocina'}</p><h1>{esBar ? 'Panel de bar' : 'Pantalla de cocina'}</h1></div></div>
      <div className="kds-board__metrics"><div><strong>{pedidos.length}</strong><span>mesas</span></div><div><strong>{pendientes}</strong><span>pendientes</span></div><div className="kds-board__live"><i /> En vivo</div><button onClick={alSalir}>← Salir</button></div>
    </header>
    <section className="kds-board__subheader"><span>Pedidos ordenados por tiempo de espera</span><span>{actualizadoEn ? `Actualizado ${actualizadoEn.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}` : 'Actualizando…'}</span></section>
    <section className="kds-board__content">
      {pedidos.length === 0 ? <div className="kds-board__empty"><span>{esBar ? '◇' : '♨'}</span><h2>{esBar ? 'No hay bebidas pendientes' : 'No hay pedidos pendientes'}</h2><p>{esBar ? 'El bar está al día.' : 'La cocina está al día.'}</p></div> : <div className="kds-board__grid">
        {pedidos.map(({ mesa, items, minutos }) => {
          const prioridad = minutos >= 15 ? 'critica' : minutos >= 10 ? 'atencion' : 'normal';
          return <article key={mesa} className={`kds-order kds-order--${prioridad}`}>
            <header><div><span>Mesa</span><h2>{mesa}</h2></div><strong className="kds-order__time">◷ {minutos} min</strong></header>
            <ul>{items.map((item) => <li key={item.detalle_id}><span className="kds-order__qty">{item.cantidad}×</span><strong>{item.producto}</strong><button onClick={() => despacharItem(item.detalle_id)}>Listo</button></li>)}</ul>
            <button className="kds-order__complete" onClick={() => despacharMesaCompleta(items)}>Marcar mesa completa</button>
          </article>;
        })}
      </div>}
    </section>
  </main>
  {confirmData && <ConfirmModal mensaje={confirmData.mensaje} onConfirm={async () => { await confirmData.onConfirm(); setConfirmData(null); }} onCancel={() => setConfirmData(null)} />}
  </>;
}

export default PantallaKDS;
