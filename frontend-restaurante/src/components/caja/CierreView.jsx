import React, { useState, useEffect, useCallback } from 'react';
import {
  ChartColumn, ClipboardList, CircleCheck, Banknote, CreditCard, Landmark, ArrowLeftRight, Lock,
  Printer, Search, TrendingUp, TrendingDown, Save
} from 'lucide-react';
import { sanitizarDecimal } from '../../utils/input.js';
import { toastAviso } from '../Toast.jsx';
import './caja.css';

function formatearRD(val) {
  return Number(val || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* Tarjetita métrica reutilizable */
function Metrica({ etiqueta, valor, Icono, tono, grande }) {
  return (
    <div className={`cv-metric ${grande ? 'cv-metric--lg' : ''}`} data-tone={tono}>
      <span className="cv-metric__label">{Icono && <Icono size={14} />}{etiqueta}</span>
      <strong>{valor}</strong>
    </div>
  );
}

function Diferencia({ valor }) {
  const n = Number(valor || 0);
  if (n === 0) return null;
  const sobra = n > 0;
  return (
    <div className={`cv-diff ${sobra ? 'cv-diff--up' : 'cv-diff--down'}`}>
      {sobra ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
      <span>{sobra ? 'Sobrante' : 'Faltante'}</span>
      <strong>RD$ {formatearRD(Math.abs(n))}</strong>
    </div>
  );
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
  onImprimir,
  onCerrarCaja,
  cierreReciente,
  apiUrl
}) {
  const [pestana, setPestana] = useState('turno');
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [filtroDesde, setFiltroDesde] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);

  const urlBase = apiUrl;

  const cargarHistorial = useCallback(async () => {
    setCargandoHistorial(true);
    try {
      const params = new URLSearchParams();
      if (filtroDesde) params.set('desde', filtroDesde);
      if (filtroHasta) params.set('hasta', filtroHasta);
      const res = await fetch(`${urlBase}/api/caja/cierres?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setHistorial(data);
      }
    } catch {
      toastAviso("Error al cargar historial de cierres.");
    } finally {
      setCargandoHistorial(false);
    }
  }, [filtroDesde, filtroHasta, urlBase]);

  useEffect(() => {
    if (pestana === 'historial') cargarHistorial();
  }, [pestana, cargarHistorial]);

  if (!cierreCajaData && !cierreReciente) return null;

  const desgloseMetodos = cierreCajaData?.desgloseMetodos ?? [];
  const desgloseFiscal = cierreCajaData?.desgloseFiscal ?? [];

  const mostrarReporte = cierreReciente ? (
    <section className="cv-card cv-card--done">
      <div className="cv-card__head">
        <span className="cv-card__badge cv-card__badge--ok"><CircleCheck size={22} /></span>
        <div>
          <h3>Caja cerrada · reporte del turno</h3>
          <p>{new Date(cierreReciente.fecha_cierre).toLocaleString()}</p>
        </div>
      </div>

      <div className="cv-grid cv-grid--3">
        <Metrica etiqueta="Cajero/a" valor={cierreReciente.usuario_nombre} />
        <Metrica etiqueta="Fondo inicial" valor={`RD$ ${formatearRD(cierreReciente.monto_inicial)}`} />
        <Metrica etiqueta="Total ventas" valor={`RD$ ${formatearRD(cierreReciente.total_ventas)}`} tono="gold" grande />
      </div>

      <h4 className="cv-subtitle">Desglose por método de pago</h4>
      <div className="cv-grid cv-grid--3">
        <Metrica etiqueta="Efectivo" Icono={Banknote} valor={`RD$ ${formatearRD(cierreReciente.efectivo)}`} tono="ok" />
        <Metrica etiqueta="Tarjeta" Icono={CreditCard} valor={`RD$ ${formatearRD(cierreReciente.tarjeta)}`} tono="warn" />
        <Metrica etiqueta="Transferencia" Icono={Landmark} valor={`RD$ ${formatearRD(cierreReciente.transferencia)}`} tono="info" />
      </div>

      <div className="cv-grid cv-grid--3">
        <Metrica etiqueta="ITBIS" valor={`RD$ ${formatearRD(cierreReciente.total_itbis)}`} />
        <Metrica etiqueta="Propina" valor={`RD$ ${formatearRD(cierreReciente.total_propina)}`} />
        <Metrica etiqueta="Facturas" valor={cierreReciente.total_facturas} />
      </div>

      <Diferencia valor={cierreReciente.diferencia_efectivo} />
    </section>
  ) : null;

  return (
    <div className="cierre-view">
      {/* Pestañas */}
      <div className="cv-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={pestana === 'turno'} className={`cv-tab ${pestana === 'turno' ? 'is-active' : ''}`} onClick={() => setPestana('turno')}>
          <ChartColumn size={16} /> Turno actual
        </button>
        <button type="button" role="tab" aria-selected={pestana === 'historial'} className={`cv-tab ${pestana === 'historial' ? 'is-active' : ''}`} onClick={() => setPestana('historial')}>
          <ClipboardList size={16} /> Historial de cierres
        </button>
      </div>

      {/* PESTAÑA: Turno Actual */}
      {pestana === 'turno' && (
        <>
          {mostrarReporte}

          <div className="cv-grid cv-grid--2">
            <section className="cv-card">
              <h4 className="cv-subtitle">Desglose por método de pago</h4>
              {desgloseMetodos.length === 0 && <p className="cv-empty">Aún no hay cobros en este turno.</p>}
              {desgloseMetodos.map((m, i) => (
                <div key={i} className="cv-row">
                  <span>{m.metodo_pago} <small>({m.cantidad} tickets)</small></span>
                  <strong>RD$ {formatearRD(m.total)}</strong>
                </div>
              ))}
            </section>
            <section className="cv-card">
              <h4 className="cv-subtitle">Desglose fiscal (DGII)</h4>
              {desgloseFiscal.length === 0 && <p className="cv-empty">Sin comprobantes emitidos en este turno.</p>}
              {desgloseFiscal.map((f, i) => (
                <div key={i} className="cv-row">
                  <span>Tipo {f.tipo_comprobante} <small>({f.cantidad} facturas)</small></span>
                  <strong>RD$ {formatearRD(f.total)}</strong>
                </div>
              ))}
            </section>
          </div>

          {/* TASAS DE DIVISAS */}
          <section className="cv-card">
            <div className="cv-card__bar">
              <h4 className="cv-subtitle"><ArrowLeftRight size={15} /> Tasas de divisas</h4>
              <button type="button" className="px-btn px-btn--sm" onClick={onGuardarTasas}><Save size={14} /> Guardar</button>
            </div>
            <div className="cv-grid cv-grid--2">
              <label className="cv-field">
                <span>USD $ → RD$</span>
                <input className="po-input" type="text" inputMode="decimal" value={tasaUsd} onChange={(e) => onTasaUsdChange(sanitizarDecimal(e.target.value))} />
              </label>
              <label className="cv-field">
                <span>EUR € → RD$</span>
                <input className="po-input" type="text" inputMode="decimal" value={tasaEur} onChange={(e) => onTasaEurChange(sanitizarDecimal(e.target.value))} />
              </label>
            </div>
          </section>

          {/* ARQUEO CIEGO — CONTEO EN GAVETA */}
          <section className="cv-card cv-card--accent">
            <div className="cv-card__head">
              <span className="cv-card__badge"><Lock size={20} /></span>
              <div>
                <h3>Arqueo ciego</h3>
                <p>Cuenta el efectivo en gaveta por divisa antes de cerrar el turno.</p>
              </div>
            </div>

            <div className="cv-grid cv-grid--3">
              <label className="cv-field">
                <span>Efectivo pesos (RD$)</span>
                <input className="po-input cv-input--count" type="text" inputMode="decimal" placeholder="0.00" value={efectivoFisico} onChange={(e) => onEfectivoChange(sanitizarDecimal(e.target.value))} />
              </label>
              <label className="cv-field">
                <span>Dólares (US$)</span>
                <input className="po-input cv-input--count" type="text" inputMode="decimal" placeholder="0.00" value={usdFisicoArqueo} onChange={(e) => onUsdChange(sanitizarDecimal(e.target.value))} />
                {usdFisicoArqueo > 0 && <em>= RD$ {formatearRD(usdFisicoArqueo * tasaUsd)}</em>}
              </label>
              <label className="cv-field">
                <span>Euros (€)</span>
                <input className="po-input cv-input--count" type="text" inputMode="decimal" placeholder="0.00" value={eurFisicoArqueo} onChange={(e) => onEurChange(sanitizarDecimal(e.target.value))} />
                {eurFisicoArqueo > 0 && <em>= RD$ {formatearRD(eurFisicoArqueo * tasaEur)}</em>}
              </label>
            </div>

            <label className="cv-field">
              <span>Notas u observaciones</span>
              <input className="po-input" type="text" placeholder="Billetes de US$100, cambio inicial…" value={notasArqueo} onChange={(e) => onNotasChange(e.target.value)} />
            </label>

            <button type="button" className="px-btn px-btn--gold px-btn--lg" onClick={onArqueo}><ClipboardList size={18} /> Registrar arqueo</button>
          </section>

          {/* BOTONES DE ACCIÓN */}
          <div className="cv-actions">
            <button type="button" className="px-btn px-btn--lg" onClick={onImprimir}><Printer size={18} /> Imprimir cierre de caja</button>
            <button type="button" className="px-btn px-btn--lg px-btn--danger" onClick={onCerrarCaja}><Lock size={18} /> Cerrar caja</button>
          </div>
        </>
      )}

      {/* PESTAÑA: Historial de Cierres */}
      {pestana === 'historial' && (
        <div className="cv-history">
          <div className="cv-filters">
            <label className="cv-field">
              <span>Desde</span>
              <input className="po-input" type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
            </label>
            <label className="cv-field">
              <span>Hasta</span>
              <input className="po-input" type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
            </label>
            <button type="button" className="px-btn px-btn--gold" style={{ minHeight: 46 }} onClick={cargarHistorial} disabled={cargandoHistorial}>
              <Search size={16} /> {cargandoHistorial ? 'Cargando…' : 'Buscar'}
            </button>
          </div>

          {historial.length === 0 ? (
            <div className="cv-blank">No hay cierres registrados en este período.</div>
          ) : (
            <div className="cv-list">
              {historial.map((c) => (
                <article key={c.id} className="cv-card">
                  <div className="cv-card__bar">
                    <div>
                      <div className="cv-who">
                        <span className="cv-date">{new Date(c.fecha_cierre).toLocaleDateString()}</span>
                        <strong>{c.usuario_nombre}</strong>
                      </div>
                      <p className="cv-muted">Apertura {new Date(c.fecha_apertura).toLocaleString()} · Cierre {new Date(c.fecha_cierre).toLocaleString()}</p>
                    </div>
                    <span className="cv-total">RD$ {formatearRD(c.total_ventas)}</span>
                  </div>

                  <div className="cv-grid cv-grid--3">
                    <Metrica etiqueta="Efectivo" Icono={Banknote} valor={`RD$ ${formatearRD(c.efectivo)}`} tono="ok" />
                    <Metrica etiqueta="Tarjeta" Icono={CreditCard} valor={`RD$ ${formatearRD(c.tarjeta)}`} tono="warn" />
                    <Metrica etiqueta="Transferencia" Icono={Landmark} valor={`RD$ ${formatearRD(c.transferencia)}`} tono="info" />
                  </div>

                  <Diferencia valor={c.diferencia_efectivo} />
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default CierreView;
