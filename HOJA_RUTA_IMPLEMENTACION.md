# 🗓️ HOJA DE RUTA - IMPLEMENTACIÓN MULTI-TENANT

## Estado Actual: FASE 0 - PLANIFICACIÓN COMPLETADA ✅

---

## 📊 Progreso General

```
Fase 0: ████████████████████ 100% ✅ COMPLETADA
Fase 1: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ PENDIENTE
Fase 2: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ PENDIENTE
Fase 3: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ PENDIENTE
Fase 4: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ PENDIENTE
Fase 5: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ PENDIENTE
Fase 6: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ OPCIONAL
Fase 7: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ PENDIENTE
Fase 8: ░░░░░░░░░░░░░░░░░░░░   0%  ⏸️ PENDIENTE
```

**Progreso total: 11% (Fase 0 completada)**

---

## 🎯 FASE 0: PREPARACIÓN (1-2 días) ✅ COMPLETADA

### ✅ Tareas Completadas

- [x] **Análisis de arquitectura actual** ✅
  - Codebase: ~26,000 líneas analizadas
  - Stack: Firebase (Firestore, Auth, Storage)
  - Estructura: Monolítica identificada

- [x] **Diseño de arquitectura multi-tenant** ✅
  - Estrategia: Base de datos compartida con `tenantId`
  - Aislamiento: Security Rules + filtros de query
  - Identificación: Subdominios

- [x] **Documentación técnica** ✅
  - PROPUESTA_SAAS_MULTITENANT.md (35+ páginas)
  - DIAGRAMA_ARQUITECTURA.md (diagramas visuales)
  - EJEMPLOS_CODIGO.md (código de referencia)
  - README_TRANSFORMACION_SAAS.md (resumen ejecutivo)

- [x] **Branch de desarrollo creado** ✅
  - Rama: `claude/multi-tenant-saas-conversion-pSW47`
  - Commits: Documentación commiteada y pusheada

### ⏭️ Próximo Paso
- [ ] **Backup de base de datos actual** (antes de comenzar Fase 1)
- [ ] **Aprobación de propuesta técnica**

---

## 🔨 FASE 1: CORE MULTI-TENANT (5-7 días) ⏸️ PENDIENTE

**Objetivo**: Implementar aislamiento de datos por tenant

### Tareas Pendientes

#### 1.1 Modelo de Datos
- [ ] Crear colección `tenants` en Firestore
  - Estructura definida en PROPUESTA_SAAS_MULTITENANT.md
  - Campos: nombre, slug, estado, branding, limites

- [ ] Agregar campo `tenantId` a colecciones existentes:
  - [ ] productos
  - [ ] ventas
  - [ ] clientes
  - [ ] usuarios
  - [ ] pedidosWeb
  - [ ] apartados
  - [ ] categorias
  - [ ] promociones
  - [ ] chatConversations
  - [ ] movimientosFinancieros
  - [ ] cierresCaja
  - [ ] repartidores
  - [ ] proveedores

- [ ] Crear índices compuestos en Firestore:
  - [ ] productos: [tenantId ASC, timestamp DESC]
  - [ ] productos: [tenantId ASC, categoriaId ASC]
  - [ ] ventas: [tenantId ASC, timestamp DESC]
  - [ ] ventas: [tenantId ASC, estado ASC]
  - [ ] clientes: [tenantId ASC, nombreLower ASC]
  - [ ] usuarios: [tenantId ASC, rol ASC]

- [ ] Actualizar Security Rules con filtros de tenant
  - Código de referencia en EJEMPLOS_CODIGO.md

#### 1.2 Tenant Resolver
- [ ] Implementar `src/core/tenant-resolver.js`
  - Código completo en EJEMPLOS_CODIGO.md
  - Funciones: detectar tenant desde URL, cargar config, inyectar branding

- [ ] Configurar Firebase Hosting para subdominios
  - Actualizar `firebase.json`
  - Configurar rewrites

- [ ] Configurar DNS wildcard
  - Tipo: CNAME
  - Host: *.miboutique.com
  - Target: miboutique-com.web.app

- [ ] Testing de identificación por subdominio
  - Desarrollo local: ?tenant=eleganza
  - Producción: eleganza.miboutique.com

