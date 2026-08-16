import { useState, useEffect, useRef } from 'react';

// ════════════════════════════════════════════════════════════════════════
// Asistente IA Nativo de Chloe Restaurant POS
// Procesamiento local sin APIs externas - 100% privado
// ════════════════════════════════════════════════════════════════════════

const CONOCIMIENTO = {
  // Respuestas pre-definidas basadas en keywords
  saludo: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'saludos'],
  despedida: ['adiós', 'adios', 'hasta luego', 'chao', 'nos vemos'],
  ayuda: ['ayuda', 'help', 'qué puedes hacer', 'que puedes hacer', 'opciones', 'comandos'],
  mesas: ['mesa', 'mesas', 'ocupada', 'disponible', 'ocupadas'],
  caja: ['caja', 'efectivo', 'dinero', 'apertura', 'cerrar caja'],
  productos: ['producto', 'productos', 'menú', 'menu', 'catálogo', 'catalogo'],
  reportes: ['reporte', 'reportes', 'ventas', 'estadísticas', 'estadisticas', 'dashboard'],
  facturas: ['factura', 'facturas', 'ncf', 'dgii', 'comprobante'],
  inventario: ['inventario', 'stock', 'ingredientes', 'insumos', 'almacén', 'almacen'],
  pedidos: ['pedido', 'pedidos', 'orden', 'ordenes', 'comanda'],
  usuarios: ['usuario', 'usuarios', 'personal', 'empleado', 'empleados', 'trabajador'],
  configuración: ['configuración', 'configuracion', 'ajustes', 'personalizar', 'tema', 'fondo'],
  servidor: ['servidor', 'server', 'conexión', 'conexion', 'red', 'internet'],
  kds: ['kds', 'cocina', 'bar', 'pantalla'],
  imprimir: ['imprimir', 'ticket', 'imprimiendo', 'impresora'],
  contraseña: ['pin', 'contraseña', 'contrasena', 'password', 'clave', 'acceso'],
};

