// --- IMPORTACIONES DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// *** CONFIGURACIÓN DE FIREBASE ***
const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

// --- INICIALIZACIÓN ---
const app = initializeApp(firebaseConfig, 'catalogoPDFApp');
const db = getFirestore(app);
const productsCollection = collection(db, 'productos');
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
        // 1. Leer productos desde Firebase
        console.log('📦 Leyendo productos desde Firebase...');
        const productos = await leerProductosDesdeFirebase();

        if (productos.length === 0) {
            alert('No hay productos disponibles para generar el catálogo.');
            return;
        }

        console.log(`✅ ${productos.length} productos cargados`);

        // 2. Construir HTML del catálogo
        console.log('🎨 Construyendo catálogo HTML...');
        const htmlCatalogo = construirHTMLCatalogo(productos);

        // 3. Crear elemento temporal para el PDF
        const contenedor = document.createElement('div');
        contenedor.innerHTML = htmlCatalogo;
        contenedor.style.position = 'absolute';
        contenedor.style.left = '-9999px';
        contenedor.style.top = '0';
        document.body.appendChild(contenedor);

        // 4. Generar PDF usando html2pdf
        console.log('📄 Generando PDF...');
        const opciones = {
            margin: [10, 10, 10, 10],
            filename: 'catalogo-mishell.pdf',
            image: { type: 'jpeg', quality: 0.85 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false,
                letterRendering: true
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        await html2pdf().set(opciones).from(contenedor).save();

        // 5. Limpiar
        document.body.removeChild(contenedor);
        console.log('✅ PDF generado correctamente');

        // Mostrar mensaje de éxito
        mostrarToast('PDF descargado correctamente', 'success');

    } catch (error) {
        console.error('❌ Error al generar PDF:', error);
        alert('Hubo un error al generar el PDF. Por favor intenta de nuevo.');
    } finally {
        // Restaurar botón
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-download me-2"></i>Descargar catálogo en PDF';
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

    // Logo SVG de Mishell
    const logoSVG = `
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 512 512">
            <rect width="512" height="512" fill="#D988B9" rx="80"/>
            <text x="256" y="320" font-family="Arial, sans-serif" font-size="200" font-weight="bold" fill="white" text-anchor="middle">M</text>
        </svg>
    `;

    // Construir tarjetas de productos
    let productosHTML = '';
    productos.forEach(producto => {
        productosHTML += construirTarjetaProducto(producto);
    });

    // HTML completo del catálogo
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Catálogo Mishell</title>
    ${obtenerEstilosPDF()}
</head>
<body>
    <!-- Encabezado -->
    <div class="catalogo-header">
        <div class="logo-container">
            ${logoSVG}
        </div>
        <h1 class="catalogo-titulo">MISHELL</h1>
        <p class="catalogo-subtitulo">Catálogo de Productos</p>
        <p class="catalogo-fecha">Generado el ${fechaActual}</p>
    </div>

    <!-- Productos Grid -->
    <div class="productos-grid">
        ${productosHTML}
    </div>

    <!-- Footer -->
    <div class="catalogo-footer">
        <p><strong>Contacto:</strong></p>
        <p><i>📱 WhatsApp:</i> <strong>+57 300 123 4567</strong></p>
        <p class="footer-nota">¡Haz tu pedido por WhatsApp!</p>
        <p class="footer-copyright">© ${new Date().getFullYear()} Mishell Boutique - Todos los derechos reservados</p>
    </div>
</body>
</html>
    `;
}

// 🎴 FUNCIÓN: Construir tarjeta individual de producto (basado en index.html)
function construirTarjetaProducto(producto) {
    const imgUrl = producto.imagen || 'https://via.placeholder.com/300x400?text=Sin+Imagen';
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

    // Badge de stock
    let stockBadge = '';
    if (stockTotal === 0) {
        stockBadge = '<span class="badge-agotado">AGOTADO</span>';
    }

    return `
        <div class="producto-card">
            <div class="producto-imagen-wrapper">
                <img src="${imgUrl}" alt="${nombre}" class="producto-imagen" crossorigin="anonymous">
                ${stockBadge ? `<div class="producto-badges">${stockBadge}</div>` : ''}
            </div>
            <div class="producto-body">
                <h3 class="producto-titulo">${nombre}</h3>
                ${descripcion ? `<p class="producto-descripcion">${descripcion.length > 80 ? descripcion.substring(0, 80) + '...' : descripcion}</p>` : ''}
                <div class="precio-detal-card">
                    ${formatoMoneda.format(precioDetal)} <span class="precio-label">(Detal)</span>
                </div>
                ${precioMayorHTML}
                ${tallasHTML || coloresHTML ? `<div class="producto-variaciones">${tallasHTML}${coloresHTML}</div>` : ''}
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
        }

        .producto-badges {
            position: absolute;
            top: 6px;
            left: 6px;
            z-index: 2;
        }

        .badge-agotado {
            background: #dc3545;
            color: white;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: bold;
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
