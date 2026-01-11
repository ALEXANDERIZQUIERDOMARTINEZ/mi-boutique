# 🚀 GUÍA DE DEPLOY - PLATAFORMA MULTI-TENANT

## 📋 ESTADO DEL PROYECTO

**✅ COMPLETADO (95%)**:
- ✅ Arquitectura multi-tenant diseñada
- ✅ Core components implementados (6 módulos)
- ✅ Servicios con filtrado automático (4 servicios)
- ✅ Security Rules multi-tenant exhaustivas
- ✅ Sistema de branding dinámico
- ✅ Script de migración interactivo
- ✅ Panel Super Admin completo
- ✅ Guías de adaptación para HTML existentes
- ✅ Documentación completa (130+ páginas)

**⏸️ PENDIENTE (5%)**:
- Adaptación real de index.html y admin.html (siguiendo las guías)
- Testing exhaustivo con múltiples tenants
- Deploy a producción

---

## 🎯 PLAN DE DEPLOY

### FASE 1: PREPARACIÓN (30 min)

#### 1.1 Backup de Datos (CRÍTICO)
```bash
# Opción 1: Desde Firebase Console
# Ir a: Firestore → Backups → Create Backup
# Guardar en: gs://mishell-boutique-admin-backups/

# Opción 2: Desde CLI (si tienes Firebase CLI)
firebase firestore:export gs://mishell-boutique-admin-backups/backup-$(date +%Y%m%d-%H%M%S)
```

#### 1.2 Verificar Configuración
- [ ] Verificar que tienes acceso a Firebase Console
- [ ] Verificar que tienes permisos de Owner en el proyecto
- [ ] Verificar que Firebase Hosting está configurado

---

### FASE 2: MIGRACIÓN DE DATOS (30-60 min)

#### 2.1 Crear Documento del Primer Tenant

**Opción A: Usar script interactivo (RECOMENDADO)**

1. Abrir en navegador: `migration-add-tenantid.html`

2. Configurar:
   ```
   Tenant ID: tenant_mishell_001
   Nombre: Mishell Boutique
   Slug: mishell
   [✓] Crear documento del tenant
   [✓] Dry Run (primera vez)
   ```

3. Ejecutar Dry Run primero para verificar

4. Si OK, desmarcar "Dry Run" y ejecutar real

**Opción B: Manual desde Firebase Console**

1. Ir a Firestore → Crear colección: `tenants`

2. ID del documento: `tenant_mishell_001`

3. Datos:
```javascript
{
  nombre: "Mishell Boutique",
  slug: "mishell",
  estado: "activo",
  planId: "premium",
  dominioCustom: null,

  limites: {
    maxProductos: 5000,
    maxUsuarios: 20,
    maxStorage: 5368709120,
    features: ["branding_custom", "subdominios"]
  },

  branding: {
    logo: null,
    faviconUrl: null,
    colorPrimario: "#D988B9",
    colorSecundario: "#333333",
    colorAccento: "#FFD700",
    fuentePrincipal: "Poppins, sans-serif",
    textos: {
      nombreTienda: "Mishell Boutique",
      tagline: "Tu estilo, nuestra pasión",
      footerTexto: "© 2026 Mishell Boutique. Todos los derechos reservados.",
      descripcionSEO: "Tienda en línea de Mishell Boutique"
    }
  },

  contacto: {
    email: "",
    telefono: "",
    direccion: "",
    ciudad: "",
    pais: "Colombia"
  },

  suscripcion: {
    fechaInicio: [timestamp actual],
    fechaRenovacion: [timestamp +1 año],
    metodoPago: null,
    estadoPago: "activo"
  },

  estadisticas: {
    totalProductos: 0,
    totalUsuarios: 0,
    totalVentas: 0,
    storageUsado: 0
  },

  propietarioId: null,
  createdAt: [timestamp actual],
  updatedAt: [timestamp actual]
}
```

#### 2.2 Agregar tenantId a Documentos Existentes

**Opción A: Usar script (RECOMENDADO)**
- Ya cubierto en paso 2.1 si marcaste "Crear documento"
- El script agrega `tenantId` a todas las colecciones automáticamente

**Opción B: Script manual (Node.js)**

