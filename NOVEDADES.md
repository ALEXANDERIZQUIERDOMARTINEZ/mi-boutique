# Informe de novedades — MISHELL'ES BOUTIQUE

Periodo cubierto: **6 de mayo de 2026 → 14 de julio de 2026** (todo el historial registrado en git hasta hoy).

Este informe resume todo lo nuevo que se agregó a la aplicación en este periodo, organizado por área. Al final hay una línea de tiempo completa, commit por commit.

---

## 1. Identidad de marca

- **Cambio de nombre de la tienda**: de "Mishell Boutique" a **"MISHELL'ES BOUTIQUE"** en toda la app.
- **Rediseño del banner OG** (la imagen que se ve al compartir el link en WhatsApp/redes): logo elegante, sin texto de categorías encima.
- La página de fábrica al por mayor (`encargo.html`) pasó a mostrar la marca **"MISHELL'ES FÁBRICA"**.

## 2. Catálogo en PDF

- **Rediseño premium** del catálogo PDF descargable: solo precio al detal (sin mostrar variaciones internas de precio), 4 productos por página, sin productos agotados.
- **Modal de categoría** dentro del catálogo, con scroll adaptado a móvil.
- Corrección de imágenes distorsionadas para que las 4 tarjetas por página se vean reales y nítidas.

## 3. Direcciones y envíos

- **Autocompletar de barrio/vecindario** con soporte para "aprender" barrios nuevos que el cliente escriba, para que la próxima persona ya lo encuentre sugerido.

## 4. Página "Bajo Encargo" (`encargo.html`) — venta por catálogo con precios por volumen

Esta fue el área con más trabajo del periodo. Quedó así:

- **Selector de prendas por catálogo** con desbloqueo de precios mayoristas según cantidad (escalones tipo 6X / 12X / 24X / 50X).
- **Precios que se recalculan en vivo** apenas el cliente cambia la cantidad, sin tener que salir del campo.
- **Color por texto libre** en vez de selector fijo, y ese color ahora sí se refleja correctamente en el resumen del pedido (antes se quedaba mostrando "sin especificar" aunque el cliente lo hubiera escrito).
- **Multi-color por referencia**: se puede pedir la misma prenda en varios colores dentro del mismo pedido.
- **Mayoreo surtido**: ya no exige comprar 6/12/24 unidades del mismo tipo — se puede surtir entre referencias, aunque el segundo escalón (12X/24X) si exige mantener la misma categoría.
- **Mínimo por referencia subido de 2 a 6 unidades**, y se eliminó por completo el sistema de "código mayorista" (antes había que desbloquear un código para ver precios de mayor; ahora el acceso es libre y el precio de mayor se muestra siempre).
- **Fecha estimada de entrega** visible desde el encabezado.
- **Botón de condiciones del pedido al por mayor** y sección de reglas simplificada (se quitó la sección de "prendas de entrega inmediata").
- **Panel de resumen tipo "voucher"**, con desglose detallado del pedido y botón para quitar productos directamente desde el resumen.
- **Panel inferior colapsable** y, más adelante, **a pantalla completa**, con fin del parpadeo al seleccionar prendas.
- Varias rondas de **rediseño visual**: hero con tipografía Playfair Display, tarjeta de progreso flotante, grilla de prendas con hover y badge de selección; luego simplificado a una barra de información funcional (más compacta) tras detectar que el hero ocupaba demasiado espacio en móvil.
- **Legibilidad móvil mejorada**: más contraste en la caja de condiciones, textos más grandes, y los avisos de precio ahora hablan en lenguaje simple ("Con 12 de esta prenda: $16.000 c/u") en vez de jerga interna ("Nivel 6X").
- **Filtro/búsqueda y paginación** (30 productos por página).
- Corrección de que la página **saltaba de posición** al elegir prendas.
- Mejora del **mensaje que se arma para WhatsApp** al confirmar el pedido.

## 5. Catálogo al por mayor (`mayor.html`)

