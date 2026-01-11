# 🔧 GUÍA DE ADAPTACIÓN: admin.html → Multi-Tenant

## Cambios Necesarios en admin.html

### PASO 1: Modificar el `<head>`

**AGREGAR después de los CSS existentes:**

```html
<head>
  <!-- CSS existentes (mantener) -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="admin-styles.css">

  <!-- ⭐ NUEVO: Theme CSS multi-tenant -->
  <link rel="stylesheet" href="src/styles/theme.css">
</head>
```

---

### PASO 2: Adaptar Navbar/Header

**BUSCAR** (aproximadamente línea 30-50):
```html
<div class="navbar-brand">MISHELL</div>
```

**REEMPLAZAR por:**
```html
<div class="navbar-brand d-flex align-items-center">
  <img data-tenant-logo src="icon.svg" alt="Logo" style="height: 35px; margin-right: 10px;">
  <span data-tenant-title>Panel Admin</span>
</div>
```

**BUSCAR** el área de usuario (donde muestra el email):
```html
<span id="user-email">usuario@email.com</span>
```

**AGREGAR**:
```html
<div class="user-info">
  <strong data-user-name>Usuario</strong>
  <small class="text-muted" data-user-email>email@example.com</small>
  <span class="badge bg-primary" data-user-rol>Admin</span>
</div>
```

---

### PASO 3: Agregar Tab de Branding (Solo para Admin Tenant)

**BUSCAR** la sección de tabs/pills navigation (donde están Productos, Ventas, etc):

**AGREGAR** un nuevo tab:
```html
<!-- Después del tab de Usuarios o Configuración -->
<li class="nav-item" data-require-permission="config_branding">
  <a class="nav-link" data-bs-toggle="pill" href="#branding">
    <i class="bi bi-palette-fill"></i> Branding
  </a>
</li>
```

