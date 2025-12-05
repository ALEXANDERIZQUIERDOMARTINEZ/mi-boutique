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

        // Crear overlay
        const overlay = document.createElement('div');
        overlay.id = 'pdf-overlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;font-family:Arial;';
        overlay.innerHTML = `
            <div style="text-align:center;max-width:400px;">
                <div style="font-size:28px;margin-bottom:20px;">⏳ Generando PDF</div>
                <div id="progress-text" style="font-size:16px;margin-bottom:20px;color:#ccc;">Iniciando...</div>
                <div style="width:100%;height:30px;background:#333;border-radius:15px;overflow:hidden;box-shadow:0 4px 10px rgba(0,0,0,0.3);">
                    <div id="progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg, #D988B9, #E5A8CB);transition:width 0.3s;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;"></div>
                </div>
                <div style="margin-top:15px;font-size:13px;color:#999;">No cierres esta ventana</div>
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

        // Header
        progressText.textContent = 'Creando encabezado...';
        progressBar.style.width = '5%';
        progressBar.textContent = '5%';

        pdf.setFontSize(32);
        pdf.setTextColor(217, 136, 185);
        pdf.setFont('helvetica', 'bold');
        pdf.text('MISHELL', pageWidth / 2, yPos + 15, { align: 'center' });

        yPos += 20;
        pdf.setFontSize(12);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Catálogo de Productos', pageWidth / 2, yPos, { align: 'center' });

        yPos += 5;
        pdf.setFontSize(10);
        const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
        pdf.text(`Generado el ${fecha}`, pageWidth / 2, yPos, { align: 'center' });

        yPos += 10;
        pdf.setDrawColor(217, 136, 185);
        pdf.setLineWidth(1);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 10;

        // Procesar productos
        const colsPerRow = 3;
        const imgWidth = (contentWidth - 10) / colsPerRow;
        const imgHeight = imgWidth * 1.3;
        const cardHeight = imgHeight + 30;

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

            // Convertir imagen
            const imgUrl = producto.imagenUrl || producto.imagen;
            const base64Img = await convertirImagenABase64(imgUrl);

            // Dibujar imagen
            try {
                pdf.addImage(base64Img, 'JPEG', xPos, yPos, imgWidth, imgHeight, undefined, 'FAST');
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

            // Nombre
            pdf.setFontSize(9);
            pdf.setTextColor(0, 0, 0);
            pdf.setFont('helvetica', 'bold');
            const nombreCorto = producto.nombre.length > 20 ? producto.nombre.substring(0, 20) + '...' : producto.nombre;
            pdf.text(nombreCorto, xPos + (imgWidth / 2), yPos + imgHeight + 5, { align: 'center', maxWidth: imgWidth - 2 });

            // Precios
            const precioDetal = parseFloat(producto.precioDetal) || 0;
            const precioMayor = parseFloat(producto.precioMayor) || 0;

            pdf.setFontSize(8);
            pdf.setTextColor(217, 136, 185);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`$${precioDetal.toLocaleString('es-CO')}`, xPos + (imgWidth / 2), yPos + imgHeight + 10, { align: 'center' });

            if (precioMayor > 0) {
                pdf.setTextColor(39, 174, 96);
                pdf.setFontSize(7);
                pdf.text(`Mayor: $${precioMayor.toLocaleString('es-CO')}`, xPos + (imgWidth / 2), yPos + imgHeight + 14, { align: 'center' });
            }

            // Siguiente columna
            col++;
            if (col >= colsPerRow) {
                col = 0;
                yPos += cardHeight + 5;
            }
        }

        // Footer
        if (col !== 0) {
            yPos += cardHeight + 10;
        }

        if (yPos + 30 > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setDrawColor(217, 136, 185);
        pdf.setLineWidth(0.5);
        pdf.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        pdf.setFontSize(11);
        pdf.setTextColor(80, 80, 80);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Contacto:', pageWidth / 2, yPos, { align: 'center' });

        yPos += 6;
        pdf.setFontSize(10);
        pdf.setTextColor(217, 136, 185);
        pdf.text('📱 WhatsApp: +57 304 608 4971', pageWidth / 2, yPos, { align: 'center' });

        yPos += 6;
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.setFont('helvetica', 'italic');
        pdf.text('¡Haz tu pedido por WhatsApp!', pageWidth / 2, yPos, { align: 'center' });

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
