/**
 * @file Tickets efímeros de un solo uso para los streams SSE (item 9).
 * Evita exponer el token de sesión en la URL (?token=), que queda en logs de
 * proxy/historial. El cliente pide un ticket por header y lo usa en el SSE.
 */

import crypto from 'node:crypto';

export interface ISseTicket {
  empresaId: number | null;
  userId: number;
  nombre: string;
  userRole: string;
  isDueno: boolean;
  exp: number;
}

const tickets = new Map<string, ISseTicket>();
const TTL_MS = 60_000;

function limpiar(): void {
  const now = Date.now();
  for (const [k, v] of tickets) {
    if (v.exp <= now) {tickets.delete(k);}
  }
}

export function crearTicketSse(ctx: Omit<ISseTicket, 'exp'>): string {
  limpiar();
  const ticket = crypto.randomBytes(24).toString('base64url');
  tickets.set(ticket, { ...ctx, exp: Date.now() + TTL_MS });
  return ticket;
}

/** Consume el ticket (un solo uso): devuelve el contexto o null si inválido. */
export function consumirTicketSse(ticket: string | null | undefined): ISseTicket | null {
  if (!ticket) {return null;}
  const v = tickets.get(ticket);
  if (!v) {return null;}
  tickets.delete(ticket);
  if (v.exp <= Date.now()) {return null;}
  return v;
}