**AGREGAR** el contenido del tab (al final de los `.tab-pane`):
```html
<!-- Tab de Branding -->
<div class="tab-pane fade" id="branding">
  <div class="card">
    <div class="card-header">
      <h5>🎨 Configuración de Marca (White-Label)</h5>
      <p class="text-muted mb-0">Personaliza los colores, logo y textos de tu tienda</p>
    </div>
    <div class="card-body">

      <!-- Logo -->
      <div class="mb-4">
        <label class="form-label fw-bold">Logo Principal</label>
        <div class="d-flex align-items-center gap-3">
          <img id="preview-logo-current" src="" alt="Logo actual"
               style="max-height: 80px; border: 1px solid #ddd; padding: 10px; border-radius: 8px;">
          <div class="flex-grow-1">
            <input type="file" id="input-logo" accept="image/*" class="form-control">
            <small class="text-muted">Tamaño recomendado: 200x80px (PNG con fondo transparente)</small>
          </div>
        </div>
      </div>

      <!-- Paleta de colores -->
      <div class="mb-4">
        <label class="form-label fw-bold">Paleta de Colores</label>
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">Color Primario</label>
            <div class="input-group">
              <input type="color" id="color-primario" class="form-control form-control-color" value="#D988B9">
              <input type="text" class="form-control" id="color-primario-hex" value="#D988B9">
            </div>
          </div>
          <div class="col-md-4">
            <label class="form-label">Color Secundario</label>
            <div class="input-group">
              <input type="color" id="color-secundario" class="form-control form-control-color" value="#333333">
              <input type="text" class="form-control" id="color-secundario-hex" value="#333333">
            </div>
          </div>
          <div class="col-md-4">
            <label class="form-label">Color de Acento</label>
            <div class="input-group">
              <input type="color" id="color-acento" class="form-control form-control-color" value="#FFD700">
              <input type="text" class="form-control" id="color-acento-hex" value="#FFD700">
            </div>
          </div>
        </div>
      </div>

      <!-- Textos -->
      <div class="mb-4">
        <label class="form-label fw-bold">Textos de la Tienda</label>

        <div class="mb-3">
          <label class="form-label">Nombre de la Tienda</label>
          <input type="text" id="nombre-tienda" class="form-control" placeholder="Ej: Boutique Eleganza">
        </div>

        <div class="mb-3">
          <label class="form-label">Eslogan / Tagline</label>
          <input type="text" id="tagline" class="form-control" placeholder="Ej: Tu estilo, nuestra pasión">
        </div>

        <div class="mb-3">
          <label class="form-label">Texto del Footer</label>
          <textarea id="footer-texto" class="form-control" rows="2"></textarea>
        </div>
      </div>

      <!-- Preview en vivo -->
      <div class="card bg-light mb-4">
        <div class="card-body">
          <h6 class="fw-bold">Vista Previa</h6>
          <div id="branding-preview"
               style="border: 2px solid var(--color-primario); padding: 20px; border-radius: 8px; background: white;">
            <img id="preview-logo-live" src="" alt="Logo" style="max-height: 60px;">
            <h3 style="color: var(--color-primario); margin-top: 15px;" id="preview-nombre">Mi Tienda</h3>
            <p style="color: var(--color-secundario);" id="preview-tagline">Tu estilo, nuestra pasión</p>
            <button class="btn mt-2" style="background-color: var(--color-primario); color: white;">
              Ejemplo de Botón
            </button>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-lg" onclick="guardarBranding()">
        💾 Guardar Cambios de Branding
      </button>
    </div>
  </div>
</div>

<script>
// Función para guardar branding
async function guardarBranding() {
  try {
    const tenantId = window.appContext.tenantId;
    const db = firebase.firestore();
    const storage = firebase.storage();

    // Subir logo si hay uno nuevo
    let logoUrl = document.getElementById('preview-logo-current').src;
    const logoFile = document.getElementById('input-logo').files[0];

    if (logoFile) {
      const storageRef = storage.ref();
      const logoRef = storageRef.child(`${tenantId}/branding/logo.png`);
      await logoRef.put(logoFile);
      logoUrl = await logoRef.getDownloadURL();
    }

    // Actualizar documento tenant
    await db.collection('tenants').doc(tenantId).update({
      'branding.logo': logoUrl,
      'branding.colorPrimario': document.getElementById('color-primario').value,
      'branding.colorSecundario': document.getElementById('color-secundario').value,
      'branding.colorAccento': document.getElementById('color-acento').value,
      'branding.textos.nombreTienda': document.getElementById('nombre-tienda').value,
      'branding.textos.tagline': document.getElementById('tagline').value,
      'branding.textos.footerTexto': document.getElementById('footer-texto').value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert('✅ Branding actualizado correctamente. Recarga la página para ver los cambios.');
    location.reload();

  } catch (error) {
    console.error('Error al guardar branding:', error);
    alert('❌ Error al guardar: ' + error.message);
  }
}

// Preview en tiempo real
document.getElementById('color-primario')?.addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--color-primario', e.target.value);
  document.getElementById('color-primario-hex').value = e.target.value;
});

document.getElementById('color-secundario')?.addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--color-secundario', e.target.value);
  document.getElementById('color-secundario-hex').value = e.target.value;
});

document.getElementById('nombre-tienda')?.addEventListener('input', (e) => {
  document.getElementById('preview-nombre').textContent = e.target.value;
});

document.getElementById('tagline')?.addEventListener('input', (e) => {
  document.getElementById('preview-tagline').textContent = e.target.value;
});

document.getElementById('input-logo')?.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      document.getElementById('preview-logo-current').src = event.target.result;
      document.getElementById('preview-logo-live').src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
});

// Cargar branding actual al abrir el tab
function cargarBrandingActual() {
  const tenant = window.tenantResolver.getTenant();
  if (!tenant || !tenant.branding) return;

  const { branding } = tenant;

  document.getElementById('preview-logo-current').src = branding.logo || '';
  document.getElementById('preview-logo-live').src = branding.logo || '';
  document.getElementById('color-primario').value = branding.colorPrimario;
  document.getElementById('color-primario-hex').value = branding.colorPrimario;
  document.getElementById('color-secundario').value = branding.colorSecundario;
  document.getElementById('color-secundario-hex').value = branding.colorSecundario;
  document.getElementById('color-acento').value = branding.colorAccento;
  document.getElementById('color-acento-hex').value = branding.colorAccento;
  document.getElementById('nombre-tienda').value = branding.textos?.nombreTienda || '';
  document.getElementById('tagline').value = branding.textos?.tagline || '';
  document.getElementById('footer-texto').value = branding.textos?.footerTexto || '';
  document.getElementById('preview-nombre').textContent = branding.textos?.nombreTienda || '';
  document.getElementById('preview-tagline').textContent = branding.textos?.tagline || '';
}
</script>
```

