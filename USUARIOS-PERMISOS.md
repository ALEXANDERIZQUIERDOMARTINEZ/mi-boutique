# 🔐 Sistema de Usuarios y Permisos - Mishell Boutique Admin

## 📋 Descripción General

Este sistema implementa autenticación y control de acceso basado en roles y permisos para el panel de administración de Mishell Boutique. Permite crear usuarios con diferentes niveles de acceso y controlar qué puede hacer cada usuario en el sistema.

## 🚀 Configuración Inicial

### Paso 1: Crear el Primer Super Admin

1. **Abre el archivo `crear-super-admin.html` en tu navegador**
2. Completa el formulario con:
   - Nombre completo
   - Email (este será tu usuario de inicio de sesión)
   - Contraseña (mínimo 6 caracteres)
3. Haz clic en **"Crear Super Admin"**
4. **IMPORTANTE**: Una vez creado el usuario, elimina el archivo `crear-super-admin.html` por seguridad

### Paso 2: Desplegar las Reglas de Firestore

Las nuevas reglas de seguridad están en el archivo `firestore.rules`. Para aplicarlas:

```bash
firebase deploy --only firestore:rules
```

O desde la consola de Firebase:
1. Ve a Firestore Database → Reglas
2. Copia el contenido de `firestore.rules`
3. Pega y publica las reglas

### Paso 3: Iniciar Sesión

1. Ve a `login.html`
2. Ingresa tu email y contraseña
3. Serás redirigido a `admin.html` con todos los permisos

## 👥 Roles Predefinidos

El sistema incluye 7 roles predefinidos:

### 1. Super Administrador
- **Acceso**: Total al sistema incluyendo gestión de usuarios
- **Permisos**: Todos (58 permisos)
- **Uso**: Propietario del negocio o desarrollador

### 2. Administrador
- **Acceso**: Completo excepto gestión de usuarios
- **Permisos**: Todos menos `usuarios_ver` y `usuarios_gestionar`
- **Uso**: Gerente o encargado principal

### 3. Vendedor
- **Acceso**: Registrar ventas, ver inventario y clientes
- **Permisos**:
  - Dashboard (ver)
  - Ventas (registrar, ver)
  - Productos (ver)
  - Clientes (ver)
  - Apartados (ver, gestionar)
- **Uso**: Personal de ventas en tienda

### 4. Gestión de Inventario
- **Acceso**: Gestionar productos y categorías
- **Permisos**:
  - Dashboard (ver)
  - Productos (ver, crear, editar, cargue masivo)
  - Categorías (ver, gestionar)
- **Uso**: Encargado de bodega o inventario

### 5. Contador
- **Acceso**: Ver y gestionar finanzas
- **Permisos**:
  - Dashboard (ver)
  - Ventas (ver)
  - Finanzas (ver, gestionar)
  - Cierres de caja (ver, gestionar)
- **Uso**: Contador o persona de finanzas

### 6. Repartidor
- **Acceso**: Ver y gestionar pedidos web/entregas
- **Permisos**:
  - Pedidos web (ver, gestionar)
- **Uso**: Personal de entregas/domicilios

### 7. Visualizador
- **Acceso**: Solo lectura de reportes
- **Permisos**:
  - Dashboard (ver)
  - Ventas (ver)
  - Productos (ver)
  - Clientes (ver)
- **Uso**: Consultas o supervisión sin modificación

### 8. Personalizado
- **Acceso**: Configurable manualmente
- **Permisos**: Selección manual de cada permiso
- **Uso**: Casos especiales que no encajan en roles predefinidos

## 🔑 Gestión de Usuarios

### Crear Nuevo Usuario

1. Ve a **Admin → Usuarios**
2. Haz clic en **"Nuevo Usuario"**
3. Completa los datos:
   - Nombre completo
   - Email (usuario de inicio de sesión)
   - Contraseña (mínimo 6 caracteres)
   - Rol (elige uno de los roles predefinidos o personalizado)
   - Estado (Activo/Inactivo)
