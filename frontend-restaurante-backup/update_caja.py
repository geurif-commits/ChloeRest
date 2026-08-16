import sys

file_path = r'c:\Users\Administrador\sistema_restaurante\frontend-restaurante\src\components\PantallaCaja.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    "'#14141b'": "'var(--bg-secondary, #14141b)'",
    "'#0a0a0f'": "'var(--bg-primary, #0a0a0f)'",
    "'#1a1a24'": "'var(--bg-tertiary, #1a1a24)'",
    "'#2a2a38'": "'var(--border-color, #2a2a38)'",
    "'#00f576'": "'var(--accent, #00f576)'",
    "'#ff3366'": "'var(--danger, #ff3366)'",
    "'#ffb703'": "'var(--warning, #ffb703)'",
    "'#9494ad'": "'var(--text-secondary, #9494ad)'",
    "width: '480px', maxWidth: '92vw'": "width: 'min(460px, 95vw)'",
    "width: '460px'": "width: 'min(460px, 95vw)'",
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Find flex rows with gap 8px or 10px that are button rows and add flexWrap: wrap
content = content.replace("display: 'flex', gap: '8px'", "display: 'flex', gap: '8px', flexWrap: 'wrap'")
content = content.replace("display: 'flex', gap: '10px'", "display: 'flex', gap: '10px', flexWrap: 'wrap'")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('PantallaCaja.jsx updated successfully.')