#### 1.3 Migración de Datos
- [ ] Script de migración: Mishell → Primer tenant
  - Crear documento en `tenants` para Mishell
  - Asignar `tenantId` de Mishell a todos los documentos existentes

- [ ] Mover imágenes Storage a namespace
  - De: `/productos/{productoId}/...`
  - A: `/mishell/productos/{productoId}/...`

- [ ] Validación de migración
  - Verificar que todos los documentos tienen `tenantId`
  - Verificar que imágenes están accesibles

### 📦 Entregables Fase 1
- ✅ Colección `tenants` creada y poblada
- ✅ Todas las colecciones con campo `tenantId`
- ✅ `tenant-resolver.js` funcional
- ✅ Security Rules actualizadas
- ✅ Datos de Mishell migrados como primer tenant
- ✅ Subdominios configurados

### ⏱️ Tiempo Estimado: 5-7 días

---

## 👥 FASE 2: SISTEMA RBAC DE 3 NIVELES (4-5 días) ⏸️ PENDIENTE

**Objetivo**: Implementar jerarquía de permisos (Super Admin, Admin Tenant, Sub-usuarios)

### Tareas Pendientes

#### 2.1 Refactorización de Auth
- [ ] Extender `auth.js` → `src/core/auth-manager.js`
  - Código completo en EJEMPLOS_CODIGO.md

- [ ] Implementar validación de `tenantId` en login
  - Usuario debe pertenecer al tenant actual
  - Super Admin puede acceder a cualquier tenant

- [ ] Crear roles:
  - [ ] SUPER_ADMIN (sin tenantId)
  - [ ] ADMIN_TENANT (con tenantId)
  - [ ] VENDEDOR (con tenantId)
  - [ ] INVENTARIO (con tenantId)
  - [ ] CONTADOR (con tenantId)
  - [ ] REPARTIDOR (con tenantId)
  - [ ] VISUALIZADOR (con tenantId)

- [ ] Modificar colección `usuarios` con nuevo schema:
  ```javascript
  {
    uid: string,
    email: string,
    nombre: string,
    tenantId: string | null, // null solo para Super Admin
    rol: string,
    permisos: { [key]: boolean },
    activo: boolean
  }
  ```

#### 2.2 Sistema de Permisos
- [ ] Definir matriz de permisos por rol
  - Documentado en PROPUESTA_SAAS_MULTITENANT.md

- [ ] Implementar `src/core/permissions.js`
  - hasPermission(permission)
  - hasRole(rol)
  - requirePermission(permission)

- [ ] Actualizar Security Rules con permisos granulares
  - Verificar permisos en cada operación
  - Código en EJEMPLOS_CODIGO.md

#### 2.3 Gestión de Sub-usuarios
- [ ] UI para crear sub-usuarios en admin.html
  - Formulario de creación
  - Asignación de rol
  - Asignación de permisos custom

- [ ] Listado de sub-usuarios
  - Tabla con usuarios del tenant actual
  - Filtros por rol, estado

- [ ] Edición de sub-usuarios
  - Cambiar rol
  - Modificar permisos
  - Activar/desactivar

### 📦 Entregables Fase 2
- ✅ `auth-manager.js` refactorizado y funcional
- ✅ Sistema de roles implementado
- ✅ Matriz de permisos definida y aplicada
- ✅ UI de gestión de sub-usuarios
- ✅ Security Rules con validación de permisos

### ⏱️ Tiempo Estimado: 4-5 días

---

## 🎛️ FASE 3: PANEL SUPER ADMIN (5-6 días) ⏸️ PENDIENTE

**Objetivo**: Dashboard de gestión de plataforma

### Tareas Pendientes

#### 3.1 Interfaz Nueva
- [ ] Crear `src/pages/super-admin/super-admin.html`
  - Layout similar a admin.html
  - Navbar específico
  - Sidebar con opciones de super admin

- [ ] Crear `src/pages/super-admin/super-admin.js`
  - Lógica principal
  - Inicialización

- [ ] Dashboard con métricas globales
  - Total de tenants activos
  - Total de usuarios en la plataforma
  - Total de productos (todos los tenants)
  - Ingresos mensuales (si se implementa facturación)
  - Gráficos con Chart.js

