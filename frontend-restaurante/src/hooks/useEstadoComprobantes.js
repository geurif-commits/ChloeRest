import { useCallback, useEffect, useState } from 'react';

/**
 * Estado de los comprobantes fiscales para la caja: qué tipos se pueden emitir hoy, si el e-CF ya es obligatorio y
 * cuántos días faltan. Se vuelve a pedir al montar y cuando se llama a `recargar` (p. ej. al abrir el cobro).
 */
export function useEstadoComprobantes(apiUrl, activo = true) {
  const [estado, setEstado] = useState(null);

  const recargar = useCallback(async () => {
    if (!apiUrl) return null;
    try {
      const res = await fetch(`${apiUrl}/api/comprobantes/estado`, { cache: 'no-store' });
      if (!res.ok) return null;
      const datos = await res.json();
      setEstado(datos);
      return datos;
    } catch {
      return null; // sin conexión: la caja sigue con el último estado conocido
    }
  }, [apiUrl]);

  useEffect(() => {
    if (activo) recargar();
  }, [activo, recargar]);

  return { estado, recargar };
}