---

### PASO 4: Agregar Scripts Multi-Tenant

**AL FINAL del archivo, ANTES del cierre `</body>`:**

```html
<!-- Firebase (si no está ya) -->
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.6.1/firebase-storage-compat.js"></script>

<!-- ⭐ NUEVO: Módulos Multi-Tenant -->
<script src="src/core/firebase-config.js"></script>
<script src="src/core/tenant-resolver.js"></script>
<script src="src/core/auth-manager.js"></script>
<script src="src/core/permissions.js"></script>

<!-- Servicios -->
<script src="src/services/productos.service.js"></script>
<script src="src/services/ventas.service.js"></script>
<script src="src/services/clientes.service.js"></script>
<script src="src/services/tenants.service.js"></script>

<!-- Usuarios.js (mantener si existe) -->
<script src="usuarios.js"></script>

<!-- ⭐ IMPORTANTE: app-init.js ANTES de admin.js -->
<script src="src/core/app-init.js"></script>

<!-- Tu código existente -->
<script src="admin.js"></script>

<!-- ⭐ NUEVO: Inicializar branding al cargar tab -->
<script>
document.querySelector('a[href="#branding"]')?.addEventListener('shown.bs.tab', () => {
  cargarBrandingActual();
});
</script>
```

---

### PASO 5: Refactorizar admin.js

#### 5.1 Cambiar inicialización

**BUSCAR al inicio de admin.js:**
```javascript
const firebaseConfig = { ... };
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
```

**REEMPLAZAR por:**
```javascript
// ⭐ ELIMINAR inicialización de Firebase (ya se hace en app-init.js)
// Las variables db, auth, storage estarán disponibles globalmente

// ⭐ Esperar a que la app esté lista
window.onAppReady(() => {
  console.log('✅ Admin panel listo');
  console.log('Tenant:', window.appContext.tenantId);
  console.log('Usuario:', window.appContext.email);
  console.log('Rol:', window.appContext.rol);

  // Inicializar módulos
  cargarDashboard();
  cargarProductos();
  cargarCategorias();
  // ... etc
});
```

#### 5.2 Refactorizar funciones de Productos

**ANTES:**
```javascript
async function cargarProductos() {
  const snapshot = await db.collection('productos')
    .orderBy('timestamp', 'desc')
    .get();

  snapshot.forEach(doc => {
    const producto = { id: doc.id, ...doc.data() };
    renderizarProducto(producto);
  });
}
```

**DESPUÉS:**
```javascript
async function cargarProductos() {
  try {
    // ⭐ Usar servicio (filtra por tenant automáticamente)
    const productos = await window.productosService.listar();

    productos.forEach(producto => {
      renderizarProducto(producto);
    });

  } catch (error) {
    console.error('Error al cargar productos:', error);
    mostrarError('No se pudieron cargar los productos');
  }
}
```

**ANTES:**
```javascript
async function crearProducto(datos) {
  await db.collection('productos').add({
    nombre: datos.nombre,
    codigo: datos.codigo,
    precio: datos.precio,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
```

**DESPUÉS:**
```javascript
async function crearProducto(datos) {
  try {
    // ⭐ Usar servicio (agrega tenantId automáticamente)
    const productoId = await window.productosService.crear(datos);

    console.log('✅ Producto creado:', productoId);
    await cargarProductos(); // Recargar lista

  } catch (error) {
    console.error('Error al crear producto:', error);
    alert('❌ ' + error.message);
  }
}
```