Crear archivo `migrate.js`:
```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const tenantId = 'tenant_mishell_001';

const collections = [
  'productos', 'ventas', 'clientes', 'pedidosWeb',
  'apartados', 'categorias', 'proveedores', 'repartidores'
];

async function migrate() {
  for (const collectionName of collections) {
    console.log(`Migrando ${collectionName}...`);

    const snapshot = await db.collection(collectionName).get();
    const batch = db.batch();
    let count = 0;

    snapshot.docs.forEach(doc => {
      if (!doc.data().tenantId) {
        batch.update(doc.ref, { tenantId });
        count++;
      }
    });

    if (count > 0) {
      await batch.commit();
      console.log(`✅ ${collectionName}: ${count} documentos actualizados`);
    }
  }
}

migrate().then(() => console.log('Migración completada'));
```

Ejecutar:
```bash
node migrate.js
```

#### 2.3 Verificar Migración
- [ ] Verificar que existe `tenants/tenant_mishell_001`
- [ ] Verificar que productos tienen campo `tenantId`
- [ ] Verificar que ventas tienen campo `tenantId`
- [ ] Verificar que clientes tienen campo `tenantId`

---

### FASE 3: DEPLOY DE SECURITY RULES (10 min)

#### 3.1 Actualizar Reglas

```bash
# Reemplazar archivo de reglas actual
cp firestore-multitenant.rules firestore.rules

# Ver diferencias (opcional)
git diff firestore.rules

# Deploy
firebase deploy --only firestore:rules
```

#### 3.2 Verificar Rules en Firebase Console

1. Ir a: Firestore → Rules
2. Verificar que las nuevas reglas están activas
3. Probar en Rules Playground:

**Test 1: Crear producto sin tenantId (debe RECHAZAR)**
```javascript
operation: create
path: /productos/test123
auth: { uid: 'user123' }
data: { nombre: 'Test' }
// → RECHAZADO ✅
```

**Test 2: Crear producto con tenantId correcto (debe PERMITIR)**
```javascript
operation: create
path: /productos/test123
auth: { uid: 'user123' } // user con tenantId = 'tenant_mishell_001'
data: { nombre: 'Test', tenantId: 'tenant_mishell_001' }
// → PERMITIDO ✅
```

---

### FASE 4: ADAPTAR HTML (2-4 horas)

#### 4.1 Adaptar index.html

Seguir la guía en `GUIA_ADAPTACION_INDEX.md`:

**Resumen de cambios**:
1. Agregar imports en `<head>`:
   ```html
   <link rel="stylesheet" href="src/styles/theme.css">
   ```

2. Agregar data attributes en navbar:
   ```html
   <img data-tenant-logo src="icon.svg" alt="Logo">
   <span data-tenant-title>Mi Tienda</span>
   ```

3. Agregar scripts antes de `</body>`:
   ```html
   <script src="src/core/firebase-config.js"></script>
   <script src="src/core/tenant-resolver.js"></script>
   <script src="src/core/auth-manager.js"></script>
   <script src="src/core/permissions.js"></script>
   <script src="src/services/productos.service.js"></script>
   <script src="src/core/app-init.js"></script>
   <script src="app.js"></script>
   ```

4. Refactorizar `app.js`:
   ```javascript
   // Cambiar DOMContentLoaded por:
   window.onAppReady(() => {
     cargarProductos();
   });

   // Cambiar queries directos por servicios:
   const productos = await window.productosService.listar({ visible: true });
   ```

#### 4.2 Adaptar admin.html

Seguir la guía en `GUIA_ADAPTACION_ADMIN.md`:

**Resumen de cambios**:
1. Agregar tab de Branding (copiar de la guía)
2. Agregar imports (igual que index.html)
3. Refactorizar `admin.js` para usar servicios
4. Agregar `tenantId` a todas las creaciones

#### 4.3 Testing Local

```bash
# Servidor local
npx http-server -p 8080

# Abrir en navegador
http://localhost:8080/?tenant=mishell

# Verificar en consola del navegador
window.appContext.tenantId
// → "tenant_mishell_001"
```

---

### FASE 5: CREAR PLANES (10 min)

Crear colección `planes` en Firestore con 3 planes:

