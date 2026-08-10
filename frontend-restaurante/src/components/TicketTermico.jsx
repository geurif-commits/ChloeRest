import React, { useRef } from 'react';

function TicketTermico({ datosFactura, alCerrar, esPrecheque = false }) {
  const ticketRef = useRef(null);
  if (!datosFactura) return null;

  const {
    nombreNegocio = 'RESTAURANTE / BAR',
    rncNegocio = '131-XXXXX-1',
    direccionNegocio = 'Av. Principal, La Romana, R.D.',
    telefonoNegocio = '(809) 555-0000',
    logoUrl,
    mesa,
    cajero,
    camarero,
    items = [],
    subtotal = 0,
    itbis = 0,
    propina = 0,
    total = 0,
    metodoPago,
    tipoComprobante = 'B02',
    rncCliente,
    ncfGenerado,
    fecha
  } = datosFactura;

  const formatearRD = (val) => {
    return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

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
    switch (tipoComprobante) {
      case 'B01':
        return 'FACTURA DE CRÉDITO FISCAL (B01)';
      case 'e-CF':
        return 'FACTURA ELECTRÓNICA (e-CF)';
      case 'B02':
      default:
        return 'FACTURA DE CONSUMO (B02)';
    }
  };

  const imprimir = () => {
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

  return (
    <div className="modal-overlay print-overlay">
      <div className="ticket-termico-container" ref={ticketRef}>
        
        {/* Contenido físico del recibo (Área que se imprime en formato 80mm/58mm) */}
        <div className="ticket-papel" id="area-impresion" style={{width: '280px', margin: '0 auto', background: '#fff', color: '#000', padding: '15px', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.4'}}>
          
          {/* Encabezado del Establecimiento */}
          <div style={{textAlign: 'center', marginBottom: '8px'}}>
            {logoUrl && <img src={logoUrl} alt="Logo" style={{maxHeight: '45px', marginBottom: '4px', objectFit: 'contain'}} />}
            <h3 style={{margin: '0 0 2px 0', fontSize: '15px', fontWeight: 'bold'}}>{nombreNegocio}</h3>
            <p style={{margin: '0', fontSize: '11px'}}>RNC: {rncNegocio}</p>
            <p style={{margin: '0', fontSize: '10px'}}>{direccionNegocio}</p>
            <p style={{margin: '0', fontSize: '10px'}}>Tel: {telefonoNegocio}</p>

            <div style={{marginTop: '8px', padding: '4px 0', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase'}}>
              {obtenerTituloFiscal()}
            </div>
            {esPrecheque && (
              <p style={{margin: '3px 0 0 0', fontSize: '9px', fontStyle: 'italic', fontWeight: 'bold'}}>(DOCUMENTO NO VÁLIDO COMO COMPROBANTE FISCAL)</p>
            )}
          </div>

          {/* Información de Mesa y Emisión */}
          <div style={{marginBottom: '8px', fontSize: '11px'}}>
            <p style={{margin: '2px 0'}}><strong>Fecha:</strong> {fecha || new Date().toLocaleString()}</p>
            <p style={{margin: '2px 0'}}><strong>Mesa:</strong> {mesa || 'N/A'}</p>
            {cajero && <p style={{margin: '2px 0'}}><strong>Cajero:</strong> {cajero}</p>}
            {camarero && <p style={{margin: '2px 0'}}><strong>Camarero:</strong> {camarero}</p>}            
            {!camarero && !cajero && <p style={{margin: '2px 0'}}><strong>Atendido por:</strong> —</p>}
            
            {!esPrecheque && (
              <>
                <p style={{margin: '2px 0'}}><strong>Comprobante:</strong> {tipoComprobante}</p>
                {ncfGenerado && <p style={{margin: '2px 0'}}><strong>NCF:</strong> <span style={{fontWeight: 'bold', fontSize: '12px'}}>{ncfGenerado}</span></p>}
                {tipoComprobante !== 'B02' && rncCliente && (
                  <p style={{margin: '2px 0'}}><strong>RNC Cliente:</strong> {rncCliente}</p>
                )}
              </>
            )}
          </div>

          <div style={{borderBottom: '1px dashed #000', marginBottom: '8px'}}></div>

          {/* Tabla de Artículos Agrupados */}
          <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '11px'}}>
            <thead>
              <tr style={{borderBottom: '1px solid #000'}}>
                <th style={{textAlign: 'center', width: '35px', paddingBottom: '3px'}}>Cant.</th>
                <th style={{textAlign: 'left', paddingBottom: '3px'}}>Descripción</th>
                <th style={{textAlign: 'right', width: '70px', paddingBottom: '3px'}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {itemsAgrupados.map((item, idx) => {
                const subtotalItem = item.cantidad * item.precio;
                return (
                  <tr key={idx} style={{borderBottom: '1px dotted #ccc'}}>
                    <td style={{textAlign: 'center', verticalAlign: 'top', paddingTop: '4px', fontWeight: 'bold'}}>{item.cantidad}</td>
                    <td style={{textAlign: 'left', verticalAlign: 'top', paddingTop: '4px'}}>
                      <div style={{fontWeight: 'bold'}}>{item.nombre}</div>
                      <div style={{fontSize: '9.5px', color: '#555'}}>@ RD$ {formatearRD(item.precio)} c/u</div>
                    </td>
                    <td style={{textAlign: 'right', verticalAlign: 'top', paddingTop: '4px', fontWeight: 'bold'}}>
                      RD$ {formatearRD(subtotalItem)}
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
              <strong>RD$ {formatearRD(subtotal)}</strong>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>ITBIS (18%):</span>
              <strong>RD$ {formatearRD(itbis)}</strong>
            </div>
            <div style={{display: 'flex', justifyContent: 'space-between'}}>
              <span>Propina Legal (10%):</span>
              <strong>RD$ {formatearRD(propina)}</strong>
            </div>
            
            <div style={{borderTop: '2px solid #000', marginTop: '4px', paddingTop: '4px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold'}}>
              <span>TOTAL A PAGAR:</span>
              <span>RD$ {formatearRD(total)}</span>
            </div>
          </div>

          {!esPrecheque && metodoPago && (
            <div style={{marginTop: '8px', borderTop: '1px dashed #000', paddingTop: '6px', fontSize: '11px'}}>
              <p style={{margin: '2px 0'}}><strong>Método de Pago:</strong> {metodoPago}</p>
            </div>
          )}

          {/* Pie del Recibo */}
          <div style={{marginTop: '12px', textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px', fontSize: '10px'}}>
            <p style={{margin: '2px 0', fontWeight: 'bold'}}>¡Gracias por su visita!</p>
            <p style={{margin: '2px 0', fontSize: '9px'}}>{esPrecheque ? 'Solicite su comprobante fiscal en caja' : 'Servicio e impuestos incluidos'}</p>
          </div>

        </div>

        {/* Botones de control del modal (No salen en impresión) */}
        <div className="ticket-acciones-modal" style={{marginTop: '15px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap'}}>
          <button className="btn-imprimir" onClick={imprimir} style={{background: '#00f576', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>🖨️ Imprimir</button>
          <button className="btn-exportar-pdf" onClick={exportarPDF} style={{background: '#1a73e8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>📄 Exportar PDF</button>
          <button className="btn-cerrar-ticket" onClick={alCerrar} style={{background: '#2a2a38', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer'}}>❌ Cerrar</button>
        </div>

      </div>
    </div>
  );
}

export default TicketTermico;
