import { useEffect, useState } from 'react';

/**
 * Banner de actualización remota (Electron). Escucha el evento del proceso
 * principal, que consulta /api/app/version, y solicita al usuario instalar la
 * nueva versión publicada. En web no se renderiza (no hay electronPOS).
 */
export default function UpdateBanner() {
  const [info, setInfo] = useState(null);
  const [oculto, setOculto] = useState(false);

  useEffect(() => {
    const api = window.electronPOS;
    if (!api || typeof api.onActualizacionDisponible !== 'function') {return undefined;}
    const off = api.onActualizacionDisponible((data) => {
      if (data && data.disponible) {
        setInfo(data);
        setOculto(false);
      }
    });
    return () => { if (typeof off === 'function') {off();} };
  }, []);

  if (!info || oculto) {return null;}

  return (
    <div className="update-banner" role="alert">
      <span className="update-banner__text">
        Nueva versión <strong>{info.version}</strong> disponible
        {info.actual ? ` (tienes ${info.actual})` : ''}.
      </span>
      {info.downloadUrl && (
        <button
          type="button"
          className="update-banner__btn"
          onClick={() => window.electronPOS?.abrirDescargaActualizacion?.(info.downloadUrl)}
        >
          Actualizar ahora
        </button>
      )}
      <button
        type="button"
        className="update-banner__close"
        onClick={() => setOculto(true)}
        aria-label="Cerrar aviso de actualización"
      >
        ✕
      </button>
    </div>
  );
}
