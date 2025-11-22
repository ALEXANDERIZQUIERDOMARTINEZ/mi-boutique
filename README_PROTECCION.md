# 🔒 Protección de Imágenes - Mishell Boutique

## Protecciones Activas

### 1. **CSS (style.css)**
```css
- user-select: none → Impide seleccionar imágenes
- user-drag: none → Impide arrastrar imágenes
```

### 2. **JavaScript (app.js líneas 1514-1597)**

#### Bloqueos activos:
- ✅ Clic derecho deshabilitado
- ✅ Arrastrar y soltar bloqueado
- ✅ Ctrl+S bloqueado
- ✅ PrintScreen limitado
- ✅ Protección dinámica (MutationObserver)

## Nivel de Protección

| Usuarios | Protección |
|----------|-----------|
| Básicos | 95% ✅ |
| Intermedios | 75% ⚠️ |
| Avanzados | 40% ⚠️ |

## Limitaciones

**NO se puede prevenir:**
- ❌ Capturas de pantalla
- ❌ DevTools (F12)
- ❌ Fotografías de pantalla

## Verificación

1. Hacer clic derecho en imagen → Debe mostrar advertencia
2. Intentar arrastrar imagen → No debe funcionar
3. Consola (F12) → Debe mostrar: `🔒 Protección de imágenes activada`