const RESPUESTAS = {
  saludo: () => '¡Hola! 👋 Soy el asistente de Chloe Restaurant POS. Puedo ayudarte con:\n\n• **Estado de mesas y caja**\n• **Reportes y estadísticas**\n• **Configuración del sistema**n• **Navegación rápida**\n\n¿En qué puedo ayudarte?',
  despedida: () => '¡Hasta luego! 👋 Si necesitas algo más, aquí estaré.',
  ayuda: () => '📋 **Puedo ayudarte con:**\n\n🪑 **Mesas**: "¿Cuántas mesas ocupadas hay?"\n💰 **Caja**: "¿La caja está abierta?"\n📊 **Reportes**: "Muéstrate las ventas de hoy"\n📦 **Productos**: "¿Qué productos tengo?"\n⚙️ **Configuración**: "¿Cómo cambio el fondo?"\n🔧 **Sistema**: "Estado del servidor"\n\n💡 **Tips rápidos:**\n• Usa F1 para ayuda rápida\n• Escribe "ir a [sección]" para navegar',
  mesas: (data) => {
    if (data?.mesasOcupadas !== undefined) {
      return `🪑 **Estado de Mesas:**\n\n• Ocupadas: ${data.mesasOcupadas}\n• Estado: ${data.mesasOcupadas > 0 ? 'Hay mesas ocupadas' : 'Todas las mesas están libres'}\n\n💡 Ve al **Mapa de Mesas** para ver el detalle completo.`;
    }
    return '🪑 Ve al panel de **Mesas** para ver el estado actual de cada mesa.';
  },
  caja: (data) => {
    if (data?.caja) {
      return `💰 **Estado de Caja:**\n\n• Estado: ${data.caja.abierta ? '✅ Disponible' : '🔒 Cerrada'}\n• Monto inicial: RD$ ${data.caja.monto?.toFixed(2) || '0.00'}\n\n💡 Usa el panel de **Caja** para apertura y arqueo.`;
    }
    return '💰 La caja se gestiona desde el panel de administración.';
  },
  reportes: () => `📊 **Reportes disponibles:**\n\n• 📊 Reportes de Facturas (Hoy)\n• 📜 Historial de Facturas\n• 💳 Reporte por Tipo de Pago\n• 📈 Dashboard General\n\n💡 Accede desde el panel lateral en la sección **Reportes y Facturas**.`,
  productos: () => `📦 **Gestión de Productos:**\n\nDesde el panel de Productos puedes:\n• Crear y editar productos\n• Asignar precios y categorías\n• Subir imágenes\n• Importar desde CSV\n\n💡 Usa el botón "Productos" en el menú lateral.`,
  facturas: () => `🧾 **Facturación DGII:**\n\n• Secuencias NCF (B01, B02, etc.)\n• Configuración e-CF\n• Historial de comprobantes\n\n💡 Configura las secuencias NCF en el panel de administración.`,
  inventario: () => `📦 **Inventario y Almacén:**\n\n• Control de stock de ingredientes\n• Movimientos (entradas/salidas)\n• Alertas de stock bajo\n• Escandallos y recetas\n\n💡 Revisa el inventario regularmente para evitar faltantes.`,
  pedidos: () => `🛎️ **Pedidos:**\n\n• Crear pedido por mesa\n• Enviar a Cocina/Bar\n• Traslados entre mesas\n• Anular productos\n\n💡 Los pedidos aparecen automáticamente en las pantallas KDS.`,
  usuarios: () => `👥 **Gestión de Personal:**\n\n• Crear usuarios con roles:\n  - Administrador (acceso total)\n  - Cajero (cobros y caja)\n  - Camarero (toma pedidos)\n  - Cocina/Bar (KDS)\n\n💡 Cada usuario tiene su PIN de acceso.`,
  configuración: () => `⚙️ **Configuración del Sistema:**\n\n• 🎨 Personalización (logo, fondo, tema)\n• 🏢 Datos del negocio (RNC, dirección)\n• 💱 Tasas de divisa\n• 📄 Configuración DGII\n\n💡 Cambia el logo y fondo desde Personalización.`,
  servidor: (data) => {
    const online = data?.servidorOnline;
    return `🖥️ **Estado del Servidor:**\n\n• Estado: ${online ? '✅ Online' : '🔴 Offline'}\n• Base de datos: ${online ? 'Conectada' : 'Sin conexión'}\n• Versión: ${data?.version || '2.0.0'}\n\n💡 Si el servidor está offline, verifica que el backend esté corriendo.`;
  },
  kds: () => `📺 **Pantallas KDS:**\n\n• 🍳 Cocina: Pedidos pendientes de preparar\n• 🍸 Bar: Bebidas y cocteles\n\n💡 Las pantallas se actualizan en tiempo real con cada pedido.`,
  imprimir: () => `🖨️ **Impresión de Tickets:**\n\n• Pre-cheque: Estado de cuenta sin cobrar\n• Factura: Comprobante fiscal\n• Usa Ctrl+P para imprimir desde cualquier pantalla\n\n💡 Configura la impresora térmica en 80mm.`,
  contraseña: () => `🔒 **Acceso al Sistema:**\n\n• Cada usuario tiene un PIN (4-12 dígitos)\n• El administrador puede crear nuevos usuarios\n• Si olvidaste tu PIN, contacta al administrador\n\n💡 Nunca compartas tu PIN con nadie.`,
  noEntiendo: () => '🤔 No estoy seguro de entender. ¿Podrías reformular tu pregunta?\n\n💡 **Prueba con:**\n• "¿Qué mesas están ocupadas?"\n• "¿La caja está abierta?"\n• "Muéstrame los reportes"\n• "Ayuda" para ver todas las opciones',
};