4. Si eliges "Personalizado", selecciona los permisos específicos
5. Haz clic en **"Guardar Usuario"**

### Editar Usuario

1. Ve a **Admin → Usuarios**
2. Haz clic en el botón **editar (✏️)** del usuario
3. Modifica los campos necesarios
4. Guarda los cambios

**Nota**: No se puede cambiar la contraseña desde la edición. El usuario debe usar "Olvidé mi contraseña" en el login.

### Desactivar Usuario

1. Edita el usuario
2. Desmarca la opción **"Usuario Activo"**
3. Guarda

Los usuarios inactivos no podrán iniciar sesión.

### Eliminar Usuario

1. Ve a **Admin → Usuarios**
2. Haz clic en el botón **eliminar (🗑️)** del usuario
3. Confirma la eliminación

**Importante**: No puedes eliminarte a ti mismo. Solo Super Admins pueden eliminar usuarios.

## 🛡️ Permisos Disponibles

El sistema cuenta con 58 permisos organizados en 8 categorías:

### Dashboard (1 permiso)
- `dashboard_ver`: Ver el dashboard principal

### Ventas (8 permisos)
- `ventas_registrar`: Registrar nuevas ventas
- `ventas_ver`: Ver historial de ventas
- `ventas_editar`: Editar ventas existentes
- `ventas_eliminar`: Eliminar ventas
- `pedidos_web_ver`: Ver pedidos del catálogo web
- `pedidos_web_gestionar`: Gestionar pedidos web
- `apartados_ver`: Ver apartados de clientes
- `apartados_gestionar`: Gestionar apartados

### Inventario (7 permisos)
- `productos_ver`: Ver lista de productos
- `productos_crear`: Crear nuevos productos
- `productos_editar`: Editar productos existentes
- `productos_eliminar`: Eliminar productos
- `productos_cargue_masivo`: Usar cargue masivo desde Excel
- `categorias_ver`: Ver categorías
- `categorias_gestionar`: Crear/editar/eliminar categorías

### Clientes (2 permisos)
- `clientes_ver`: Ver lista de clientes
- `clientes_gestionar`: Crear/editar/eliminar clientes

### Logística (4 permisos)
- `repartidores_ver`: Ver lista de repartidores
- `repartidores_gestionar`: Crear/editar/eliminar repartidores
- `promociones_ver`: Ver promociones
- `promociones_gestionar`: Crear/editar/eliminar promociones

### Finanzas (4 permisos)
- `finanzas_ver`: Ver movimientos financieros
- `finanzas_gestionar`: Gestionar finanzas
- `cierres_caja_ver`: Ver cierres de caja
- `cierres_caja_gestionar`: Gestionar cierres de caja

### Configuración (2 permisos)
- `config_ver`: Acceder a configuración
- `config_backup`: Realizar backups de datos

### Usuarios (2 permisos)
- `usuarios_ver`: Ver lista de usuarios
- `usuarios_gestionar`: Crear/editar usuarios

**IMPORTANTE**: Los permisos de usuarios solo están disponibles para Super Administradores.

## 🔒 Seguridad

### Reglas de Firestore

Las nuevas reglas de seguridad implementan:

- ✅ Autenticación obligatoria para el admin
- ✅ Verificación de permisos por operación
- ✅ Lectura pública solo para catálogo web (productos, promociones)
- ✅ Protección contra accesos no autorizados
- ✅ Validación de usuarios activos

### Características de Seguridad

1. **Login Requerido**: El admin.html redirige a login.html si no hay sesión
2. **Verificación de Estado**: Solo usuarios activos pueden acceder
3. **Permisos Granulares**: Cada acción verifica permisos específicos
4. **UI Adaptativa**: Las secciones sin permiso se ocultan automáticamente
5. **Sesión Persistente**: La sesión se mantiene mientras el navegador esté abierto
6. **Logout Seguro**: Botón de cerrar sesión disponible en el sidebar

## 📁 Archivos del Sistema