- [ ] Listado de tenants
  - Tabla con todos los tenants
  - Búsqueda por nombre/slug
  - Filtrado por estado (activo, suspendido, trial)
  - Ordenamiento

#### 3.2 CRUD de Tenants
- [ ] Formulario de creación de tenant (onboarding)
  - Datos básicos: nombre, slug, email
  - Selección de plan
  - Asignación de admin inicial
  - Configuración de branding inicial

- [ ] Editar tenant
  - Cambiar plan
  - Actualizar límites
  - Modificar estado (activo/suspendido)
  - Cambiar datos de contacto

- [ ] Suspender tenant
  - Modal de confirmación
  - Cambiar estado a "suspendido"
  - Los usuarios del tenant no pueden hacer login

- [ ] Eliminar tenant (soft delete)
  - Modal de confirmación
  - Cambiar estado a "cancelado"
  - NO eliminar datos (mantener histórico)

- [ ] Asignar Admin inicial al tenant
  - Crear usuario con rol ADMIN_TENANT
  - Enviar credenciales por email

#### 3.3 Gestión de Planes
- [ ] Crear colección `planes` en Firestore

- [ ] CRUD de planes
  - Crear plan (básico, premium, enterprise)
  - Definir límites (maxProductos, maxUsuarios, maxStorage)
  - Definir precio
  - Activar/desactivar plan

- [ ] Asignar plan a tenant
  - Cambiar plan de un tenant
  - Aplicar nuevos límites automáticamente

### 📦 Entregables Fase 3
- ✅ Panel super admin funcional
- ✅ CRUD de tenants completo
- ✅ Dashboard con métricas globales
- ✅ Gestión de planes implementada
- ✅ Onboarding de nuevos tenants automatizado

### ⏱️ Tiempo Estimado: 5-6 días

---

## 🎨 FASE 4: BRANDING DINÁMICO (4-5 días) ⏸️ PENDIENTE

**Objetivo**: White-label completo

### Tareas Pendientes

#### 4.1 Sistema de Temas
- [ ] Crear `src/styles/theme.css`
  - Variables CSS base
  - Código en EJEMPLOS_CODIGO.md

- [ ] Migrar CSS hardcoded a CSS variables
  - style.css: Reemplazar colores hardcoded con variables
  - admin-styles.css: Reemplazar colores hardcoded con variables

- [ ] Implementar `src/ui/theme-injector.js`
  - Inyección de variables CSS
  - Cálculo de colores derivados (claro, hover, oscuro)
  - Ya implementado en tenant-resolver.js

- [ ] Pruebas con múltiples paletas
  - Crear 3 tenants de prueba con colores diferentes
  - Verificar que todos los elementos respetan las variables

#### 4.2 Configuración en Admin Panel
- [ ] Sección de branding en admin.html
  - Tab "Configuración de Marca"
  - Código HTML en EJEMPLOS_CODIGO.md

- [ ] Upload de logo
  - Input file para logo principal
  - Preview en tiempo real
  - Upload a Storage: `/{tenantId}/branding/logo.png`

- [ ] Color pickers
  - Color primario
  - Color secundario
  - Color de acento
  - Preview en vivo al cambiar

- [ ] Campos de texto
  - Nombre de la tienda
  - Tagline
  - Texto del footer
  - Descripción SEO

- [ ] Guardado en documento tenant
  - Actualizar campo `branding` del tenant
  - Función guardarBranding() en EJEMPLOS_CODIGO.md

#### 4.3 Aplicación Dinámica
- [ ] Inyección de branding en catálogo (index.html)
  - Logo dinámico
  - Colores dinámicos
  - Textos dinámicos

- [ ] Inyección en admin panel
  - Logo en navbar
  - Nombre de tienda

- [ ] Favicon dinámico
  - Reemplazar favicon según tenant
  - Soporte para .ico y .png

- [ ] Meta tags dinámicos (SEO)
  - Title
  - Description
  - OG tags (para redes sociales)

### 📦 Entregables Fase 4
- ✅ Sistema de variables CSS implementado
- ✅ Configuración de branding en admin panel
- ✅ Inyección dinámica en todas las páginas
- ✅ Preview en vivo de cambios
- ✅ Meta tags dinámicos

### ⏱️ Tiempo Estimado: 4-5 días

---

