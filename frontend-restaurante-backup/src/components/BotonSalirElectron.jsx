function BotonSalirElectron({ top = '14px', right = '14px' }) {
  const esElectron =
    typeof window !== 'undefined' &&
    typeof window.electronPOS !== 'undefined' &&
    typeof window.electronPOS.salirSistema === 'function';

  if (!esElectron) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window.electronPOS?.salirSistema === 'function') {
          window.electronPOS.salirSistema();
        }
      }}
      title="Salir del sistema"
      style={{
        position: 'fixed',
        top,
        right,
        zIndex: 99999,
        width: '44px',
        height: '44px',
        borderRadius: '10px',
        background: 'rgba(18,18,23,0.85)',
        border: '1px solid #3e3e4f',
        color: '#ff5252',
        fontSize: '1.3rem',
        lineHeight: 1,
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,82,82,0.18)';
        e.currentTarget.style.borderColor = '#ff5252';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(18,18,23,0.85)';
        e.currentTarget.style.borderColor = '#3e3e4f';
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = '2px solid rgba(255,82,82,0.6)';
        e.currentTarget.style.outlineOffset = '2px';
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = 'none';
      }}
    >
      ✕
    </button>
  );
}

export default BotonSalirElectron;
