# 🔧 Instrucciones para Corregir Errores de Permisos de Firebase

## 📋 Problema Identificado

Los errores `Missing or insufficient permissions` ocurren porque las reglas de seguridad de Firestore están bloqueando el acceso a las siguientes colecciones:

- ✅ `apartados` (apartados activos)
- ✅ `proveedores` (suppliers)
- ✅ `clientes` (clients)
- ✅ `ventas` (sales)
- ✅ `pedidosWeb` (web orders)
- ✅ `abonos` (payments)
- ✅ `liquidaciones` (settlements)
- Y otras colecciones relacionadas

## 🚀 Solución: Actualizar las Reglas de Firestore

### Opción 1: Actualizar Manualmente en Firebase Console

1. **Accede a Firebase Console:**
   - Ve a https://console.firebase.google.com/
   - Selecciona tu proyecto de mi-boutique

2. **Navega a Firestore Database:**
   - En el menú lateral, haz clic en **"Firestore Database"**
   - Haz clic en la pestaña **"Reglas"** (Rules)

3. **Copia y Pega las Nuevas Reglas:**
   - Abre el archivo `firestore.rules` en este repositorio
   - Copia todo el contenido
   - Pégalo en el editor de reglas de Firebase Console
   - Haz clic en **"Publicar"** (Publish)

### Opción 2: Desplegar con Firebase CLI

Si tienes Firebase CLI instalado, puedes desplegar las reglas automáticamente:

```bash
# 1. Instalar Firebase CLI (si no lo tienes)
npm install -g firebase-tools

# 2. Iniciar sesión
firebase login

# 3. Inicializar el proyecto (solo la primera vez)
firebase init firestore

# Cuando te pregunte:
# - Selecciona tu proyecto existente
# - Para "Firestore rules file": usa firestore.rules
# - Para "Firestore indexes file": presiona Enter para usar el default

# 4. Desplegar las reglas
firebase deploy --only firestore:rules
```

## 🔍 ¿Qué Cambiaron las Nuevas Reglas?

Las nuevas reglas permiten:

✅ **Lectura y escritura** para usuarios autenticados en todas las colecciones necesarias:
   - categorias
   - proveedores
   - clientes
   - repartidores
   - productos
   - ventas
   - apartados
   - movimientosFinancieros / finanzas
   - cierresCaja
   - pedidosWeb
   - chatConversations
   - metas
   - ordenesRecepcion
   - liquidaciones
   - abonos
   - pedidos

🔒 **Seguridad básica:**
   - Se requiere autenticación para todas las operaciones
   - Se niega el acceso a colecciones no especificadas

## ✅ Verificación

Después de aplicar las reglas:

1. **Refresca tu aplicación web** (Ctrl+F5 o Cmd+Shift+R)
2. **Verifica la consola del navegador:**
   - No deberías ver más errores de permisos
   - Los datos deberían cargarse correctamente

3. **Comprueba que funcionan:**
   - Ventas del día
   - Apartados activos
   - Lista de clientes
   - Lista de proveedores
   - Pedidos web

## ⚠️ Nota Importante

Estas reglas permiten acceso completo a usuarios autenticados. Si necesitas reglas más restrictivas basadas en roles de usuario, deberás configurar un sistema de permisos más avanzado.

## 🆘 Solución de Problemas

Si los errores persisten después de aplicar las reglas:

1. **Verifica que estás autenticado:**
   - Asegúrate de haber iniciado sesión en la aplicación
   - Revisa la consola del navegador para ver si `auth.currentUser` no es null

2. **Limpia la caché:**
   - Cierra y abre el navegador
   - Limpia la caché del navegador

3. **Espera unos segundos:**
   - Los cambios en las reglas pueden tardar unos momentos en propagarse

4. **Revisa las reglas en Firebase Console:**
   - Verifica que se publicaron correctamente
   - Asegúrate de que no haya errores de sintaxis
