import { useState } from 'react';
import { FileText, UserRoundCheck, TriangleAlert, Info } from 'lucide-react';
import { TIPOS, errorComprador, exigeComprador, fechaLegible, soloDigitos } from '../../utils/comprobantes.js';
import './selector-comprobante.css';

const TIPOS_ECF = ['E32', 'E31', 'E45', 'E44'];
const TIPOS_NCF = ['B02', 'B01', 'B15', 'B14'];

/**
 * Elige el comprobante fiscal de la venta y captura al comprador. Hasta la fecha de corte se ofrecen los e-CF y el NCF
 * tradicional; desde esa fecha, solo los e-CF. Crédito fiscal, gubernamental y regímenes especiales (y el consumo desde
 * RD$ 250,000) exigen RNC/cédula y nombre del cliente.
 */
export default function SelectorComprobante({ estado, tipo, onTipo, rnc, onRnc, nombre, onNombre, total = 0 }) {
  const [abierto, setAbierto] = useState(false);
  const corte = estado?.corte;
  const disponibles = new Map((estado?.tipos || []).map((t) => [t.codigo, t]));
  const obligatorio = Boolean(corte?.obligatorio);
  const exige = exigeComprador(tipo, total);
  const mostrarCliente = exige || abierto || Boolean(rnc) || Boolean(nombre);
  const error = mostrarCliente ? errorComprador({ tipo, total, rnc, nombre }) : '';
  const info = disponibles.get(tipo);
  const sinSecuencia = estado && info && !info.disponible;
  const diasRestantes = corte?.diasRestantes;

  const chip = (codigo) => {
    const t = disponibles.get(codigo);
    const habilitado = !estado || Boolean(t?.disponible);
    return (
      <button
        key={codigo}
        type="button"
        role="radio"
        aria-checked={tipo === codigo}
        className={`sc-chip ${tipo === codigo ? 'is-on' : ''} ${TIPOS[codigo].electronico ? '' : 'is-ncf'}`}
        disabled={!habilitado}
        title={habilitado ? TIPOS[codigo].titulo : `Sin secuencia ${codigo} activa: regístrala en DGII > Secuencias`}
        onClick={() => onTipo(codigo)}
      >
        <strong>{codigo}</strong>
        <small>{TIPOS[codigo].nombre.replace(' (NCF)', '')}</small>
      </button>
    );
  };

  return (
    <div className="sc">
      {corte && obligatorio && (
        <p className="sc-aviso sc-aviso--info"><Info size={15} />Facturación electrónica obligatoria desde el {fechaLegible(corte.fechaCorte)}: el NCF tradicional ya no es válido.</p>
      )}
      {corte && !obligatorio && diasRestantes <= 45 && (
        <p className="sc-aviso sc-aviso--warn">
          <TriangleAlert size={15} />El NCF tradicional deja de ser válido el {fechaLegible(corte.fechaCorte)} ({diasRestantes === 1 ? 'falta 1 día' : `faltan ${diasRestantes} días`}). Desde esa fecha solo se factura con e-CF.
        </p>
      )}

      <div className="sc-fila">
        <span className="sc-etiqueta"><FileText size={14} />Comprobante electrónico (e-CF)</span>
        <div className="sc-chips" role="radiogroup" aria-label="Tipo de comprobante electrónico">{TIPOS_ECF.map(chip)}</div>
      </div>
      {!obligatorio && estado && (
        <div className="sc-fila">
          <span className="sc-etiqueta">NCF tradicional <em>(hasta el {fechaLegible(corte.fechaCorte)})</em></span>
          <div className="sc-chips" role="radiogroup" aria-label="Tipo de NCF tradicional">{TIPOS_NCF.map(chip)}</div>
        </div>
      )}

      {sinSecuencia && <p className="sc-aviso sc-aviso--error"><TriangleAlert size={15} />No hay una secuencia {tipo} activa y con números disponibles. Regístrala en DGII &gt; Secuencias.</p>}
      {estado && TIPOS[tipo]?.electronico && estado.listoParaEcf === false && !sinSecuencia && (
        <p className="sc-aviso sc-aviso--warn"><TriangleAlert size={15} />La facturación electrónica no está completa (DGII &gt; e-CF): el comprobante quedará pendiente de validación.</p>
      )}

      {!exige && !mostrarCliente && (
        <button type="button" className="sc-cliente" onClick={() => setAbierto(true)}><UserRoundCheck size={15} />Identificar cliente (RNC o cédula)</button>
      )}
      {mostrarCliente && (
        <div className="sc-cliente-campos">
          <label className="sc-campo">
            <span>RNC o cédula{exige ? ' *' : ''}</span>
            <input
              className="cobro-input"
              inputMode="numeric"
              autoComplete="off"
              maxLength={13}
              placeholder="9 u 11 dígitos"
              value={rnc}
              onChange={(e) => onRnc(soloDigitos(e.target.value).slice(0, 11))}
              aria-invalid={Boolean(error)}
            />
          </label>
          <label className="sc-campo">
            <span>Nombre o razón social{exige && TIPOS[tipo]?.electronico ? ' *' : ''}</span>
            <input className="cobro-input" autoComplete="off" maxLength={150} placeholder="Como figura en el RNC" value={nombre} onChange={(e) => onNombre(e.target.value)} />
          </label>
          {error && <p className="sc-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