## 💻 FASE 5: REFACTORIZACIÓN DE FRONTEND (6-8 días) ⏸️ PENDIENTE

**Objetivo**: Adaptar UI existente a contexto multi-tenant

### Tareas Pendientes

#### 5.1 Catálogo Público (index.html)
- [ ] Refactorizar `app.js` → `src/pages/public/index.js`
  - Modularizar código
  - Separar responsabilidades

- [ ] Filtrar productos por `tenantId`
  - Todos los queries incluyen filtro
  - Usar productosService

- [ ] Adaptar carrito a contexto tenant
  - Verificar que productos pertenecen al tenant actual
  - Prevenir mezcla de productos de diferentes tenants

- [ ] Pedidos web con `tenantId`
  - Agregar tenantId al crear pedido
  - Validar en Security Rules

- [ ] Chat con contexto tenant
  - Conversaciones por tenant
  - No mezclar chats de diferentes tenants

#### 5.2 Panel Admin (admin.html)
- [ ] Refactorizar `admin.js`
  - Modularizar en controllers separados
  - Productos, ventas, clientes, usuarios, etc.

- [ ] Agregar filtro `tenantId` a TODOS los queries
  - Productos: `.where('tenantId', '==', tenantId)`
  - Ventas: `.where('tenantId', '==', tenantId)`
  - Clientes: `.where('tenantId', '==', tenantId)`
  - Etc.

- [ ] Productos: Filtrado por tenant
  - Listar solo productos del tenant actual
  - Crear productos con tenantId
  - Editar/eliminar validando tenantId

- [ ] Ventas: Filtrado por tenant
  - Listar solo ventas del tenant actual
  - Crear ventas con tenantId

- [ ] Clientes: Filtrado por tenant
  - Listar solo clientes del tenant actual
  - Crear clientes con tenantId

- [ ] Reportes: Solo datos del tenant actual
  - Dashboard con métricas filtradas
  - Gráficos solo del tenant actual

- [ ] Validación de límites de plan
  - Al crear producto: verificar maxProductos
  - Al crear usuario: verificar maxUsuarios
  - Mostrar warnings al acercarse al límite

#### 5.3 Componentes Compartidos
- [ ] Navbar con branding dinámico
  - Logo dinámico
  - Nombre de tienda dinámico
  - Color primario aplicado

- [ ] Footer con textos dinámicos
  - Texto del footer desde configuración

- [ ] Modales reutilizables
  - Modal genérico con branding

### 📦 Entregables Fase 5
- ✅ index.html adaptado a multi-tenant
- ✅ admin.html adaptado a multi-tenant
- ✅ Todos los queries con filtro tenantId
- ✅ Validación de límites de plan
- ✅ Componentes compartidos con branding

### ⏱️ Tiempo Estimado: 6-8 días

---

## ☁️ FASE 6: CLOUD FUNCTIONS (3-4 días) 🔶 OPCIONAL

**Objetivo**: Automatización y operaciones avanzadas

### Tareas Pendientes

#### 6.1 Onboarding Automatizado
- [ ] Function: `createTenant` (triggered por HTTP)
  - Crear documento en `tenants`
  - Crear estructura inicial (categorías default)
  - Crear usuario admin inicial
  - Enviar email de bienvenida

#### 6.2 Backup por Tenant
- [ ] Function scheduled: Backup diario por tenant
  - Exportar colecciones del tenant
  - Guardar en Cloud Storage
  - Retención de 30 días

#### 6.3 Analytics Agregados
- [ ] Function: Calcular métricas globales
  - Total de productos por tenant
  - Total de ventas por tenant
  - Almacenar en colección `platformMetrics`
  - Ejecutar diariamente

### 📦 Entregables Fase 6
- ✅ Cloud Functions desplegadas
- ✅ Onboarding automatizado
- ✅ Sistema de backups
- ✅ Métricas agregadas

### ⏱️ Tiempo Estimado: 3-4 días

**⚠️ NOTA**: Esta fase es OPCIONAL. Puede implementarse después si se requiere.

---

## 🧪 FASE 7: TESTING & QA (4-5 días) ⏸️ PENDIENTE

**Objetivo**: Validación exhaustiva del sistema

### Tareas Pendientes

