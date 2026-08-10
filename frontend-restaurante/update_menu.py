import sys

file_path = r'c:\Users\Administrador\sistema_restaurante\frontend-restaurante\src\components\MenuPedido.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add states and useEffect
state_hook_old = "const [prechequeData, setPrechequeData] = useState(null);"
state_hook_new = """const [prechequeData, setPrechequeData] = useState(null);
  
  const [mobileTab, setMobileTab] = useState('menu');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);"""
content = content.replace(state_hook_old, state_hook_new)

# 2. Main container
main_container_old = """<div style={{
      display: 'flex', width: '100vw', height: '100vh', background: '#0a0a0f', 
      color: '#fff', fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box',
      position: 'fixed', top: 0, left: 0, zIndex: 1000
    }}>
      
      {/* SECCIÓN IZQUIERDA: MENÚ Y PRODUCTOS */}
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: '#0a0a0f'}}>
        
        <header style={{padding: '18px 25px', background: '#14141b', borderBottom: '1px solid #2a2a38', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0}}>
          <button onClick={alVolver} style={{background: '#1a1a24', color: '#fff', border: '1px solid #2a2a38', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem'}}>
            ⬅ Volver a Mesas
          </button>
          
          <input 
            type="text" 
            placeholder="🔍 Buscar plato o bebida..." 
            value={busqueda} 
            onChange={(e) => setBusqueda(e.target.value)}
            style={{padding: '10px 16px', background: '#121217', color: '#fff', border: '1px solid #00f576', borderRadius: '10px', width: '320px', fontSize: '1rem'}}
          />
        </header>"""

main_container_new = """<div style={{
      display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100vw', height: '100vh', background: 'var(--bg-primary, #0a0a0f)', 
      color: 'var(--text-primary, #fff)', fontFamily: 'sans-serif', overflow: 'hidden', boxSizing: 'border-box',
      position: 'fixed', top: 0, left: 0, zIndex: 1000
    }}>
      
      {isMobile && (
        <>
          <header style={{padding: '12px 15px', background: 'var(--bg-secondary, #14141b)', borderBottom: '1px solid var(--border-color, #2a2a38)', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0}}>
            <button onClick={alVolver} style={{background: 'var(--bg-tertiary, #1a1a24)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-color, #2a2a38)', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem', alignSelf: 'flex-start'}}>
              ⬅ Volver a Mesas
            </button>
            <input 
              type="text" 
              placeholder="🔍 Buscar plato o bebida..." 
              value={busqueda} 
              onChange={(e) => setBusqueda(e.target.value)}
              style={{padding: '10px 16px', background: 'var(--bg-tertiary, #121217)', color: 'var(--text-primary, #fff)', border: '1px solid var(--accent, #00f576)', borderRadius: '10px', width: '100%', fontSize: '1rem', boxSizing: 'border-box'}}
            />
          </header>
          <div className="mobile-tab-bar">
            <button className={mobileTab === 'menu' ? 'active' : ''} onClick={() => setMobileTab('menu')}>Menú</button>
            <button className={mobileTab === 'cuenta' ? 'active' : ''} onClick={() => setMobileTab('cuenta')}>
              Cuenta <span className="mobile-tab-badge">{comandaNueva.length + cuentaActual.length}</span>
            </button>
          </div>
        </>
      )}

      {/* SECCIÓN IZQUIERDA: MENÚ Y PRODUCTOS */}
      <div style={{flex: 1, display: (!isMobile || mobileTab === 'menu') ? 'flex' : 'none', flexDirection: 'column', height: isMobile ? 'auto' : '100vh', overflow: 'hidden', background: 'var(--bg-primary, #0a0a0f)'}}>
        
        {!isMobile && (
          <header style={{padding: '18px 25px', background: 'var(--bg-secondary, #14141b)', borderBottom: '1px solid var(--border-color, #2a2a38)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0}}>
            <button onClick={alVolver} style={{background: 'var(--bg-tertiary, #1a1a24)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-color, #2a2a38)', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95rem'}}>
              ⬅ Volver a Mesas
            </button>
            
            <input 
              type="text" 
              placeholder="🔍 Buscar plato o bebida..." 
              value={busqueda} 
              onChange={(e) => setBusqueda(e.target.value)}
              style={{padding: '10px 16px', background: 'var(--bg-tertiary, #121217)', color: 'var(--text-primary, #fff)', border: '1px solid var(--accent, #00f576)', borderRadius: '10px', width: '320px', fontSize: '1rem'}}
            />
          </header>
        )}"""
content = content.replace(main_container_old, main_container_new)

# 3. Product grid mobile adjust
grid_old = "<div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '20px'}}>"
grid_new = "<div style={{display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(130px, 1fr))' : 'repeat(auto-fill, minmax(190px, 1fr))', gap: isMobile ? '12px' : '20px'}}>"
content = content.replace(grid_old, grid_new)

# 4. Right section mobile adjust
right_sec_old = """{/* SECCIÓN DERECHA: TICKET Y CUENTA ACTUAL */}
      <div style={{width: '420px', background: '#14141b', display: 'flex', flexDirection: 'column', height: '100vh', borderLeft: '1px solid #2a2a38', flexShrink: 0, boxSizing: 'border-box'}}>"""
right_sec_new = """{/* SECCIÓN DERECHA: TICKET Y CUENTA ACTUAL */}
      <div style={{width: isMobile ? '100vw' : '420px', background: 'var(--bg-secondary, #14141b)', display: (!isMobile || mobileTab === 'cuenta') ? 'flex' : 'none', flexDirection: 'column', height: isMobile ? 'auto' : '100vh', flex: isMobile ? 1 : 'none', borderLeft: isMobile ? 'none' : '1px solid var(--border-color, #2a2a38)', flexShrink: 0, boxSizing: 'border-box'}}>"""
content = content.replace(right_sec_old, right_sec_new)

# 5. Cobro modal mobile adjust
cobro_modal_old = "<div style={{background: '#14141b', border: '2px solid #00f576', borderRadius: '16px', padding: '25px', width: '460px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}}>"
cobro_modal_new = "<div style={{background: 'var(--bg-secondary, #14141b)', border: '2px solid var(--accent, #00f576)', borderRadius: '16px', padding: '25px', width: 'min(460px, 95vw)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.5)'}}>"
content = content.replace(cobro_modal_old, cobro_modal_new)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('MenuPedido.jsx updated successfully.')
