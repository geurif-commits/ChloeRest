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
