# Manual de uso de ChloeRestaurant

Guía de capacitación para el personal del restaurante. Cada persona entra con **su PIN de 6 dígitos**: no lo compartas.

## 1. Empezar el día

1. Enciende el equipo y abre ChloeRestaurant. Si es un equipo nuevo, actívalo con la clave que te entregaron.
2. En la pantalla de acceso, toca **Fichar entrada o salida**, escribe tu PIN y confirma. El sistema te asigna el **Turno 1** o el **Turno 2** según la hora y avisa si llegas tarde.
3. Para trabajar, escribe tu PIN en el teclado numérico. Cinco PIN incorrectos seguidos bloquean el acceso unos minutos.
4. Al terminar, vuelve a fichar (**salida**). Si olvidas la salida, el sistema la cierra solo al pasar 16 horas y lo marca para el administrador.

## 2. Camarero: mesas y comandas

- **Mapa de mesas:** cada mesa muestra si está libre, ocupada o reservada, cuánto tiempo lleva abierta y cuánto se ha consumido. Toca una mesa libre para abrirla.
- **Tomar el pedido:** elige la categoría, toca el plato para agregarlo (más de una vez para varias unidades). Si pide término de cocción, guarnición o una nota ("sin cebolla"), se abre una ventana para indicarlo.
- **Enviar comanda:** *Enviar comanda* manda lo nuevo a Cocina (comidas) y a Bar (bebidas) al instante. Lo ya enviado no se puede quitar sin autorización de un supervisor.
- **Pre-cuenta:** imprime la cuenta para mostrársela al cliente antes de cobrar.
- Solo ves las mesas que abriste tú; para entrar a una mesa ocupada tuya se te pide tu PIN.

## 3. Cocina y Bar (pantallas KDS)

- Entra con **KDS Cocina** o **KDS Bar** en la pantalla de acceso y tu PIN. Cada área ve solo lo suyo: comidas en Cocina, bebidas en Bar.
- Cada comanda muestra la mesa, el tiempo de espera y las notas. Toca **Listo** en cada plato o **Despachar mesa completa**.
- La pantalla se actualiza sola; el punto **En vivo** indica que está conectada.

## 4. Cajero: abrir, cobrar y cerrar

1. **Abrir caja:** al entrar se pide el fondo inicial (el efectivo con que empiezas). Sin caja abierta el sistema **no permite cobrar**.
2. **Cobrar:** toca la mesa en *Cuentas abiertas* y revisa los artículos y totales. Luego **Proceder al pago**:
   - **Efectivo:** escribe lo que entrega el cliente y el sistema calcula el cambio. Acepta RD$, USD y EUR con la tasa configurada.
   - **Tarjeta:** indica los últimos 4 dígitos. **Transferencia:** elige el banco.
   - **Pago mixto:** combina dos métodos indicando cuánto se paga con el segundo.
   - Elige el tipo de comprobante (consumidor final u otro) y escribe el RNC/cédula si el cliente lo pide. Pulsa **Facturar**.
3. **Dividir cuenta:** en el detalle de cobro toca **Dividir cuenta** y elige con − / + qué se cobra ahora. Lo demás **sigue abierto** en la mesa y se cobra después con su propio comprobante.
4. **Descuento:** toca **Descuento**, elige porcentaje o monto y **escribe el motivo** (es obligatorio y queda registrado). El descuento reduce la base del ITBIS y de la propina.
5. **Cerrar caja:** al terminar el turno, *Cierre de caja*: cuenta el efectivo y escríbelo; el sistema muestra ventas, propina, diferencia y guarda el reporte.

## 4b. ITBIS y propina

Por defecto **no se cobran** (se activan en *Datos de la Empresa → Fiscal & Cuentas*). Los precios del menú **no** los incluyen: se suman al subtotal. La propina se puede fijar de **2 % a 30 %**.

## 5. Administrador

Entra con tu PIN al panel administrativo. Lo esencial:

| Quiero… | Dónde |
|---|---|
| Ver ventas del día y mesas | Principal → Centro de mando |
| Crear o cambiar productos y precios | Operaciones → Catálogo de Menú (categorías: las de bebidas van al Bar) |
| Importar el menú desde un archivo | Catálogo de Menú → Importar CSV |
| Agregar empleados y sus PIN | Equipo → Personal y Accesos |
| Ver entradas y salidas, y cambiar los horarios de turno | Equipo → Turnos y Asistencia → Horarios |
| Activar ITBIS o propina, elegir el % de propina | Equipo → Datos de la Empresa → Fiscal & Cuentas |
| Configurar comprobantes (NCF) y reportes 606/607 | Equipo → Comprobantes DGII |
| Ver facturas, reimprimir o consultar cierres | Ventas → Historial de facturas |
| Cambiar tema, logo, fondo y pantalla de acceso | Sistema → Tema y Colores / Logotipo y Fondo |
| **Respaldar los datos** | Equipo → Datos de la Empresa → **Respaldos** |

**Respaldos:** el sistema respalda solo cada noche. Una vez por semana, entra a *Respaldos*, descarga el más reciente y **guárdalo fuera del equipo** (memoria USB o la nube).

## 6. Si algo falla

| Problema | Qué hacer |
|---|---|
| "La caja está cerrada" al cobrar | El cajero debe abrir la caja (fondo inicial). |
| "PIN incorrecto" / acceso bloqueado | Espera unos minutos. Si olvidaste tu PIN, el administrador lo restablece. |
| El equipo muestra la pantalla de bienvenida | El equipo no está activado: pide al administrador o a soporte la clave de activación. Si ya estaba activado y el servidor no responde un momento, el sistema recuerda la activación y no debería pasar. |
| No salen comandas en Cocina o Bar | Revisa que el KDS esté abierto con "En vivo" y que la categoría del producto sea de comida (Cocina) o de bebida (Bar). |
| ChloeRestaurant no abre o se queda en segundo plano | Espera a que termine la pantalla "Iniciando ChloeRestaurant…" (la primera vez tarda más). Si aparece un mensaje de error, toca *Reintentar*; si persiste, envía a soporte el archivo `%APPDATA%\chloerestaurant\main.log`. |
| No imprime | Verifica la impresora en *Datos de la Empresa → Estaciones & Despacho* y que esté encendida y con papel. |
| "La base de datos no está actualizada" | Avisa a soporte: falta aplicar una actualización en el servidor. |

Soporte: [teléfono / WhatsApp / correo del distribuidor].
