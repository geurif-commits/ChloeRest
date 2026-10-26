/**
 * Compila `bundle-pruebas.cjs`: el servidor sin el PIN del propietario incrustado, para las pruebas automáticas.
 * (El servidor que se despliega es `bundle.cjs`, de `npm run build:server`; ese no se toca.)
 */
import { compilarBundleSinPin } from './lib/bundle-pin-prueba.js';

compilarBundleSinPin()
  .then((destino) => console.log(`${destino} listo (servidor de pruebas, sin PIN de propietario incrustado).`))
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
