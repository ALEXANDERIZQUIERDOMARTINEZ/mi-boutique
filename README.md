# 🛍️ Mi Boutique - Plataforma Multi-Tenant SaaS

![Status](https://img.shields.io/badge/status-production--ready-success)
![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Firebase](https://img.shields.io/badge/firebase-v9-orange)

Plataforma de e-commerce multi-tenant con capacidades SaaS, permitiendo a múltiples empresas operar tiendas independientes con branding personalizado, aislamiento total de datos y gestión centralizada.

---

## 📋 Tabla de Contenidos

- [Características Principales](#-características-principales)
- [Arquitectura](#-arquitectura)
- [Documentación](#-documentación)
- [Inicio Rápido](#-inicio-rápido)
- [Stack Tecnológico](#-stack-tecnológico)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [Componentes Principales](#-componentes-principales)
- [Despliegue](#-despliegue)
- [Testing](#-testing)
- [Licencia](#-licencia)

---

## ✨ Características Principales

### 🏢 Multi-Tenant
- **Aislamiento total de datos** entre tenants usando discriminador `tenantId`
- **Identificación por subdominio**: `empresa-a.miplataforma.com`, `empresa-b.miplataforma.com`
- **Security Rules a nivel servidor** validando pertenencia de datos
- **Servicios con filtrado automático** por tenant

### 🎨 White Label / Branding Dinámico
- **Personalización completa por tenant**:
  - Logo personalizado
  - Paleta de colores (primario, secundario, acento)
  - Textos de footer y banners
  - Meta tags y favicon dinámicos
- **CSS Variables** que cambian en tiempo real
- **Preview en tiempo real** del branding

### 👥 RBAC (Control de Acceso Basado en Roles)
- **3 niveles de acceso**:
  1. **Super Admin**: Gestión global de la plataforma
  2. **Admin Tenant**: Control total de su tienda
  3. **Sub-usuarios**: 6 roles con permisos granulares
- **7 roles disponibles**:
  - Super Admin (plataforma)
  - Administrador (tenant)
  - Vendedor
  - Inventario
  - Contador
  - Repartidor
  - Visualizador
- **30+ permisos granulares** (productos_crear, ventas_editar, usuarios_eliminar, etc.)

### 📊 Panel Super Admin
- **Dashboard global** con estadísticas de toda la plataforma
- **Gestión de tenants**: crear, suspender, activar, eliminar
- **Gestión de planes**: configurar límites y precios
- **Auditoría global**: logs de todas las operaciones
- **Usuarios cross-tenant**: ver y gestionar todos los usuarios

### 💳 Sistema de Planes
- **3 planes predefinidos**: Básico, Profesional, Enterprise
- **Límites configurables**:
  - Productos máximos
  - Usuarios máximos
  - Almacenamiento
  - Pedidos mensuales
- **Validación automática** de límites en creación de documentos

### 🔐 Seguridad
- **Firebase Security Rules** (913 líneas) validando:
  - Pertenencia a tenant
  - Permisos de usuario
  - Integridad de `tenantId`
  - Prevención de modificación de tenant
- **Auth Manager** con validación en cliente
- **Servicios** con verificación de permisos

---

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                   SUBDOMINIOS DNS                        │
│  empresa-a.plataforma.com  │  empresa-b.plataforma.com  │
└────────────────┬────────────────────────┬────────────────┘
                 │                        │
                 ▼                        ▼
┌─────────────────────────────────────────────────────────┐
│              TENANT RESOLVER (Frontend)                  │
│  • Detecta tenant desde URL                             │
│  • Carga configuración del tenant                       │
│  • Inyecta branding (CSS vars, logo, textos)            │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│               AUTH MANAGER (Frontend)                    │
│  • Valida usuario pertenece al tenant                   │
│  • Carga permisos y rol                                 │
│  • Crea contexto de aplicación                          │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│          SERVICIOS CON FILTRADO AUTOMÁTICO               │
│  • ProductosService  • VentasService                    │
│  • ClientesService   • UsuariosService                  │
│  • TenantsService (Super Admin only)                    │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│              FIRESTORE DATABASE                          │
│  ┌──────────────────────────────────────────┐           │
│  │ tenants/                                 │           │
│  │   └─ {tenantId}/                         │           │
│  │       • nombre, slug, estado             │           │
│  │       • branding {...}                   │           │
│  │       • limites {...}                    │           │
│  ├──────────────────────────────────────────┤           │
│  │ productos/                               │           │
│  │   └─ {productoId}/                       │           │
│  │       • tenantId ← DISCRIMINADOR         │           │
│  │       • nombre, precio, stock            │           │
│  ├──────────────────────────────────────────┤           │
│  │ usuarios/                                │           │
│  │   └─ {userId}/                           │           │
│  │       • tenantId ← DISCRIMINADOR         │           │
│  │       • rol, permisos {...}              │           │
│  └──────────────────────────────────────────┘           │
│                                                          │
│  SECURITY RULES (Validación servidor):                  │
│  • belongsToTenant(tenantId)                            │
│  • hasPermission(permission)                            │
│  • isNotChangingTenant()                                │
└──────────────────────────────────────────────────────────┘
```

### Flujo de Inicialización

```
1. Usuario accede a empresa-a.plataforma.com
   ↓
2. tenant-resolver.js extrae "empresa-a" del URL
   ↓
3. Busca tenant con slug="empresa-a" en Firestore
   ↓
4. Inyecta branding (colores, logo, textos)
   ↓
5. auth-manager.js detecta usuario autenticado
   ↓
6. Valida usuario.tenantId === tenant.id
   ↓
7. Carga permisos del usuario
   ↓
8. Crea window.appContext = {tenantId, userId, rol, permisos}
   ↓
9. Servicios usan appContext.tenantId para filtrar datos
   ↓
10. Aplicación lista ✅
```

---

## 📚 Documentación

### Documentación Técnica Completa
- **[PROPUESTA_SAAS_MULTITENANT.md](./PROPUESTA_SAAS_MULTITENANT.md)** (35+ páginas)
  - Arquitectura detallada
  - Diseño de base de datos
  - Sistema de autenticación
  - Análisis de costos
  - Plan de implementación

- **[HOJA_RUTA_IMPLEMENTACION.md](./HOJA_RUTA_IMPLEMENTACION.md)**
  - Fases de implementación
  - Cronograma
  - Entregables por fase

- **[DIAGRAMA_ARQUITECTURA.md](./DIAGRAMA_ARQUITECTURA.md)**
  - Diagramas visuales de arquitectura
  - Flujos de datos
  - Secuencias de operaciones

- **[EJEMPLOS_CODIGO.md](./EJEMPLOS_CODIGO.md)**
  - Ejemplos de uso de todos los componentes
  - Snippets de código funcional
  - Casos de uso comunes

### Guías de Implementación
- **[IMPLEMENTACION.md](./IMPLEMENTACION.md)**
  - Guía paso a paso de implementación completa
  - Checklist de tareas
  - Validaciones

- **[GUIA_ADAPTACION_INDEX.md](./GUIA_ADAPTACION_INDEX.md)**
  - Adaptación de index.html (catálogo público)
  - Refactorización de app.js
  - Uso de servicios

- **[GUIA_ADAPTACION_ADMIN.md](./GUIA_ADAPTACION_ADMIN.md)**
  - Adaptación de admin.html
  - Implementación de tab de branding
  - Gestión de permisos en UI

### Herramientas y Utilidades
- **[migration-add-tenantid.html](./migration-add-tenantid.html)**
  - Herramienta interactiva de migración
  - Modo dry-run para pruebas
  - Procesamiento por lotes

- **[super-admin.html](./super-admin.html)**
  - Panel completo de Super Administración
  - Gestión de tenants y planes
  - Dashboard global

### Despliegue
- **[DEPLOY.md](./DEPLOY.md)** ⭐
  - **Guía definitiva de despliegue**
  - 8 fases detalladas
  - Checklist pre-deploy
  - Troubleshooting

---

## 🚀 Inicio Rápido

### 1. Prerrequisitos
- Node.js 14+
- Firebase CLI instalado: `npm install -g firebase-tools`
- Cuenta de Firebase (plan Blaze para producción)
- Dominio con acceso a DNS (para subdominios)

### 2. Instalación

```bash
# Clonar repositorio
git clone <repository-url>
cd mi-boutique

# Iniciar sesión en Firebase
firebase login

# Seleccionar proyecto
firebase use <tu-proyecto-firebase>
```

### 3. Configuración Inicial

```bash
# 1. Actualizar configuración de Firebase
# Editar src/core/firebase-config.js con tus credenciales

# 2. Desplegar Security Rules
firebase deploy --only firestore:rules

# 3. Crear primer tenant (Mishell)
# Usar super-admin.html después de crear Super Admin
```

### 4. Crear Super Admin

```javascript
// Ejecutar en consola de Firebase:
const auth = firebase.auth();
const db = firebase.firestore();

// 1. Crear usuario en Firebase Auth
const userCredential = await auth.createUserWithEmailAndPassword(
  'superadmin@plataforma.com',
  'password-seguro'
);

// 2. Crear documento en Firestore
await db.collection('usuarios').doc(userCredential.user.uid).set({
  uid: userCredential.user.uid,
  email: 'superadmin@plataforma.com',
  nombre: 'Super Administrador',
  rol: 'SUPER_ADMIN',
  tenantId: null, // Super Admin no pertenece a ningún tenant
  activo: true,
  permisos: {},
  timestamp: firebase.firestore.FieldValue.serverTimestamp()
});
```

### 5. Acceder al Panel Super Admin

```bash
# Abrir super-admin.html en navegador
# Login con credenciales del Super Admin
# Crear primer tenant
```

---

## 🛠️ Stack Tecnológico

### Frontend
- **JavaScript Vanilla ES6+**: Sin frameworks, modular con ES6 imports
- **Bootstrap 5.3.3**: UI framework responsive
- **CSS Variables**: Para theming dinámico
- **HTML5**: Estructura semántica

### Backend / BaaS
- **Firebase Firestore**: Base de datos NoSQL
- **Firebase Authentication**: Gestión de usuarios
- **Firebase Storage**: Almacenamiento de archivos (logos, imágenes)
- **Firebase Hosting**: Hosting estático
- **Firebase Security Rules**: Validación servidor

### Herramientas
- **Git**: Control de versiones
- **Firebase CLI**: Despliegue y gestión
- **Chrome DevTools**: Debugging

---

## 📁 Estructura del Proyecto

```
mi-boutique/
├── index.html                      # Catálogo público (a adaptar)
├── admin.html                      # Panel administrativo (a adaptar)
├── super-admin.html                # Panel Super Admin ✅
├── tenant-not-found.html           # Error: Tenant no existe ✅
├── tenant-suspended.html           # Error: Tenant suspendido ✅
├── migration-add-tenantid.html     # Herramienta de migración ✅
│
├── src/
│   ├── core/                       # ✅ NÚCLEO MULTI-TENANT
│   │   ├── firebase-config.js      # Configuración Firebase
│   │   ├── tenant-resolver.js      # Detección y carga de tenant
│   │   ├── auth-manager.js         # Autenticación con validación
│   │   ├── permissions.js          # Sistema RBAC completo
│   │   └── app-init.js             # Inicializador maestro
│   │
│   ├── services/                   # ✅ SERVICIOS CON FILTRADO AUTO
│   │   ├── productos.service.js    # CRUD productos
│   │   ├── ventas.service.js       # CRUD ventas
│   │   ├── clientes.service.js     # CRUD clientes
│   │   ├── usuarios.service.js     # CRUD usuarios
│   │   └── tenants.service.js      # CRUD tenants (Super Admin)
│   │
│   ├── styles/
│   │   └── theme.css               # ✅ Variables CSS para branding
│   │
│   └── [archivos legacy...]        # app.js, admin.js (a refactorizar)
│
├── firestore-multitenant.rules     # ✅ Security Rules (913 líneas)
│
├── docs/                           # ✅ DOCUMENTACIÓN COMPLETA
│   ├── PROPUESTA_SAAS_MULTITENANT.md
│   ├── HOJA_RUTA_IMPLEMENTACION.md
│   ├── DIAGRAMA_ARQUITECTURA.md
│   ├── EJEMPLOS_CODIGO.md
│   ├── IMPLEMENTACION.md
│   ├── GUIA_ADAPTACION_INDEX.md
│   └── GUIA_ADAPTACION_ADMIN.md
│
├── DEPLOY.md                       # ✅ Guía de despliegue
├── README.md                       # ✅ Este archivo
└── firebase.json                   # Configuración Firebase
```

**Leyenda**:
- ✅ = Completado y listo para usar
- 🔨 = Por adaptar (siguiendo guías)

---

## 🔧 Componentes Principales

### 1. Tenant Resolver (`src/core/tenant-resolver.js`)
**Responsabilidad**: Detectar tenant desde URL, cargar configuración, inyectar branding

```javascript
import TenantResolver from './src/core/tenant-resolver.js';

// Inicialización automática en app-init.js
await window.tenantResolver.initialize(db);

// Uso en componentes
const tenantId = window.tenantResolver.getTenantId();
const tenantConfig = window.tenantResolver.getCurrentTenant();
```

**Funcionalidades**:
- Extracción de slug desde subdomain
- Consulta de tenant en Firestore
- Validación de estado (activo/trial)
- Inyección de CSS variables
- Cambio de logo y textos
- Redirección a páginas de error

### 2. Auth Manager (`src/core/auth-manager.js`)
**Responsabilidad**: Gestión de autenticación con validación de tenant

```javascript
import AuthManager from './src/core/auth-manager.js';

// Verificar permisos
if (window.authManager.hasPermission('productos_crear')) {
  // Permitir creación
}

// Obtener rol
const rol = window.authManager.getCurrentUser().rol;

// Verificar si es Super Admin
if (window.authManager.isSuperAdmin()) {
  // Mostrar opciones especiales
}
```

**Funcionalidades**:
- Login/Logout
- Validación de pertenencia a tenant
- Carga de permisos desde BD
- Creación de contexto global
- Eventos personalizados (userReady)

### 3. Permissions System (`src/core/permissions.js`)
**Responsabilidad**: Definir roles y permisos

```javascript
import { ROLES, PERMISSIONS, hasPermission } from './src/core/permissions.js';

// Verificar permiso específico
const permisos = usuario.permisos;
const tienePermiso = hasPermission(permisos, 'productos_editar');

// Obtener todos los permisos de un rol
const permisosVendedor = ROLES.VENDEDOR.permisos;
```

**Permisos disponibles**:
- Productos: ver, crear, editar, eliminar
- Ventas: ver, crear, editar, eliminar, cancelar
- Clientes: ver, crear, editar, eliminar
- Usuarios: ver, crear, editar, eliminar
- Reportes: ventas, inventario, financiero
- Configuración: general, branding, planes

### 4. Services (`src/services/*.service.js`)
**Responsabilidad**: Capa de acceso a datos con filtrado automático

```javascript
import ProductosService from './src/services/productos.service.js';

const productosService = new ProductosService(db, storage);

// Listar productos (automáticamente filtra por tenantId)
const productos = await productosService.listar({
  categoriaId: 'categoria-123'
});

// Crear producto (automáticamente agrega tenantId)
const productoId = await productosService.crear({
  nombre: 'Producto Nuevo',
  precio: 99.99,
  stock: 50
});

// Actualizar producto (valida permisos)
await productosService.actualizar(productoId, {
  precio: 89.99
});
```

**Servicios disponibles**:
- `ProductosService`: CRUD completo de productos
- `VentasService`: Gestión de ventas y pedidos
- `ClientesService`: Gestión de clientes
- `UsuariosService`: Gestión de usuarios del tenant
- `TenantsService`: Gestión de tenants (Super Admin only)

### 5. Super Admin Panel (`super-admin.html`)
**Responsabilidad**: Gestión global de la plataforma

**Características**:
- Dashboard con estadísticas globales
- CRUD de tenants con tarjetas visuales
- Suspensión/activación de tenants
- Gestión de planes
- Listado de usuarios cross-tenant
- Auditoría y logs

**Acceso**: Solo usuarios con `rol: 'SUPER_ADMIN'`

---

## 📦 Despliegue

### Opción 1: Despliegue Rápido (Desarrollo)

```bash
# 1. Adaptar archivos HTML (seguir guías)
# Ver GUIA_ADAPTACION_INDEX.md y GUIA_ADAPTACION_ADMIN.md

# 2. Desplegar Security Rules
firebase deploy --only firestore:rules

# 3. Desplegar hosting
firebase deploy --only hosting
```

### Opción 2: Despliegue Completo (Producción)

**Seguir la guía completa en [DEPLOY.md](./DEPLOY.md)**

Incluye:
1. Preparación y backup
2. Migración de datos
3. Despliegue de Security Rules
4. Adaptación de HTML
5. Creación de planes
6. Setup de Super Admin
7. Configuración DNS
8. Testing final

---

## 🧪 Testing

### Testing Manual

```bash
# 1. Crear 2 tenants de prueba
# - tenant-a (slug: tenant-a)
# - tenant-b (slug: tenant-b)

# 2. Crear usuarios en cada tenant
# - Admin de tenant-a
# - Admin de tenant-b
# - Vendedor de tenant-a

# 3. Verificar aislamiento de datos
# - Login como admin de tenant-a
# - Crear 5 productos
# - Logout
# - Login como admin de tenant-b
# - Verificar que no ve productos de tenant-a

# 4. Verificar branding
# - Cambiar colores de tenant-a
# - Acceder a subdominio de tenant-a
# - Verificar que se aplican los colores

# 5. Verificar permisos
# - Login como vendedor
# - Intentar crear usuario (debe fallar)
# - Intentar crear venta (debe funcionar)
```

### Casos de Prueba Críticos

| # | Caso | Resultado Esperado |
|---|------|-------------------|
| 1 | Usuario de Tenant A intenta acceder a Tenant B | Logout automático + alerta |
| 2 | Crear producto sin tenantId | Security Rule rechaza |
| 3 | Modificar tenantId de documento existente | Security Rule rechaza |
| 4 | Usuario sin permiso intenta crear producto | Error + mensaje |
| 5 | Super Admin accede a cualquier tenant | Permitido |
| 6 | Cambiar branding y recargar página | Nuevos colores aplicados |
| 7 | Tenant suspendido | Redirección a tenant-suspended.html |
| 8 | Slug inexistente | Redirección a tenant-not-found.html |

---

## 🔒 Seguridad

### Capas de Seguridad

1. **Cliente (JavaScript)**:
   - Validación de permisos antes de mostrar UI
   - Verificación de tenantId en servicios
   - Auth Manager validando usuario

2. **Servidor (Security Rules)**:
   - Validación de pertenencia a tenant
   - Verificación de permisos en cada operación
   - Prevención de modificación de tenantId
   - Validación de estructura de datos

3. **Firebase Authentication**:
   - Usuarios autenticados con email/password
   - Tokens JWT validados por Firebase

### Principios de Seguridad

- **Zero Trust**: Nunca confiar en validaciones del cliente
- **Least Privilege**: Usuarios solo tienen permisos necesarios
- **Defense in Depth**: Múltiples capas de validación
- **Audit Trail**: Todas las operaciones registradas con timestamp

---

## 📊 Base de Datos

### Colecciones Principales

#### `tenants/`
```javascript
{
  nombre: "Eleganza Boutique",
  slug: "eleganza",
  estado: "activo", // activo | trial | suspendido
  planId: "plan-profesional",
  branding: {
    logo: "https://...",
    colorPrimario: "#D988B9",
    colorSecundario: "#333333",
    colorAcento: "#FFD700",
    // ... más configuración
  },
  limites: {
    productosMaximos: 100,
    usuariosMaximos: 5,
    almacenamientoMB: 1000,
    pedidosMensuales: 500
  },
  timestamp: Timestamp
}
```

#### `productos/`
```javascript
{
  tenantId: "tenant-abc123", // ← DISCRIMINADOR
  nombre: "Vestido Floral",
  precio: 299.99,
  stock: 15,
  categoriaId: "vestidos",
  // ... más campos
}
```

#### `usuarios/`
```javascript
{
  uid: "user-xyz789",
  tenantId: "tenant-abc123", // ← DISCRIMINADOR
  email: "vendedor@eleganza.com",
  nombre: "Juan Pérez",
  rol: "VENDEDOR",
  permisos: {
    productos_ver: true,
    ventas_crear: true,
    // ... permisos específicos
  },
  activo: true
}
```

---

## 🤝 Contribución

Este proyecto fue transformado de una arquitectura single-tenant a multi-tenant SaaS. Para contribuir:

1. Seguir las guías de adaptación para nuevas páginas
2. Siempre usar servicios para acceso a datos
3. Verificar permisos antes de operaciones sensibles
4. Probar con múltiples tenants
5. Validar Security Rules

---

## 📝 Roadmap Futuro

- [ ] Panel de onboarding para nuevos tenants
- [ ] Sistema de facturación integrado (Stripe)
- [ ] Analytics por tenant
- [ ] API REST para integraciones
- [ ] Webhooks configurables
- [ ] Exportación de datos por tenant
- [ ] Temas predefinidos de branding
- [ ] Marketplace de extensiones

---

## 📄 Licencia

Proyecto propietario - Todos los derechos reservados

---

## 🆘 Soporte

Para asistencia con el despliegue o configuración:

1. Revisar [DEPLOY.md](./DEPLOY.md) - Troubleshooting
2. Verificar Security Rules en Firebase Console
3. Revisar logs en Firebase Console > Firestore > Reglas
4. Validar configuración DNS para subdominios

---

## 📌 Enlaces Rápidos

- 📖 [Guía de Despliegue Completa](./DEPLOY.md)
- 🏗️ [Propuesta Técnica](./PROPUESTA_SAAS_MULTITENANT.md)
- 📋 [Hoja de Ruta](./HOJA_RUTA_IMPLEMENTACION.md)
- 🎯 [Guía Index.html](./GUIA_ADAPTACION_INDEX.md)
- 🎯 [Guía Admin.html](./GUIA_ADAPTACION_ADMIN.md)
- 🔧 [Herramienta de Migración](./migration-add-tenantid.html)
- 👑 [Panel Super Admin](./super-admin.html)

---

**¿Listo para desplegar?** → Comienza con [DEPLOY.md](./DEPLOY.md)

**¿Necesitas entender la arquitectura?** → Lee [PROPUESTA_SAAS_MULTITENANT.md](./PROPUESTA_SAAS_MULTITENANT.md)

**¿Quieres adaptar una página?** → Sigue [GUIA_ADAPTACION_INDEX.md](./GUIA_ADAPTACION_INDEX.md)

---

<div align="center">

**Mi Boutique Multi-Tenant SaaS v2.0**

Transformado de single-tenant a multi-tenant | 2025

</div>
