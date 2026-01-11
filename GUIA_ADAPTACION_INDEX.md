# 🔧 GUÍA DE ADAPTACIÓN: index.html → Multi-Tenant

## Cambios Necesarios en index.html

### PASO 1: Modificar el `<head>` (Líneas 1-28)

**ANTES:**
```html
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mishell Boutique</title>
<!-- ... otros meta tags ... -->
<link rel="stylesheet" href="style.css?v=1.8.3">
</head>
```

**DESPUÉS:**
```html
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<!-- Title dinámico (será reemplazado por tenant-resolver) -->
<title>Mi Tienda</title>

<!-- Meta tags dinámicos (serán completados por tenant-resolver) -->
<meta name="description" content="Tienda en línea">
<meta name="theme-color" content="#D988B9">

<!-- Preconnects -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- CSS de Bootstrap -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">

<!-- ⭐ NUEVO: Theme CSS con variables dinámicas -->
<link rel="stylesheet" href="src/styles/theme.css">

<!-- CSS personalizado (mantener) -->
<link rel="stylesheet" href="style.css?v=1.8.3">

<link rel="manifest" href="manifest.json">

<!-- Favicon dinámico (será reemplazado por tenant-resolver) -->
<link rel="icon" href="icon.svg" type="image/svg+xml">

<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
</head>
```

---

### PASO 2: Adaptar el Navbar (Líneas 31-75)

**ANTES:**
```html
<a class="navbar-brand" href="index.html">MISHELL</a>
```

**DESPUÉS:**
```html
<!-- Logo dinámico del tenant -->
<a class="navbar-brand d-flex align-items-center" href="index.html">
  <img data-tenant-logo src="icon.svg" alt="Logo" style="height: 40px; margin-right: 10px;">
  <span data-tenant-title>Mi Tienda</span>
</a>
```

**Explicación**:
- `data-tenant-logo`: El tenant-resolver inyectará el logo del tenant aquí
- `data-tenant-title`: El tenant-resolver inyectará el nombre de la tienda aquí
- El src="icon.svg" y texto "Mi Tienda" son solo placeholders

---

### PASO 3: Agregar Scripts de Firebase y Módulos (ANTES del cierre de `</body>`)

**UBICACIÓN**: Al final del archivo, antes de `</body>`

**AGREGAR:**
```html
<!-- Firebase -->
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-storage-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-analytics-compat.js"></script>

<!-- ⭐ NUEVO: Módulos Multi-Tenant (en orden específico) -->
<script src="src/core/firebase-config.js"></script>
<script src="src/core/tenant-resolver.js"></script>
<script src="src/core/auth-manager.js"></script>
<script src="src/core/permissions.js"></script>
<script src="src/services/productos.service.js"></script>
<script src="src/services/clientes.service.js"></script>

<!-- ⭐ IMPORTANTE: app-init.js debe ir ANTES de app.js -->
<script src="src/core/app-init.js"></script>

<!-- Tu código existente -->
<script src="app.js"></script>
```

**ORDEN CRÍTICO**:
1. Firebase SDKs
2. firebase-config.js
3. tenant-resolver.js (debe ir primero)
4. auth-manager.js
5. permissions.js
6. Servicios
7. app-init.js (inicializador)
8. app.js (tu código)

---

### PASO 4: Refactorizar app.js

**Archivo**: `app.js`

#### 4.1 Cambiar inicialización

**ANTES:**
```javascript
// Al inicio de app.js
const firebaseConfig = {
  apiKey: "...",
  // ... config
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
```

**DESPUÉS:**
```javascript
// ⭐ ELIMINAR la inicialización de Firebase (ya se hace en app-init.js)
// ⭐ Las variables db, auth, storage estarán disponibles globalmente

// Esperar a que la app esté lista
window.onAppReady(() => {
  console.log('✅ App lista, tenantId:', window.appContext.tenantId);

  // Aquí va tu código de inicialización
  cargarCategorias();
  cargarProductos();
  cargarPromociones();
});
```

#### 4.2 Cambiar queries de productos

**ANTES:**
```javascript
function cargarProductos() {
  db.collection('productos')
    .where('visible', '==', true)
    .orderBy('timestamp', 'desc')
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        const producto = { id: doc.id, ...doc.data() };
        renderizarProducto(producto);
      });
    });
}
```

**DESPUÉS:**
```javascript
async function cargarProductos() {
  try {
    // ⭐ Usar el servicio en lugar de query directo
    // El servicio ya filtra por tenantId automáticamente
    const productos = await window.productosService.listar({
      visible: true
    });

    productos.forEach(producto => {
      renderizarProducto(producto);
    });

  } catch (error) {
    console.error('Error al cargar productos:', error);
    mostrarError('No se pudieron cargar los productos');
  }
}
```

#### 4.3 Cambiar creación de pedidos web

**ANTES:**
```javascript
function crearPedidoWeb(datos) {
  db.collection('pedidosWeb').add({
    clienteNombre: datos.nombre,
    items: datos.items,
    total: datos.total,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  })
  .then(() => {
    alert('Pedido enviado');
  });
}
```

