// --- IMPORTACIONES DE FIREBASE ---
import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// --- INICIALIZACIÓN ---
// Usar la instancia existente de Firebase si ya está inicializada, o crear una nueva
let app;
let db;
let productsCollection;

function initFirebase() {
    try {
        // Intentar obtener la app existente (la que inicializó admin.js)
        if (getApps().length > 0) {
            app = getApp();
            console.log('✅ Usando instancia de Firebase existente');
        } else {
            // Si no existe, inicializar una nueva (por si acaso)
            const firebaseConfig = {
                apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
                authDomain: "mishell-boutique-admin.firebaseapp.com",
                projectId: "mishell-boutique-admin",
                storageBucket: "mishell-boutique-admin.firebasestorage.app",
                messagingSenderId: "399662956877",
                appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
            };
            app = initializeApp(firebaseConfig);
            console.log('✅ Inicializada nueva instancia de Firebase');
        }

        db = getFirestore(app);
        productsCollection = collection(db, 'productos');
    } catch (error) {
        console.error('❌ Error al inicializar Firebase:', error);
        throw error;
    }
}
const formatoMoneda = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
});

// ✅ MAPEO DE COLORES: Texto → Código Hex (igual que app.js)
const COLOR_MAP = {
    // Colores básicos
    'rojo': '#E53935',
    'roja': '#E53935',
    'azul': '#1E88E5',
    'verde': '#43A047',
    'amarillo': '#FDD835',
    'naranja': '#FB8C00',
    'rosa': '#FF8DA1',
    'morado': '#8E24AA',
    'violeta': '#8E24AA',
    'negro': '#212121',
    'negra': '#212121',
    'blanca': '#FFFFFF',
    'blanco': '#FFFFFF',
    'blanco 50%': '#F5F5F5',
    'blanco50%': '#F5F5F5',
    'negro%': '#424242',
    'negro %': '#424242',
    'gris': '#757575',
    'beige': '#D7CCC8',
    'cafe': '#795548',
    'café': '#795548',
    'dorado': '#FFD700',
    'plateado': '#C0C0C0',
    'turquesa': '#26C6DA',
    'fucsia': '#E91E63',
    'vino': '#880E4F',
    'vinotinto': '#880E4F',
    'verde militar': '#546E7A',
    'verdemilitar': '#546E7A',
    'naranja brillante': '#FF6D00',
    'neon': '#76FF03',
    'durazno': '#FFCCBC',
    'lila': '#BA68C8',
    'crema': '#FFF8E1',
    'salmón': '#FF8A80',
    'salmon': '#FF8A80',
    'cian': '#00BCD4',
    'oliva': '#827717',
    'menta': '#80CBC4',
    'cielo': '#B3E5FC',
    'coral': '#FF7043',
    'lavanda': '#CE93D8',
    'ocre': '#BF360C',
    'aguamarina': '#1DE9B6',
    'marfil': '#FFFDE7',
    'bordo': '#B71C1C',
    'bordó': '#B71C1C'
};

