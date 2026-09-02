// Helpers compartidos del servidor (puros, sin estado de Express).
// Extraídos de server.js para permitir la modularización en routers.

// Envuelve un handler async y reenvía los errores al middleware global.
export function route(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

// Error HTTP con código de estado (lo interpreta el middleware global).
export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Entero positivo validado; lanza 400 si no lo es.
export function positiveInteger(value, field) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) throw httpError(400, `${field} no es válido.`);
  return numeric;
}

// Redondea a 2 decimales sin errores de coma flotante.
export function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// IP del cliente desde la petición.
export function clientIp(req) {
  return req.ip || req.socket.remoteAddress || null;
}

// Parsea una línea CSV respetando comillas dobles.
export function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}
