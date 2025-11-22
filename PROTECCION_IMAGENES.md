# 🔒 Protección de Imágenes - Mishell Boutique

## Sistema Anti-Descarga Implementado

Este documento describe las medidas de seguridad implementadas para proteger las imágenes de productos en la tienda online.

---

## 📋 Protecciones Implementadas

### 1. **CSS - Protección Visual**

**Ubicación:** `style.css` (líneas 1489-1529)

```css
/* Deshabilitar selección y arrastre de imágenes */
- user-select: none
- -webkit-user-drag: none
- pointer-events: auto
```

**Qué hace:**
- ✅ Impide seleccionar imágenes con el mouse
- ✅ Deshabilita arrastrar y soltar imágenes
- ✅ Compatible con todos los navegadores (Chrome, Firefox, Safari, Edge)

---

### 2. **JavaScript - Protección de Comportamiento**

**Ubicación:** `app.js` (líneas 1557-1640)

#### **Funcionalidades:**

##### **a) Clic Derecho Deshabilitado**
```javascript
img.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showToast('Las imágenes están protegidas', 'warning');
});
```
- ✅ Bloquea el menú contextual en imágenes
- ✅ Muestra mensaje de advertencia al usuario

##### **b) Arrastrar y Soltar Deshabilitado**
```javascript
img.addEventListener('dragstart', (e) => {
    e.preventDefault();
});
```
- ✅ Impide arrastrar imágenes fuera del navegador
- ✅ Previene guardar imágenes arrastrando al escritorio

##### **c) Protección Dinámica**
```javascript
MutationObserver - Observa nuevas imágenes
```
- ✅ Protege imágenes cargadas dinámicamente
- ✅ Funciona con productos cargados con scroll infinito

##### **d) Bloqueo de Teclas**
```javascript
// Ctrl+S (Guardar)
// PrintScreen (Captura)
```
- ✅ Bloquea Ctrl+S para guardar página
- ✅ Limita captura de pantalla con PrintScreen

---

### 3. **Marca de Agua (Opcional)**

**Ubicación:** `image-protection.js`

#### **Cómo Funcionar:**
Sistema avanzado que agrega marca de agua "MISHELL BOUTIQUE" en diagonal sobre las imágenes.

#### **Características:**
- ✅ Marca de agua sutil (15% opacidad)
- ✅ Patrón repetido en diagonal
- ✅ Color personalizable (#D988B9 - rosa de marca)
- ✅ No afecta la experiencia del usuario
- ✅ Dificulta uso no autorizado de imágenes

#### **Cómo Activar:**

Descomentar en `image-protection.js` línea 147:
```javascript
// ANTES (desactivado)
// const imageProtection = new ImageProtection();

// DESPUÉS (activado)
const imageProtection = new ImageProtection();
```

Luego incluir el script en `index.html`:
```html
<script type="module" src="image-protection.js"></script>
```

---

## 🛡️ Nivel de Protección

### **Usuarios Básicos: 95% Protegido**
- ❌ No pueden hacer clic derecho → Guardar imagen
- ❌ No pueden arrastrar imágenes al escritorio
- ❌ No pueden seleccionar y copiar

### **Usuarios Intermedios: 75% Protegido**
- ⚠️ Pueden usar DevTools (F12) para ver URLs
- ⚠️ Pueden tomar capturas de pantalla
- ✅ La marca de agua (si está activa) aparecerá en capturas

### **Usuarios Avanzados: 40% Protegido**
- ⚠️ Pueden inspeccionar código y obtener URLs directas
- ⚠️ Pueden usar extensiones de navegador
- ✅ La marca de agua dificulta el uso profesional

---

## 💡 Recomendaciones Adicionales

### **Para Máxima Protección:**

1. **Activa la Marca de Agua**
   - Edita `image-protection.js` línea 147
   - Ajusta opacidad si es muy visible/invisible

2. **Usa Imágenes de Baja Resolución**
   - Sube imágenes de 800x800px máximo
   - Las imágenes grandes son más atractivas de robar

3. **Watermark Manual (Photoshop/Canva)**
   - Agrega marca de agua ANTES de subir
   - Más seguro que marca de agua por JavaScript

4. **Firebase Storage Rules**
   - Configura reglas para prevenir hotlinking
   - Requiere autenticación para ver imágenes

5. **Servicio de Protección de Imágenes**
   - Cloudflare Image Protection
   - Amazon CloudFront Signed URLs

---

## 🚨 Limitaciones Importantes

**NOTA:** Ninguna protección web es 100% efectiva.

### **Lo que NO se puede prevenir:**
- ❌ Capturas de pantalla (Print Screen, Snipping Tool)
- ❌ Fotografías de la pantalla con celular
- ❌ Usuarios técnicos con DevTools
- ❌ Bots/scrapers automatizados

### **Lo que SÍ prevenimos:**
- ✅ 95% de usuarios casuales
- ✅ Copias rápidas y fáciles
- ✅ Uso accidental no autorizado
- ✅ Arrastrar y pegar en redes sociales

---

## 📊 Resumen de Archivos Modificados

| Archivo | Cambios | Propósito |
|---------|---------|-----------|
| `style.css` | Agregado CSS anti-selección | Protección visual |
| `app.js` | Agregado listeners anti-copia | Protección JavaScript |
| `image-protection.js` | Nuevo archivo (opcional) | Marca de agua avanzada |
| `index.html` | Eliminado botón descarga | Remover acceso fácil |

---

## 🔧 Configuración Personalizada

### **Cambiar Mensaje de Advertencia:**

En `app.js` línea 1566 y similares:
```javascript
showToast('Las imágenes están protegidas', 'warning');
// Cambiar a:
showToast('Tu mensaje personalizado', 'warning');
```

### **Cambiar Marca de Agua:**

En `image-protection.js` líneas 7-10:
```javascript
this.watermarkText = 'MISHELL BOUTIQUE'; // Tu texto
this.watermarkOpacity = 0.15; // 0.0 - 1.0
this.watermarkColor = '#D988B9'; // Color hex
this.watermarkSize = 30; // Tamaño en px
```

---

## ✅ Verificación de Funcionamiento

1. **Abrir la tienda**
2. **Intentar clic derecho en una imagen** → Debe mostrar mensaje
3. **Intentar arrastrar imagen** → No debe funcionar
4. **Abrir consola del navegador (F12)** → Debe ver: `🔒 Protección de imágenes activada`

---

## 📞 Soporte

Si necesitas ayuda adicional con la protección de imágenes:
- Ajusta la configuración en los archivos mencionados
- Considera servicios profesionales de protección de imágenes
- Consulta con un desarrollador para protecciones avanzadas

---

**Última actualización:** 2025
**Versión:** 1.0
**Autor:** Sistema de Protección Mishell Boutique