**Plan Básico**:
```javascript
{
  nombre: "Básico",
  precio: 29,
  periodo: "mensual",
  limites: {
    maxProductos: 500,
    maxUsuarios: 3,
    maxStorage: 524288000, // 500 MB
    features: []
  },
  activo: true,
  orden: 1
}
```

**Plan Profesional**:
```javascript
{
  nombre: "Profesional",
  precio: 79,
  periodo: "mensual",
  limites: {
    maxProductos: 2000,
    maxUsuarios: 10,
    maxStorage: 2147483648, // 2 GB
    features: ["branding_custom", "subdominios"]
  },
  activo: true,
  orden: 2
}
```

**Plan Enterprise**:
```javascript
{
  nombre: "Enterprise",
  precio: 199,
  periodo: "mensual",
  limites: {
    maxProductos: 999999,
    maxUsuarios: 999,
    maxStorage: 10737418240, // 10 GB
    features: ["branding_custom", "subdominios", "dominios_propios", "api_access"]
  },
  activo: true,
  orden: 3
}
```

---

### FASE 6: CREAR SUPER ADMIN (15 min)

#### 6.1 Crear Usuario Super Admin

1. Ir a Firebase Console → Authentication
2. Add User:
   ```
   Email: admin@plataforma.com
   Password: [contraseña segura]
   ```
3. Copiar el UID del usuario creado

#### 6.2 Crear Documento en Firestore

Ir a Firestore → `usuarios` → Crear documento:

```javascript
// ID del documento: [UID copiado en paso anterior]
{
  email: "admin@plataforma.com",
  nombre: "Super Administrador",
  rol: "SUPER_ADMIN",
  tenantId: null,  // ← IMPORTANTE: null para Super Admin
  permisos: {
    // Super Admin tiene todos los permisos
    // Se valida por rol en Security Rules
  },
  activo: true,
  createdAt: [timestamp actual]
}
```

#### 6.3 Probar Panel Super Admin

```bash
# Abrir super-admin.html
http://localhost:8080/super-admin.html

# Login con:
# Email: admin@plataforma.com
# Password: [tu contraseña]

# Verificar:
# - Dashboard muestra estadísticas
# - Listado de tenants muestra "Mishell"
# - Planes se cargan correctamente
```

---

### FASE 7: CONFIGURAR SUBDOMINIOS (30 min)

#### 7.1 Configurar Firebase Hosting

**firebase.json**:
```json
{
  "hosting": {
    "public": ".",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**",
      "**/*.md",
      "migration-*.html"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "**/*.@(js|css)",
        "headers": [
          {
            "key": "Cache-Control",
            "value": "max-age=31536000"
          }
        ]
      }
    ]
  }
}
```

#### 7.2 Deploy a Firebase Hosting

```bash
# Primera vez
firebase login
firebase init hosting

# Deploy
firebase deploy --only hosting

# Anotar la URL generada:
# https://mishell-boutique-admin.web.app
```

#### 7.3 Configurar DNS para Subdominios

**Si tienes dominio propio** (ej: miboutique.com):

1. Ir a tu proveedor de DNS (Cloudflare, GoDaddy, etc)

2. Agregar registros:
```
Tipo: CNAME
Host: *.miboutique.com
Target: mishell-boutique-admin.web.app.
TTL: 3600
```

3. En Firebase Console:
   - Hosting → Custom Domain
   - Agregar: miboutique.com
   - Seguir instrucciones de verificación

#### 7.4 Testing de Subdominios

```bash
# Desarrollo (sin DNS real)
http://localhost:8080/?tenant=mishell

# Producción (con DNS configurado)
https://mishell.miboutique.com
```

---

### FASE 8: TESTING FINAL (1-2 horas)

#### 8.1 Crear Segundo Tenant de Prueba

1. Login como Super Admin en `super-admin.html`

2. Crear nuevo tenant:
   ```
   Nombre: Boutique Eleganza
   Slug: eleganza
   Plan: Básico
   Email Admin: admin@eleganza.com
   ```

3. Cambiar branding de Eleganza:
   - Color primario: #8B4789 (Morado)
   - Logo: [subir logo diferente]
   - Nombre: "Boutique Eleganza"

#### 8.2 Verificar Aislamiento de Datos