**ANTES:**
```javascript
async function actualizarProducto(productoId, datos) {
  await db.collection('productos').doc(productoId).update(datos);
}
```

**DESPUÉS:**
```javascript
async function actualizarProducto(productoId, datos) {
  try {
    await window.productosService.actualizar(productoId, datos);
    console.log('✅ Producto actualizado');

  } catch (error) {
    console.error('Error al actualizar producto:', error);
    alert('❌ ' + error.message);
  }
}
```

**ANTES:**
```javascript
async function eliminarProducto(productoId) {
  if (confirm('¿Eliminar producto?')) {
    await db.collection('productos').doc(productoId).delete();
  }
}
```

**DESPUÉS:**
```javascript
async function eliminarProducto(productoId) {
  if (!window.authManager.hasPermission('productos_eliminar')) {
    alert('No tienes permisos para eliminar productos');
    return;
  }

  if (confirm('¿Eliminar producto?')) {
    try {
      await window.productosService.eliminar(productoId);
      console.log('✅ Producto eliminado');
      await cargarProductos();

    } catch (error) {
      console.error('Error al eliminar producto:', error);
      alert('❌ ' + error.message);
    }
  }
}
```

#### 5.3 Refactorizar funciones de Ventas

**ANTES:**
```javascript
async function registrarVenta(datos) {
  await db.collection('ventas').add({
    clienteNombre: datos.clienteNombre,
    items: datos.items,
    total: datos.total,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
}
```

**DESPUÉS:**
```javascript
async function registrarVenta(datos) {
  try {
    const ventaId = await window.ventasService.crear(datos);
    console.log('✅ Venta registrada:', ventaId);

    // Limpiar formulario
    limpiarFormularioVenta();

    // Recargar dashboard
    await cargarDashboard();

  } catch (error) {
    console.error('Error al registrar venta:', error);
    alert('❌ ' + error.message);
  }
}
```

#### 5.4 Refactorizar funciones de Clientes

**ANTES:**
```javascript
async function buscarClientePorCedula(cedula) {
  const snapshot = await db.collection('clientes')
    .where('cedula', '==', cedula)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  }
  return null;
}
```

**DESPUÉS:**
```javascript
async function buscarClientePorCedula(cedula) {
  try {
    const cliente = await window.clientesService.buscarPorCedula(cedula);
    return cliente;

  } catch (error) {
    console.error('Error al buscar cliente:', error);
    return null;
  }
}
```

#### 5.5 Refactorizar Categorías

