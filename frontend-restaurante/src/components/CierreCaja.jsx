import { useState, useEffect } from 'react';
import { sanitizarDecimal } from '../utils/input.js';
import { toastExito, toastError, toastAviso } from './Toast.jsx';

function CierreCaja({ alVolver, apiUrl }) {
  const [datosCierre, setDatosCierre] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [efectivoContado, setEfectivoContado] = useState('');

  const formatearRD = (val) => {
    return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    cargarCierre();
  }, []);

  const cargarCierre = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/reportes/cierre`);
      const data = await res.json();
      setDatosCierre(data);
      setCargando(false);
    } catch (error) {
      toastError("Error al cargar los datos del cierre de caja.");
      setCargando(false);
    }
  };

  const imprimirCierre = () => {
    window.print();
  };

  if (cargando) return <div className="menu-container"><p style={{color: '#fff', padding: '20px'}}>Calculando cierre de caja...</p></div>;

  const { totalesGenerales, desgloseMetodos, desgloseFiscal, montoInicial } = datosCierre;
  
  // Buscar cuánto se recaudó en efectivo en el sistema
  const efectivoSistema = desgloseMetodos.find(m => m.metodo_pago === 'Efectivo')?.total || 0;
  const efectivoEsperado = Number(montoInicial || 0) + Number(efectivoSistema);
  const diferencia = efectivoContado !== '' ? parseFloat(efectivoContado) - efectivoEsperado : 0;

  return (
    <div className="menu-container" style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '20px'}}>
      <div style={{width: '100%', maxWidth: '600px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
        <button onClick={alVolver} className="btn-volver">⬅ Volver</button>
        <h2 style={{color: '#fff', margin: 0}}>💵 Cierre de Caja / Turno</h2>
        <button onClick={imprimirCierre} className="btn-agregar" style={{background: '#00e5ff', color: '#000', border: 'none'}}>🖨️ Imprimir Corte</button>
      </div>

      <div className="ticket-papel" id="area-impresion" style={{width: '100%', maxWidth: '500px'}}>
        <div className="ticket-encabezado">
          <h3>CORTE DE CAJA DIARIO</h3>
          <p>Fecha: {new Date().toLocaleString()}</p>
        </div>

        <div className="ticket-divider">------------------------------------</div>

        <div className="ticket-totales">
          <div className="t-row"><span>Total Facturas Emitidas:</span> <strong>{totalesGenerales.total_facturas}</strong></div>
          <div className="t-row"><span>Fondo Inicial de Apertura:</span> <span>RD$ {formatearRD(montoInicial)}</span></div>
          <div className="t-row"><span>Subtotal Acumulado:</span> <span>RD$ {formatearRD(totalesGenerales.subtotal)}</span></div>
          <div className="t-row"><span>ITBIS Recaudado:</span> <span>RD$ {formatearRD(totalesGenerales.itbis)}</span></div>
          <div className="t-row"><span>Propina Ley (10%):</span> <span>RD$ {formatearRD(totalesGenerales.propina)}</span></div>
          <div className="t-row t-final"><span>GRAN TOTAL RECAUDADO:</span> <span>RD$ {formatearRD(totalesGenerales.total)}</span></div>
        </div>

        <div className="ticket-divider">------------------------------------</div>
        <p style={{fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'center', margin: '5px 0'}}>DESGLOSE POR MÉTODO DE PAGO</p>
        {desgloseMetodos.map((metodo, idx) => (
          <div key={idx} style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', margin: '3px 0'}}>
            <span>{metodo.metodo_pago} ({metodo.cantidad} tks):</span>
            <strong>RD$ {formatearRD(metodo.total)}</strong>
          </div>
        ))}

        <div className="ticket-divider">------------------------------------</div>
        <p style={{fontWeight: 'bold', fontSize: '0.8rem', textAlign: 'center', margin: '5px 0'}}>DESGLOSE FISCAL (DGII)</p>
        {desgloseFiscal.map((fiscal, idx) => (
          <div key={idx} style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', margin: '3px 0'}}>
            <span>{fiscal.tipo_comprobante} ({fiscal.cantidad}):</span>
            <strong>RD$ {formatearRD(fiscal.total)}</strong>
          </div>
        ))}

        {/* Control de Cuadre de Efectivo */}
        <div className="ticket-divider">------------------------------------</div>
        <div style={{marginTop: '10px', background: '#f4f4f4', padding: '10px', borderRadius: '4px'}}>
          <p style={{margin: '0 0 5px 0', fontWeight: 'bold'}}>Arqueo de Efectivo en Caja:</p>
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px'}}>
            <span>Fondo Inicial:</span>
            <span>RD$ {formatearRD(montoInicial)}</span>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '5px'}}>
            <span>Efectivo Esperado en Gaveta:</span>
            <span>RD$ {formatearRD(efectivoEsperado)}</span>
          </div>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', gap: '5px'}}>
            <span>Efectivo Contado (RD$):</span>
            <input 
              type="text" 
              inputMode="decimal" 
              placeholder="0.00" 
              value={efectivoContado} 
              onChange={(e) => setEfectivoContado(sanitizarDecimal(e.target.value))}
              style={{width: '110px', padding: '2px', border: '1px solid #ccc', fontWeight: 'bold'}}
            />
          </div>
          {efectivoContado !== '' && (
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '5px', fontWeight: 'bold', color: diferencia < 0 ? '#d9534f' : '#2b542c'}}>
              <span>Diferencia (Sobrante/Faltante):</span>
              <span>RD$ {formatearRD(diferencia)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CierreCaja;
