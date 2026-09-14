const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPOS', {
  reenfocarVentana: () => ipcRenderer.send('reenfocar-ventana'),
  exportarPDF: ({ html, nombre }) => ipcRenderer.invoke('exportar-pdf', { html, nombre }),
  listarImpresoras: () => ipcRenderer.invoke('listar-impresoras'),
  imprimirHTML: ({ html, impresora, ancho = 80 }) => ipcRenderer.invoke('imprimir-html', { html, impresora, ancho }),
  salirSistema: () => ipcRenderer.send('salir-sistema'),
  abrirLinkPago: (url) => ipcRenderer.invoke('abrir-link-pago', url),
  minimizarVentana: () => ipcRenderer.send('ventana-minimizar'),
  maximizarVentana: () => ipcRenderer.send('ventana-maximizar'),
  cerrarVentana: () => ipcRenderer.send('ventana-cerrar'),
  estaMaximizada: () => ipcRenderer.invoke('ventana-esta-maximizada'),
  mostrarVentana: () => ipcRenderer.invoke('mostrar-ventana'),
  verificarActualizacion: () => ipcRenderer.invoke('verificar-actualizacion'),
  abrirDescargaActualizacion: (url) => ipcRenderer.invoke('abrir-descarga-actualizacion', url),
  onActualizacionDisponible: (callback) => {
    const listener = (_event, info) => callback(info);
    ipcRenderer.on('actualizacion-disponible', listener);
    return () => ipcRenderer.removeListener('actualizacion-disponible', listener);
  },
});
