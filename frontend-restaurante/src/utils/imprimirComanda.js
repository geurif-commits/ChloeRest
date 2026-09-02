// Utilidad para imprimir comandas en impresora térmica (vía ventana del navegador).
// En modo "impresora" del negocio, reemplaza/envía junto al KDS la comanda física.

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function centrar(texto, ancho = 42) {
  const t = String(texto);
  if (t.length >= ancho) return t;
  const espacios = Math.floor((ancho - t.length) / 2);
  return ' '.repeat(espacios) + t + ' '.repeat(ancho - t.length - espacios);
}

// Aplica los estilos de ticket desde la configuración del negocio.
export function estilosTicketDesdeConfig(cfg = {}) {
  const fuente = cfg.ticket_font_family || 'Inter';
  const tamano = parseInt(cfg.ticket_font_size || '12', 10);
  const margen = cfg.ticket_margin === 'compact' ? '4mm'
    : cfg.ticket_margin === 'wide' ? '14mm'
    : '10mm';
  return {
    fuenteFamilia: fuente,
    tamanoBase: isNaN(tamano) ? 12 : tamano,
    margen,
  };
}

export function imprimirComanda({ negocio, mesa, camarero, productos, ticket = {} }) {
  let ventana;

  const estilos = estilosTicketDesdeConfig(ticket);
  const ahora = new Date();
  const fecha = ahora.toLocaleString('es-DO');

  const logoHtml = negocio.logo_url
    ? `<img src="${negocio.logo_url}" style="max-height:48px;max-width:160px;object-fit:contain;display:block;margin:0 auto 4px;" />`
    : '';

  const itemsHtml = productos.map(p => {
    const nombre = escaparHtml(p.nombre);
    const cant = p.cantidad;
    const sub = (p.precio * p.cantidad).toFixed(2);
    const notas = p.notas ? `<div style="font-size:${estilos.tamanoBase - 2}px;color:#555;padding-left:8px;">↳ ${escaparHtml(p.notas)}</div>` : '';
    return `<div style="margin:4px 0;">
      <div style="display:flex;justify-content:space-between;">
        <span><strong>${cant}x</strong> ${nombre}</span>
        <span>RD$ ${sub}</span>
      </div>
      ${notas}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Comanda - ${escaparHtml(mesa.nombre_numero)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: '${estilos.fuenteFamilia}', 'Inter', sans-serif;
    font-size: ${estilos.tamanoBase}px;
    width: 80mm;
    margin: 0;
    padding: ${estilos.margen};
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: ${estilos.tamanoBase - 1}px; }
  .footer { text-align: center; font-size: ${estilos.tamanoBase - 2}px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="center">${logoHtml}</div>
  <div class="center bold" style="font-size:${estilos.tamanoBase + 2}px;">${escaparHtml(negocio.nombre_comercial || negocio.nombre || 'Mi Negocio')}</div>
  <div class="center meta">${escaparHtml(negocio.direccion || '')}</div>
  <div class="center meta">${escaparHtml(negocio.telefono || '')}</div>
  <hr/>
  <div class="bold center" style="font-size:${estilos.tamanoBase + 3}px;letter-spacing:1px;">*** COMANDA ***</div>
  <hr/>
  <div class="meta"><span class="bold">Mesa:</span> ${escaparHtml(mesa.nombre_numero)}</div>
  <div class="meta"><span class="bold">Camarero/a:</span> ${escaparHtml(camarero?.nombre || '')}</div>
  <div class="meta"><span class="bold">Hora:</span> ${escaparHtml(fecha)}</div>
  <hr/>
  ${itemsHtml}
  <hr/>
  <div class="footer">${centrar('*** FIN COMANDA ***')}</div>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 350);
    };
  </script>
</body>
</html>`;

  if (ticket.printerName && window.electronPOS?.imprimirHTML) {
    return window.electronPOS.imprimirHTML({ html, impresora: ticket.printerName, ancho: 80 })
      .then((resultado) => {
        if (!resultado?.exito) throw new Error(resultado?.error || 'No se pudo imprimir.');
        return true;
      })
      .catch((error) => {
        alert(`No se pudo imprimir en ${ticket.printerName}: ${error.message}`);
        return false;
      });
  }

  ventana = window.open('', '_blank', 'width=340,height=600');
  if (!ventana) {
    alert('Permite las ventanas emergentes para imprimir la comanda.');
    return false;
  }
  ventana.document.open();
  ventana.document.write(html);
  ventana.document.close();
  return true;
}

export default imprimirComanda;