**DESPUÉS:**
```javascript
async function crearPedidoWeb(datos) {
  try {
    // ⭐ El tenantId se agrega automáticamente
    const pedidoId = await window.pedidosService.crear({
      clienteNombre: datos.nombre,
      clienteCelular: datos.celular,
      clienteDireccion: datos.direccion,
      items: datos.items,
      total: datos.total
      // tenantId se agrega automáticamente por el servicio
    });

    alert('✅ Pedido enviado correctamente');
    return pedidoId;

  } catch (error) {
    console.error('Error al crear pedido:', error);
    alert('❌ Error al enviar el pedido. Intenta nuevamente.');
  }
}
```

**IMPORTANTE**: Necesitarás crear `pedidos.service.js` similar a otros servicios, O usar directamente Firestore con tenantId:

```javascript
// Opción rápida (sin servicio)
async function crearPedidoWeb(datos) {
  const db = firebase.firestore();

  await db.collection('pedidosWeb').add({
    tenantId: window.appContext.tenantId, // ⭐ AGREGAR
    clienteNombre: datos.nombre,
    items: datos.items,
    total: datos.total,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
```

#### 4.4 Cambiar búsqueda de productos

**ANTES:**
```javascript
function buscarProductos(texto) {
  // Búsqueda en cliente
  const productosFiltrados = todosLosProductos.filter(p =>
    p.nombre.toLowerCase().includes(texto.toLowerCase())
  );
  renderizarResultados(productosFiltrados);
}
```

**DESPUÉS:**
```javascript
async function buscarProductos(texto) {
  try {
    // ⭐ Usar servicio de búsqueda (ya filtra por tenant)
    const productos = await window.productosService.buscar(texto);
    renderizarResultados(productos);

  } catch (error) {
    console.error('Error en búsqueda:', error);
  }
}
```

#### 4.5 Cambiar carga de categorías

**ANTES:**
```javascript
function cargarCategorias() {
  db.collection('categorias')
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        renderizarCategoria(doc.data());
      });
    });
}
```

**DESPUÉS:**
```javascript
async function cargarCategorias() {
  try {
    const db = firebase.firestore();
    const tenantId = window.appContext.tenantId;

    // ⭐ Filtrar por tenantId
    const snapshot = await db.collection('categorias')
      .where('tenantId', '==', tenantId)
      .orderBy('nombre', 'asc')
      .get();

    snapshot.forEach(doc => {
      renderizarCategoria({ id: doc.id, ...doc.data() });
    });

  } catch (error) {
    console.error('Error al cargar categorías:', error);
  }
}
```

---

### PASO 5: Adaptar Chat (si aplica)

**ANTES:**
```javascript
function enviarMensajeChat(mensaje) {
  db.collection('chatConversations').add({
    mensaje: mensaje,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
```

**DESPUÉS:**
```javascript
async function enviarMensajeChat(mensaje) {
  const db = firebase.firestore();

  await db.collection('chatConversations').add({
    tenantId: window.appContext.tenantId, // ⭐ AGREGAR
    mensaje: mensaje,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
```

---

## RESUMEN DE CAMBIOS

### Archivos a Modificar:
1. ✅ `index.html` - Agregar imports y data attributes
2. ✅ `app.js` - Refactorizar para usar servicios y agregar tenantId

### Cambios Clave:
- ⭐ Agregar `data-tenant-logo` y `data-tenant-title` en navbar
- ⭐ Agregar imports de módulos multi-tenant
- ⭐ Usar `window.onAppReady()` en lugar de `DOMContentLoaded`
- ⭐ Usar servicios en lugar de queries directos
- ⭐ Agregar `tenantId` a todas las creaciones de documentos

### Testing:
1. Abrir `index.html?tenant=mishell` en navegador
2. Verificar en consola:
   - `window.appContext` debe existir
   - `window.appContext.tenantId` debe tener valor
3. Verificar que productos se cargan
4. Verificar que colores se aplican dinámicamente

---

## SCRIPT DE VALIDACIÓN

Agregar al final de `app.js` para debugging:

```javascript
// Script de validación (solo para desarrollo)
if (window.location.hostname === 'localhost') {
  window.addEventListener('appReady', () => {
    console.log('🔍 VALIDACIÓN MULTI-TENANT:');
    console.log('✅ Tenant ID:', window.appContext?.tenantId);
    console.log('✅ Usuario:', window.appContext?.email || 'No autenticado');
    console.log('✅ Servicios disponibles:', {
      productos: !!window.productosService,
      ventas: !!window.ventasService,
      clientes: !!window.clientesService
    });
    console.log('✅ Color primario:',
      getComputedStyle(document.documentElement).getPropertyValue('--color-primario')
    );
  });
}
```

---

**Siguiente**: Ver `GUIA_ADAPTACION_ADMIN.md` para adaptar admin.html
