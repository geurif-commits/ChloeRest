import { useEffect, useRef } from 'react';

export default function ConfirmModal({ mensaje, onConfirm, onCancel, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', variante = 'danger' }) {
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  const colorMap = { danger: 'var(--red)', warning: 'var(--orange)', info: 'var(--blue)' };
  const accent = colorMap[variante] || colorMap.danger;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-msg">{mensaje}</p>
        <div className="confirm-actions">
          <button ref={cancelRef} className="confirm-btn confirm-btn-cancel" onClick={onCancel}>{textoCancelar}</button>
          <button className="confirm-btn confirm-btn-ok" style={{ background: accent }} onClick={onConfirm}>{textoConfirmar}</button>
        </div>
      </div>
    </div>
  );
}
