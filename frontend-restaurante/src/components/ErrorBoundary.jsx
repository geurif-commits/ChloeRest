import { Component } from 'react';

// Error Boundary global: evita que un error de renderizado en un componente
// tumbe todo el POS. Muestra una pantalla de recuperación con opción de
// recargar, en lugar de una pantalla en blanco.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('❌ Error de renderizado capturado:', error, info?.componentStack || '');
  }

  handleRecargar = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          background: 'var(--bg-base, #070B14)',
          color: 'var(--text-primary, #F8FAFC)',
          fontFamily: 'var(--font-sans, Inter, sans-serif)',
          textAlign: 'center',
          padding: '24px',
        }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--gold, #F5B83D)' }}>
            Ocurrió un error inesperado
          </div>
          <div style={{ color: 'var(--text-secondary, #CBD5E1)', maxWidth: '480px' }}>
            El sistema encontró un problema al mostrar esta pantalla. Tus datos están a salvo.
            Recarga la aplicación para continuar.
          </div>
          <button
            onClick={this.handleRecargar}
            style={{
              marginTop: '8px',
              padding: '12px 28px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, var(--gold, #F5B83D), var(--gold-dark, #D9A030))',
              color: '#0B1020',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Recargar aplicación
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
