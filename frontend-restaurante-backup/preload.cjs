const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronPOS', {
  reenfocarVentana: () => ipcRenderer.send('reenfocar-ventana'),
  exportarPDF: ({ html, nombre }) => ipcRenderer.invoke('exportar-pdf', { html, nombre }),
  salirSistema: () => ipcRenderer.send('salir-sistema'),
  abrirLinkPago: (url) => ipcRenderer.invoke('abrir-link-pago', url),
});
