export function sanitizarDecimal(valor) {
  const texto = String(valor ?? '').replace(/,/g, '.')
  let resultado = ''
  let puntoUsado = false
  for (const ch of texto) {
    if (ch >= '0' && ch <= '9') {
      resultado += ch
    } else if (ch === '.' && !puntoUsado) {
      resultado += ch
      puntoUsado = true
    }
  }
  return resultado
}

export function sanitizarEntero(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

// Redondea a 2 decimales evitando errores de punto flotante (0.1 + 0.2 !== 0.3)
export function redondearMoneda(valor) {
  return Math.round((Number(valor || 0) + Number.EPSILON) * 100) / 100
}

// Convierte a centevos enteros para cálculos precisos sin floats
export function aCentevos(valor) {
  return Math.round(Number(valor || 0) * 100)
}

// Convierte centevos de vuelta a pesos
export function deCentevos(centevos) {
  return Math.round(Number(centevos || 0)) / 100
}
