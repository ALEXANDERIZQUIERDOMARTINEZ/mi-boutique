# 🔒 Migración de Security Rules a Multi-Tenant

## ✅ Cambios Realizados

Las **Security Rules** han sido actualizadas de un modelo **single-tenant** a **multi-tenant** con aislamiento completo de datos.

---

## 📋 Resumen de Cambios

### Antes (Single-Tenant)
```javascript
// ❌ PROBLEMA: No valida tenantId
match /productos/{productId} {
  allow read: if true; // Público
  allow create: if hasPermission('productos_crear');
  allow update: if hasPermission('productos_editar');
  allow delete: if hasPermission('productos_eliminar');
}
```

**Problema**: Un usuario de Empresa A podía ver/editar productos de Empresa B si tenía los permisos correctos.

### Ahora (Multi-Tenant)
```javascript
// ✅ SOLUCIÓN: Valida tenantId + permisos
match /productos/{productId} {
  allow read: if true; // Catálogo público

  allow create: if hasPermission('productos_crear') &&
                   hasRequiredTenantId() &&
                   isCreatingWithCorrectTenant();

  allow update: if hasPermission('productos_editar') &&
                   belongsToTenant(resource.data.tenantId) &&
                   isNotChangingTenant();

  allow delete: if hasPermission('productos_eliminar') &&
                   belongsToTenant(resource.data.tenantId);
}
```

**Solución**: El usuario SOLO puede crear/editar/eliminar datos de su propio tenant.

---

## 🆕 Nuevas Funciones de Seguridad

### 1. `belongsToTenant(tenantId)`
Verifica que el usuario pertenezca al tenant especificado.

```javascript
function belongsToTenant(tenantId) {
  return isActiveUser() &&
         (getUserData().tenantId == tenantId || isSuperAdmin());
}
```

### 2. `hasRequiredTenantId()`
Valida que el documento que se está creando incluya un `tenantId`.

```javascript
function hasRequiredTenantId() {
  return 'tenantId' in request.resource.data &&
         request.resource.data.tenantId != null &&
         request.resource.data.tenantId != '';
}
```

### 3. `isCreatingWithCorrectTenant()`
Asegura que el `tenantId` del documento coincida con el del usuario.

```javascript
function isCreatingWithCorrectTenant() {
  return request.resource.data.tenantId == getUserData().tenantId;
}
```

### 4. `isNotChangingTenant()`
Previene que se modifique el `tenantId` de un documento existente.

```javascript
function isNotChangingTenant() {
  return !('tenantId' in request.resource.data) ||
         request.resource.data.tenantId == resource.data.tenantId;
}
```

---

## 🔐 Validaciones Críticas Agregadas

### Para TODAS las colecciones con datos de tenant:

| Operación | Validación Agregada |
|-----------|-------------------|
| **CREATE** | ✅ `tenantId` presente<br>✅ `tenantId` coincide con el usuario<br>✅ Usuario tiene permiso |
| **READ** | ✅ Usuario pertenece al tenant del dato<br>✅ O es Super Admin |
| **UPDATE** | ✅ Usuario pertenece al tenant del dato<br>✅ No se cambia el `tenantId`<br>✅ Usuario tiene permiso |
| **DELETE** | ✅ Usuario pertenece al tenant del dato<br>✅ Usuario tiene permiso |

---

## 📦 Colecciones Afectadas

Las siguientes colecciones ahora tienen validación de `tenantId`:

- ✅ `productos`
- ✅ `ventas`
- ✅ `clientes`
- ✅ `usuarios`
- ✅ `categorias`
- ✅ `proveedores`
- ✅ `repartidores`
- ✅ `apartados`
- ✅ `movimientosFinancieros`
- ✅ `cierresCaja`
- ✅ `pedidosWeb`
- ✅ `metas`
- ✅ `ordenesRecepcion`
- ✅ `liquidaciones`
- ✅ `abonos`
- ✅ `pedidos`
- ✅ `promocionesGlobales`
- ✅ `historial_cargues`

### Nueva Colección: `tenants`
```javascript
match /tenants/{tenantId} {
  // Solo Super Admins pueden gestionar tenants
  allow read: if isSuperAdmin();
  allow create, update: if isSuperAdmin();
  allow delete: if false; // Nunca permitir eliminación directa
}
```