#### 7.1 Testing de Aislamiento
- [ ] Crear 3 tenants de prueba
  - Tenant A: "Eleganza"
  - Tenant B: "Chic Store"
  - Tenant C: "Moda Boutique"

- [ ] Verificar que no hay data leakage
  - Productos de Tenant A NO aparecen en Tenant B
  - Ventas de Tenant A NO aparecen en Tenant B
  - Clientes de Tenant A NO aparecen en Tenant B

- [ ] Testing de Security Rules
  - Intentar acceder a documentos de otro tenant → RECHAZAR
  - Intentar modificar tenantId → RECHAZAR
  - Verificar que queries sin filtro fallan

#### 7.2 Testing de Permisos
- [ ] Crear usuarios de cada nivel
  - Super Admin (sin tenantId)
  - Admin Tenant (Eleganza)
  - Vendedor (Eleganza)
  - Inventario (Eleganza)
  - Contador (Chic Store)

- [ ] Verificar permisos por rol
  - Vendedor NO puede editar productos → Bloqueado
  - Inventario NO puede ver finanzas → Bloqueado
  - Contador NO puede eliminar usuarios → Bloqueado

- [ ] Intentar accesos no autorizados
  - Usuario de Tenant A intenta ver datos de Tenant B → RECHAZAR
  - Sub-usuario intenta elevar sus permisos → RECHAZAR

