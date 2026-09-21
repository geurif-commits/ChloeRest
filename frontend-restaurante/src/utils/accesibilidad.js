let contador = 0;

/**
 * Asocia cada <label> de un grupo de formulario (.admin-form-group) con su campo, para que los lectores de
 * pantalla anuncien el nombre del campo. Solo actúa donde el <label> no tiene htmlFor ni envuelve al campo.
 */
export function asociarEtiquetas(raiz = document) {
  raiz.querySelectorAll('.admin-form-group').forEach((grupo) => {
    const etiqueta = grupo.querySelector(':scope > label');
    const campo = grupo.querySelector(':scope > input, :scope > select, :scope > textarea, :scope > div > input, :scope > div > select');
    if (!etiqueta || !campo || etiqueta.htmlFor || etiqueta.contains(campo)) return;
    if (!campo.id) {
      contador += 1;
      campo.id = `campo-${contador}`;
    }
    etiqueta.htmlFor = campo.id;
  });
}

/** Asocia las etiquetas ahora y cada vez que el panel agrega formularios nuevos. Devuelve la función para detenerlo. */
export function observarEtiquetas(raiz = document.body) {
  asociarEtiquetas(raiz);
  let pendiente = false;
  const observador = new MutationObserver(() => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => { pendiente = false; asociarEtiquetas(raiz); });
  });
  observador.observe(raiz, { childList: true, subtree: true });
  return () => observador.disconnect();
}
