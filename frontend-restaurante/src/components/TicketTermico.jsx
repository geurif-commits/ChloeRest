import React, { useRef } from 'react';
import { qrComoImagen } from '../utils/qr.js';
import { fechaHoraRd, fechaLegible, formatearDocumento, tituloComprobante, esTipoElectronico } from '../utils/comprobantes.js';

/**
 * Ticket térmico (80 mm). Con un e-CF imprime la representación impresa de la DGII: emisor (razón social, RNC, dirección),
 * tipo de comprobante, e-NCF, fecha de emisión y de vencimiento de la secuencia, comprador (RNC/cédula y razón social),
 * detalle con ITBIS, totales, forma de pago, código de seguridad, fecha de firma digital y el QR del timbre fiscal.
 */
function TicketTermico({ datosFactura, alCerrar, esPrecheque = false }) {
  const ticketRef = useRef(null);
  if (!datosFactura) return null;

  const cfgTicket = datosFactura.ticketConfig || {};
  const fuenteTicket = cfgTicket.font_family || 'monospace';
  const tamanoTicket = parseInt(cfgTicket.font_size || '12', 10) || 12;
  const margenTicket = cfgTicket.margin === 'compact' ? '6px'
    : cfgTicket.margin === 'wide' ? '22px'
    : '15px';
  const posicionLogo = cfgTicket.logo_position || 'top';

  const {
    nombreNegocio = 'RESTAURANTE / BAR',
    rncNegocio = '',
    direccionNegocio = '',
    telefonoNegocio = '',
    logoUrl,
    mesa,
    cajero,
    camarero,
    items = [],
    subtotal = 0,
    subtotalBruto,
    descuento = 0,
    itbis = 0,
    propina = 0,
    total = 0,
    metodoPago,
    tipoComprobante = 'B02',
    rncCliente,
    razonSocialCliente,
    ncfGenerado,
    fecha,
    fechaEmision,
    fechaVencimientoSecuencia,
    codigoSeguridad,
    fechaFirma,
    qrUrl,
    pendienteEcf = false
  } = datosFactura;

  const electronico = esTipoElectronico(tipoComprobante) || /^E\d{2}\d{10}$/.test(String(ncfGenerado || ''));
  const titulo = datosFactura.tituloComprobante || tituloComprobante(tipoComprobante);
  // En un e-CF el QR del timbre es obligatorio: el ajuste «mostrar QR» solo aplica al NCF tradicional.
  const mostrarQR = electronico ? true : (cfgTicket.show_qr ?? true);
  const compradorIdentificado = Boolean(rncCliente);
  // El e-NCF de crédito fiscal, gubernamental y regímenes especiales declara el vencimiento de su secuencia.
  const muestraVencimiento = electronico && fechaVencimientoSecuencia && tipoComprobante !== 'E32';

  const formatearRD = (val) => {
    return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Porcentaje efectivo de la propina de esta cuenta (sirve también al reimprimir facturas antiguas).
  const porcentajePropinaTicket = subtotal > 0 ? Math.round((Number(propina) / Number(subtotal)) * 1000) / 10 : 0;

  // Función para agrupar automáticamente artículos idénticos modificando la cantidad
  const agruparArticulos = (listaItems = []) => {
    const mapa = new Map();
    listaItems.forEach((item) => {
      const nombre = (item.nombre || item.producto || item.descripcion || 'Artículo').trim();
      const precio = Number(item.precio || item.precio_unitario || 0);
      const cantidad = Number(item.cantidad || 1);
      const key = `${nombre.toLowerCase()}_${precio}`;
      if (mapa.has(key)) {
        const exist = mapa.get(key);
        mapa.set(key, { ...exist, cantidad: exist.cantidad + cantidad });
      } else {
        mapa.set(key, { nombre, precio, cantidad });
      }
    });
    return Array.from(mapa.values());
  };

  const itemsAgrupados = agruparArticulos(items);

  const obtenerTituloFiscal = () => {
    if (esPrecheque) return '*** ESTADO DE CUENTA (PRE-CHEQUE) ***';
    return titulo;
  };

  const imprimir = async () => {
    if (window.electronPOS?.imprimirHTML) {
      try {
        const asignadas = JSON.parse(localStorage.getItem('chloe_impresoras') || '{}');
        const html = `<!doctype html><html lang="es"><head><meta charset="UTF-8"><style>@page{size:80mm auto;margin:0}body{width:80mm;margin:0;padding:4mm;box-sizing:border-box;font-family:monospace;color:#000;background:#fff}</style></head><body>${ticketRef.current?.querySelector('.ticket-papel')?.outerHTML || ''}</body></html>`;
        const resultado = await window.electronPOS.imprimirHTML({ html, impresora: asignadas.caja || '', ancho: 80 });
        if (resultado?.exito) return;
        if (asignadas.caja) throw new Error(resultado?.error || 'No se pudo imprimir en la impresora de caja.');
      } catch (error) {
        alert(error.message);
        return;
      }
    }
    document.body.classList.add('imprimiendo-precheque');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('imprimiendo-precheque');
    }, 1000);
  };

  // Exportar a PDF (Electron: vía IPC, Navegador: print dialog)
  const exportarPDF = async () => {
    try {
      if (window.electronPOS?.exportarPDF) {
        // En Electron: genera PDF nativo vía IPC
        const contenido = ticketRef.current?.innerHTML || '';
        const nombre = `ticket_${esPrecheque ? 'precheque' : 'factura'}_${Date.now()}.pdf`;
        const resultado = await window.electronPOS.exportarPDF({ html: contenido, nombre });
        if (resultado?.exito) {
          console.log('PDF guardado en:', resultado.ruta);
        }
      } else {
        // Fallback en navegador: usa print dialog (Guardar como PDF)
        document.body.classList.add('imprimiendo-precheque');
        window.print();
        setTimeout(() => document.body.classList.remove('imprimiendo-precheque'), 1000);
      }
    } catch (err) {
      console.error('Error exportando PDF:', err);
      // Fallback final
      window.print();
    }
  };

  const fila = (etiqueta, valor, negrita = false) => (
    <p style={{ margin: '2px 0', overflowWrap: 'anywhere' }}><strong>{etiqueta}</strong> {negrita ? <strong>{valor}</strong> : valor}</p>
  );

  // Timbre fiscal: el enlace que devuelve el servidor (o el proveedor); los NCF tradicionales conservan su verificación propia.
  const urlQr = esPrecheque ? null
    : electronico ? qrUrl
      : `https://chloerestaurant.lat/verificar-factura?ncf=${encodeURIComponent(ncfGenerado || '')}&total=${total}`;
  const qrImgSrc = mostrarQR && urlQr ? qrComoImagen(urlQr) : null;

  return (
    <div className="modal-overlay print-overlay" onClick={(e) => { if (e.target === e.currentTarget) alCerrar(); }}>
      <div className="ticket-termico-container" ref={ticketRef}>

        {/* Contenedor desplazable para tickets largos garantizando centrado vertical */}
        <div className="ticket-papel-scroll">
          {/* Contenido físico del recibo (Área que se imprime en formato 80mm/58mm) */}
          <div className="ticket-papel" id="area-impresion" style={{width: '280px', margin: '0 auto', background: '#fff', color: '#000', padding: margenTicket, fontFamily: fuenteTicket, fontSize: `${tamanoTicket}px`, lineHeight: '1.4'}}>

          {/* Encabezado del Establecimiento (emisor) */}
          <div style={{textAlign: 'center', marginBottom: '8px'}}>
            {logoUrl && posicionLogo !== 'none' && (
              <img
                src={logoUrl}
                alt="Logo"
                style={
                  posicionLogo === 'left'
                    ? { maxHeight: '40px', maxWidth: '120px', marginBottom: '4px', objectFit: 'contain', display: 'inline-block', verticalAlign: 'middle' }
                    : { maxHeight: '45px', marginBottom: '4px', objectFit: 'contain' }
                }
              />
            )}
            <h3 style={{margin: '0 0 2px 0', fontSize: `${tamanoTicket + 3}px`, fontWeight: 'bold', overflowWrap: 'anywhere'}}>{nombreNegocio}</h3>
            {rncNegocio && <p style={{margin: '0', fontSize: `${tamanoTicket - 1}px`}}>RNC: {formatearDocumento(rncNegocio)}</p>}
            {direccionNegocio && <p style={{margin: '0', fontSize: `${tamanoTicket - 2}px`, overflowWrap: 'anywhere'}}>{direccionNegocio}</p>}
            {telefonoNegocio && <p style={{margin: '0', fontSize: `${tamanoTicket - 2}px`}}>Tel: {telefonoNegocio}</p>}

            <div style={{marginTop: '8px', padding: '4px 0', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase'}}>
              {obtenerTituloFiscal()}
            </div>
            {esPrecheque && (
              <p style={{margin: '3px 0 0 0', fontSize: '9px', fontStyle: 'italic', fontWeight: 'bold'}}>(DOCUMENTO NO VÁLIDO COMO COMPROBANTE FISCAL)</p>
            )}
          </div>

          {/* Datos del comprobante, fecha, mesa y comprador */}
          <div style={{marginBottom: '8px', fontSize: '11px'}}>
            {!esPrecheque && ncfGenerado && (
              <p style={{margin: '2px 0'}}><strong>{electronico ? 'e-NCF:' : 'NCF:'}</strong> <span style={{fontWeight: 'bold', fontSize: '12px'}}>{ncfGenerado}</span></p>
            )}
            {!esPrecheque && muestraVencimiento && fila('Vence secuencia:', fechaLegible(fechaVencimientoSecuencia))}
            {fila(electronico && !esPrecheque ? 'Fecha emisión:' : 'Fecha:', electronico && fechaEmision ? fechaHoraRd(fechaEmision) : (fecha || new Date().toLocaleString()))}
            {fila('Mesa:', mesa || 'N/A')}
            {cajero && fila('Cajero:', cajero)}
            {camarero && fila('Camarero:', camarero)}
            {!camarero && !cajero && fila('Atendido por:', '—')}

            {!esPrecheque && (
              <div style={{marginTop: '4px', paddingTop: '4px', borderTop: '1px dotted #888'}}>
                {compradorIdentificado
                  ? (
                    <>
                      {fila('RNC/Cédula:', formatearDocumento(rncCliente))}
                      {razonSocialCliente && fila('Cliente:', razonSocialCliente)}
                    </>
                  )
                  : fila('Cliente:', 'Consumidor final')}
              </div>
            )}
          </div>

          <div style={{borderBottom: '1px dashed #000', marginBottom: '8px'}}></div>

          {/* Tabla de Artículos Agrupados */}
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '11px'}}>
            <thead>
              <tr style={{borderBottom: '1px solid #000'}}>
                <th style={{textAlign: 'center', width: '35px', paddingBottom: '3px'}}>Cant.</th>
                <th style={{textAlign: 'left', paddingBottom: '3px'}}>Descripción</th>
                <th style={{textAlign: 'right', width: '70px', paddingBottom: '3px'}}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {itemsAgrupados.map((item, idx) => {
                const subtotalItem = item.cantidad * item.precio;
                return (
                  <tr key={idx} style={{borderBottom: '1px dotted #ccc'}}>
                    <td style={{textAlign: 'center', verticalAlign: 'top', paddingTop: '4px', fontWeight: 'bold'}}>{item.cantidad}</td>
                    <td style={{textAlign: 'left', verticalAlign: 'top', paddingTop: '4px', overflowWrap: 'anywhere'}}>
                      <div style={{fontWeight: 'bold'}}>{item.nombre}</div>
                      <div style={{fontSize: '9.5px', color: '#555'}}>@ RD$ {formatearRD(item.precio)} c/u</div>
                    </td>
                    <td style={{textAlign: 'right', verticalAlign: 'top', paddingTop: '4px', fontWeight: 'bold', whiteSpace: 'nowrap'}}>
                      {formatearRD(subtotalItem)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{borderTop: '1px dashed #000', marginTop: '8px', paddingTop: '6px'}}></div>

          {/* Sección de Totales Estructurada */}
          <div style={{display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>Subtotal:</span>
              <strong>RD$ {formatearRD(Number(descuento) > 0 ? (subtotalBruto ?? Number(subtotal) + Number(descuento)) : subtotal)}</strong>
            </div>
            {Number(descuento) > 0 && (
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>Descuento:</span>
                <strong>- RD$ {formatearRD(descuento)}</strong>
              </div>
            )}
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>ITBIS:</span>
              <strong>RD$ {formatearRD(itbis)}</strong>
            </div>
            {propina > 0 && (
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <span>Propina legal ({porcentajePropinaTicket}%):</span>
                <strong>RD$ {formatearRD(propina)}</strong>
              </div>
            )}

            <div style={{borderTop: '2px solid #000', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold'}}>
              <span>TOTAL A PAGAR:</span>
              <span>RD$ {formatearRD(total)}</span>
            </div>
          </div>

          {!esPrecheque && metodoPago && (
            <div style={{marginTop: '8px', borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '11px'}}>
              <p style={{margin: '2px 0'}}><strong>Forma de pago:</strong> {metodoPago}</p>
            </div>
          )}

          {/* Timbre fiscal del e-CF: código de seguridad, firma digital y QR de consulta */}
          {!esPrecheque && electronico && (
            <div style={{marginTop: '8px', borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '11px'}}>
              {codigoSeguridad && !pendienteEcf ? (
                <>
                  {fila('Código de seguridad:', codigoSeguridad, true)}
                  {fechaFirma && fila('Fecha de firma digital:', fechaHoraRd(fechaFirma))}
                </>
              ) : (
                <p style={{margin: '2px 0', fontWeight: 'bold', textAlign: 'center', border: '1px solid #000', padding: '4px'}}>
                  PENDIENTE DE VALIDACIÓN POR LA DGII
                  <span style={{display: 'block', fontWeight: 'normal', fontSize: '9px'}}>El código de seguridad y el QR se imprimen al reimprimir este comprobante desde el historial de facturas.</span>
                </p>
              )}
            </div>
          )}

          {/* Pie del Recibo */}
          <div style={{marginTop: '12px', textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px', fontSize: '10px'}}>
            <p style={{margin: '2px 0', fontWeight: 'bold'}}>¡Gracias por su visita!</p>
            <p style={{margin: '2px 0', fontSize: '9px'}}>
              {esPrecheque
                ? 'Solicite su comprobante fiscal electrónico en caja'
                : electronico
                  ? 'Comprobante fiscal electrónico. Consulte su validez en dgii.gov.do'
                  : 'Comprobante fiscal (NCF)'}
            </p>
          </div>

          {qrImgSrc && !(electronico && (pendienteEcf || !codigoSeguridad)) && (
            <div style={{marginTop: '10px', textAlign: 'center'}}>
              <img
                src={qrImgSrc}
                alt="Código QR del timbre fiscal"
                style={{ width: '90px', height: '90px', display: 'inline-block' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <p style={{ margin: '4px 0 0 0', fontSize: '8px', color: '#333' }}>
                {electronico ? 'Escanee para validar el e-CF en la DGII' : 'Valida tu comprobante fiscal'}
              </p>
            </div>
          )}
          </div>
        </div>

        {/* Botones de control del modal (Siempre visibles al pie) */}
        <div className="ticket-acciones-modal">
          <button className="btn-imprimir" onClick={imprimir} style={{background: '#00f576', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}>🖨️ Imprimir</button>
          <button className="btn-exportar-pdf" onClick={exportarPDF} style={{background: '#1a73e8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}>📄 Exportar PDF</button>
          <button className="btn-cerrar-ticket" onClick={alCerrar} style={{background: '#2a2a38', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'}}>❌ Cerrar</button>
        </div>

      </div>
    </div>
  );
}

export default TicketTermico;