// 🎯 FUNCIÓN PRINCIPAL: Generar y descargar catálogo en PDF
async function generarCatalogoPDF() {
    const button = document.getElementById('btn-descargar-catalogo-pdf');
    if (!button) return;

    // Deshabilitar botón y mostrar estado de carga
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando PDF...';

    try {
        // 0. Inicializar Firebase
        initFirebase();

        // 1. Leer productos desde Firebase
        console.log('📦 Leyendo productos desde Firebase...');
        const productos = await leerProductosDesdeFirebase();

        if (productos.length === 0) {
            alert('No hay productos disponibles para generar el catálogo.');
            return;
        }

        console.log(`✅ ${productos.length} productos cargados`);

        // Limitar productos para testing (opcional - comentar/descomentar según necesites)
        const productosLimitados = productos.slice(0, 20);
        console.log(`⚠️ MODO TEST: Limitado a ${productosLimitados.length} productos`);

        // 2. Construir HTML del catálogo
        console.log('🎨 Construyendo catálogo HTML...');
        const htmlCatalogo = construirHTMLCatalogo(productosLimitados);

        // 3. Crear elemento temporal para el PDF
        console.log('🎨 Creando contenedor temporal...');
        const contenedor = document.createElement('div');
        contenedor.innerHTML = htmlCatalogo;
        contenedor.style.position = 'fixed';
        contenedor.style.top = '0';
        contenedor.style.left = '0';
        contenedor.style.width = '210mm';
        contenedor.style.zIndex = '99999';
        contenedor.style.backgroundColor = 'white';
        contenedor.style.overflow = 'auto';
        contenedor.style.maxHeight = '100vh';

        // Overlay oscuro para que el usuario sepa que está procesando
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
        overlay.style.zIndex = '99998';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = 'white';
        overlay.style.fontSize = '24px';
        overlay.innerHTML = '<div><i class="bi bi-hourglass-split"></i> Generando PDF...</div>';

        document.body.appendChild(overlay);
        document.body.appendChild(contenedor);

        // ESPERAR A QUE TODAS LAS IMÁGENES CARGUEN
        console.log('⏳ Esperando a que carguen las imágenes...');
        const images = contenedor.querySelectorAll('img');
        console.log(`📸 ${images.length} imágenes detectadas`);

        await Promise.all(
            Array.from(images).map(img => {
                if (img.complete && img.naturalHeight !== 0) {
                    return Promise.resolve();
                }
                return new Promise(resolve => {
                    img.onload = () => {
                        console.log(`✅ Imagen cargada: ${img.alt}`);
                        resolve();
                    };
                    img.onerror = () => {
                        console.warn(`⚠️ Error cargando imagen: ${img.alt}`);
                        resolve();
                    };
                    // Timeout de 3 segundos por imagen
                    setTimeout(resolve, 3000);
                });
            })
        );

        console.log('✅ Todas las imágenes procesadas');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verificar que el contenedor tenga contenido
        console.log(`📦 Contenedor tiene ${contenedor.children.length} elementos hijos`);
        console.log(`📏 Alto del contenedor: ${contenedor.offsetHeight}px`);

        if (contenedor.children.length === 0 || contenedor.offsetHeight === 0) {
            throw new Error('El contenedor está vacío. No se puede generar el PDF.');
        }

        // 4. Generar PDF usando html2pdf con opciones SIMPLIFICADAS
        console.log('📄 Generando PDF (esto puede tomar unos segundos)...');
        console.log(`📊 Procesando ${productosLimitados.length} productos...`);

        const opciones = {
            margin: [8, 8, 8, 8],
            filename: 'catalogo-mishell.pdf',
            image: {
                type: 'jpeg',
                quality: 0.6
            },
            html2canvas: {
                scale: 1,
                useCORS: false,
                allowTaint: true,
                logging: false,
                ignoreElements: (element) => {
                    // Ignorar imágenes que fallen
                    if (element.tagName === 'IMG' && !element.complete) {
                        return true;
                    }
                    return false;
                },
                onclone: (clonedDoc) => {
                    console.log('🔄 Clonando documento...');
                    // Asegurar que todos los elementos sean visibles
                    const body = clonedDoc.body;
                    body.style.visibility = 'visible';
                    body.style.display = 'block';

                    // Reemplazar imágenes problemáticas
                    const images = clonedDoc.querySelectorAll('img');
                    console.log(`📸 Procesando ${images.length} imágenes...`);

                    let reemplazadas = 0;
                    images.forEach(img => {
                        // Si la imagen es base64 (nuestro placeholder), dejarla
                        if (img.src.startsWith('data:image')) {
                            return;
                        }

                        // Si la imagen no ha cargado o es inválida, reemplazar
                        if (!img.complete || img.naturalHeight === 0 || img.src.includes('via.placeholder')) {
                            reemplazadas++;
                            img.src = PLACEHOLDER_SVG;
                            img.style.width = '100%';
                            img.style.height = '150px';
                            img.style.objectFit = 'cover';
                        }
                    });
                    console.log(`✅ ${reemplazadas} imágenes reemplazadas con placeholder`);
                }
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait',
                compress: true
            }
        };

        console.log('⏳ Procesando contenido (esto puede tomar 10-60 segundos)...');

        // Crear promesa del PDF
        const pdfPromise = html2pdf().set(opciones).from(contenedor).save();

        // Timeout de 120 segundos (2 minutos)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => {
                console.error('❌ Timeout alcanzado después de 120 segundos');
                reject(new Error('Timeout: La generación del PDF tomó demasiado tiempo. Intenta con menos productos.'));
            }, 120000)
        );

        // Esperar a que termine o timeout
        await Promise.race([pdfPromise, timeoutPromise]);

        console.log('✅ PDF procesado exitosamente');

        // 5. Limpiar
        console.log('🧹 Limpiando...');
        if (contenedor && contenedor.parentNode) {
            document.body.removeChild(contenedor);
        }
        if (overlay && overlay.parentNode) {
            document.body.removeChild(overlay);
        }
        console.log('✅ PDF generado correctamente');

        // Mostrar mensaje de éxito
        mostrarToast('PDF descargado correctamente', 'success');

    } catch (error) {
        console.error('❌ Error al generar PDF:', error);

        // Limpiar contenedor y overlay si existen
        const contenedor = document.querySelector('body > div[style*="z-index: 99999"]');
        if (contenedor && contenedor.parentNode) {
            document.body.removeChild(contenedor);
        }
        const overlay = document.querySelector('body > div[style*="z-index: 99998"]');
        if (overlay && overlay.parentNode) {
            document.body.removeChild(overlay);
        }

        // Mensaje de error más informativo
        let mensajeError = 'Hubo un error al generar el PDF.';
        if (error.message && error.message.includes('Timeout')) {
            mensajeError = 'La generación del PDF está tomando demasiado tiempo. Intenta de nuevo o contacta al soporte.';
        } else if (error.message) {
            mensajeError = `Error: ${error.message}`;
        }

        alert(mensajeError);
        mostrarToast('Error al generar PDF', 'error');
    } finally {
        // Restaurar botón siempre
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="bi bi-download me-2"></i>Descargar catálogo en PDF';
        }
    }
}

