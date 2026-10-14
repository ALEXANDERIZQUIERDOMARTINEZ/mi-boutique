# 🛍️ Mishell's: Boutique y Fábrica

Tienda en línea y paneles de administración de **Mishell's Boutique**
(venta al detal) y **Mishell's Fábrica** (venta al por mayor y bajo
encargo), sobre un mismo proyecto de Firebase.

## Stack
- HTML, CSS y JavaScript sin build: los archivos se sirven tal cual.
- Firebase v9 (Firestore, Auth y Storage), cargado desde el CDN de gstatic.
- Bootstrap 5.3 y Chart.js.
- Despliegue en Vercel (`vercel.json`).

## Dominios
| Dominio | Página |
|---|---|
| `mishelles.store` | `index.html`: catálogo al detal |
| `fabrica.mishelles.store` | `mayor.html`: catálogo mayorista |
| `ameigroup.mishelles.store` | `login.html`: acceso del personal |

## Páginas
| Página | JS | Qué hace |
|---|---|---|
| `index.html` | `app.js` | Catálogo, carrito y checkout. El pedido se guarda en `pedidosWeb` y se abre WhatsApp. |
| `mayor.html` | `mayor.js` | Catálogo mayorista con precios por cantidad (`wholesale-tiers.js`). |
| `encargo.html` | `encargo.js` | Pedidos bajo encargo (mínimo 6 por prenda). |
| `login.html` | inline | Inicio de sesión. Cada persona entra al panel de su negocio. |
| `admin.html` | `admin.js` | Panel de Boutique. |
| `admin-fabrica.html` | `admin-fabrica.js` | Panel de Fábrica. |
| `comprobante.html` | inline | Comprobante de pago. |

Módulos compartidos de los paneles:
- `auth.js`: sesión, roles y permisos.
- `admin-auth-init.js` y `admin-fabrica-auth-init.js`: guard de cada panel.
- `usuarios.js` (gestión de usuarios) y `auditoria.js` (historial de cambios).
- `barcode-system.js`, `etiquetas.js` y `etiquetas-fabrica.js`: códigos de barras e impresión de etiquetas.

## Boutique y Fábrica
Cada documento lleva `tenantId: 'boutique'` o `tenantId: 'fabrica'`. Los
documentos sin `tenantId` son de Boutique (anteriores a la separación).

- El `tenantId` del documento `usuarios/{uid}` decide a qué panel entra cada
  persona (`PANEL_POR_NEGOCIO` en `auth.js`).
- Super Admin no tiene `tenantId`: elige el negocio en el login.
- `firestore.rules` impide leer o escribir datos del otro negocio.

## Permisos
Los roles (Administrador, Vendedor, Inventario, Contador, Repartidor,
Visualizador y Super Admin) y sus permisos están en `auth.js`. Las claves
de permiso deben coincidir con las que evalúa `firestore.rules`, que es la
autoridad real; el panel solo oculta lo que la persona no puede usar.

## Desarrollo
1. Servir la carpeta con cualquier servidor estático, por ejemplo
   `python3 -m http.server`.
2. Cada vez que cambie un JS o CSS, subir el `?v=` con que lo carga su
   HTML: Vercel guarda esos archivos en caché una hora.
3. Las reglas se despliegan aparte con `firebase deploy --only firestore:rules`.