- **Rediseño completo** al mismo estilo visual de `encargo.html`, pero sin carrito de compra.
- **Colores disponibles visibles** directamente en cada tarjeta de producto.
- **Filtro/búsqueda y paginación** (30 por página), y versión compacta para móvil (se quitó el buscador flotante y la barra flotante inferior, con letra más pequeña para aprovechar espacio).
- **Mínimo de 6 prendas surtidas** (sin importar la referencia), en vez de exigir cantidades por producto individual.
- Se evita la **sobreventa** entre filas del mismo color/talla, y se eliminaron filas de color duplicadas.
- Se quitó la animación de la tarjeta al tocarla (mejora de fluidez en móvil).

## 6. Precios mayoristas por volumen (`wholesale-tiers.js` y admin)

- Sistema de **tablas de precio por volumen**, detectadas automáticamente por categoría (y con opción manual en el admin si hace falta forzarlo):
  - Body en mallatex
  - Body Elaborados
  - Vestidos cortos elaborados
  - Vestidos cortos semi elaborados
  - Vestidos largos Elaborados (1X $75.000, 6X $38.000, 12X $37.000, 24X $36.000, 50X $35.000)
- Los productos con **precio mayorista en 0** en el admin ya no se ofrecen al por mayor.

## 7. Panel de administración (`admin.html`)

- **Gestión de usuarios y roles reales**: ya no son roles simulados, se administran usuarios de verdad con sus permisos desde el admin.
- **Cerrar todas las sesiones** de un usuario desde el admin (útil si se pierde un dispositivo o se quiere forzar un cierre de sesión general).
- **Dashboard mayor/detal separado**: las ventas y ganancias al por mayor ahora se muestran separadas del total del día (antes se mezclaban), y luego se combinaron "Ventas hoy" y "Ventas mayoristas" en una sola tarjeta más clara.
- **Top 15 productos** del dashboard ahora distingue entre ventas al detal y al mayor.
- **Dashboard mejorado**: rango de fechas real y seleccionable, alerta de apartados vencidos, promociones activas visibles, y feed de actividad reciente.
- **Campana de notificaciones y menú de usuario** del topbar, ahora funcionales (antes eran solo visuales).
- **Módulos accesibles por link directo** (navegación más flexible dentro del admin).

## 8. Acceso e inicio de sesión (`login.html`)

- **Login por selector de usuario** en vez de escribir el correo cada vez: se elige el usuario de una lista.
- **Recuperar contraseña** disponible desde el login.
- El **directorio de usuarios** que alimenta ese selector ahora se trae desde Firestore (la base de datos en la nube), no solo del dispositivo local — así cualquier persona ve la lista completa de usuarios sin importar desde qué equipo entre.

## 9. Rendimiento

- **Cache-Control** agregado a las imágenes que se sirven desde Storage, para reducir los costos de descarga y acelerar la carga del catálogo.

---

## Línea de tiempo completa (commit por commit)