#### 7.3 Testing de Branding
- [ ] Cambiar branding de cada tenant
  - Eleganza: Morado (#8B4789)
  - Chic Store: Rosa (#E91E63)
  - Moda Boutique: Azul (#2196F3)

- [ ] Verificar aplicación correcta
  - Logo se muestra correctamente
  - Colores se aplican en todos los elementos
  - Textos se muestran correctamente

- [ ] Testing en múltiples navegadores
  - Chrome
  - Firefox
  - Safari
  - Edge

#### 7.4 Testing de Performance
- [ ] Load testing con muchos productos
  - Crear 1000 productos para un tenant
  - Verificar tiempo de carga < 2s

- [ ] Optimización de índices
  - Verificar que índices compuestos están creados
  - Analizar queries lentos en Firestore

- [ ] Caché de configuración de tenant
  - Verificar que se guarda en sessionStorage
  - Verificar que no se hace query repetido

### 📦 Entregables Fase 7
- ✅ Aislamiento de datos verificado
- ✅ Permisos validados exhaustivamente
- ✅ Branding funcional en todos los navegadores
- ✅ Performance optimizada
- ✅ Reporte de bugs encontrados y corregidos

### ⏱️ Tiempo Estimado: 4-5 días

---

## 🚀 FASE 8: DOCUMENTACIÓN & DEPLOY (2-3 días) ⏸️ PENDIENTE

**Objetivo**: Lanzamiento a producción

### Tareas Pendientes

#### 8.1 Documentación
- [ ] Manual de Super Admin
  - Cómo crear tenants
  - Cómo gestionar planes
  - Cómo suspender tenants
  - Métricas disponibles

- [ ] Manual de Admin Tenant
  - Cómo configurar branding
  - Cómo crear sub-usuarios
  - Cómo gestionar productos
  - Cómo ver reportes

- [ ] Guía de onboarding para nuevos tenants
  - Paso 1: Registro
  - Paso 2: Configuración inicial
  - Paso 3: Carga de productos
  - Paso 4: Invitar colaboradores

#### 8.2 Deploy
- [ ] Deploy a Firebase Hosting (producción)
  - `firebase deploy --only hosting`
  - Verificar que subdominios funcionan

- [ ] Deploy de Security Rules
  - `firebase deploy --only firestore:rules`
  - `firebase deploy --only storage:rules`

- [ ] Configurar subdominios en DNS
  - Wildcard: *.miboutique.com
  - Verificar propagación DNS

- [ ] Monitoring y alertas
  - Configurar alertas de errores
  - Configurar alertas de uso (cuotas Firebase)

#### 8.3 Post-launch
- [ ] Crear primer tenant real (migración Mishell)
  - Verificar que todos los datos están correctos
  - Verificar que branding funciona

- [ ] Crear segundo tenant de prueba
  - Tenant completamente nuevo
  - Validar flujo completo de onboarding

- [ ] Monitoreo de errores (primera semana)
  - Revisar logs diarios
  - Corregir bugs encontrados

### 📦 Entregables Fase 8
- ✅ Documentación completa
- ✅ Sistema desplegado en producción
- ✅ Subdominios configurados
- ✅ Monitoring activo
- ✅ Primer tenant real funcionando

### ⏱️ Tiempo Estimado: 2-3 días

---

## 📊 RESUMEN DE TIEMPOS

| Fase | Duración | Dependencias | Estado |
|------|----------|--------------|--------|
| Fase 0 | 1-2 días | - | ✅ COMPLETADA |
| Fase 1 | 5-7 días | Fase 0 | ⏸️ PENDIENTE |
| Fase 2 | 4-5 días | Fase 1 | ⏸️ PENDIENTE |
| Fase 3 | 5-6 días | Fase 1, 2 | ⏸️ PENDIENTE |
| Fase 4 | 4-5 días | Fase 1 | ⏸️ PENDIENTE |
| Fase 5 | 6-8 días | Fase 1, 2, 4 | ⏸️ PENDIENTE |
| Fase 6 | 3-4 días | Fase 1-5 | 🔶 OPCIONAL |
| Fase 7 | 4-5 días | Todas las anteriores | ⏸️ PENDIENTE |
| Fase 8 | 2-3 días | Fase 7 | ⏸️ PENDIENTE |

**Total (sin Fase 6)**: 34-45 días
**Total (con Fase 6)**: 37-49 días

---

## 📅 CALENDARIO SUGERIDO (Inicio: Por definir)

```
SEMANA 1:
├── Lunes-Martes: Fase 1 (Inicio) - Modelo de datos
├── Miércoles-Jueves: Fase 1 (Continuación) - Tenant Resolver
└── Viernes: Fase 1 (Fin) - Migración de datos

SEMANA 2:
├── Lunes-Martes: Fase 2 (Inicio) - Refactorización Auth
├── Miércoles: Fase 2 (Continuación) - Sistema permisos
├── Jueves-Viernes: Fase 2 (Fin) - Gestión sub-usuarios

SEMANA 3:
├── Lunes-Miércoles: Fase 3 (Inicio) - Panel Super Admin
└── Jueves-Viernes: Fase 3 (Continuación) - CRUD Tenants

SEMANA 4:
├── Lunes: Fase 3 (Fin) - Gestión de planes
├── Martes-Jueves: Fase 4 - Branding dinámico
└── Viernes: Fase 4 (Fin) - Aplicación dinámica

SEMANA 5:
├── Lunes-Viernes: Fase 5 - Refactorización frontend

SEMANA 6:
├── Lunes-Miércoles: Fase 5 (Fin) - Componentes compartidos
└── Jueves-Viernes: Fase 7 (Inicio) - Testing aislamiento

SEMANA 7:
├── Lunes-Miércoles: Fase 7 (Continuación) - Testing permisos/branding
├── Jueves: Fase 7 (Fin) - Performance
└── Viernes: Fase 8 (Inicio) - Documentación

SEMANA 8:
├── Lunes: Fase 8 (Continuación) - Deploy
└── Martes-Viernes: Fase 8 (Fin) - Post-launch + buffer
```

---

## 🎯 PRÓXIMA ACCIÓN INMEDIATA

### ✅ Antes de comenzar Fase 1:

1. **Backup de base de datos**
   ```bash
   # Exportar toda la base de datos actual
   firebase firestore:export gs://mishell-boutique-admin-backups/backup-$(date +%Y%m%d)
   ```

2. **Aprobación de propuesta**
   - Revisar PROPUESTA_SAAS_MULTITENANT.md
   - Revisar DIAGRAMA_ARQUITECTURA.md
   - Confirmar stack tecnológico
   - Confirmar plan de implementación

3. **Decisiones pendientes**
   - ¿Implementar Cloud Functions (Fase 6)?
   - ¿Dominio principal para subdominios? (ej: miboutique.com)
   - ¿Modelo de suscripción final?

### 🚦 Cuando esté listo, responde:

**"Aprobado. Comenzar con Fase 1."**

Y procederé inmediatamente con la implementación del Core Multi-Tenant.

---

**Última actualización**: 2026-01-11
**Branch actual**: claude/multi-tenant-saas-conversion-pSW47
**Commit actual**: da364c2