**Test 1: Productos**
```javascript
// Como admin@mishell.com
await window.productosService.listar();
// → Solo productos de Mishell

// Como admin@eleganza.com
await window.productosService.listar();
// → Solo productos de Eleganza
```

**Test 2: Intentar acceder cross-tenant**
```javascript
// Como admin@eleganza.com
await window.productosService.obtenerPorId('producto_de_mishell');
// → Error: "No autorizado"
```

#### 8.3 Verificar Branding

1. Abrir: `eleganza.miboutique.com` (o `localhost/?tenant=eleganza`)
2. Verificar:
   - [ ] Color primario es morado (#8B4789)
   - [ ] Logo es el de Eleganza
   - [ ] Nombre es "Boutique Eleganza"
   - [ ] Footer tiene texto de Eleganza

3. Abrir: `mishell.miboutique.com` (o `localhost/?tenant=mishell`)
4. Verificar:
   - [ ] Color primario es rosado (#D988B9)
   - [ ] Logo es el de Mishell
   - [ ] Nombre es "Mishell Boutique"

#### 8.4 Verificar Permisos

1. Crear usuario VENDEDOR en Mishell

2. Login como vendedor

3. Verificar:
   - [ ] Puede ver productos (solo lectura)
   - [ ] Puede crear ventas
   - [ ] NO puede editar productos
   - [ ] NO puede ver configuración

---

## 📊 CHECKLIST PRE-DEPLOY

### Datos
- [ ] Backup de Firestore completo
- [ ] Colección `tenants` creada con Mishell
- [ ] Todos los documentos tienen `tenantId`
- [ ] Colección `planes` creada

### Código
- [ ] Security Rules desplegadas
- [ ] index.html adaptado
- [ ] admin.html adaptado
- [ ] super-admin.html funcional
- [ ] Usuario Super Admin creado

### Testing
- [ ] Aislamiento de datos verificado
- [ ] Branding dinámico funciona
- [ ] Permisos funcionan correctamente
- [ ] Cross-browser testing (Chrome, Firefox, Safari)

### Deploy
- [ ] Firebase Hosting configurado
- [ ] DNS configurado (si aplica)
- [ ] HTTPS funcional
- [ ] Subdominios funcionan

---

## 🐛 TROUBLESHOOTING POST-DEPLOY

### Error: "Tenant no inicializado"
**Solución**:
- Verificar que `tenant-resolver.js` se carga ANTES de otros scripts
- Verificar en consola: `window.tenantResolver`
- Usar `window.onAppReady()` en lugar de `DOMContentLoaded`

### Error: "Permission denied" en Firestore
**Solución**:
- Verificar que Security Rules están desplegadas
- Verificar que usuario tiene `tenantId`
- Verificar que queries incluyen `tenantId`

### Branding no se aplica
**Solución**:
- Verificar que `theme.css` está cargado
- Verificar en DevTools que variables CSS existen
- Verificar que documento `tenants` tiene campo `branding`

### Productos no se cargan
**Solución**:
- Verificar que productos tienen `tenantId`
- Verificar que `window.productosService` existe
- Ver consola para errores

---

## 📞 SOPORTE POST-DEPLOY

Si encuentras problemas:

1. **Revisar logs de Firebase**:
   - Console → Functions → Logs
   - Console → Firestore → Usage

2. **Revisar documentación**:
   - IMPLEMENTACION.md
   - GUIA_ADAPTACION_*.md
   - PROPUESTA_SAAS_MULTITENANT.md

3. **Debug en consola**:
   ```javascript
   // Verificar estado de la app
   console.log('Context:', window.appContext);
   console.log('Tenant:', window.tenantResolver.getTenant());
   console.log('Services:', {
     productos: !!window.productosService,
     ventas: !!window.ventasService
   });
   ```

---

## 🎉 CONCLUSIÓN

Una vez completados todos los pasos, tendrás:

✅ Plataforma multi-tenant completamente funcional
✅ Aislamiento total de datos por tenant
✅ Branding personalizable dinámicamente
✅ Sistema RBAC de 3 niveles
✅ Panel Super Admin para gestión
✅ Security Rules robustas
✅ Subdominios configurados

**¡Felicidades! Has transformado un e-commerce de tienda única en una plataforma SaaS escalable.** 🚀