```
mi-boutique/
├── login.html                    # Página de inicio de sesión
├── crear-super-admin.html        # Script de configuración inicial (eliminar después de usar)
├── admin.html                    # Panel admin (ahora protegido con autenticación)
├── auth.js                       # Sistema de autenticación y permisos
├── usuarios.js                   # Gestión de usuarios CRUD
├── admin-styles.css              # Estilos actualizados (incluye sidebar footer y avatares)
├── firestore.rules               # Reglas de seguridad de Firestore
└── USUARIOS-PERMISOS.md          # Esta documentación
```

## 🔧 Integración con Código Existente

El sistema de autenticación es transparente para el código existente. Los cambios principales son:

### En admin.html:
- Se agregó la sección "Usuarios" en el sidebar
- Se agregó el footer con info de usuario y logout
- Se agregaron los modales de gestión de usuarios
- Se importó auth.js y usuarios.js al final del archivo

### En auth.js:
- `AuthManager`: Clase principal de autenticación
- `PERMISOS`: Constante con todos los permisos
- `ROLES`: Constante con roles predefinidos
- `hasPermission()`: Verifica si el usuario tiene un permiso
- `applyUIRestrictions()`: Oculta elementos sin permisos

### En usuarios.js:
- `initUsuariosManager()`: Inicializa el módulo
- CRUD completo de usuarios
- Gestión de roles y permisos personalizados

## 🎯 Flujo de Uso

1. **Usuario intenta acceder a admin.html**
   - Si no está autenticado → Redirige a login.html
   - Si está autenticado pero inactivo → Muestra error y redirige
   - Si está autenticado y activo → Carga el admin con permisos aplicados

2. **Sistema de Permisos**
   - Al cargar, `AuthManager` lee los permisos del usuario
   - Oculta automáticamente las secciones del sidebar sin permiso
   - Los botones y acciones también se validan contra permisos

3. **Gestión de Usuarios**
   - Solo Super Admins ven la sección "Usuarios"
   - Pueden crear usuarios con cualquier rol
   - Pueden editar/desactivar/eliminar usuarios (excepto a sí mismos)

## ⚠️ Consideraciones Importantes

1. **Primer Super Admin**: Solo puede crearse con `crear-super-admin.html`. Elimina este archivo después de usarlo.

2. **Cambio de Contraseña**: El sistema no permite cambiar contraseñas de otros usuarios. Usa Firebase Console o implementa "Olvidé mi contraseña".

3. **Eliminación de Authentication**: Al eliminar un usuario de Firestore, NO se elimina de Firebase Authentication automáticamente. Esto requiere Admin SDK en un backend.

4. **Reglas de Firestore**: Asegúrate de desplegar las nuevas reglas antes de activar el sistema en producción.

5. **Catálogo Público**: Las páginas `index.html` (catálogo) y el chat siguen siendo públicas. Solo el admin requiere autenticación.

6. **Super Admin**: Siempre debe existir al menos un Super Admin. No elimines todos los Super Admins.

## 🐛 Solución de Problemas

### "Usuario no autorizado para acceder al panel"
- El usuario existe en Authentication pero no en la colección `usuarios`
- Solución: Crea el usuario desde Admin → Usuarios

### "Tu cuenta está desactivada"
- El usuario tiene `activo: false` en Firestore
- Solución: Un Super Admin debe reactivar el usuario

### "No tienes permiso para esta acción"
- El usuario no tiene el permiso necesario para esa operación
- Solución: Editar el usuario y agregar el permiso requerido

### No puedo ver la sección "Usuarios"
- Solo Super Admins pueden ver esta sección
- Solución: Solicitar acceso a un Super Admin existente

### Error "Permission denied" en Firestore
- Las reglas de seguridad no están desplegadas
- Solución: Ejecutar `firebase deploy --only firestore:rules`

## 📞 Soporte

Para más información o soporte:
- Revisa la consola del navegador (F12) para ver errores detallados
- Verifica los permisos del usuario en Admin → Usuarios
- Consulta los logs de Firebase Authentication en la consola de Firebase

---

**Desarrollado para Mishell Boutique** 💜
Sistema de Usuarios y Permisos v1.0
