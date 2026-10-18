import { useEffect, useState } from 'react';
import { obtenerSesion } from '../../api.js';

const GUARNICIONES_BASE = ['Tostones', 'Papas Fritas', 'Arroz Blanco', 'Vegetales Salteados', 'Puré de Papas', 'Moro de Guandules'];
const TERMINOS_BASE = ['Término Medio (Medium)', 'Tres Cuartos (3/4)', 'Bien Cocido (Well Done)', 'Término Azul (Bleu)', 'Al Punto'];

const nombresDe = (lista, base) =>
  (Array.isArray(lista) && lista.length > 0 ? lista.map((o) => o.nombre) : base);

/** Guarniciones y términos configurados en el menú (los de siempre si no hay ninguno o falla la carga). */
export default function useOpcionesPlato(apiUrl) {
  const [opciones, setOpciones] = useState({ guarniciones: GUARNICIONES_BASE, terminos: TERMINOS_BASE });
  useEffect(() => {
    if (!apiUrl) return undefined;
    let activo = true;
    fetch(`${apiUrl}/api/menu-configuracion`, { headers: { Authorization: `Bearer ${obtenerSesion()}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!activo || !cfg) return;
        setOpciones({ guarniciones: nombresDe(cfg.guarniciones, GUARNICIONES_BASE), terminos: nombresDe(cfg.terminos, TERMINOS_BASE) });
      })
      .catch(() => {});
    return () => { activo = false; };
  }, [apiUrl]);
  return opciones;
}