### Nueva Colección: `planes`
```javascript
match /planes/{planId} {
  allow read: if isSuperAdmin();
  allow create, update, delete: if isSuperAdmin();
}
```

---

## ⚠️ Cambios de Comportamiento

### Acceso Público al Catálogo
```javascript
// MANTIENE compatibilidad: Lectura pública de productos
match /productos/{productId} {
  allow read: if true; // ✅ Catálogo público sigue funcionando
}
```

### Chat Conversations
```javascript
// MANTIENE compatibilidad: Chat público
match /chatConversations/{conversationId} {
  allow read, write: if true; // ✅ Chat público sigue funcionando
}
```

### Pedidos Web (Creación Pública)
```javascript
// NUEVO: Requiere tenantId en creación
match /pedidosWeb/{pedidoId} {
  allow create: if hasRequiredTenantId(); // ⚠️ Ahora requiere tenantId
  allow read: if hasPermission('pedidos_web_ver') &&
                 belongsToTenant(resource.data.tenantId);
}
```

**⚠️ IMPORTANTE**: El frontend debe incluir `tenantId` al crear pedidos web desde el catálogo público.

---

## 🚀 Proceso de Despliegue

### Paso 1: Verificar Backup ✅
```bash
# El backup se creó automáticamente:
ls -la firestore.rules.backup-*
```

### Paso 2: Verificar Archivo Actual
```bash
# Las nuevas reglas están en:
cat firestore.rules
```

### Paso 3: Desplegar a Firebase
```bash
# ⚠️ IMPORTANTE: Antes de desplegar, asegúrate de:
# 1. Haber ejecutado la migración de datos (agregar tenantId)
# 2. Tener al menos un tenant creado
# 3. Haber creado el Super Admin

# Desplegar las reglas:
firebase deploy --only firestore:rules
```

### Paso 4: Verificar en Firebase Console
1. Ir a **Firebase Console** → **Firestore** → **Reglas**
2. Verificar que las nuevas reglas estén activas
3. Revisar la fecha de última actualización

---

## 🧪 Testing de Seguridad

### Test 1: Aislamiento de Datos
```javascript
// Escenario: Usuario de Tenant A intenta leer producto de Tenant B

// Usuario autenticado:
{
  uid: "user123",
  tenantId: "tenant-a"
}

// Intenta leer:
db.collection('productos').doc('producto-de-tenant-b').get()

// Esperado: ✅ Lectura permitida (catálogo público)
// Actualización: ❌ Denegada (pertenece a otro tenant)
```

### Test 2: Prevención de Modificación de TenantId
```javascript
// Usuario intenta cambiar tenantId de su propio producto

db.collection('productos').doc('mi-producto').update({
  tenantId: 'otro-tenant', // ❌ Intentando cambiar tenant
  precio: 99.99
})

// Esperado: ❌ Operación DENEGADA por isNotChangingTenant()
```

### Test 3: Super Admin Acceso Global
```javascript
// Usuario con rol SUPER_ADMIN

// Usuario autenticado:
{
  uid: "superadmin123",
  rol: "SUPER_ADMIN",
  tenantId: null
}

// Intenta leer cualquier tenant:
db.collection('productos').where('tenantId', '==', 'cualquier-tenant').get()

// Esperado: ✅ Acceso PERMITIDO (es Super Admin)
```

### Test 4: Creación Sin TenantId
```javascript
// Usuario intenta crear producto sin tenantId

db.collection('productos').add({
  nombre: 'Producto Nuevo',
  precio: 50
  // ❌ Falta tenantId
})

// Esperado: ❌ Operación DENEGADA por hasRequiredTenantId()
```

---

## 📊 Comparación Detallada

### Reglas Anteriores (Single-Tenant)
```javascript
// firestore.rules.backup-*

✅ Tenía validación de permisos
✅ Tenía roles (pero sin tenant)
❌ NO validaba tenantId
❌ NO impedía acceso cross-tenant
❌ NO tenía colección de tenants
❌ NO soportaba Super Admin cross-tenant
```

