import React from 'react';
import { sanitizarDecimal } from '../../utils/input.js';

function formatearRD(val) {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function CierreView({
  cierreCajaData,
  tasaUsd,
  tasaEur,
  onTasaUsdChange,
  onTasaEurChange,
  onGuardarTasas,
  efectivoFisico,
  usdFisicoArqueo,
  eurFisicoArqueo,
  notasArqueo,
  onEfectivoChange,
  onUsdChange,
  onEurChange,
  onNotasChange,
  onArqueo,
  onImprimir
}) {
  if (!cierreCajaData) return null;

  return (
    <div className="cierre-view">
      <h3 className="cierre-view__title">Arqueo y Cuadre de Caja del Dia</h3>

      <div className="cierre-view__summary-grid">
        <div className="cierre-view__summary-card">
          <span className="cierre-view__summary-label">Fondo Inicial (RD$)</span>
          <h3 className="cierre-view__summary-value cierre-view__summary-value--cyan">RD$ {formatearRD(cierreCajaData.montoInicial)}</h3>
        </div>
        <div className="cierre-view__summary-card">
          <span className="cierre-view__summary-label">Ventas Netas</span>
          <h3 className="cierre-view__summary-value">RD$ {formatearRD(cierreCajaData.totalesGenerales.subtotal)}</h3>
        </div>
        <div className="cierre-view__summary-card">
          <span className="cierre-view__summary-label">ITBIS Recaudado</span>
          <h3 className="cierre-view__summary-value">RD$ {formatearRD(cierreCajaData.totalesGenerales.itbis)}</h3>
        </div>
        <div className="cierre-view__summary-card">
          <span className="cierre-view__summary-label">Propina Legal</span>
          <h3 className="cierre-view__summary-value">RD$ {formatearRD(cierreCajaData.totalesGenerales.propina)}</h3>
        </div>
        <div className="cierre-view__summary-card cierre-view__summary-card--accent">
          <span className="cierre-view__summary-label cierre-view__summary-label--accent">Total Ingresos</span>
          <h3 className="cierre-view__summary-value cierre-view__summary-value--accent">RD$ {formatearRD(cierreCajaData.totalesGenerales.total)}</h3>
        </div>
      </div>

      <div className="cierre-view__divisas">
        <div className="cierre-view__divisas-header">
          <h4>Configuracion de Tasas de Divisas Extranjeras</h4>
          <button className="cierre-view__divisas-save-btn" onClick={onGuardarTasas}>
            Actualizar Tasas
          </button>
        </div>
        <div className="cierre-view__divisas-fields">
          <div className="cierre-view__divisas-field">
            <label>Tasa Dolar (USD $ a RD$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={tasaUsd}
              onChange={(e) => onTasaUsdChange(sanitizarDecimal(e.target.value))}
              className="cierre-view__divisas-input"
            />
          </div>
          <div className="cierre-view__divisas-field">
            <label>Tasa Euro (EUR € a RD$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={tasaEur}
              onChange={(e) => onTasaEurChange(sanitizarDecimal(e.target.value))}
              className="cierre-view__divisas-input cierre-view__divisas-input--eur"
            />
          </div>
        </div>
      </div>

      <div className="cierre-view__arqueo">
        <h4>Arqueo Ciego de Turno (Conteo Multidivisa en Gaveta)</h4>

        <div className="cierre-view__arqueo-grid">
          <div className="cierre-view__arqueo-field">
            <label>Efectivo Pesos (RD$)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={efectivoFisico}
              onChange={(e) => onEfectivoChange(sanitizarDecimal(e.target.value))}
              className="cierre-view__arqueo-input"
            />
          </div>

          <div className="cierre-view__arqueo-field">
            <label>Dolares ($ USD)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={usdFisicoArqueo}
              onChange={(e) => onUsdChange(sanitizarDecimal(e.target.value))}
              className="cierre-view__arqueo-input cierre-view__arqueo-input--usd"
            />
            {usdFisicoArqueo > 0 && <span className="cierre-view__arqueo-conversion">= RD$ {formatearRD(usdFisicoArqueo * tasaUsd)}</span>}
          </div>

          <div className="cierre-view__arqueo-field">
            <label>Euros (€ EUR)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={eurFisicoArqueo}
              onChange={(e) => onEurChange(sanitizarDecimal(e.target.value))}
              className="cierre-view__arqueo-input cierre-view__arqueo-input--eur"
            />
            {eurFisicoArqueo > 0 && <span className="cierre-view__arqueo-conversion cierre-view__arqueo-conversion--eur">= RD$ {formatearRD(eurFisicoArqueo * tasaEur)}</span>}
          </div>
        </div>

        <div className="cierre-view__arqueo-actions">
          <div className="cierre-view__arqueo-notes">
            <label>Notas u Observaciones</label>
            <input
              type="text"
              placeholder="Ej: Billetes de $100 USD y cambio inicial..."
              value={notasArqueo}
              onChange={(e) => onNotasChange(e.target.value)}
            />
          </div>
          <button className="cierre-view__arqueo-submit" onClick={onArqueo}>
            Registrar Arqueo Multidivisa
          </button>
        </div>
      </div>

      <div className="cierre-view__breakdowns">
        <div className="cierre-view__breakdown-card">
          <h4 style={{ color: 'var(--orange)' }}>Desglose por Metodo de Pago</h4>
          {cierreCajaData.desgloseMetodos.map((m, i) => (
            <div key={i} className="cierre-view__breakdown-row">
              <span>{m.metodo_pago} ({m.cantidad} tickets)</span>
              <strong>RD$ {formatearRD(m.total)}</strong>
            </div>
          ))}
        </div>

        <div className="cierre-view__breakdown-card">
          <h4 style={{ color: 'var(--green)' }}>Desglose Fiscal (DGII)</h4>
          {cierreCajaData.desgloseFiscal.map((f, i) => (
            <div key={i} className="cierre-view__breakdown-row">
              <span>Tipo {f.tipo_comprobante} ({f.cantidad} facturas)</span>
              <strong>RD$ {formatearRD(f.total)}</strong>
            </div>
          ))}
        </div>
      </div>

      <button className="cierre-view__print-btn" onClick={onImprimir}>
        Imprimir Corte de Caja
      </button>
    </div>
  );
}

export default CierreView;
