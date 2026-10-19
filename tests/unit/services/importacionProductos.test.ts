import { describe, it, expect } from 'vitest';
import { analizarCsvProductos, CATEGORIA_POR_OMISION } from '../../../src/services/importacionProductos.js';

const COMPLETA =
  'nombre,descripcion,precio,categoria,tipo_destino,tipo_plato,tasa_itbis,aplica_propina,requiere_guarnicion,requiere_termino,imagen_url';

describe('analizarCsvProductos', () => {
  it('sigue aceptando la plantilla antigua de 6 columnas', () => {
    const csv = [
      'nombre,precio,categoria,tasa_itbis,aplica_propina,imagen_url',
      'Tostones,140.00,Acompañantes,18,SI,https://x.test/t.jpg',
      'Agua,55,Bebidas,0,NO,',
    ].join('\n');
    const { productos, invalidRows } = analizarCsvProductos(csv);
    expect(invalidRows).toEqual([]);
    expect(productos).toHaveLength(2);
    expect(productos[0]).toMatchObject({
      nombre: 'Tostones', precio: 140, categoria: 'Acompañantes', tasaItbis: 18, aplicaPropina: true,
      imagenUrl: 'https://x.test/t.jpg', descripcion: null, tipoDestino: 'cocina', tipoPlato: null,
      requiereGuarnicion: false, requiereTermino: false,
    });
    expect(productos[1]).toMatchObject({ tasaItbis: 0, aplicaPropina: false, imagenUrl: null });
  });

  it('lee todos los campos del formulario de creación', () => {
    const csv = [
      COMPLETA,
      'Churrasco,"Corte de res, a la parrilla",2000.00,Pollo y Carnes,cocina,plato_fuerte,16,SI,SI,SI,',
      'Presidente Grande,,220.00,Cervezas,bar,bebida,18,SI,NO,NO,',
    ].join('\n');
    const { productos } = analizarCsvProductos(csv);
    expect(productos[0]).toMatchObject({
      nombre: 'Churrasco', descripcion: 'Corte de res, a la parrilla', precio: 2000, categoria: 'Pollo y Carnes',
      tipoDestino: 'cocina', tipoPlato: 'plato_fuerte', tasaItbis: 16, aplicaPropina: true,
      requiereGuarnicion: true, requiereTermino: true,
    });
    expect(productos[1]).toMatchObject({ tipoDestino: 'bar', tipoPlato: 'bebida', tasaItbis: 18, descripcion: null, requiereTermino: false });
  });

  it('ignora la marca de orden de bytes que Excel agrega al guardar CSV UTF-8', () => {
    const csv = '﻿nombre,precio\nPan,50';
    expect(analizarCsvProductos(csv).productos).toHaveLength(1);
  });

  it('acepta cabeceras con acentos, mayúsculas y alias', () => {
    const csv = ['Nombre,Precio,Categoría,Descripción,Destino,Propina_Legal,Requiere_Término', 'Flan,375,Postres,Casero,Cocina,10%,no'].join('\n');
    const { productos } = analizarCsvProductos(csv);
    expect(productos[0]).toMatchObject({ categoria: 'Postres', descripcion: 'Casero', tipoDestino: 'cocina', aplicaPropina: true, requiereTermino: false });
  });

  it('usa la categoría por omisión cuando falta la columna o la celda', () => {
    const { productos } = analizarCsvProductos('nombre,precio,categoria\nA,10,\nB,20,Sopas');
    expect(productos[0].categoria).toBe(CATEGORIA_POR_OMISION);
    expect(productos[1].categoria).toBe('Sopas');
  });

  it('normaliza destino y tipo de plato y descarta valores desconocidos', () => {
    const csv = [COMPLETA, 'A,,10,X,Bebidas,Plato Fuerte,,,,,', 'B,,10,X,otro,postre,,,,,', 'C,,10,X,,inventado,,,,,'].join('\n');
    const { productos } = analizarCsvProductos(csv);
    expect(productos.map((p) => p.tipoDestino)).toEqual(['bar', 'cocina', 'cocina']);
    expect(productos.map((p) => p.tipoPlato)).toEqual(['plato_fuerte', 'postre', null]);
  });

  it('solo 16 o 18 activan el ITBIS y solo un valor afirmativo activa guarnición/término/propina', () => {
    const csv = [COMPLETA, 'A,,10,X,,,20,quizas,0,2,', 'B,,10,X,,,0,1,TRUE,SÍ,'].join('\n');
    const { productos } = analizarCsvProductos(csv);
    expect(productos[0]).toMatchObject({ tasaItbis: 0, aplicaPropina: false, requiereGuarnicion: false, requiereTermino: false });
    expect(productos[1]).toMatchObject({ tasaItbis: 0, aplicaPropina: true, requiereGuarnicion: true, requiereTermino: true });
  });

  it('informa las filas sin nombre o con precio inválido con su línea física, y salta las vacías', () => {
    const csv = ['nombre,precio', 'Bueno,10', '', ',25', 'Sin precio,', 'Negativo,-5', 'Letras,abc'].join('\n');
    const { productos, invalidRows } = analizarCsvProductos(csv);
    expect(productos.map((p) => p.nombre)).toEqual(['Bueno']);
    expect(invalidRows.map((f) => f.linea)).toEqual([4, 5, 6, 7]);
    expect(invalidRows.every((f) => f.error === 'Nombre o precio inválido.')).toBe(true);
  });

  it('acepta finales de línea de Windows', () => {
    expect(analizarCsvProductos('nombre,precio\r\nA,1\r\nB,2\r\n').productos).toHaveLength(2);
  });

  it('rechaza un archivo vacío o sin datos', () => {
    expect(() => analizarCsvProductos('')).toThrow(/vacío/);
    expect(() => analizarCsvProductos('nombre,precio\n')).toThrow(/vacío/);
  });

  it('rechaza un archivo al que le faltan nombre o precio', () => {
    expect(() => analizarCsvProductos('nombre,categoria\nA,B')).toThrow(/precio/);
    expect(() => analizarCsvProductos('precio\n10')).toThrow(/nombre/);
  });
});
