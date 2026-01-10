# 🎨 Sidebar Moderno y Responsive - Mishell Boutique

## ✨ Características

El nuevo sidebar profesional incluye:

### 🎯 **Funcionalidad**
- ✅ **Colapsable**: Se puede expandir/colapsar con un botón
- ✅ **Responsive**: Se adapta automáticamente a móvil, tablet y desktop
- ✅ **Animaciones suaves**: Transiciones fluidas y profesionales
- ✅ **Tooltips**: Muestra nombres al hacer hover cuando está colapsado
- ✅ **Overlay en móvil**: Fondo oscuro cuando está abierto en móvil
- ✅ **Persistencia**: Recuerda si estaba abierto o cerrado

### 📱 **Comportamiento por Dispositivo**

#### 🖥️ **Desktop (≥1200px)**
- Sidebar siempre expandido por defecto
- Ancho: 280px
- Botón toggle oculto (opcional)
- Transiciones suaves al cambiar de sección

#### 💻 **Tablet (768px - 991px)**
- Sidebar colapsado por defecto (80px)
- Muestra solo iconos
- Se expande al hacer clic en el botón toggle
- Tooltips al pasar sobre los iconos

#### 📱 **Móvil (<768px)**
- Sidebar oculto por defecto (fuera de pantalla)
- Se desliza desde la izquierda al abrir
- Overlay oscuro sobre el contenido
- Cierre automático al hacer clic fuera
- Botón toggle siempre visible

## 🎨 Diseño Visual

### **Logo/Brand**
- **Colapsado**: Icono circular con gradiente rosa
- **Expandido**: Icono + texto "Mishell"
- Gradiente suave de fondo

### **Navegación**
- **Iconos**: Tamaño 1.25rem, alineados a la izquierda
- **Texto**: Aparece/desaparece con transición suave
- **Hover**: Fondo rosa claro + desplazamiento sutil
- **Activo**: Fondo gradiente + sombra rosa

### **Dropdowns**
- **Colapsado**: Punto indicador rosa
- **Expandido**: Flecha que rota al abrir
- **Submenu**: Padding adicional a la izquierda

### **Footer del Usuario**
- **Info de usuario**:
  - Icono de persona grande
  - Nombre y rol (solo visible expandido)
  - Fondo blanco con borde redondeado
- **Botón de logout**:
  - Icono de salida
  - Texto (solo visible expandido)
  - Hover: Rojo claro con borde rojo

## 🔧 Archivos del Sistema

```
mi-boutique/
├── admin.html                    # Actualizado con nueva estructura
├── admin-styles.css              # Estilos base originales
├── sidebar-modern.css            # ⭐ Nuevos estilos del sidebar
├── sidebar-control.js            # ⭐ Control JavaScript del sidebar
└── SIDEBAR-MODERNO.md            # Esta documentación
```

## 🚀 Uso

### **Control Programático**

El sidebar expone una API global para control desde otros scripts:

```javascript
// Abrir sidebar
window.sidebarControl.open();

// Cerrar sidebar
window.sidebarControl.close();

// Toggle (alternar)
window.sidebarControl.toggle();
```

### **HTML Requerido**

#### Estructura del Brand:
```html
<div class="sidebar-brand">
    <div class="sidebar-brand-icon">
        <i class="bi bi-shop"></i>
    </div>
    <span>Mishell</span>
</div>
```

#### Estructura de Enlaces:
```html
<a href="#seccion" class="nav-link" data-tooltip="Nombre Sección">
    <i class="bi bi-icon"></i>
    <span>Nombre Sección</span>
</a>
```

#### Footer con Usuario:
```html
<div class="sidebar-footer">
    <div id="currentUserInfo">
        <i class="bi bi-person-circle"></i>
        <div class="user-details">
            <div class="fw-bold">Nombre Usuario</div>
            <small class="text-muted">Rol</small>
        </div>
    </div>
    <button id="logoutBtn">
        <i class="bi bi-box-arrow-right"></i>
        <span>Cerrar Sesión</span>
    </button>
</div>
```

## 🎯 Personalización

### **Cambiar Colores**

Edita las variables CSS en `sidebar-modern.css`:

```css
:root {
    --sidebar-width: 280px;          /* Ancho expandido */
    --sidebar-collapsed: 80px;       /* Ancho colapsado */
    --sidebar-bg: #ffffff;           /* Color de fondo */
    --primary: #D988B9;              /* Color primario */
    --primary-dark: #c76fa5;         /* Color primario oscuro */
}
```

### **Cambiar Velocidad de Animación**

```css
:root {
    --transition-speed: 0.3s;        /* Velocidad de transición */
}
```

### **Comportamiento en Desktop**

Para que el sidebar esté siempre expandido en desktop, descomenta en `sidebar-modern.css`:

```css
@media (min-width: 1200px) {
    .sidebar-toggle {
        display: none !important;    /* Ocultar botón en desktop */
    }
}
```

