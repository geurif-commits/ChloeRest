import sys

file_path = r'c:\Users\Administrador\sistema_restaurante\frontend-restaurante\src\App.css'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

theme_css = """/* ═══ SISTEMA DE TEMAS ═══ */
:root,
[data-theme="noche"] {
  --bg-primary: #0a0a0f;
  --bg-secondary: #14141b;
  --bg-tertiary: #1a1a24;
  --border-color: #2a2a38;
  --text-primary: #ffffff;
  --text-secondary: #9494ad;
  --accent: #00f576;
  --accent-hover: #00d966;
  --accent-glow: rgba(0, 245, 118, 0.3);
  --danger: #ff3366;
  --warning: #ffb703;
  --success: #00f576;
}

[data-theme="oceano"] {
  --bg-primary: #0a1628;
  --bg-secondary: #0f2140;
  --bg-tertiary: #142d54;
  --border-color: #1e3a5f;
  --text-primary: #e0f0ff;
  --text-secondary: #7eb8e0;
  --accent: #00b4d8;
  --accent-hover: #0096b7;
  --accent-glow: rgba(0, 180, 216, 0.3);
  --danger: #ff6b6b;
  --warning: #ffd166;
  --success: #06d6a0;
}

[data-theme="lava"] {
  --bg-primary: #120a0a;
  --bg-secondary: #1e1210;
  --bg-tertiary: #2a1a16;
  --border-color: #3d2820;
  --text-primary: #ffe8d6;
  --text-secondary: #c9a892;
  --accent: #ff6b35;
  --accent-hover: #e85d2c;
  --accent-glow: rgba(255, 107, 53, 0.3);
  --danger: #ff4444;
  --warning: #ff9f1c;
  --success: #2dc653;
}

[data-theme="esmeralda"] {
  --bg-primary: #0a1a0f;
  --bg-secondary: #102e18;
  --bg-tertiary: #163d21;
  --border-color: #1e5a2d;
  --text-primary: #e0ffe8;
  --text-secondary: #7ec992;
  --accent: #2dc653;
  --accent-hover: #25a847;
  --accent-glow: rgba(45, 198, 83, 0.3);
  --danger: #ff6b6b;
  --warning: #ffd166;
  --success: #2dc653;
}

[data-theme="amatista"] {
  --bg-primary: #120a1e;
  --bg-secondary: #1a1030;
  --bg-tertiary: #231842;
  --border-color: #352658;
  --text-primary: #f0e6ff;
  --text-secondary: #a78ec4;
  --accent: #a855f7;
  --accent-hover: #9333ea;
  --accent-glow: rgba(168, 85, 247, 0.3);
  --danger: #ff6b6b;
  --warning: #ffd166;
  --success: #06d6a0;
}

[data-theme="claro"] {
  --bg-primary: #f0f2f5;
  --bg-secondary: #ffffff;
  --bg-tertiary: #e8eaed;
  --border-color: #d1d5db;
  --text-primary: #1a1a2e;
  --text-secondary: #6b7280;
  --accent: #1a73e8;
  --accent-hover: #1557b0;
  --accent-glow: rgba(26, 115, 232, 0.2);
  --danger: #dc3545;
  --warning: #f59e0b;
  --success: #10b981;
}
"""

content = theme_css + "\n" + content

replacements = {
    '--bg-main': '--bg-primary',
    '--bg-surface': '--bg-secondary',
    '--bg-card': '--bg-tertiary',
    '--accent-primary': '--accent',
    '--accent-danger': '--danger',
    '--accent-warning': '--warning',
    '--text-main': '--text-primary',
    '--text-muted': '--text-secondary',
    '#141422': 'var(--bg-secondary)',
    'rgba(0, 245, 118, 0.5)': 'var(--accent-glow)',
    'rgba(0, 245, 118, 0.3)': 'var(--accent-glow)',
    '#00f576': 'var(--accent)',
    '#0a0a0f': 'var(--bg-primary)'
}

for old, new in replacements.items():
    content = content.replace(old, new)

responsive_css = """
/* ═══ RESPONSIVE MOBILE ═══ */
@media (max-width: 768px) {
  .login-box {
    width: 92vw !important;
    max-width: 380px !important;
    padding: 25px 20px !important;
  }
  
  .teclado {
    gap: 8px !important;
  }
  
  .tecla {
    padding: 14px !important;
    font-size: 1.2rem !important;
  }
}

/* Mobile tabs for MenuPedido */
.mobile-tab-bar {
  display: none;
}

@media (max-width: 768px) {
  .mobile-tab-bar {
    display: flex;
    gap: 0;
    background: var(--bg-secondary, #14141b);
    border-bottom: 1px solid var(--border-color, #2a2a38);
  }
  
  .mobile-tab-bar button {
    flex: 1;
    padding: 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary, #9494ad);
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
  }
  
  .mobile-tab-bar button.active {
    color: var(--accent, #00f576);
    border-bottom-color: var(--accent, #00f576);
    background: var(--bg-tertiary, #1a1a24);
  }
  
  .mobile-tab-badge {
    background: var(--accent, #00f576);
    color: #000;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 800;
    margin-left: 6px;
  }
}
"""

content = content + "\n" + responsive_css

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('App.css updated.')
