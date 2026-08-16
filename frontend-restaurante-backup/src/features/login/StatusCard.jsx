export default function StatusCard({ status, label, host }) {
  const isOnline = status === 'online';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 16px',
      borderRadius: 'var(--radius-md)',
      background: 'var(--bg-card)',
      border: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        width: '10px',
        height: '10px',
        borderRadius: '50%',
        background: isOnline ? 'var(--green)' : 'var(--red)',
        boxShadow: isOnline ? 'var(--green-glow)' : 'var(--red-glow)',
        animation: isOnline ? 'pulse 2s infinite' : 'none',
      }} />
      <div>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--white)' }}>
          {isOnline ? 'Servidor Online' : 'Sin Conexión'}
        </div>
        {host && (
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{host}</div>
        )}
      </div>
    </div>
  );
}