### **Cambiar Punto de Quiebre Mobile**

Modifica los media queries en `sidebar-modern.css`:

```css
/* Cambiar 991px por el ancho deseado */
@media (max-width: 991px) {
    /* Estilos móvil */
}
```

## 🐛 Solución de Problemas

### **El sidebar no se expande**

1. Verifica que `sidebar-control.js` esté cargado correctamente
2. Revisa la consola del navegador por errores
3. Asegúrate de que los IDs sean correctos:
   - `adminSidebar` para el sidebar
   - `sidebarToggle` para el botón

### **El overlay no aparece en móvil**

- El overlay se crea automáticamente por `sidebar-control.js`
- Verifica que el script se ejecute después de cargar el DOM

### **Los tooltips no se muestran**

- Asegúrate de que los enlaces tengan el atributo `data-tooltip`
- Los tooltips solo se muestran cuando el sidebar está colapsado

### **El contenido queda detrás del sidebar**

- Verifica que tengas la clase `.admin-content-wrapper` en el contenedor principal
- Los márgenes se ajustan automáticamente según el estado del sidebar

### **Conflictos con estilos antiguos**

- `sidebar-modern.css` debe cargarse **después** de `admin-styles.css`
- Los nuevos estilos sobrescriben los antiguos automáticamente

## 📊 Compatibilidad

### **Navegadores Soportados**
- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Opera 76+

### **Dispositivos Probados**
- ✅ Desktop (1920x1080, 1366x768)
- ✅ Tablet (iPad, Android tablets)
- ✅ Móvil (iPhone, Android phones)

## 🔄 Migración desde el Sidebar Anterior

### **Cambios Requeridos**

1. **Agregar CSS**:
   ```html
   <link rel="stylesheet" href="sidebar-modern.css?v=1.0.0">
   ```

2. **Agregar JavaScript**:
   ```html
   <script src="sidebar-control.js"></script>
   ```

3. **Actualizar estructura del brand**:
   ```html
   <!-- Antes -->
   <div class="sidebar-brand">
       <span>Mishell</span>
   </div>

   <!-- Después -->
   <div class="sidebar-brand">
       <div class="sidebar-brand-icon">
           <i class="bi bi-shop"></i>
       </div>
       <span>Mishell</span>
   </div>
   ```

4. **Actualizar botón de logout**:
   ```html
   <!-- Antes -->
   <button id="logoutBtn">
       <i class="bi bi-box-arrow-right me-2"></i>Cerrar Sesión
   </button>

   <!-- Después -->
   <button id="logoutBtn">
       <i class="bi bi-box-arrow-right"></i>
       <span>Cerrar Sesión</span>
   </button>
   ```

### **Compatibilidad hacia atrás**

El nuevo sistema es **compatible** con el anterior. Si no cargas `sidebar-modern.css`, el sidebar seguirá funcionando con los estilos originales.

## 💡 Mejores Prácticas

1. **Iconos claros**: Usa iconos de Bootstrap Icons que sean reconocibles
2. **Textos cortos**: Mantén los nombres de sección concisos
3. **Grupos lógicos**: Organiza las secciones en dropdowns relacionados
4. **Testing responsive**: Prueba en diferentes tamaños de pantalla
5. **Accesibilidad**: Mantén los tooltips para usuarios con sidebar colapsado

## 🎓 Ejemplos de Uso

### **Agregar nueva sección**

```html
<li class="nav-item">
    <a href="#mi-seccion" class="nav-link" data-bs-toggle="pill" data-tooltip="Mi Sección">
        <i class="bi bi-star"></i>
        <span>Mi Sección</span>
    </a>
</li>
```

### **Agregar nuevo dropdown**

```html
<li class="nav-item dropdown">
    <a class="nav-link dropdown-toggle" href="javascript:void(0)" data-tooltip="Categoría">
        <i class="bi bi-folder"></i>
        <span>Categoría</span>
    </a>
    <ul class="dropdown-menu">
        <li>
            <a class="dropdown-item" href="#opcion1" data-bs-toggle="pill">
                <i class="bi bi-file"></i>Opción 1
            </a>
        </li>
        <li>
            <a class="dropdown-item" href="#opcion2" data-bs-toggle="pill">
                <i class="bi bi-file"></i>Opción 2
            </a>
        </li>
    </ul>
</li>
```

## 📱 Capturas de Pantalla

### Desktop
- Sidebar expandido (280px) con texto completo
- Navegación clara y espaciosa
- Footer con información del usuario visible

### Tablet
- Sidebar colapsado (80px) con solo iconos
- Tooltips al pasar el mouse
- Se expande temporalmente al hacer clic

### Móvil
- Sidebar oculto por defecto
- Se desliza desde la izquierda al abrir
- Overlay oscuro sobre el contenido
- Cierre al tocar fuera

---

**Desarrollado para Mishell Boutique** 💜
Sidebar Moderno y Responsive v1.0
Enero 2026
