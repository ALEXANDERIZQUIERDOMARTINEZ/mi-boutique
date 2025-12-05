// 🔥 IMPORTACIONES Firebase
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Variables globales
let app, db, productsCollection;

// Configuración Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

// Placeholder SVG
const PLACEHOLDER_SVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTk5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gSW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';

// Inicializar Firebase
function initFirebase() {
    if (getApps().length > 0) {
        app = getApp();
    } else {
        app = initializeApp(firebaseConfig);
    }
    db = getFirestore(app);
    productsCollection = collection(db, 'productos');
}

// Leer productos
async function leerProductos() {
    const q = query(productsCollection, where('visible', '==', true));
    const snapshot = await getDocs(q);
    const productos = [];
    snapshot.forEach(doc => {
        productos.push({ ...doc.data(), id: doc.id });
    });
    return productos;
}

// Convertir imagen a base64
async function convertirImagenABase64(url) {
    if (!url || !url.startsWith('http')) {
        return PLACEHOLDER_SVG;
    }

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            } catch (e) {
                resolve(PLACEHOLDER_SVG);
            }
        };

        img.onerror = () => resolve(PLACEHOLDER_SVG);
        setTimeout(() => resolve(PLACEHOLDER_SVG), 3000);

        img.src = url;
    });
}