// 📦 FUNCIÓN: Leer productos visibles desde Firebase
async function leerProductosDesdeFirebase() {
    try {
        // Crear query para obtener solo productos visibles
        const q = query(
            productsCollection,
            where('visible', '==', true)
        );

        const snapshot = await getDocs(q);
        const productos = [];

        snapshot.forEach(doc => {
            const product = { ...doc.data(), id: doc.id };
            productos.push(product);
        });

        // Ordenar por timestamp (más recientes primero)
        productos.sort((a, b) => {
            const timestampA = a.timestamp?.toMillis?.() || 0;
            const timestampB = b.timestamp?.toMillis?.() || 0;
            return timestampB - timestampA;
        });

        return productos;
    } catch (error) {
        console.error('Error al leer productos:', error);
        throw error;
    }
}

// 🎨 FUNCIÓN: Construir HTML del catálogo basado en index.html
function construirHTMLCatalogo(productos) {
    // Fecha actual
    const fechaActual = new Date().toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Construir tarjetas de productos
    let productosHTML = '';
    productos.forEach(producto => {
        productosHTML += construirTarjetaProducto(producto);
    });

    // HTML SIN estilos en <style> tag - los inyectaremos después
    return `
<div style="font-family: Arial, sans-serif; padding: 20px; background: white;">
    <!-- Encabezado -->
    <div style="text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #D988B9;">
        <h1 style="font-size: 36px; color: #D988B9; letter-spacing: 3px; margin: 20px 0;">MISHELL</h1>
        <p style="font-size: 16px; color: #666; margin: 5px 0;">Catálogo de Productos</p>
        <p style="font-size: 12px; color: #999; margin: 5px 0;">Generado el ${fechaActual}</p>
    </div>

    <!-- Productos Grid -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
        ${productosHTML}
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 2px solid #D988B9;">
        <p style="margin: 8px 0; font-size: 13px; color: #555;"><strong>Contacto:</strong></p>
        <p style="margin: 8px 0; font-size: 13px; color: #555;">📱 WhatsApp: <strong style="color: #D988B9;">+57 300 123 4567</strong></p>
        <p style="margin: 8px 0; font-size: 11px; color: #999; font-style: italic;">¡Haz tu pedido por WhatsApp!</p>
        <p style="margin: 10px 0; font-size: 10px; color: #999;">© ${new Date().getFullYear()} Mishell Boutique - Todos los derechos reservados</p>
    </div>
</div>
    `;
}

