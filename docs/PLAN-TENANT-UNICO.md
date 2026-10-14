# Plan: un solo panel, el tenant manda

Objetivo: dejar atrás los "proyectos individuales" (Boutique y Fábrica como
apps separadas con su empresa escrita a mano en el código) y que **la
empresa (tenant) decida** qué datos se ven, qué módulos aparecen y en qué
tienda pública se vende.

Decisiones tomadas:
- `admin.html` es el **único panel**. Lo exclusivo de Fábrica se vuelve un
  módulo que el Super Admin activa por empresa (plan / `modulosExtra`).
  `admin-fabrica.html` se retira.
- Los productos se **unifican en `productos`** (filtrados por `tenantId`).
  `productosFabrica` se migra y luego se retira.

## Fase 1: el panel filtra por empresa (hecha)
- `src/core/tenant-scope.js` envuelve `query`, `getDocs`, `onSnapshot` y
  `addDoc` de `admin.js`:
  - Las lecturas de colecciones por empresa llegan ya filtradas al tenant
    activo. Los documentos sin `tenantId` cuentan como `boutique` (son los
    de antes de multi-tenant).
  - Los documentos nuevos quedan marcados con el `tenantId` del usuario.
  - Ninguna lectura arranca antes de saber quién inició sesión.
- Se quitaron los filtros escritos a mano (`tenantId === 'fabrica'`,
  `!== 'boutique'`) de Pedidos Web, Ventas, Clientes y el Dashboard.

Cómo verificar en producción: entrar con un usuario de Boutique y
comprobar que Ventas, Clientes, Pedidos Web y Productos muestran lo mismo
que antes. Entrar como Super Admin con `admin.html?empresa=fabrica` debe
mostrar solo lo de Fábrica.

## Fase 2: productos unificados
1. Página `migration-productos-fabrica.html`: copia cada documento de
   `productosFabrica` a `productos` con `tenantId: 'fabrica'`. Hace primero
   una vista previa en seco y conserva el ID original en
   `origenProductosFabricaId`.
2. `mayor.js` y `encargo.js` leen `productos` donde `tenantId` es el de
   la tienda. Las ventas de Fábrica que apuntan a IDs de `productosFabrica`
   se remapean con `origenProductosFabricaId`.
3. En `admin.js`, la sección "Productos Fábrica" deja de existir: es la
   misma sección Productos de cualquier empresa. Los campos que Fábrica no
   usa (`precio_detal`, `proveedor`) se ocultan según la configuración del
   tenant.
4. Reemplazar `esProveedorBoutique()` (precio mayorista solo para el
   proveedor "Mishelles Boutique") por un ajuste de la empresa en
   `tenants/{id}/config`.

## Fase 3: login y tiendas públicas por tenant
1. `login.html` envía a **todas** las empresas a `admin.html`, eliminando
   `PANEL_POR_TENANT`. `admin-fabrica.html` redirige a `admin.html`.
2. `index.html`, `mayor.html` y `encargo.html` toman la empresa de
   `tenant-resolver.js` (subdominio) en lugar de `'boutique'`/`'fabrica'`
   fijos. El número de WhatsApp, los asesores y los datos de pago se
   leen de `tenants/{id}/config`.
3. Super Admin: al crear una empresa se elige su subdominio, sus módulos
   y los canales de venta (detal, mayorista, bajo encargo).

## Fase 4: cerrar el servidor
1. Confirmar que no quedan documentos sin `tenantId`, con una página de
   diagnóstico que cuente documentos por `tenantId` y colección.
2. Pasar el filtro de `tenant-scope.js` a la consulta
   (`where('tenantId', '==', …)`) y crear los índices en
   `firestore.indexes.json`.
3. Endurecer `firestore.rules`:
   - Lectura de `productos` y `categorias` por tenant.
   - Eliminar las excepciones "sin tenantId".
   - Retirar `productosFabrica` y las colecciones legacy.
4. Borrar `admin-fabrica.html`, `admin-fabrica.js`,
   `admin-fabrica-auth-init.js`, `admin.js.backup` y
   `firestore.rules.backup-*`.
