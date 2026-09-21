import { useEffect, useState } from 'react';
import { alternarTemaLocal, esTemaOscuro, temaActualId } from '../personalizacion.js';

/**
 * Tema claro/oscuro del terminal. Se sincroniza con cualquier cambio de tema en <html>
 * y recuerda la elección local (no se pierde al recargar la configuración del servidor).
 */
export function useTemaLocal() {
  const [tema, setTema] = useState(temaActualId);

  useEffect(() => {
    const obs = new MutationObserver(() => setTema(temaActualId()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-paleta'] });
    return () => obs.disconnect();
  }, []);

  return { tema, esOscuro: esTemaOscuro(tema), alternar: alternarTemaLocal };
}