**ANTES:**
```javascript
async function cargarCategorias() {
  const snapshot = await db.collection('categorias').get();
  snapshot.forEach(doc => {
    renderizarCategoria({ id: doc.id, ...doc.data() });
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

**ANTES:**
```javascript
async function crearCategoria(nombre) {
  await db.collection('categorias').add({
    nombre: nombre,
    nombreLower: nombre.toLowerCase()
  });
}
```

**DESPUÉS:**
```javascript
async function crearCategoria(nombre) {
  try {
    const db = firebase.firestore();

    await db.collection('categorias').add({
      tenantId: window.appContext.tenantId, // ⭐ AGREGAR
      nombre: nombre,
      nombreLower: nombre.toLowerCase(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await cargarCategorias();

  } catch (error) {
    console.error('Error al crear categoría:', error);
    alert('❌ ' + error.message);
  }
}
```

#### 5.6 Dashboard - Filtrar estadísticas por tenant

**ANTES:**
```javascript
async function cargarDashboard() {
  // Contar productos
  const productosSnapshot = await db.collection('productos').get();
  const totalProductos = productosSnapshot.size;

  // Contar ventas del día
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const ventasSnapshot = await db.collection('ventas')
    .where('timestamp', '>=', hoy)
    .get();

  const ventasHoy = ventasSnapshot.size;
}
```

**DESPUÉS:**
```javascript
async function cargarDashboard() {
  try {
    const tenantId = window.appContext.tenantId;

    // Estadísticas de productos (usa servicio)
    const statsProductos = await window.productosService.obtenerEstadisticas();
    document.getElementById('total-productos').textContent = statsProductos.total;

    // Ventas de hoy (usa servicio)
    const ventasHoy = await window.ventasService.obtenerVentasHoy();
    document.getElementById('ventas-hoy').textContent = ventasHoy.length;

    // Total ingresos hoy
    const totalIngresos = ventasHoy.reduce((sum, v) => sum + (v.totalVenta || 0), 0);
    document.getElementById('ingresos-hoy').textContent = formatoCOP(totalIngresos);

  } catch (error) {
    console.error('Error al cargar dashboard:', error);
  }
}
```

---

### PASO 6: Actualizar Gestión de Usuarios (usuarios.js)

**ANTES:**
```javascript
async function crearUsuario(datos) {
  // Crear en Firebase Auth
  const userCredential = await firebase.auth().createUserWithEmailAndPassword(
    datos.email,
    datos.password
  );

  // Crear documento en usuarios
  await db.collection('usuarios').doc(userCredential.user.uid).set({
    email: datos.email,
    nombre: datos.nombre,
    rol: datos.rol,
    permisos: datos.permisos,
    activo: true
  });
}
```

**DESPUÉS:**
```javascript
async function crearUsuario(datos) {
  try {
    // Verificar permiso
    if (!window.authManager.hasPermission('usuarios_crear')) {
      alert('No tienes permisos para crear usuarios');
      return;
    }

    // Crear en Firebase Auth
    const userCredential = await firebase.auth().createUserWithEmailAndPassword(
      datos.email,
      datos.password
    );

    // Obtener permisos del rol seleccionado
    const permisos = window.getPermissionsForRole(datos.rol);

    // Crear documento en usuarios
    await firebase.firestore().collection('usuarios').doc(userCredential.user.uid).set({
      tenantId: window.appContext.tenantId, // ⭐ AGREGAR
      email: datos.email,
      nombre: datos.nombre,
      rol: datos.rol,
      permisos: permisos,
      activo: true,
      creadoPor: window.appContext.userId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Usuario creado');
    await cargarUsuarios();

  } catch (error) {
    console.error('Error al crear usuario:', error);
    alert('❌ ' + error.message);
  }
}
```

**ANTES:**
```javascript
async function cargarUsuarios() {
  const snapshot = await db.collection('usuarios').get();
  snapshot.forEach(doc => {
    renderizarUsuario({ id: doc.id, ...doc.data() });
  });
}
```

**DESPUÉS:**
```javascript
async function cargarUsuarios() {
  try {
    const db = firebase.firestore();
    const tenantId = window.appContext.tenantId;

    // ⭐ Filtrar por tenantId (excepto si es Super Admin)
    let query = db.collection('usuarios');

    if (!window.appContext.isSuperAdmin) {
      query = query.where('tenantId', '==', tenantId);
    }

    const snapshot = await query.get();

    snapshot.forEach(doc => {
      renderizarUsuario({ id: doc.id, ...doc.data() });
    });

  } catch (error) {
    console.error('Error al cargar usuarios:', error);
  }
}
```

---

## RESUMEN DE CAMBIOS EN ADMIN.HTML

### Archivos Modificados:
1. ✅ `admin.html` - Agregar tab branding + imports
2. ✅ `admin.js` - Refactorizar para usar servicios
3. ✅ `usuarios.js` - Agregar tenantId a usuarios

### Cambios Críticos:
- ⭐ Agregar `data-tenant-logo`, `data-tenant-title`, `data-user-*` en navbar
- ⭐ Agregar tab de Branding (solo visible para Admin Tenant)
- ⭐ Usar `window.onAppReady()` para inicialización
- ⭐ Usar servicios en lugar de queries directos
- ⭐ Agregar `tenantId` a TODAS las creaciones de documentos
- ⭐ Agregar validación de permisos antes de operaciones

### Testing:
1. Login como admin
2. Verificar que solo ve datos de su tenant
3. Verificar que elementos se ocultan según permisos
4. Probar configuración de branding
5. Verificar que cambios de color se aplican

---

**Siguiente**: Ver archivo `super-admin.html` (panel completo para Super Admins)