| Fecha | Cambio |
|---|---|
| 2026-05-08 | Cambio de nombre de la tienda a MISHELL'ES BOUTIQUE |
| 2026-05-12 | Autocompletado de barrio con aprendizaje de barrios nuevos |
| 2026-05-13 | Rediseño del banner OG (logo elegante, sin texto de categorías) |
| 2026-05-17 | Rediseño premium del catálogo PDF (solo precio detal, sin variaciones) |
| 2026-05-17 | Catálogo premium: 4 por página, modal de categoría, sin agotados |
| 2026-05-18 | Modal de categoría responsive con scroll para móvil |
| 2026-05-18 | Corrección de imágenes distorsionadas, 4 tarjetas reales por página |
| 2026-07-10 | Página de selección Bajo Encargo con desbloqueo de código mayorista |
| 2026-07-10 | Cache-Control en imágenes de Storage para reducir costos |
| 2026-07-10 | Ventas y ganancias mayoristas separadas del total del día |
| 2026-07-10 | "Ventas hoy" y "Ventas mayoristas" combinadas en una tarjeta |
| 2026-07-10 | Precios mayoristas por volumen, gate real de código, colores/observaciones en encargo |
| 2026-07-10 | Selector de color por texto libre y precio real por cantidad en encargo |
| 2026-07-10 | Se revierte el candado de código en mayor.html: acceso libre |
| 2026-07-10 | Rediseño de selección en encargo.html: multi-color por referencia |
| 2026-07-10 | Panel inferior de encargo.html colapsable |
| 2026-07-10 | Recalcular precio por cantidad en vivo |
| 2026-07-10 | Corrección de flecha inferior y flecha por tarjeta |
| 2026-07-10 | Detección de grupo de precio mayorista por categoría |
| 2026-07-10 | Intro compacta y fecha estimada de entrega en encargo.html |
| 2026-07-10 | Encabezado de encargo.html simplificado a chips compactos |
| 2026-07-10 | Cuadrícula más ancha y tablas de precio rediseñadas |
| 2026-07-10 | Mayoreo surtido: no exige mismo tipo en 6/12/24 |
| 2026-07-10 | Marca de encargo.html cambiada a MISHELL'ES FÁBRICA |
| 2026-07-10 | Botón de condiciones de pedido al por mayor |
| 2026-07-10 | Desglose detallado del pedido en el panel de total |
| 2026-07-10 | Rediseño minimalista del encabezado de encargo.html |
| 2026-07-10 | Estilo sobrio en tabla de precios y condiciones |
| 2026-07-10 | Se quita sección de "prendas de entrega inmediata" |
| 2026-07-10 | El surtido solo desbloquea el primer escalón; 12X/24X exige misma categoría |
| 2026-07-10 | Rediseño visual completo de encargo.html (hero Playfair Display, panel voucher) |
| 2026-07-10 | Hero de encargo.html más compacto |
| 2026-07-10 | Hero reemplazado por barra de información funcional |
| 2026-07-11 | Legibilidad móvil y mensajes de precio en lenguaje simple |
| 2026-07-11 | Código mayorista eliminado; mínimo sube a 6 por referencia; 3 tablas de precio nuevas |
| 2026-07-11 | Nuevo grupo de precio "Vestidos largos Elaborados" |
| 2026-07-11 | Corrección: el color escrito ya se refleja en el resumen del pedido |
| 2026-07-11 | Rediseño de mayor.html al estilo de encargo.html, sin carrito |
| 2026-07-11 | Filtro/búsqueda y paginación (30) en encargo.html y mayor.html |
| 2026-07-11 | No se vende al por mayor lo que tenga precio mayor en 0 |
| 2026-07-11 | mayor.html: mínimo de 6 prendas surtidas, sin importar referencia |
| 2026-07-11 | Botón para eliminar prendas seleccionadas desde el resumen |
| 2026-07-11 | Se evita sobreventa entre filas del mismo color/talla en mayor.html |
| 2026-07-12 | Tabla de precios para Vestidos cortos semi elaborados |
| 2026-07-12 | Catálogo mayorista compactado en móvil, se quita buscador flotante |
| 2026-07-12 | Se quita barra flotante inferior, letra más pequeña en mayor.html |
| 2026-07-12 | Se evitan filas de color duplicadas, sin animación al tocar tarjeta |
| 2026-07-12 | La página ya no salta al elegir prendas; mejor mensaje de WhatsApp |
| 2026-07-12 | Panel de pedido a pantalla completa, fin del parpadeo al seleccionar |
| 2026-07-14 | Gestión de usuarios y roles reales en admin.html |
| 2026-07-14 | Login por selector de usuario, y recuperar contraseña |
| 2026-07-14 | Colores disponibles visibles en cada tarjeta de mayor.html |
| 2026-07-14 | Cerrar todas las sesiones, dashboard mayor/detal, módulos por link |
| 2026-07-14 | Campana de notificaciones y menú de usuario del topbar activados |
| 2026-07-14 | Dashboard mejorado: rango de fechas real, apartados vencidos, promociones, actividad reciente |
| 2026-07-14 | Directorio de usuarios del login traído desde Firestore |
| 2026-07-14 | Top 15 productos del dashboard distingue detal/mayor |

---

*Informe generado automáticamente a partir del historial de git del proyecto.*
