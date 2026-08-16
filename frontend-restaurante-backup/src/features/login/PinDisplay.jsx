export default function PinDisplay({ pin, maxLength = 4 }) {
  return (
    <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', margin: '24px 0' }}>
      {Array.from({ length: maxLength }).map((_, i) => (
        <div
          key={i}
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: pin.length > i ? '2px solid var(--gold)' : '2px solid var(--white)',
            backgroundColor: pin.length > i ? 'var(--gold)' : 'transparent',
            transition: 'all 200ms ease',
            boxShadow: pin.length > i ? 'var(--shadow-glow)' : 'none',
          }}
        />
      ))}
    </div>
  );
}
