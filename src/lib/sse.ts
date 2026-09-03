/**
 * @file Hub Server-Sent Events (KDS y Mesas). Puerto directo de server.js:
 * mantiene conjuntos de clientes SSE y funciones para notificarlos.
 */

import type { ServerResponse } from 'node:http';

export const sseClients = new Set<ServerResponse>();
export const sseMesaClients = new Set<ServerResponse>();

function broadcast(clients: Set<ServerResponse>, payload: string): void {
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function notificarKDS(evento = 'actualizacion'): void {
  const payload = `data: ${JSON.stringify({ type: evento, time: Date.now() })}\n\n`;
  broadcast(sseClients, payload);
}

export function notificarMesas(evento = 'mesa_actualizada'): void {
  const payload = `data: ${JSON.stringify({ type: evento, time: Date.now() })}\n\n`;
  broadcast(sseMesaClients, payload);
}

// Mantener vivas las conexiones SSE en producción (evita desconexiones por proxy/timeout)
const keepAlive = setInterval(() => {
  const ping = ': ping\n\n';
  broadcast(sseClients, ping);
  broadcast(sseMesaClients, ping);
}, 20000);
keepAlive.unref();