// 🛡️ PLACEHOLDER SVG embebido (evita problemas de red)
const PLACEHOLDER_SVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTk5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gSW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';

// 🛡️ FUNCIÓN: Validar y sanitizar URL de imagen
function validarUrlImagen(url) {
    // Si no hay URL, usar placeholder SVG embebido
    if (!url || typeof url !== 'string' || url.trim() === '') {
        return PLACEHOLDER_SVG;
    }

    // Si la URL no comienza con http:// o https://, es inválida
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.warn(`⚠️ URL de imagen inválida: ${url} - Usando placeholder`);
        return PLACEHOLDER_SVG;
    }

    // Validar que sea una URL válida
    try {
        new URL(url);
        return url;
    } catch (error) {
        console.warn(`⚠️ URL de imagen malformada: ${url} - Usando placeholder`);
        return PLACEHOLDER_SVG;
    }
}

// 🎴 FUNCIÓN: Construir tarjeta individual de producto (basado en index.html)
function construirTarjetaProducto(producto) {
    // Validar y sanitizar URL de imagen
    const imgUrl = validarUrlImagen(producto.imagen);
    const nombre = producto.nombre || 'Sin nombre';
    const descripcion = producto.descripcion || '';
    const precioDetal = parseFloat(producto.precioDetal) || 0;
    const precioMayor = parseFloat(producto.precioMayor) || 0;

    // Calcular stock total
    let stockTotal = 0;
    if (producto.variaciones && Array.isArray(producto.variaciones)) {
        stockTotal = producto.variaciones.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
    }

    // Obtener tallas únicas
    let tallasHTML = '';
    if (producto.variaciones && Array.isArray(producto.variaciones)) {
        const tallasUnicas = [...new Set(producto.variaciones
            .map(v => v.talla)
            .filter(Boolean))];

        if (tallasUnicas.length > 0) {
            const tallaChips = tallasUnicas.map(talla =>
                `<span class="chip-talla">${talla}</span>`
            ).join('');
            tallasHTML = `<div class="variaciones-titulo">Tallas</div>
                         <div class="variation-chips">${tallaChips}</div>`;
        }
    }

    // Obtener colores únicos con círculos de color
    let coloresHTML = '';
    if (producto.variaciones && Array.isArray(producto.variaciones)) {
        const coloresUnicos = [...new Set(producto.variaciones
            .map(v => v.color)
            .filter(Boolean))];

        if (coloresUnicos.length > 0) {
            const colorChips = coloresUnicos.map(color => {
                const colorHex = COLOR_MAP[color.toLowerCase().trim()] || '#CCCCCC';
                return `<span class="chip-color" style="background-color: ${colorHex}; ${colorHex === '#FFFFFF' || colorHex === '#F5F5F5' ? 'border: 1px solid #ddd;' : ''}" title="${color}"></span>`;
            }).join('');

            coloresHTML = `<div class="variaciones-titulo">Colores</div>
                          <div class="variation-chips colors">${colorChips}</div>`;
        }
    }

    // Precio Mayor (solo si existe y no es 0)
    let precioMayorHTML = '';
    if (precioMayor > 0) {
        precioMayorHTML = `
            <div class="precio-mayor-card">
                ${formatoMoneda.format(precioMayor)} <span class="precio-label">(Mayor)</span>
            </div>
        `;
    }

    // Badge de stock y clase especial para agotados
    const isAgotado = stockTotal === 0;
    let stockBadge = '';
    if (isAgotado) {
        stockBadge = '<span class="badge-agotado">AGOTADO</span>';
    }

    // Clase especial para imagen agotada (aplicar filtro grayscale)
    const imagenClase = isAgotado ? 'producto-imagen producto-imagen-agotado' : 'producto-imagen';
    const cardClase = isAgotado ? 'producto-card producto-agotado' : 'producto-card';

    // Estilos inline
    const cardStyle = "background: white; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;";
    const imgWrapperStyle = "position: relative; width: 100%; height: 180px; overflow: hidden; background: #f8f8f8;";
    const imgStyle = `width: 100%; height: 100%; object-fit: cover; ${isAgotado ? 'filter: grayscale(100%); opacity: 0.75;' : ''}`;
    const badgeStyle = "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #dc3545; color: white; padding: 6px 15px; border-radius: 5px; font-size: 14px; font-weight: bold; border: 2px solid white;";
    const bodyStyle = "padding: 10px; display: flex; flex-direction: column; gap: 5px;";
    const titleStyle = "font-size: 13px; font-weight: 600; color: #2c3e50; margin: 0; min-height: 32px;";
    const descStyle = "font-size: 10px; color: #7f8c8d; margin: 0;";
    const priceDetalStyle = "font-size: 14px; font-weight: bold; color: #D988B9; margin: 3px 0;";
    const priceMayorStyle = "font-size: 12px; font-weight: 600; color: #27ae60; margin: 3px 0;";

    return `
        <div style="${cardStyle}">
            <div style="${imgWrapperStyle}">
                <img src="${imgUrl}" alt="${nombre}" style="${imgStyle}">
                ${stockBadge ? `<div style="${badgeStyle}">AGOTADO</div>` : ''}
            </div>
            <div style="${bodyStyle}">
                <h3 style="${titleStyle}">${nombre}</h3>
                ${descripcion ? `<p style="${descStyle}">${descripcion.length > 70 ? descripcion.substring(0, 70) + '...' : descripcion}</p>` : ''}
                <div style="${priceDetalStyle}">
                    ${formatoMoneda.format(precioDetal)} <span style="font-size: 10px; color: #95a5a6;">(Detal)</span>
                </div>
                ${precioMayor > 0 ? `<div style="${priceMayorStyle}">${formatoMoneda.format(precioMayor)} <span style="font-size: 10px; color: #95a5a6;">(Mayor)</span></div>` : ''}
            </div>
        </div>
    `;
}

