import { useRef } from 'react';

function FacturaActivacion({ factura, nombreNegocio, alCerrar }) {
  const ticketRef = useRef(null);
  if (!factura) return null;

  const formatearMonto = (val) => Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneda = factura.moneda || 'RD$';

  const imprimir = () => {
    document.body.classList.add('imprimiendo-precheque');
    window.print();
    setTimeout(() => document.body.classList.remove('imprimiendo-precheque'), 1000);
  };

  const exportarPDF = async () => {
    try {
      if (window.electronPOS?.exportarPDF) {
        const contenido = ticketRef.current?.innerHTML || '';
        const nombre = `factura_activacion_${factura.numero_factura || 'FAC'}.pdf`;
        const resultado = await window.electronPOS.exportarPDF({ html: contenido, nombre });
        if (resultado?.exito) console.log('PDF guardado en:', resultado.ruta);
        else window.print();
      } else {
        document.body.classList.add('imprimiendo-precheque');
        window.print();
        setTimeout(() => document.body.classList.remove('imprimiendo-precheque'), 1000);
      }
    } catch (err) {
      window.print();
    }
  };

  return (
    <div className="modal-overlay print-overlay">
      <div className="ticket-termico-container" ref={ticketRef}>
        <div className="ticket-papel" id="area-impresion" style={{ width: '280px', margin: '0 auto', background: '#fff', color: '#000', padding: '15px', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.4' }}>

          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: '0 0 2px 0', fontSize: '15px', fontWeight: 'bold' }}>{nombreNegocio}</h3>
            <div style={{ marginTop: '6px', padding: '4px 0', borderTop: '1px dashed #000', borderBottom: '1px dashed #000', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase' }}>
              FACTURA DE ACTIVACIÓN DE LICENCIA
            </div>
            <p style={{ margin: '3px 0 0 0', fontSize: '9px', fontStyle: 'italic', fontWeight: 'bold' }}>(DOCUMENTO DE CONTROL INTERNO DEL PROPIETARIO)</p>
          </div>

          <div style={{ marginBottom: '8px', fontSize: '11px' }}>
            <p style={{ margin: '2px 0' }}><strong>Factura:</strong> {factura.numero_factura || '—'}</p>
            <p style={{ margin: '2px 0' }}><strong>Fecha:</strong> {factura.pagada_en ? new Date(factura.pagada_en).toLocaleString() : '—'}</p>
          </div>

          <div style={{ borderBottom: '1px dashed #000', marginBottom: '8px' }}></div>

          <div style={{ fontSize: '11px', marginBottom: '8px' }}>
            <p style={{ margin: '2px 0' }}><strong>Cliente:</strong> {factura.propietario || '—'}</p>
            <p style={{ margin: '2px 0' }}><strong>Negocio:</strong> {factura.negocio || '—'}</p>
            {factura.telefono && <p style={{ margin: '2px 0' }}><strong>Teléfono:</strong> {factura.telefono}</p>}
            {factura.email && <p style={{ margin: '2px 0' }}><strong>Correo:</strong> {factura.email}</p>}
            {factura.provincia && <p style={{ margin: '2px 0' }}><strong>Provincia:</strong> {factura.provincia}</p>}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <tbody>
              <tr style={{ borderBottom: '1px dotted #ccc' }}>
                <td style={{ textAlign: 'left', verticalAlign: 'top', paddingTop: '4px' }}>
                  <div style={{ fontWeight: 'bold' }}>Licencia: {factura.plan_nombre || 'Sin plan'}</div>
                  <div style={{ fontSize: '9.5px', color: '#555' }}>Activación de licencia de uso</div>
                </td>
                <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                  {moneda} {formatearMonto(factura.monto)}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ borderTop: '1px dashed #000', marginTop: '8px', paddingTop: '6px', fontSize: '11px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 'bold' }}>
              <span>TOTAL:</span>
              <span>{moneda} {formatearMonto(factura.monto)}</span>
            </div>
            {factura.metodo_pago && <p style={{ margin: '4px 0 0 0' }}><strong>Método de pago:</strong> {factura.metodo_pago}</p>}
            {factura.comprobante && <p style={{ margin: '2px 0' }}><strong>Comprobante:</strong> {factura.comprobante}</p>}
          </div>

          <div style={{ marginTop: '12px', textAlign: 'center', borderTop: '1px dashed #000', paddingTop: '8px', fontSize: '10px' }}>
            <p style={{ margin: '2px 0', fontWeight: 'bold' }}>¡Gracias por confiar en ChloeRestaurant!</p>
            <p style={{ margin: '2px 0', fontSize: '9px' }}>Documento de control interno — no válido como comprobante fiscal.</p>
          </div>

        </div>

        <div className="ticket-acciones-modal" style={{ marginTop: '15px', display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-imprimir" onClick={imprimir} style={{ background: '#00f576', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>🖨️ Imprimir</button>
          <button className="btn-exportar-pdf" onClick={exportarPDF} style={{ background: '#1a73e8', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>📄 Exportar PDF</button>
          <button className="btn-cerrar-ticket" onClick={alCerrar} style={{ background: '#2a2a38', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>❌ Cerrar</button>
        </div>

      </div>
    </div>
  );
}

export default FacturaActivacion;
