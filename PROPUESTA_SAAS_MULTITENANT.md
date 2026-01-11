# 🚀 PROPUESTA TÉCNICA: TRANSFORMACIÓN A PLATAFORMA SAAS MULTI-TENANT

## Mi Boutique → Plataforma SaaS de E-commerce

**Fecha**: 2026-01-11
**Proyecto**: Conversión de tienda única a plataforma multi-tenant
**Estado Actual**: Tienda "Mishell" - Arquitectura monolítica
**Objetivo**: Plataforma SaaS escalable con múltiples tiendas aisladas

---

## 📋 ÍNDICE

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura Técnica](#arquitectura-técnica)
3. [Diseño de Base de Datos Multi-Tenant](#diseño-de-base-de-datos-multi-tenant)
4. [Stack Tecnológico](#stack-tecnológico)
5. [Sistema de Autenticación y RBAC](#sistema-de-autenticación-y-rbac)
6. [Sistema de Subdominios](#sistema-de-subdominios)
7. [Branding Dinámico (White-Label)](#branding-dinámico-white-label)
8. [Plan de Implementación](#plan-de-implementación)
9. [Consideraciones de Seguridad](#consideraciones-de-seguridad)
10. [Costos y Escalabilidad](#costos-y-escalabilidad)

---

## 1. RESUMEN EJECUTIVO

### Estado Actual
- **Codebase**: ~26,000 líneas (JavaScript vanilla, HTML5, CSS3)
- **Backend**: Firebase (Firestore, Auth, Storage, Analytics)
- **Arquitectura**: Monolítica de tienda única
- **Capacidades**: E-commerce completo con inventario, ventas, apartados, pedidos web

### Transformación Propuesta
Convertir el sistema en una plataforma SaaS que permita:
- ✅ Múltiples empresas (tenants) independientes
- ✅ Aislamiento total de datos por tenant
- ✅ Branding personalizable (colores, logos, textos)
- ✅ Sistema RBAC de 3 niveles (Super Admin, Admin Tenant, Sub-usuarios)
- ✅ Identificación por subdominio (empresaA.miboutique.com)
- ✅ Panel Super Admin para gestión de la plataforma

### Complejidad Estimada
- **Impacto**: ALTO - Refactorización arquitectónica profunda
- **Tiempo estimado**: Desarrollo por fases (ver sección 8)
- **Riesgo**: MEDIO - Migración de datos existentes + nuevas abstracciones

---

## 2. ARQUITECTURA TÉCNICA

### 2.1 Estrategia Multi-Tenant: **BASE DE DATOS COMPARTIDA CON DISCRIMINADOR**

**Decisión**: Utilizaremos **Base de Datos Compartida con `tenantId`** en cada documento.

#### ¿Por qué esta estrategia?

##### ✅ Ventajas
1. **Costo-efectivo**: Un solo proyecto Firebase
2. **Simplicidad operativa**: Sin duplicación de infraestructura
3. **Escalabilidad horizontal**: Firestore escala automáticamente
4. **Mantenimiento centralizado**: Actualizaciones simultáneas para todos
5. **Queries cross-tenant**: Para Super Admin (métricas globales)

##### ⚠️ Desventajas (Mitigadas)
1. **Riesgo de data leakage**: MITIGADO con Security Rules estrictas
2. **Performance con muchos tenants**: MITIGADO con índices compuestos
3. **Backup selectivo difícil**: MITIGADO con funciones Cloud

#### Alternativas Descartadas

| Estrategia | Por qué NO |
|-----------|-----------|
| **DB por Tenant** | Costo prohibitivo (N proyectos Firebase), complejidad operativa |
| **Schema por Tenant** | No aplica a Firestore (NoSQL sin schemas) |
| **Proyectos separados** | Mantenimiento insostenible, no hay métricas globales |

### 2.2 Arquitectura de Capas

```
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE PRESENTACIÓN                      │
├─────────────────────────────────────────────────────────────┤
│  Catálogo Público (index.html)  │  Panel Admin (admin.html) │
│  - Branding dinámico            │  - Contexto tenant        │
│  - CSS variables inyectadas     │  - Permisos por rol       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   CAPA DE IDENTIFICACIÓN                     │
├─────────────────────────────────────────────────────────────┤
│            Tenant Resolver (tenant-resolver.js)              │
│  - Detecta tenant desde subdominio                           │
│  - Carga configuración del tenant                            │
│  - Inyecta contexto en toda la app                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   CAPA DE AUTENTICACIÓN                      │
├─────────────────────────────────────────────────────────────┤
│              Auth Manager (auth.js - refactorizado)          │
│  - Firebase Auth                                             │
│  - Validación de permisos multi-nivel                        │
│  - Context injection (tenantId + userId)                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE LÓGICA DE NEGOCIO                 │
├─────────────────────────────────────────────────────────────┤
│  Productos │ Ventas │ Apartados │ Clientes │ Usuarios │ ... │
│  - TODOS los queries filtrados por tenantId                  │
│  - Validación de permisos por operación                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    CAPA DE DATOS                             │
├─────────────────────────────────────────────────────────────┤
│                   Firebase Firestore                         │
│  - Security Rules: Validación tenantId obligatoria           │
│  - Índices compuestos: [tenantId, timestamp], etc            │
│  - Collections: productos, ventas, pedidosWeb, clientes...   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                   CAPA DE ALMACENAMIENTO                     │
├─────────────────────────────────────────────────────────────┤
│                   Firebase Storage                           │
│  - Path: /{tenantId}/productos/{productoId}/{file}          │
│  - Path: /{tenantId}/branding/{logo.png}                    │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Panel Super Admin (Nuevo)

```
┌─────────────────────────────────────────────────────────────┐
│               super-admin.html (NUEVO)                       │
├─────────────────────────────────────────────────────────────┤
│  Dashboard Global:                                           │
│  ├── Métricas de toda la plataforma                          │
│  ├── Gestión de Tenants (crear, suspender, eliminar)        │
│  ├── Configuración de planes/features                        │
│  ├── Logs de auditoría                                       │
│  └── Soporte a tenants                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. DISEÑO DE BASE DE DATOS MULTI-TENANT

### 3.1 Colecciones Principales (Modificadas)

#### 🏢 **tenants** (NUEVA)
```javascript
tenants/{tenantId}
├── id: string (auto-generated)
├── nombre: string (ej: "Boutique Eleganza")
├── slug: string (ej: "eleganza" → eleganza.miboutique.com)
├── dominioCustom: string | null (ej: "www.eleganza.com")
├── estado: "activo" | "suspendido" | "trial" | "cancelado"
├── planId: string (ej: "basico", "premium", "enterprise")
├── limites: {
│   maxProductos: number,
│   maxUsuarios: number,
│   maxStorage: number (bytes)
├── }
├── branding: {
│   logo: string (Storage URL),
│   faviconUrl: string,
│   colorPrimario: string (hex),
│   colorSecundario: string (hex),
│   colorAccento: string (hex),
│   fuentePrincipal: string,
│   textos: {
│       nombreTienda: string,
│       tagline: string,
│       footerTexto: string
│   }
├── }
├── contacto: {
│   email: string,
│   telefono: string,
│   direccion: string,
│   ciudad: string,
│   pais: string
├── }
├── suscripcion: {
│   fechaInicio: Timestamp,
│   fechaRenovacion: Timestamp,
│   metodoPago: string,
│   estadoPago: "al_dia" | "vencido"
├── }
├── propietarioId: string (userId del admin principal)
├── createdAt: Timestamp
├── updatedAt: Timestamp
└── metadata: object (datos adicionales)
```

#### 📦 **productos** (Modificada)
```javascript
productos/{productoId}
├── tenantId: string ← NUEVO (índice obligatorio)
├── nombre: string
├── codigo: string (único por tenant)
├── codigoBarras: string (EAN-13)
├── categoriaId: string
├── costoCompra: number
├── precioDetal: number
├── precioMayor: number
├── visible: boolean
├── imagenUrl: string (Storage: /{tenantId}/productos/...)
├── variaciones: [{ talla, color, stock }]
└── timestamp: Timestamp

Índice compuesto: [tenantId ASC, timestamp DESC]
Índice compuesto: [tenantId ASC, categoriaId ASC]
Índice compuesto: [tenantId ASC, visible ASC]
```

#### 💰 **ventas** (Modificada)
```javascript
ventas/{ventaId}
├── tenantId: string ← NUEVO
├── clienteId: string
├── items: [...]
├── totalVenta: number
├── estado: string
└── timestamp: Timestamp

Índice compuesto: [tenantId ASC, timestamp DESC]
Índice compuesto: [tenantId ASC, estado ASC]
```

#### 👤 **usuarios** (Modificada - CRÍTICO)
```javascript
usuarios/{userId}
├── email: string
├── nombre: string
├── tenantId: string | null ← NUEVO (null solo para Super Admin)
├── rol: "SUPER_ADMIN" | "ADMIN_TENANT" | "VENDEDOR" | ...
├── permisos: { [permiso]: true }
├── activo: boolean
├── creadoPor: string (userId)
└── createdAt: Timestamp

IMPORTANTE:
- Super Admins NO tienen tenantId (acceso global)
- Admin Tenants tienen tenantId (acceso limitado a su tenant)
- Sub-usuarios tienen tenantId (acceso limitado por permisos)
```

#### 🛒 **pedidosWeb** (Modificada)
```javascript
pedidosWeb/{pedidoId}
├── tenantId: string ← NUEVO
├── clienteId: string
├── items: [...]
├── total: number
└── timestamp: Timestamp
```

#### 👥 **clientes** (Modificada)
```javascript
clientes/{clienteId}
├── tenantId: string ← NUEVO
├── nombre: string
├── cedula: string
├── celular: string
└── ultimaCompra: Timestamp
```

### 3.2 Colecciones de Sistema (Nuevas)

#### 📊 **planes** (NUEVA)
```javascript
planes/{planId}
├── nombre: string (ej: "Básico")
├── precio: number
├── periodo: "mensual" | "anual"
├── limites: {
│   maxProductos: number,
│   maxUsuarios: number,
│   maxStorage: number,
│   features: string[] (ej: ["branding_custom", "dominios_propios"])
├── }
├── activo: boolean
└── orden: number (para mostrar en UI)
```

#### 📜 **auditLogs** (NUEVA)
```javascript
auditLogs/{logId}
├── tenantId: string | null (null = acción de Super Admin)
├── userId: string
├── accion: string (ej: "crear_producto", "eliminar_usuario")
├── recurso: string (ej: "productos/ABC123")
├── detalles: object
├── ip: string
└── timestamp: Timestamp
```

---

## 4. STACK TECNOLÓGICO

### 4.1 Stack Actual (Mantenido)

| Capa | Tecnología | Versión | ¿Cambios? |
|------|-----------|---------|-----------|
| **Frontend** | JavaScript Vanilla (ES6+) | - | ✅ Refactorizar (modularizar) |
| **UI Framework** | Bootstrap 5 | 5.3.3 | ✅ Mantener |
| **Backend** | Firebase | 9.6.1 | ✅ Mantener |
| **Base de Datos** | Cloud Firestore | - | ⚠️ Agregar índices |
| **Auth** | Firebase Auth | - | ⚠️ Extender lógica |
| **Storage** | Firebase Storage | - | ⚠️ Namespace por tenant |
| **Hosting** | Firebase Hosting | - | ⚠️ Configurar subdominios |

### 4.2 Nuevas Dependencias

```json
{
  "dependencies": {
    "firebase": "^10.x", // Actualizar de 9.6.1
    "firebase-admin": "^12.x", // Para Cloud Functions
    "@firebase/firestore": "^4.x"
  },
  "devDependencies": {
    "webpack": "^5.x", // Bundler
    "babel": "^7.x", // Transpiler ES6+
    "eslint": "^8.x" // Linting
  }
}
```

### 4.3 Arquitectura de Archivos (Refactorizada)

```
/home/user/mi-boutique/
├── src/
│   ├── core/
│   │   ├── tenant-resolver.js (Detecta tenant desde URL)
│   │   ├── auth-manager.js (auth.js refactorizado)
│   │   ├── permissions.js (Sistema RBAC)
│   │   └── firebase-config.js
│   │
│   ├── modules/
│   │   ├── productos/
│   │   │   ├── productos.service.js (Lógica negocio)
│   │   │   ├── productos.ui.js (Renderizado UI)
│   │   │   └── productos.controller.js
│   │   ├── ventas/
│   │   ├── clientes/
│   │   ├── usuarios/
│   │   └── tenants/ (NUEVO)
│   │       ├── tenants.service.js
│   │       ├── tenants.ui.js
│   │       └── onboarding.js
│   │
│   ├── components/
│   │   ├── navbar.js
│   │   ├── modal.js
│   │   └── theme-injector.js (Inyecta CSS variables dinámicamente)
│   │
│   ├── pages/
│   │   ├── public/
│   │   │   ├── index.html (Catálogo público)
│   │   │   └── index.js (app.js refactorizado)
│   │   ├── admin/
│   │   │   ├── admin.html (Panel admin tenant)
│   │   │   └── admin.js (refactorizado)
│   │   └── super-admin/
│   │       ├── super-admin.html (NUEVO)
│   │       └── super-admin.js (NUEVO)
│   │
│   └── styles/
│       ├── theme.css (Variables CSS base)
│       ├── admin.css
│       └── super-admin.css (NUEVO)
│
├── functions/ (Cloud Functions - NUEVO)
│   ├── index.js
│   ├── tenant-setup.js (Onboarding automatizado)
│   ├── backup.js (Backup por tenant)
│   └── analytics.js (Métricas agregadas)
│
├── firestore.rules (Actualizado con tenant filters)
├── storage.rules (Actualizado con tenant paths)
├── firebase.json (Hosting config con subdominios)
└── package.json
```

---

## 5. SISTEMA DE AUTENTICACIÓN Y RBAC

### 5.1 Jerarquía de Roles (3 Niveles)

```
NIVEL 1: SUPER_ADMIN (Plataforma)
    ↓
NIVEL 2: ADMIN_TENANT (Empresa)
    ↓
NIVEL 3: SUB_USUARIOS (Empleados)
    ├── VENDEDOR
    ├── INVENTARIO
    ├── CONTADOR
    ├── REPARTIDOR
    └── VISUALIZADOR
```

### 5.2 Matriz de Permisos

#### Nivel 1: Super Admin

| Recurso | Permisos |
|---------|----------|
| **Tenants** | CRUD completo, suspender, eliminar |
| **Planes** | CRUD completo |
| **Métricas Globales** | Ver todas |
| **Usuarios de cualquier tenant** | Ver, modificar (solo super admins) |
| **Audit Logs** | Ver todos |
| **Configuración Global** | Modificar |

**Acceso**: Panel dedicado en `super-admin.html`

#### Nivel 2: Admin Tenant

| Recurso | Permisos |
|---------|----------|
| **Productos** | CRUD completo (solo su tenant) |
| **Ventas** | CRUD completo (solo su tenant) |
| **Clientes** | CRUD completo (solo su tenant) |
| **Sub-usuarios** | CRUD completo (solo su tenant) |
| **Branding** | Modificar (logo, colores, textos) |
| **Configuración Tenant** | Modificar datos de contacto |
| **Reportes** | Ver métricas de su tenant |
| **Otros Tenants** | ❌ Sin acceso |

**Acceso**: Panel admin (`admin.html`) con contexto de su tenant

#### Nivel 3: Sub-usuarios

Permisos **granulares** definidos por el Admin Tenant:

```javascript
SUB_ROLES_DEFAULT = {
  VENDEDOR: {
    ventas_crear: true,
    ventas_ver: true,
    apartados_crear: true,
    clientes_ver: true,
    productos_ver: true, // Solo lectura
    // NO puede editar inventario
  },

  INVENTARIO: {
    productos_crear: true,
    productos_editar: true,
    productos_eliminar: true,
    categorias_gestionar: true,
    // NO puede ver finanzas
  },

  CONTADOR: {
    ventas_ver: true,
    reportes_ver: true,
    finanzas_gestionar: true,
    cierres_caja: true,
    // NO puede crear usuarios
  },

  REPARTIDOR: {
    pedidos_web_ver: true,
    pedidos_web_actualizar_estado: true,
    // Solo sus pedidos asignados
  },

  VISUALIZADOR: {
    // Solo lectura de dashboard
    dashboard_ver: true
  }
}
```

### 5.3 Flujo de Autenticación Multi-Tenant

```
1. Usuario visita: eleganza.miboutique.com/admin.html
   ↓
2. tenant-resolver.js:
   - Parsea subdominio: "eleganza"
   - Busca en Firestore: tenants where slug == "eleganza"
   - Guarda en sessionStorage: { tenantId, branding, limites }
   ↓
3. Login con Firebase Auth
   ↓
4. auth-manager.js:
   - Obtiene userId de Firebase Auth
   - Lee documento: usuarios/{userId}
   - VALIDACIÓN CRÍTICA:
       if (user.rol === "SUPER_ADMIN") {
           // Puede acceder a cualquier tenant
       } else if (user.tenantId !== currentTenantId) {
           // ERROR: Usuario no pertenece a este tenant
           → logout + redirect
       }
   ↓
5. Carga permisos del usuario
   ↓
6. Inyecta contexto global:
   window.appContext = {
       tenantId: "tenant_abc123",
       userId: "user_xyz789",
       rol: "ADMIN_TENANT",
       permisos: {...}
   }
   ↓
7. Todos los queries Firestore usan:
   db.collection("productos")
     .where("tenantId", "==", window.appContext.tenantId)
```

### 5.4 Security Rules (Firestore)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserData() {
      return get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data;
    }

    function isSuperAdmin() {
      return isAuthenticated() &&
             getUserData().rol == "SUPER_ADMIN";
    }

    function belongsToTenant(tenantId) {
      return isAuthenticated() &&
             getUserData().tenantId == tenantId;
    }

    function hasPermission(permission) {
      return isAuthenticated() &&
             getUserData().permisos[permission] == true;
    }

    // Tenants: Solo Super Admins
    match /tenants/{tenantId} {
      allow read: if isSuperAdmin();
      allow create, update, delete: if isSuperAdmin();
    }

    // Productos: Filtrado por tenant
    match /productos/{productoId} {
      allow read: if true; // Público para catálogo
      allow create: if isAuthenticated() &&
                      hasPermission("productos_crear") &&
                      request.resource.data.tenantId == getUserData().tenantId;
      allow update: if belongsToTenant(resource.data.tenantId) &&
                      hasPermission("productos_editar");
      allow delete: if belongsToTenant(resource.data.tenantId) &&
                      hasPermission("productos_eliminar");
    }

    // Ventas: Solo del mismo tenant
    match /ventas/{ventaId} {
      allow read: if belongsToTenant(resource.data.tenantId) &&
                    hasPermission("ventas_ver");
      allow create: if isAuthenticated() &&
                      hasPermission("ventas_crear") &&
                      request.resource.data.tenantId == getUserData().tenantId;
      allow update: if belongsToTenant(resource.data.tenantId) &&
                      hasPermission("ventas_editar");
    }

    // Usuarios: Admin Tenant puede gestionar sub-usuarios de su tenant
    match /usuarios/{userId} {
      allow read: if isSuperAdmin() ||
                    (belongsToTenant(resource.data.tenantId) &&
                     hasPermission("usuarios_ver"));
      allow create: if (isSuperAdmin()) ||
                      (hasPermission("usuarios_crear") &&
                       request.resource.data.tenantId == getUserData().tenantId);
      allow update: if isSuperAdmin() ||
                      (belongsToTenant(resource.data.tenantId) &&
                       hasPermission("usuarios_editar"));
      allow delete: if isSuperAdmin(); // Solo Super Admin puede eliminar
    }

    // Patrón para otras colecciones (clientes, pedidosWeb, etc)
    match /{collection}/{docId} {
      allow read, write: if belongsToTenant(resource.data.tenantId);
    }
  }
}
```

---

## 6. SISTEMA DE SUBDOMINIOS

### 6.1 Estrategia de Identificación

#### Opción A: Subdominios (RECOMENDADO)
```
https://eleganza.miboutique.com    → Tenant: "eleganza"
https://modaparati.miboutique.com  → Tenant: "modaparati"
https://chicstoremx.miboutique.com → Tenant: "chicstoremx"
```

#### Opción B: Dominios Personalizados (Premium)
```
https://www.eleganza.com      → Mapeado a tenant: "eleganza"
https://www.modaparati.co     → Mapeado a tenant: "modaparati"
```

### 6.2 Configuración Firebase Hosting

**firebase.json**
```json
{
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
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

**Configuración DNS** (Para subdominios wildcard)
```
Tipo: CNAME
Host: *.miboutique.com
Target: miboutique-com.web.app
TTL: 3600
```

### 6.3 tenant-resolver.js (Core)

```javascript
// src/core/tenant-resolver.js

class TenantResolver {
  constructor() {
    this.currentTenant = null;
  }

  async initialize() {
    // 1. Detectar tenant desde URL
    const tenantSlug = this.extractTenantFromURL();

    if (!tenantSlug) {
      throw new Error("No se pudo identificar el tenant desde la URL");
    }

    // 2. Buscar tenant en Firestore
    const db = firebase.firestore();
    const tenantSnapshot = await db.collection('tenants')
      .where('slug', '==', tenantSlug)
      .where('estado', '==', 'activo')
      .limit(1)
      .get();

    if (tenantSnapshot.empty) {
      throw new Error(`Tenant "${tenantSlug}" no encontrado o inactivo`);
    }

    const tenantData = tenantSnapshot.docs[0].data();
    this.currentTenant = {
      id: tenantSnapshot.docs[0].id,
      ...tenantData
    };

    // 3. Guardar en sessionStorage para performance
    sessionStorage.setItem('currentTenant', JSON.stringify(this.currentTenant));

    // 4. Inyectar branding dinámicamente
    this.injectBranding();

    return this.currentTenant;
  }

  extractTenantFromURL() {
    const hostname = window.location.hostname;

    // Desarrollo local
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Leer de parámetro ?tenant=eleganza
      const params = new URLSearchParams(window.location.search);
      return params.get('tenant') || 'mishell'; // Default para dev
    }

    // Producción: Subdominio
    // eleganza.miboutique.com → eleganza
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      return parts[0]; // Primer parte = tenant slug
    }

    // Dominio custom
    // www.eleganza.com → Buscar en DB por dominioCustom
    return this.resolveDominioCustom(hostname);
  }

  async resolveDominioCustom(domain) {
    const db = firebase.firestore();
    const tenantSnapshot = await db.collection('tenants')
      .where('dominioCustom', '==', domain)
      .limit(1)
      .get();

    if (!tenantSnapshot.empty) {
      return tenantSnapshot.docs[0].data().slug;
    }

    return null;
  }

  injectBranding() {
    if (!this.currentTenant) return;

    const { branding } = this.currentTenant;
    const root = document.documentElement;

    // Inyectar CSS variables
    root.style.setProperty('--color-primario', branding.colorPrimario);
    root.style.setProperty('--color-secundario', branding.colorSecundario);
    root.style.setProperty('--color-acento', branding.colorAccento);
    root.style.setProperty('--fuente-principal', branding.fuentePrincipal);

    // Reemplazar logo
    const logoElements = document.querySelectorAll('[data-tenant-logo]');
    logoElements.forEach(el => {
      el.src = branding.logo;
      el.alt = branding.textos.nombreTienda;
    });

    // Reemplazar textos
    const titleElements = document.querySelectorAll('[data-tenant-title]');
    titleElements.forEach(el => {
      el.textContent = branding.textos.nombreTienda;
    });

    // Favicon dinámico
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon && branding.faviconUrl) {
      favicon.href = branding.faviconUrl;
    }

    // Title dinámico
    document.title = branding.textos.nombreTienda;
  }

  getTenantId() {
    if (this.currentTenant) {
      return this.currentTenant.id;
    }

    // Fallback: Leer de sessionStorage
    const cached = sessionStorage.getItem('currentTenant');
    if (cached) {
      const tenant = JSON.parse(cached);
      return tenant.id;
    }

    throw new Error("Tenant no inicializado");
  }
}

// Instancia global
window.tenantResolver = new TenantResolver();
```

---

## 7. BRANDING DINÁMICO (WHITE-LABEL)

### 7.1 Sistema de Temas CSS

**Estructura base (theme.css)**
```css
:root {
  /* Colores por defecto (Mishell) - Serán sobrescritos dinámicamente */
  --color-primario: #D988B9;
  --color-primario-claro: #F5E8ED;
  --color-primario-hover: #E3B0CC;
  --color-primario-oscuro: #C273A2;
  --color-secundario: #333333;
  --color-acento: #FFD700;

  /* Tipografía */
  --fuente-principal: 'Poppins', sans-serif;
  --fuente-secundaria: 'Roboto', sans-serif;

  /* Espaciado */
  --radio-sm: 8px;
  --radio-md: 12px;
  --radio-lg: 16px;

  /* Sombras */
  --sombra-sm: 0 2px 4px rgba(0, 0, 0, 0.05);
  --sombra-md: 0 4px 8px rgba(0, 0, 0, 0.08);
  --sombra-lg: 0 8px 16px rgba(0, 0, 0, 0.12);

  /* Transiciones */
  --transicion: 0.3s ease;
}

/* Aplicación de variables */
.btn-primary {
  background-color: var(--color-primario);
  border-color: var(--color-primario);
}

.btn-primary:hover {
  background-color: var(--color-primario-hover);
  border-color: var(--color-primario-hover);
}

.navbar-brand {
  color: var(--color-primario);
}

.product-card:hover {
  border-color: var(--color-primario);
  box-shadow: 0 0 0 2px var(--color-primario-claro);
}
```

### 7.2 Configuración de Branding (Admin Panel)

**Interfaz de configuración** (admin.html - Nueva sección)

```html
<!-- Tab: Configuración de Marca -->
<div class="tab-pane fade" id="branding">
  <div class="card">
    <div class="card-header">
      <h5>🎨 Configuración de Marca (White-Label)</h5>
    </div>
    <div class="card-body">

      <!-- Logo -->
      <div class="mb-4">
        <label class="form-label">Logo Principal</label>
        <div class="d-flex align-items-center gap-3">
          <img id="preview-logo" src="" alt="Logo actual" style="max-height: 80px;">
          <input type="file" id="input-logo" accept="image/*" class="form-control">
        </div>
        <small class="text-muted">Tamaño recomendado: 200x80px (PNG con fondo transparente)</small>
      </div>

      <!-- Paleta de colores -->
      <div class="row mb-4">
        <div class="col-md-4">
          <label class="form-label">Color Primario</label>
          <input type="color" id="color-primario" class="form-control form-control-color" value="#D988B9">
          <input type="text" class="form-control mt-2" id="color-primario-hex" value="#D988B9">
        </div>
        <div class="col-md-4">
          <label class="form-label">Color Secundario</label>
          <input type="color" id="color-secundario" class="form-control form-control-color" value="#333333">
          <input type="text" class="form-control mt-2" id="color-secundario-hex" value="#333333">
        </div>
        <div class="col-md-4">
          <label class="form-label">Color de Acento</label>
          <input type="color" id="color-acento" class="form-control form-control-color" value="#FFD700">
          <input type="text" class="form-control mt-2" id="color-acento-hex" value="#FFD700">
        </div>
      </div>

      <!-- Textos -->
      <div class="mb-3">
        <label class="form-label">Nombre de la Tienda</label>
        <input type="text" id="nombre-tienda" class="form-control" placeholder="Ej: Boutique Eleganza">
      </div>

      <div class="mb-3">
        <label class="form-label">Eslogan / Tagline</label>
        <input type="text" id="tagline" class="form-control" placeholder="Ej: Tu estilo, nuestra pasión">
      </div>

      <div class="mb-4">
        <label class="form-label">Texto del Footer</label>
        <textarea id="footer-texto" class="form-control" rows="3">© 2026 Boutique Eleganza. Todos los derechos reservados.</textarea>
      </div>

      <!-- Preview en vivo -->
      <div class="card bg-light mb-4">
        <div class="card-body">
          <h6>Vista Previa</h6>
          <div id="branding-preview" style="border: 1px solid var(--color-primario); padding: 20px; border-radius: 8px;">
            <img id="preview-logo-live" src="" alt="Logo" style="max-height: 60px;">
            <h3 style="color: var(--color-primario);" id="preview-nombre">Boutique Eleganza</h3>
            <p style="color: var(--color-secundario);" id="preview-tagline">Tu estilo, nuestra pasión</p>
            <button class="btn" style="background-color: var(--color-primario); color: white;">Ejemplo de Botón</button>
          </div>
        </div>
      </div>

      <button class="btn btn-primary" onclick="guardarBranding()">
        💾 Guardar Cambios
      </button>
    </div>
  </div>
</div>

<script>
async function guardarBranding() {
  const tenantId = window.appContext.tenantId;

  // Subir logo a Storage
  const logoFile = document.getElementById('input-logo').files[0];
  let logoUrl = document.getElementById('preview-logo').src;

  if (logoFile) {
    const storageRef = firebase.storage().ref();
    const logoRef = storageRef.child(`${tenantId}/branding/logo.png`);
    await logoRef.put(logoFile);
    logoUrl = await logoRef.getDownloadURL();
  }

  // Actualizar documento tenant
  const db = firebase.firestore();
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

  alert('✅ Branding actualizado. Recarga la página para ver los cambios.');
  location.reload();
}

// Preview en tiempo real
document.getElementById('color-primario').addEventListener('input', (e) => {
  document.documentElement.style.setProperty('--color-primario', e.target.value);
  document.getElementById('color-primario-hex').value = e.target.value;
});

document.getElementById('nombre-tienda').addEventListener('input', (e) => {
  document.getElementById('preview-nombre').textContent = e.target.value;
});

document.getElementById('input-logo').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      document.getElementById('preview-logo').src = event.target.result;
      document.getElementById('preview-logo-live').src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
});
</script>
```

### 7.3 Carga Inicial de Branding

```javascript
// Al cargar cualquier página (index.html, admin.html)

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Resolver tenant
    const tenant = await window.tenantResolver.initialize();

    // 2. Branding ya inyectado por tenant-resolver
    console.log('✅ Branding cargado:', tenant.branding);

    // 3. Continuar con inicialización de la app
    initializeApp();
  } catch (error) {
    console.error('❌ Error al cargar tenant:', error);
    // Mostrar página de error o redirect a página de inicio
    window.location.href = '/tenant-not-found.html';
  }
});
```

---

## 8. PLAN DE IMPLEMENTACIÓN

### Fase 0: Preparación (1-2 días)
- [x] Análisis de arquitectura actual ✅
- [ ] Crear branch: `feature/multi-tenant-architecture`
- [ ] Configurar entorno de desarrollo local con múltiples tenants
- [ ] Backup completo de base de datos actual

### Fase 1: Core Multi-Tenant (5-7 días)
**Objetivo**: Implementar aislamiento de datos

1. **Modelo de datos**
   - [ ] Crear colección `tenants`
   - [ ] Agregar campo `tenantId` a todas las colecciones existentes
   - [ ] Crear índices compuestos en Firestore
   - [ ] Actualizar Security Rules con filtros de tenant

2. **Tenant Resolver**
   - [ ] Implementar `tenant-resolver.js`
   - [ ] Configurar Firebase Hosting para subdominios
   - [ ] Configurar DNS wildcard (*.miboutique.com)
   - [ ] Testing de identificación por subdominio

3. **Migración de datos**
   - [ ] Script de migración: Mishell → Primer tenant
   - [ ] Asignar `tenantId` a todos los documentos existentes
   - [ ] Mover imágenes Storage a namespace `mishell/`
   - [ ] Validación de migración

### Fase 2: Sistema RBAC de 3 Niveles (4-5 días)
**Objetivo**: Implementar jerarquía de permisos

1. **Refactorización de Auth**
   - [ ] Extender `auth.js` con lógica multi-tenant
   - [ ] Implementar validación de `tenantId` en login
   - [ ] Crear roles: SUPER_ADMIN, ADMIN_TENANT
   - [ ] Modificar colección `usuarios` con nuevo schema

2. **Sistema de permisos**
   - [ ] Definir matriz de permisos por rol
   - [ ] Implementar funciones de verificación
   - [ ] Actualizar Security Rules con permisos granulares

3. **Gestión de Sub-usuarios**
   - [ ] UI para crear sub-usuarios (admin.html)
   - [ ] Asignación de roles y permisos custom
   - [ ] Listado y edición de sub-usuarios

### Fase 3: Panel Super Admin (5-6 días)
**Objetivo**: Dashboard de gestión de plataforma

1. **Interfaz nueva**
   - [ ] Crear `super-admin.html` + `super-admin.js`
   - [ ] Dashboard con métricas globales (Chart.js)
   - [ ] Listado de tenants con búsqueda/filtrado

2. **CRUD de Tenants**
   - [ ] Formulario de creación de tenant (onboarding)
   - [ ] Editar tenant (cambiar plan, suspender)
   - [ ] Eliminar tenant (con confirmación)
   - [ ] Asignar Admin inicial al tenant

3. **Gestión de Planes**
   - [ ] CRUD de planes (básico, premium, enterprise)
   - [ ] Definir límites por plan
   - [ ] Asignar plan a tenant

### Fase 4: Branding Dinámico (4-5 días)
**Objetivo**: White-label completo

1. **Sistema de temas**
   - [ ] Migrar CSS hardcoded a CSS variables
   - [ ] Implementar `theme-injector.js`
   - [ ] Pruebas con múltiples paletas

2. **Configuración en Admin Panel**
   - [ ] Sección de branding en `admin.html`
   - [ ] Upload de logo + preview en vivo
   - [ ] Color pickers con previsualización
   - [ ] Guardado en documento tenant

3. **Aplicación dinámica**
   - [ ] Inyección de branding en catálogo (index.html)
   - [ ] Inyección en admin panel
   - [ ] Favicon dinámico
   - [ ] Meta tags dinámicos (SEO)

### Fase 5: Refactorización de Frontend (6-8 días)
**Objetivo**: Adaptar UI existente a contexto multi-tenant

1. **Catálogo público (index.html)**
   - [ ] Filtrar productos por `tenantId`
   - [ ] Adaptar carrito a contexto tenant
   - [ ] Pedidos web con `tenantId`
   - [ ] Chat con contexto tenant

2. **Panel Admin (admin.html)**
   - [ ] Refactorizar `admin.js` (modularizar)
   - [ ] Agregar filtro `tenantId` a TODOS los queries
   - [ ] Productos: Filtrado por tenant
   - [ ] Ventas: Filtrado por tenant
   - [ ] Clientes: Filtrado por tenant
   - [ ] Reportes: Solo datos del tenant actual
   - [ ] Validación de límites de plan

3. **Componentes compartidos**
   - [ ] Navbar con branding dinámico
   - [ ] Footer con textos dinámicos
   - [ ] Modales reutilizables

### Fase 6: Cloud Functions (Opcional - 3-4 días)
**Objetivo**: Automatización y operaciones avanzadas

1. **Onboarding automatizado**
   - [ ] Function: `createTenant` (triggered por HTTP)
   - [ ] Crear estructura inicial (categorías default, etc)
   - [ ] Enviar email de bienvenida

2. **Backup por tenant**
   - [ ] Function scheduled: Backup diario por tenant
   - [ ] Exportar a Cloud Storage

3. **Analytics agregados**
   - [ ] Function: Calcular métricas globales
   - [ ] Almacenar en colección `platformMetrics`

### Fase 7: Testing & QA (4-5 días)
**Objetivo**: Validación exhaustiva

1. **Testing de aislamiento**
   - [ ] Crear 3 tenants de prueba
   - [ ] Verificar que no hay data leakage
   - [ ] Testing de Security Rules

2. **Testing de permisos**
   - [ ] Crear usuarios de cada nivel
   - [ ] Verificar permisos por rol
   - [ ] Intentar accesos no autorizados

3. **Testing de branding**
   - [ ] Cambiar branding de cada tenant
   - [ ] Verificar aplicación correcta
   - [ ] Testing en múltiples navegadores

4. **Performance**
   - [ ] Load testing con muchos productos
   - [ ] Optimización de índices
   - [ ] Caché de configuración de tenant

### Fase 8: Documentación & Deploy (2-3 días)
**Objetivo**: Lanzamiento

1. **Documentación**
   - [ ] Manual de Super Admin
   - [ ] Manual de Admin Tenant
   - [ ] Guía de onboarding para nuevos tenants

2. **Deploy**
   - [ ] Deploy a Firebase Hosting (producción)
   - [ ] Configurar subdominios en DNS
   - [ ] Monitoring y alertas

3. **Post-launch**
   - [ ] Crear primer tenant real (migración Mishell)
   - [ ] Crear segundo tenant de prueba
   - [ ] Monitoreo de errores

---

### Resumen de Tiempos

| Fase | Duración | Dependencias |
|------|----------|--------------|
| Fase 0 | 1-2 días | - |
| Fase 1 | 5-7 días | Fase 0 |
| Fase 2 | 4-5 días | Fase 1 |
| Fase 3 | 5-6 días | Fase 1, 2 |
| Fase 4 | 4-5 días | Fase 1 |
| Fase 5 | 6-8 días | Fase 1, 2, 4 |
| Fase 6 | 3-4 días | Fase 1-5 (Opcional) |
| Fase 7 | 4-5 días | Todas las anteriores |
| Fase 8 | 2-3 días | Fase 7 |

**Total estimado**: 34-45 días (sin Fase 6), 37-49 días (con Fase 6)

---

## 9. CONSIDERACIONES DE SEGURIDAD

### 9.1 Principios CRÍTICOS

#### 1. Aislamiento de Datos (Data Isolation)
```javascript
// ❌ NUNCA hacer queries sin filtro de tenant
db.collection('productos').get(); // PELIGRO: Trae de todos los tenants

// ✅ SIEMPRE filtrar por tenantId
db.collection('productos')
  .where('tenantId', '==', window.appContext.tenantId)
  .get();
```

#### 2. Validación Server-Side (Security Rules)
```javascript
// Las Security Rules son la ÚNICA línea de defensa real
// El código frontend puede ser manipulado
// SIEMPRE validar tenantId en las Rules
```

#### 3. Principio de Mínimo Privilegio
```javascript
// Cada usuario solo debe tener los permisos estrictamente necesarios
// Sub-usuario VENDEDOR NO debe poder ver configuración de branding
// Sub-usuario CONTADOR NO debe poder eliminar productos
```

### 9.2 Checklist de Seguridad

- [ ] **Queries Firestore**: 100% incluyen filtro `tenantId`
- [ ] **Security Rules**: Validación obligatoria de `tenantId` en writes
- [ ] **Firebase Storage**: Paths con namespace `/{tenantId}/...`
- [ ] **Storage Rules**: Validación de permisos por tenant
- [ ] **Auth**: Validación de `user.tenantId` match con `currentTenantId`
- [ ] **Super Admin**: No tiene `tenantId` → acceso global controlado
- [ ] **Inputs**: Sanitización contra XSS/SQL Injection
- [ ] **API Keys**: No expuestas en código público (ya OK con Firebase)
- [ ] **Audit Logs**: Log de acciones críticas (crear/eliminar tenant)

### 9.3 Escenarios de Ataque (Mitigados)

| Ataque | Mitigación |
|--------|-----------|
| **Usuario de Tenant A accede a datos de Tenant B** | Security Rules validan `tenantId` match |
| **Sub-usuario intenta elevar privilegios** | Permisos inmutables en Security Rules |
| **Manipulación de `tenantId` en request** | Security Rules ignoran request data, validan desde `usuarios` doc |
| **SQL Injection** | Firestore es NoSQL, params parametrizados |
| **XSS en nombre de producto** | Sanitización con DOMPurify antes de renderizar |
| **Acceso a Storage de otro tenant** | Storage Rules validan path `/{tenantId}/` match con user |

---

## 10. COSTOS Y ESCALABILIDAD

### 10.1 Proyección de Costos (Firebase)

#### Pricing Firebase (Plan Blaze - Pay as you go)

**Firestore**
- **Lecturas**: $0.06 USD por 100k docs
- **Escrituras**: $0.18 USD por 100k docs
- **Eliminaciones**: $0.02 USD por 100k docs
- **Storage**: $0.18 USD por GB/mes

**Storage**
- **Storage**: $0.026 USD por GB/mes
- **Descarga**: $0.12 USD por GB

**Hosting**
- **Storage**: $0.026 USD por GB/mes
- **Bandwidth**: $0.15 USD por GB

**Auth**
- Gratis para usuarios ilimitados

#### Ejemplo: Plataforma con 50 Tenants

**Supuestos**:
- Cada tenant: 500 productos, 100 clientes, 50 ventas/mes
- Visitas: 1000 visitas/mes por tenant = 50k visitas totales
- Imágenes: 10 MB por tenant = 500 MB total

**Cálculo mensual**:
```
Firestore:
- Lecturas: 50k visitas × 20 productos/visita × 50 tenants = 50M reads
  → $30 USD
- Escrituras: 50 ventas/mes × 50 tenants = 2.5k writes
  → $0.45 USD
- Storage: 50 tenants × 1000 docs × 1KB = 50 MB
  → $0.009 USD

Storage:
- Archivos: 500 MB
  → $0.013 USD
- Bandwidth: 50k visitas × 2 MB (imágenes) = 100 GB
  → $12 USD

Hosting:
- Bandwidth: 50k visitas × 500 KB (HTML/CSS/JS) = 25 GB
  → $3.75 USD

TOTAL MENSUAL: ~$46 USD
```

**Escalabilidad**: Firebase escala automáticamente hasta **1M de operaciones/segundo**.

### 10.2 Modelo de Monetización (Sugerido)

#### Planes de Suscripción

| Plan | Precio/mes | Max Productos | Max Usuarios | Storage | Margen |
|------|-----------|---------------|--------------|---------|--------|
| **Básico** | $29 USD | 500 | 3 | 500 MB | $25 beneficio |
| **Profesional** | $79 USD | 2000 | 10 | 2 GB | $73 beneficio |
| **Enterprise** | $199 USD | Ilimitado | Ilimitado | 10 GB | $193 beneficio |

**Breakeven**: Con 2 tenants en plan Básico ya cubres costos de infraestructura.

### 10.3 Optimizaciones de Performance

1. **Caché de configuración de tenant**
   ```javascript
   // Guardar en sessionStorage para evitar lecturas repetidas
   sessionStorage.setItem('currentTenant', JSON.stringify(tenant));
   ```

2. **Paginación de productos**
   ```javascript
   // No cargar todos los productos a la vez
   db.collection('productos')
     .where('tenantId', '==', tenantId)
     .orderBy('timestamp', 'desc')
     .limit(20) // Primera página
   ```

3. **Índices compuestos**
   ```
   tenantId (ASC) + timestamp (DESC)
   tenantId (ASC) + categoriaId (ASC)
   tenantId (ASC) + visible (ASC)
   ```

4. **CDN para imágenes**
   - Firebase Storage incluye CDN global
   - Caché headers configurados en firebase.json

---

## 11. PRÓXIMOS PASOS

### Aprobación del cliente
1. Revisar esta propuesta técnica
2. Aprobar stack tecnológico y estrategia multi-tenant
3. Aprobar plan de implementación por fases
4. Definir prioridades (¿Cloud Functions opcional?)

### Inicio de desarrollo
1. Crear branch `feature/multi-tenant-architecture`
2. Comenzar con Fase 1: Core Multi-Tenant
3. Commits atómicos y descriptivos
4. Code review en cada fase

### Comunicación continua
- Updates semanales de progreso
- Demos de funcionalidades completadas
- Ajustes según feedback

---

## 12. CONCLUSIONES

### Viabilidad Técnica
✅ **ALTA** - Firebase está diseñado para multi-tenancy, la arquitectura es sólida.

### Complejidad de Implementación
⚠️ **MEDIA-ALTA** - Requiere refactorización profunda pero no hay bloqueadores técnicos.

### Riesgos
- **Migración de datos**: Mitigado con scripts y validación exhaustiva
- **Performance**: Mitigado con índices y paginación
- **Seguridad**: Mitigado con Security Rules robustas

### Beneficios
- 🚀 Escalabilidad horizontal ilimitada
- 💰 Modelo de negocio rentable desde 2 clientes
- 🎨 White-label completo (diferenciación competitiva)
- 🔒 Seguridad enterprise con aislamiento total
- 📊 Métricas centralizadas para toma de decisiones

---

**¿Aprobamos esta propuesta y comenzamos con la implementación?** 🚀