### Reglas Nuevas (Multi-Tenant)
```javascript
// firestore.rules (actual)

✅ Validación de permisos MEJORADA
✅ Roles con soporte multi-tenant
✅ Validación ESTRICTA de tenantId
✅ Impide acceso cross-tenant
✅ Colecciones tenants y planes
✅ Super Admin con acceso global
✅ Prevención de modificación de tenantId
✅ Validación en CREATE de tenantId correcto
```

---

## ⚠️ Advertencias Importantes

### 1. Migración de Datos PRIMERO
```bash
# ⚠️ CRÍTICO: Antes de desplegar estas reglas, debes:
# 1. Agregar tenantId a TODOS los documentos existentes
# 2. Usar migration-add-tenantid.html para esto
```

Si despliegas las reglas SIN migrar los datos:
- ❌ Los documentos sin `tenantId` serán inaccesibles
- ❌ No se podrán crear nuevos documentos hasta que el frontend envíe `tenantId`
- ❌ La aplicación dejará de funcionar

### 2. Actualizar Frontend TAMBIÉN
```javascript
// ⚠️ Todos los servicios deben incluir tenantId:

// Antes:
db.collection('productos').add({
  nombre: 'Producto',
  precio: 100
});

// Ahora:
db.collection('productos').add({
  nombre: 'Producto',
  precio: 100,
  tenantId: window.appContext.tenantId // ← REQUERIDO
});
```

### 3. Orden de Despliegue Correcto

```
1. ✅ Crear Super Admin (usar crear-super-admin.html)
2. ✅ Crear primer tenant (usar super-admin.html)
3. ✅ Migrar datos existentes (usar migration-add-tenantid.html)
4. ✅ Adaptar frontend (usar guías de adaptación)
5. ✅ Desplegar Security Rules (firebase deploy --only firestore:rules)
6. ✅ Testing completo
```

**❌ NO INVERTAS EL ORDEN** o la aplicación dejará de funcionar.

---

## 🔄 Rollback (Si algo sale mal)

Si necesitas volver a las reglas anteriores:

```bash
# Paso 1: Encontrar el backup
ls -la firestore.rules.backup-*

# Paso 2: Restaurar
cp firestore.rules.backup-YYYYMMDD-HHMMSS firestore.rules

# Paso 3: Desplegar
firebase deploy --only firestore:rules

# Paso 4: Verificar en Firebase Console
```

---

## 📚 Referencias

- **Guía completa**: Ver [DEPLOY.md](./DEPLOY.md)
- **Reglas completas**: Ver [firestore.rules](./firestore.rules)
- **Reglas originales**: Ver `firestore.rules.backup-*`

---

## 📞 Troubleshooting

### Error: "Missing or insufficient permissions"

**Causa**: El documento no tiene `tenantId` o el usuario no pertenece al tenant.

**Solución**:
1. Verificar que el documento tenga `tenantId`
2. Verificar que el usuario tenga `tenantId` en su documento
3. Verificar que ambos `tenantId` coincidan

### Error: "tenantId is required"

**Causa**: Intentando crear documento sin `tenantId`.

**Solución**: Actualizar el código del frontend para incluir `tenantId`:

```javascript
const nuevoProducto = {
  ...datosProducto,
  tenantId: window.appContext.tenantId
};
```

### Error: "Cannot change tenantId"

**Causa**: Intentando modificar el `tenantId` de un documento existente.

**Solución**: No incluir `tenantId` en el objeto de actualización, o asegurarse de que sea el mismo valor.

---

## ✅ Validación Final

Antes de considerar la migración completa:

- [ ] Backup de reglas anterior creado
- [ ] Nuevas reglas desplegadas en Firebase
- [ ] Migración de datos completada (todos los docs tienen tenantId)
- [ ] Super Admin creado y funcional
- [ ] Al menos un tenant creado
- [ ] Frontend actualizado con servicios multi-tenant
- [ ] Tests de aislamiento completados exitosamente
- [ ] Acceso público al catálogo funcionando
- [ ] Chat público funcionando
- [ ] Creación de pedidos web funcionando

---

**Estado**: Archivo `firestore.rules` actualizado con reglas multi-tenant ✅

**Backup**: `firestore.rules.backup-*` disponible para rollback

**Siguiente Paso**: Seguir [DEPLOY.md](./DEPLOY.md) para completar el despliegue.
