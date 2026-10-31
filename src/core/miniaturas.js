// Miniaturas de las fotos de productos.
//
// La foto principal de un producto pesa en promedio ~500 KB (hasta 1600 px)
// y se usaba tal cual en cuadritos de 70–250 px: la tienda descargaba ~10 MB
// solo en la primera página de prendas, y el buscador de Ventas, la lista de
// Productos y el punto de venta igual. Ahora cada producto guarda además una
// miniatura (~30–40 KB, 480 px en su lado mayor):
//   imagenThumbUrl: URL de la miniatura (o null si la original ya es chica)
//   imagenThumbDe:  la imagenUrl de la que se sacó
// urlMiniatura() solo la usa si imagenThumbDe coincide con la imagenUrl
// actual; si la foto cambió por cualquier vía, vuelve a la foto completa en
// vez de mostrar una miniatura vieja.

export const MINIATURA_LADO = 480;
const MINIATURA_CALIDAD = 0.78;
// Por debajo de esto la original ya es liviana: no vale la pena otra copia.
const MINIATURA_MINIMO_BYTES = 70 * 1024;
const DECODIFICAR_TIMEOUT_MS = 15000;

/** URL para mostrar el producto en tamaño pequeño (tarjetas, listas). */
export function urlMiniatura(p) {
    if (!p) return '';
    if (p.imagenThumbUrl && p.imagenThumbDe === p.imagenUrl) return p.imagenThumbUrl;
    return p.imagenUrl || '';
}

/** ¿Este producto todavía no tiene miniatura para su foto actual? */
export function necesitaMiniatura(p) {
    return !!p?.imagenUrl && p.imagenThumbDe !== p.imagenUrl;
}

function decodificar(blob) {
    if ('createImageBitmap' in window) {
        return createImageBitmap(blob).then(bmp => ({ fuente: bmp, ancho: bmp.width, alto: bmp.height, liberar: () => bmp.close?.() }));
    }
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => resolve({ fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) });
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
        img.src = url;
    });
}

/**
 * Crea la miniatura JPEG de una imagen (File/Blob). Devuelve null si no hace
 * falta (la original ya es liviana) o si el navegador no puede leerla (p. ej.
 * HEIC): en ese caso se sigue usando la foto completa.
 */
export async function crearMiniatura(blob) {
    if (!blob || !blob.type?.startsWith('image/') || blob.type === 'image/svg+xml') return null;
    if (blob.size <= MINIATURA_MINIMO_BYTES) return null;
    let img;
    try {
        img = await Promise.race([
            decodificar(blob),
            new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo agotado leyendo la imagen')), DECODIFICAR_TIMEOUT_MS)),
        ]);
    } catch (e) {
        console.warn('Miniatura: no se pudo leer la imagen:', e.message || e);
        return null;
    }
    try {
        const escala = Math.min(1, MINIATURA_LADO / Math.max(img.ancho, img.alto));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.ancho * escala));
        canvas.height = Math.max(1, Math.round(img.alto * escala));
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img.fuente, 0, 0, canvas.width, canvas.height);
        const resultado = await new Promise(res => canvas.toBlob(res, 'image/jpeg', MINIATURA_CALIDAD));
        if (!resultado || resultado.size >= blob.size) return null;
        return resultado;
    } finally {
        img.liberar();
    }
}

/** Descarga una foto ya subida y crea su miniatura (ver crearMiniatura). */
export async function miniaturaDesdeUrl(url) {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return crearMiniatura(await res.blob());
}
