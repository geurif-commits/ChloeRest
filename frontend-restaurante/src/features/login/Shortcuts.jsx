export default function Shortcuts({ onCocina, onBar }) {
  return (
    <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
      <button
        onClick={onCocina}
        style={{
          flex: 1,
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'var(--bg-card)',
          color: 'var(--white)',
          cursor: 'pointer',
          transition: 'all var(--anim-fast)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-card-hover)';
          e.currentTarget.style.borderColor = 'var(--gold)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-card)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        }}
      >
        <span style={{ fontSize: '1.5rem' }}>🍳</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Cocina</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Ver pedidos</span>
      </button>
      <button
        onClick={onBar}
        style={{
          flex: 1,
          padding: '14px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(255,255,255,0.06)',
          background: 'var(--bg-card)',
          color: 'var(--white)',
          cursor: 'pointer',
          transition: 'all var(--anim-fast)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '6px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-card-hover)';
          e.currentTarget.style.borderColor = 'var(--gold)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-card)';
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
        }}
      >
        <span style={{ fontSize: '1.5rem' }}>🍸</span>
        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Bar</span>
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>Ver pedidos</span>
      </button>
    </div>
  );
}
