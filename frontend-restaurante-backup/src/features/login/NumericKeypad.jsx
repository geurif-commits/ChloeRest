export default function NumericKeypad({ onNumber, onBackspace }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', maxWidth: '280px', margin: '0 auto' }}>
      {keys.map((key) => (
        <button
          key={key}
          onClick={() => onNumber(key)}
          style={{
            height: '64px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.06)',
            background: 'var(--bg-card)',
            color: 'var(--white)',
            fontSize: '1.4rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all var(--anim-fast)',
            boxShadow: 'var(--shadow-sm)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-card-hover)';
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--bg-card)';
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
          }}
        >
          {key}
        </button>
      ))}
      <button
        onClick={onBackspace}
        style={{
          height: '64px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid rgba(255,69,58,0.2)',
          background: 'rgba(255,69,58,0.08)',
          color: 'var(--red)',
          fontSize: '1.2rem',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all var(--anim-fast)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,69,58,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,69,58,0.08)';
        }}
      >
        ⌫
      </button>
    </div>
  );
}