// 🎨 FUNCIÓN: Obtener estilos CSS para el PDF
function obtenerEstilosPDF() {
    return `
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #333;
            background: #ffffff;
            padding: 20px;
            font-size: 11px;
            line-height: 1.4;
        }

        /* Encabezado */
        .catalogo-header {
            text-align: center;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 3px solid #D988B9;
            page-break-after: avoid;
        }

        .logo-container {
            margin: 0 auto 10px;
            display: inline-block;
        }

        .catalogo-titulo {
            font-size: 32px;
            font-weight: bold;
            color: #D988B9;
            letter-spacing: 3px;
            margin: 10px 0 5px;
        }

        .catalogo-subtitulo {
            font-size: 14px;
            color: #666;
            margin-bottom: 5px;
        }

        .catalogo-fecha {
            font-size: 10px;
            color: #999;
        }

        /* Grid de productos - 3 columnas */
        .productos-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }

        /* Tarjeta de producto */
        .producto-card {
            background: #fff;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .producto-imagen-wrapper {
            position: relative;
            width: 100%;
            height: 150px;
            overflow: hidden;
            background: #f8f8f8;
        }

        .producto-imagen {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: filter 0.3s ease;
        }

        /* Imagen en blanco y negro cuando está agotado */
        .producto-imagen-agotado {
            filter: grayscale(100%) brightness(1.1);
            opacity: 0.75;
        }

        .producto-badges {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 3;
            width: 100%;
            text-align: center;
        }

        /* Badge AGOTADO más grande y llamativo */
        .badge-agotado {
            background: #dc3545;
            color: white;
            padding: 8px 20px;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 900;
            letter-spacing: 1px;
            text-transform: uppercase;
            box-shadow: 0 4px 8px rgba(220, 53, 69, 0.4);
            border: 3px solid white;
            display: inline-block;
        }

        /* Overlay oscuro para productos agotados */
        .producto-agotado .producto-imagen-wrapper::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.15);
            z-index: 2;
        }

        .producto-body {
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex-grow: 1;
        }

        .producto-titulo {
            font-size: 12px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 3px;
            line-height: 1.3;
            min-height: 28px;
        }

        .producto-descripcion {
            font-size: 9px;
            color: #7f8c8d;
            line-height: 1.3;
            margin-bottom: 5px;
        }

        .precio-detal-card {
            font-size: 13px;
            font-weight: bold;
            color: #D988B9;
            margin-bottom: 2px;
        }

        .precio-mayor-card {
            font-size: 11px;
            font-weight: 600;
            color: #27ae60;
            margin-bottom: 5px;
        }

        .precio-label {
            font-size: 9px;
            font-weight: normal;
            color: #95a5a6;
        }

        .producto-variaciones {
            margin-top: 6px;
        }

        .variaciones-titulo {
            font-size: 9px;
            font-weight: 600;
            color: #7f8c8d;
            margin-bottom: 3px;
            text-transform: uppercase;
        }

        .variation-chips {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
            margin-bottom: 6px;
        }

        .chip-talla {
            display: inline-block;
            padding: 2px 6px;
            background: #ecf0f1;
            color: #2c3e50;
            border-radius: 3px;
            font-size: 9px;
            font-weight: 500;
        }

        .chip-color {
            display: inline-block;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            border: 1px solid rgba(0,0,0,0.1);
        }

        /* Footer */
        .catalogo-footer {
            text-align: center;
            margin-top: 25px;
            padding-top: 15px;
            border-top: 2px solid #D988B9;
            page-break-inside: avoid;
        }

        .catalogo-footer p {
            margin: 5px 0;
            font-size: 11px;
            color: #555;
        }

        .catalogo-footer strong {
            color: #D988B9;
            font-size: 13px;
        }

        .footer-nota {
            font-style: italic;
            color: #999;
            margin-top: 8px;
        }

        .footer-copyright {
            font-size: 9px;
            color: #999;
            margin-top: 10px;
        }

        /* Ajustes para impresión */
        @media print {
            body {
                padding: 10px;
            }
            .producto-card {
                page-break-inside: avoid;
            }
        }
    </style>
    `;
}

// 🔔 FUNCIÓN: Mostrar toast de notificación
function mostrarToast(mensaje, tipo = 'success') {
    const toastEl = document.getElementById('liveToast');
    const toastBody = document.getElementById('toast-body');

    if (!toastEl || !toastBody) return;

    // Configurar mensaje y color
    toastBody.textContent = mensaje;
    toastEl.className = 'toast align-items-center border-0';

    if (tipo === 'success') {
        toastEl.classList.add('text-white', 'bg-success');
    } else if (tipo === 'error') {
        toastEl.classList.add('text-white', 'bg-danger');
    } else {
        toastEl.classList.add('text-white', 'bg-info');
    }

    // Mostrar toast
    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
}

// 🎯 INICIALIZACIÓN: Event listener para el botón
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('btn-descargar-catalogo-pdf');
    if (button) {
        button.addEventListener('click', generarCatalogoPDF);
        console.log('✅ Módulo de catálogo PDF cargado correctamente');
    }
});