function procesarMensaje(mensaje, datosSistema) {
  const texto = mensaje.toLowerCase().trim();

  // Buscar coincidencias
  for (const [categoria, keywords] of Object.entries(CONOCIMIENTO)) {
    if (keywords.some(kw => texto.includes(kw))) {
      const respuesta = RESPUESTAS[categoria];
      return typeof respuesta === 'function' ? respuesta(datosSistema) : respuesta;
    }
  }

  return RESPUESTAS.noEntiendo();
}

export default function AsistenteIA({ apiUrl, usuario }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [input, setInput] = useState('');
  const [datosSistema, setDatosSistema] = useState(null);
  const messagesEndRef = useRef(null);

  // Cargar datos del sistema para respuestas inteligentes
  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/sistema/info`);
        if (res.ok) setDatosSistema(await res.json());
      } catch { /* ignorar */ }
    };
    if (abierto) cargar();
  }, [abierto, apiUrl]);

  // Mensaje de bienvenida
  useEffect(() => {
    if (abierto && mensajes.length === 0) {
      setMensajes([{ tipo: 'ia', texto: '¡Hola! 👋 Soy tu asistente IA. Puedo ayudarte con el sistema, resolver dudas y darte información en tiempo real.\n\n¿En qué puedo ayudarte?' }]);
    }
  }, [abierto]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  const enviar = () => {
    if (!input.trim()) return;
    const msgUsuario = input.trim();
    setInput('');
    setMensajes(prev => [...prev, { tipo: 'usuario', texto: msgUsuario }]);

    // Procesar respuesta
    setTimeout(() => {
      const respuesta = procesarMensaje(msgUsuario, datosSistema);
      setMensajes(prev => [...prev, { tipo: 'ia', texto: respuesta }]);
    }, 300);
  };

  const handleKey = (e) => { if (e.key === 'Enter') enviar(); };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setAbierto(!abierto)}
        style={{
          position: 'fixed', bottom: '24px', right: '24px', width: '56px', height: '56px',
          borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, var(--gold), var(--gold-dark))',
          color: 'var(--bg-base)', fontSize: '1.5rem', cursor: 'pointer', zIndex: 99999,
          boxShadow: 'var(--shadow-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all var(--anim-fast)',
        }}
        title="Asistente IA"
      >
        🤖
      </button>

      {/* Panel de chat */}
      {abierto && (
        <div style={{
          position: 'fixed', bottom: '90px', right: '24px', width: '360px', height: '480px',
          borderRadius: 'var(--radius-lg)', background: 'var(--bg-card)', border: 'var(--glass-border)',
          boxShadow: 'var(--shadow-lg)', zIndex: 99999, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', backdropFilter: 'var(--glass-blur)',
        }}>
          {/* Header */}
          <div style={{ padding: 'var(--space-md)', background: 'var(--bg-panel)', borderBottom: 'var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
              <span style={{ fontSize: '1.2rem' }}>🤖</span>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Asistente IA</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--green)' }}>En línea</div>
              </div>
            </div>
            <button onClick={() => setAbierto(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            {mensajes.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.tipo === 'usuario' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{
                  padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)',
                  background: msg.tipo === 'usuario' ? 'var(--gold)' : 'var(--bg-panel)',
                  color: msg.tipo === 'usuario' ? 'var(--bg-base)' : 'var(--white)',
                  fontSize: '0.8rem', lineHeight: '1.5', whiteSpace: 'pre-wrap',
                }}>{msg.texto}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 'var(--space-md)', borderTop: 'var(--glass-border)', display: 'flex', gap: 'var(--space-sm)' }}>
            <input
              type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Pregunta algo..."
              style={{ flex: 1, padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.08)', background: 'var(--bg-input)', color: 'var(--white)', fontSize: '0.85rem', outline: 'none' }}
            />
            <button onClick={enviar} style={{ padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--gold)', color: 'var(--bg-base)', cursor: 'pointer', fontWeight: 600 }}>→</button>
          </div>
        </div>
      )}
    </>
  );
}

// Exportar función de procesamiento para uso externo
export { procesarMensaje };
