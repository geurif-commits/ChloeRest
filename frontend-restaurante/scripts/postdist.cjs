// Limpia los archivos temporales que predist.cjs dejó en frontend-restaurante/ para el empaquetado.
const fs = require('fs');
const path = require('path');

const raiz = process.cwd();
for (const nombre of ['ServidorPOS.exe', 'ServidorPOS.cjs', '.env']) {
  const ruta = path.resolve(raiz, nombre);
  if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
}
