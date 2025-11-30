# 🔥 Firebase Storage - Guía Rápida

## ⚠️ Error Code 412: Permisos Faltantes

Si ves este error en la consola de Firebase Storage:
```
Error Code 412: "A required service account is missing necessary permissions"
```

**Solución Rápida:**
1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona proyecto: `mishell-boutique-admin`
3. Ve a Storage → Haz clic en "Re-link bucket" o "Configurar"
4. Espera 2-5 minutos para que los cambios se propaguen

📖 **Documentación completa:** Ver [FIREBASE_PERMISSIONS_FIX.md](./FIREBASE_PERMISSIONS_FIX.md)

## 📊 Información del Proyecto

```javascript
Project ID: mishell-boutique-admin
Storage Bucket: mishell-boutique-admin.firebasestorage.app
API Key: AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI
```

## 🛠️ Mejoras Implementadas

### Error Handling Mejorado

El código ahora detecta automáticamente errores de permisos de Firebase Storage (code 412) y muestra mensajes claros:

**Ubicaciones actualizadas:**
- `admin.js:1419-1421` - Error handling en guardado de productos
- `admin.js:358-360` - Error handling en eliminación de imágenes
- `admin.js:8268-8270` - Error handling en creación de productos

### Mensaje de Error Mostrado

Cuando ocurre un error de permisos, los usuarios verán:
```
⚠️ Error de permisos de Firebase Storage. Consulta FIREBASE_PERMISSIONS_FIX.md para solucionar.
```

## 🎯 Verificación Post-Fix

Después de resolver el problema de permisos:

✅ Las vistas previas de imágenes en Firebase Console se cargarán correctamente
✅ Podrás subir nuevas imágenes de productos
✅ Las imágenes existentes se mostrarán en el catálogo
✅ No habrá errores 412 en la consola del navegador

## 📚 Recursos Adicionales

- [Firebase Storage Security](https://firebase.google.com/docs/storage/security)
- [Google Cloud IAM Documentation](https://cloud.google.com/iam/docs)
- [Firebase Storage FAQ](https://firebase.google.com/support/faq#storage-accounts)

---

**Actualizado:** 2025-11-30
**Autor:** Claude AI Assistant