// Generar PDF
async function generarCatalogoPDF() {
    const button = document.getElementById('btn-descargar-catalogo-pdf');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

    try {
        // Inicializar
        initFirebase();
        console.log('📥 Cargando productos...');
        const productos = await leerProductos();

        if (productos.length === 0) {
            alert('No hay productos para generar el catálogo');
            return;
        }

        console.log(`✅ ${productos.length} productos cargados`);

        // Crear overlay con diseño mejorado
        const overlay = document.createElement('div');
        overlay.id = 'pdf-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;font-family:Arial;';
        overlay.innerHTML = `
            <style>
                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes shimmer {
                    0% { background-position: -1000px 0; }
                    100% { background-position: 1000px 0; }
                }
                .pdf-logo {
                    font-size: 60px;
                    margin-bottom: 20px;
                    animation: pulse 2s ease-in-out infinite;
                }
                .progress-container {
                    width: 450px;
                    padding: 40px;
                    background: rgba(255,255,255,0.05);
                    border-radius: 20px;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                    border: 1px solid rgba(255,255,255,0.1);
                }
                .progress-title {
                    font-size: 32px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    background: linear-gradient(90deg, #D988B9, #E5A8CB, #F0B8D8);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                .progress-bar-outer {
                    width: 100%;
                    height: 40px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 20px;
                    overflow: hidden;
                    box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
                    position: relative;
                }
                .progress-bar-inner {
                    height: 100%;
                    background: linear-gradient(90deg, #D988B9 0%, #E5A8CB 50%, #D988B9 100%);
                    background-size: 200% 100%;
                    animation: shimmer 2s infinite;
                    transition: width 0.5s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: bold;
                    color: white;
                    text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }
                .progress-info {
                    margin-top: 20px;
                    font-size: 15px;
                    color: #E5A8CB;
                    text-align: center;
                    line-height: 1.6;
                }
                .progress-warning {
                    margin-top: 15px;
                    font-size: 13px;
                    color: #ffd700;
                    text-align: center;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                }
            </style>
            <div class="progress-container">
                <div class="pdf-logo">📄</div>
                <div class="progress-title">Generando Catálogo</div>
                <div id="progress-text" class="progress-info">Iniciando proceso...</div>
                <div class="progress-bar-outer">
                    <div id="progress-bar" class="progress-bar-inner" style="width:0%;">0%</div>
                </div>
                <div class="progress-warning">
                    <span>⚠️</span>
                    <span>No cierres esta ventana - Puede tomar varios minutos</span>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const progressText = document.getElementById('progress-text');
        const progressBar = document.getElementById('progress-bar');

        // Inicializar jsPDF
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4', true);

        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 10;
        const contentWidth = pageWidth - (margin * 2);

        let yPos = margin;
        let currentPage = 1;

        // Header con diseño profesional
        progressText.textContent = 'Creando encabezado...';
        progressBar.style.width = '5%';
        progressBar.textContent = '5%';

        // Fondo del header
        pdf.setFillColor(250, 245, 248);
        pdf.rect(0, 0, pageWidth, 45, 'F');

        // Borde inferior del header
        pdf.setDrawColor(217, 136, 185);
        pdf.setLineWidth(2);
        pdf.line(0, 45, pageWidth, 45);

        // Decoración lateral izquierda
        pdf.setFillColor(217, 136, 185);
        pdf.circle(5, 10, 2, 'F');
        pdf.circle(5, 20, 1.5, 'F');
        pdf.circle(5, 30, 2, 'F');

        // Decoración lateral derecha
        pdf.circle(pageWidth - 5, 10, 2, 'F');
        pdf.circle(pageWidth - 5, 20, 1.5, 'F');
        pdf.circle(pageWidth - 5, 30, 2, 'F');

        // Título principal
        pdf.setFontSize(36);
        pdf.setTextColor(217, 136, 185);
        pdf.setFont('helvetica', 'bold');
        pdf.text('M I S H E L L', pageWidth / 2, yPos + 18, { align: 'center' });

        yPos += 22;
        pdf.setFontSize(11);
        pdf.setTextColor(80, 80, 80);
        pdf.setFont('helvetica', 'normal');
        pdf.text('✦  C A T Á L O G O  D E  P R O D U C T O S  ✦', pageWidth / 2, yPos, { align: 'center' });

        yPos += 6;
        pdf.setFontSize(9);
        pdf.setTextColor(120, 120, 120);
        const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
        pdf.text(fecha, pageWidth / 2, yPos, { align: 'center' });

        yPos = 55;

        // Procesar productos - 2 columnas para más espacio vertical
        const colsPerRow = 2;
        const imgWidth = (contentWidth - 10) / colsPerRow;
        const imgHeight = imgWidth * 1.2;
        let cardHeight = imgHeight + 60; // Más espacio para descripción y variaciones

        let col = 0;
        let xPos = margin;

        for (let i = 0; i < productos.length; i++) {
            const producto = productos[i];
            const progreso = Math.floor(((i + 1) / productos.length) * 90) + 5;
            progressText.textContent = `Procesando ${i + 1} de ${productos.length}: ${producto.nombre}`;
            progressBar.style.width = `${progreso}%`;
            progressBar.textContent = `${progreso}%`;

            // Nueva página si es necesario
            if (yPos + cardHeight > pageHeight - margin) {
                pdf.addPage();
                currentPage++;
                yPos = margin;
                col = 0;
                xPos = margin;
            }

            // Calcular posición
            xPos = margin + (col * (imgWidth + 5));

            // Guardar posición inicial para el borde
            const cardStartY = yPos;

            // Fondo blanco con sombra simulada para la tarjeta
            pdf.setFillColor(250, 250, 250);
            pdf.rect(xPos - 1, yPos - 1, imgWidth + 2, imgHeight + 2, 'F');

            // Convertir imagen
            const imgUrl = producto.imagenUrl || producto.imagen;
            const base64Img = await convertirImagenABase64(imgUrl);

            // Dibujar imagen con borde sutil
            try {
                pdf.addImage(base64Img, 'JPEG', xPos, yPos, imgWidth, imgHeight, undefined, 'FAST');

                // Borde alrededor de la imagen
                pdf.setDrawColor(220, 220, 220);
                pdf.setLineWidth(0.3);
                pdf.rect(xPos, yPos, imgWidth, imgHeight);
            } catch (e) {
                console.error('Error al agregar imagen:', e);
            }

            // Badge AGOTADO si aplica
            let stockTotal = 0;
            if (producto.variaciones && Array.isArray(producto.variaciones)) {
                stockTotal = producto.variaciones.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0);
            }

            if (stockTotal === 0) {
                pdf.setFillColor(220, 53, 69);
                pdf.rect(xPos + (imgWidth / 2) - 15, yPos + (imgHeight / 2) - 5, 30, 10, 'F');
                pdf.setFontSize(8);
                pdf.setTextColor(255, 255, 255);
                pdf.setFont('helvetica', 'bold');
                pdf.text('AGOTADO', xPos + (imgWidth / 2), yPos + (imgHeight / 2) + 2, { align: 'center' });
            }

            // Calcular altura dinámica según contenido
            let contentYPos = yPos + imgHeight + 5;

            // Nombre
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'bold');
            const nombreCorto = producto.nombre.length > 30 ? producto.nombre.substring(0, 30) + '...' : producto.nombre;
            pdf.text(nombreCorto, xPos + (imgWidth / 2), contentYPos, { align: 'center', maxWidth: imgWidth - 4 });
            contentYPos += 5;

            // Descripción
            if (producto.descripcion && producto.descripcion.trim()) {
                pdf.setFontSize(6);
                pdf.setTextColor(100, 100, 100);
                pdf.setFont('helvetica', 'normal');
                const descripcionCorta = producto.descripcion.length > 80 ? producto.descripcion.substring(0, 80) + '...' : producto.descripcion;
                const descLines = pdf.splitTextToSize(descripcionCorta, imgWidth - 4);
                pdf.text(descLines, xPos + (imgWidth / 2), contentYPos, { align: 'center', maxWidth: imgWidth - 4 });
                contentYPos += descLines.length * 2.5;
            }

            // Precios
            const precioDetal = parseFloat(producto.precioDetal) || 0;
            const precioMayor = parseFloat(producto.precioMayor) || 0;

            pdf.setFontSize(8);
            pdf.setTextColor(217, 136, 185);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`Detal: $${precioDetal.toLocaleString('es-CO')}`, xPos + (imgWidth / 2), contentYPos, { align: 'center' });
            contentYPos += 4;

            if (precioMayor > 0) {
                pdf.setTextColor(39, 174, 96);
                pdf.setFontSize(7);
                pdf.text(`Mayor: $${precioMayor.toLocaleString('es-CO')}`, xPos + (imgWidth / 2), contentYPos, { align: 'center' });
                contentYPos += 4;
            }

            // Variaciones - TODAS sin límite, sin stock
            if (producto.variaciones && Array.isArray(producto.variaciones) && producto.variaciones.length > 0) {
                contentYPos += 3;

                // Línea separadora antes de variaciones
                pdf.setDrawColor(230, 230, 230);
                pdf.setLineWidth(0.2);
                pdf.line(xPos + 2, contentYPos, xPos + imgWidth - 2, contentYPos);
                contentYPos += 3;

                pdf.setFontSize(7);
                pdf.setTextColor(217, 136, 185);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Disponible en:', xPos + (imgWidth / 2), contentYPos, { align: 'center' });
                contentYPos += 4;

                // Agrupar variaciones para mostrar de forma compacta
                pdf.setFontSize(6);
                pdf.setTextColor(60, 60, 60);
                pdf.setFont('helvetica', 'normal');

                for (const variacion of producto.variaciones) {
                    const color = variacion.color || '';
                    const talla = variacion.talla || '';

                    let varText = '';
                    if (color && talla) {
                        varText = `• ${color} - Talla ${talla}`;
                    } else if (color) {
                        varText = `• ${color}`;
                    } else if (talla) {
                        varText = `• Talla ${talla}`;
                    }

                    if (varText) {
                        const varLines = pdf.splitTextToSize(varText, imgWidth - 6);
                        pdf.text(varLines, xPos + (imgWidth / 2), contentYPos, { align: 'center', maxWidth: imgWidth - 6 });
                        contentYPos += varLines.length * 2.8;
                    }
                }
            }

            // Calcular altura real usada
            const actualCardHeight = contentYPos - cardStartY + 3;
            cardHeight = Math.max(actualCardHeight, imgHeight + 40);

            // Borde completo alrededor de toda la tarjeta (producto completo)
            pdf.setDrawColor(217, 136, 185);
            pdf.setLineWidth(0.5);
            pdf.roundedRect(xPos - 1.5, cardStartY - 1.5, imgWidth + 3, actualCardHeight + 3, 2, 2);

            // Sombra simulada (líneas sutiles)
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.1);
            pdf.line(xPos + imgWidth + 3.5, cardStartY + 1, xPos + imgWidth + 3.5, cardStartY + actualCardHeight + 2);
            pdf.line(xPos, cardStartY + actualCardHeight + 3.5, xPos + imgWidth + 2, cardStartY + actualCardHeight + 3.5);

            // Siguiente columna
            col++;
            if (col >= colsPerRow) {
                col = 0;
                yPos += cardHeight + 10;
            }
        }

        // Footer profesional
        if (col !== 0) {
            yPos += cardHeight + 10;
        }

        // Asegurar espacio para footer
        if (yPos + 50 > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
        }

        yPos += 10;

        // Fondo del footer
        pdf.setFillColor(250, 245, 248);
        pdf.rect(margin - 5, yPos - 5, contentWidth + 10, 40, 'F');

        // Borde superior del footer
        pdf.setDrawColor(217, 136, 185);
        pdf.setLineWidth(1.5);
        pdf.line(margin, yPos - 5, pageWidth - margin, yPos - 5);

        yPos += 5;

        // Icono decorativo
        pdf.setFillColor(217, 136, 185);
        pdf.circle(pageWidth / 2, yPos, 3, 'F');

        yPos += 8;

        // Título de contacto
        pdf.setFontSize(12);
        pdf.setTextColor(217, 136, 185);
        pdf.setFont('helvetica', 'bold');
        pdf.text('¡ REALIZA TU PEDIDO !', pageWidth / 2, yPos, { align: 'center' });

        yPos += 8;

        // WhatsApp con diseño destacado
        pdf.setFillColor(37, 211, 102);
        pdf.roundedRect(pageWidth / 2 - 40, yPos - 4, 80, 10, 2, 2, 'F');

        pdf.setFontSize(11);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text('📱  +57 304 608 4971', pageWidth / 2, yPos + 2, { align: 'center' });

        yPos += 10;

        // Texto adicional
        pdf.setFontSize(8);
        pdf.setTextColor(120, 120, 120);
        pdf.setFont('helvetica', 'italic');
        pdf.text('Disponible para atenderte en WhatsApp', pageWidth / 2, yPos, { align: 'center' });

        yPos += 5;

        // Copyright
        pdf.setFontSize(7);
        pdf.setTextColor(150, 150, 150);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`© ${new Date().getFullYear()} Mishell Boutique - Todos los derechos reservados`, pageWidth / 2, yPos, { align: 'center' });

        // Guardar
        progressText.textContent = 'Descargando PDF...';
        progressBar.style.width = '100%';
        progressBar.textContent = '100%';

        pdf.save('catalogo-mishell.pdf');
        console.log('✅ PDF generado exitosamente');

        await new Promise(resolve => setTimeout(resolve, 1000));
        document.body.removeChild(overlay);

    } catch (error) {
        console.error('❌ Error:', error);
        alert(`Error al generar PDF: ${error.message}`);
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-download me-2"></i>Descargar catálogo en PDF';
    }
}

// Event listener
document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('btn-descargar-catalogo-pdf');
    if (button) {
        button.addEventListener('click', generarCatalogoPDF);
        console.log('✅ Botón PDF configurado correctamente');
    }
});

export { generarCatalogoPDF };
