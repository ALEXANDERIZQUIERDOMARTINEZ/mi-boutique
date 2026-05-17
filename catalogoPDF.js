// Firebase imports
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let app, db, productsCollection;

const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

const PLACEHOLDER_SVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTgiIGZpbGw9IiM5OTk5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj5TaW4gSW1hZ2VuPC90ZXh0Pjwvc3ZnPg==';

function initFirebase() {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    db = getFirestore(app);
    productsCollection = collection(db, 'productos');
}

async function leerProductos() {
    const q = query(productsCollection, where('visible', '==', true));
    const snapshot = await getDocs(q);
    const productos = [];
    snapshot.forEach(doc => productos.push({ ...doc.data(), id: doc.id }));
    return productos;
}

async function convertirImagenABase64(url) {
    if (!url || !url.startsWith('http')) return PLACEHOLDER_SVG;

    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            } catch (e) {
                resolve(PLACEHOLDER_SVG);
            }
        };
        img.onerror = () => resolve(PLACEHOLDER_SVG);
        setTimeout(() => resolve(PLACEHOLDER_SVG), 4000);
        img.src = url;
    });
}

// ─── Layout constants ────────────────────────────────────────────────────────
const MARGIN       = 8;     // mm page margin
const PAGE_W       = 210;
const PAGE_H       = 297;
const HEADER_H     = 42;    // height of the cover header band
const GAP_X        = 5;     // horizontal gap between cards
const GAP_Y        = 7;     // vertical gap between card rows
const COLS         = 2;

// Card dimensions (fixed → uniform rows, no orphan gaps)
const CARD_W       = (PAGE_W - MARGIN * 2 - GAP_X) / COLS;  // ≈ 94.5 mm
const CARD_IMG_H   = CARD_W * 1.22;                          // portrait fashion ratio
const CARD_FOOT_H  = 17;                                      // name + price strip
const CARD_H       = CARD_IMG_H + CARD_FOOT_H;

// Brand palette
const PINK    = [217, 136, 185];
const DARK    = [30,  30,  30];
const LIGHT   = [252, 248, 251];
const GREY    = [160, 160, 160];
const WHITE   = [255, 255, 255];
const RED     = [210, 45,  65];
// ─────────────────────────────────────────────────────────────────────────────

function drawHeader(pdf) {
    // Background band
    pdf.setFillColor(...LIGHT);
    pdf.rect(0, 0, PAGE_W, HEADER_H, 'F');

    // Bottom rule
    pdf.setDrawColor(...PINK);
    pdf.setLineWidth(0.8);
    pdf.line(0, HEADER_H, PAGE_W, HEADER_H);

    // Corner dots — top-left
    pdf.setFillColor(...PINK);
    [8, 16, 24].forEach((y, i) => {
        const r = i === 1 ? 1.2 : 1.6;
        pdf.circle(5, y, r, 'F');
    });
    // Corner dots — top-right
    [8, 16, 24].forEach((y, i) => {
        const r = i === 1 ? 1.2 : 1.6;
        pdf.circle(PAGE_W - 5, y, r, 'F');
    });

    // Brand name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(34);
    pdf.setTextColor(...PINK);
    pdf.text('M I S H E L L', PAGE_W / 2, 18, { align: 'center' });

    // Subtitle
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    pdf.text('& C A T Á L O G O   D E   P R O D U C T O S  &', PAGE_W / 2, 26, { align: 'center' });

    // Date
    pdf.setFontSize(7);
    const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    pdf.text(fecha, PAGE_W / 2, 33, { align: 'center' });
}

function drawFooterPage(pdf, yStart) {
    const bandH = 38;
    const yBand = yStart;

    pdf.setFillColor(...LIGHT);
    pdf.rect(MARGIN - 4, yBand - 4, PAGE_W - MARGIN * 2 + 8, bandH, 'F');

    pdf.setDrawColor(...PINK);
    pdf.setLineWidth(0.8);
    pdf.line(MARGIN, yBand - 4, PAGE_W - MARGIN, yBand - 4);

    // Pink dot
    pdf.setFillColor(...PINK);
    pdf.circle(PAGE_W / 2, yBand + 3, 2.5, 'F');

    // Call to action
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...PINK);
    pdf.text('¡ R E A L I Z A  T U  P E D I D O !', PAGE_W / 2, yBand + 12, { align: 'center' });

    // WhatsApp pill
    pdf.setFillColor(37, 211, 102);
    pdf.roundedRect(PAGE_W / 2 - 42, yBand + 15, 84, 10, 3, 3, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...WHITE);
    pdf.text('+57 304 608 4971', PAGE_W / 2, yBand + 21.5, { align: 'center' });

    // Copyright
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(...GREY);
    pdf.text(
        `© ${new Date().getFullYear()} MISHELL'ES BOUTIQUE — Todos los derechos reservados`,
        PAGE_W / 2, yBand + 30, { align: 'center' }
    );
}

async function drawCard(pdf, producto, xPos, yPos) {
    const isAgotado = (() => {
        if (!producto.variaciones || !Array.isArray(producto.variaciones)) return false;
        return producto.variaciones.reduce((s, v) => s + (parseInt(v.stock) || 0), 0) === 0;
    })();

    // ── Card shadow (offset rect behind) ──────────────────────────────────────
    pdf.setFillColor(220, 210, 218);
    pdf.roundedRect(xPos + 1.5, yPos + 1.5, CARD_W, CARD_H, 3, 3, 'F');

    // ── Card background ───────────────────────────────────────────────────────
    pdf.setFillColor(...WHITE);
    pdf.roundedRect(xPos, yPos, CARD_W, CARD_H, 3, 3, 'F');

    // ── Product image ─────────────────────────────────────────────────────────
    const imgUrl = producto.imagenUrl || producto.imagen;
    const base64Img = await convertirImagenABase64(imgUrl);

    try {
        // Clip to top rounded area of the card
        pdf.addImage(base64Img, 'JPEG', xPos, yPos, CARD_W, CARD_IMG_H, undefined, 'FAST');
    } catch (e) {
        pdf.setFillColor(245, 240, 244);
        pdf.rect(xPos, yPos, CARD_W, CARD_IMG_H, 'F');
    }

    // ── AGOTADO ribbon (top-right corner) ─────────────────────────────────────
    if (isAgotado) {
        const rx = xPos + CARD_W - 36;
        const ry = yPos + 8;
        pdf.setFillColor(...RED);
        pdf.roundedRect(rx, ry, 34, 8, 2, 2, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...WHITE);
        pdf.text('AGOTADO', rx + 17, ry + 5.3, { align: 'center' });
    }

    // ── Thin separator line between image and footer ──────────────────────────
    pdf.setDrawColor(...PINK);
    pdf.setLineWidth(0.3);
    pdf.line(xPos + 4, yPos + CARD_IMG_H, xPos + CARD_W - 4, yPos + CARD_IMG_H);

    // ── Footer strip ──────────────────────────────────────────────────────────
    const fy = yPos + CARD_IMG_H;

    // Product name — uppercase, tight
    const nombre = (producto.nombre || '').toUpperCase();
    const nombreCorto = nombre.length > 28 ? nombre.substring(0, 27) + '…' : nombre;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...DARK);
    pdf.text(nombreCorto, xPos + CARD_W / 2, fy + 6.5, { align: 'center', maxWidth: CARD_W - 6 });

    // Price — prominent, brand pink
    const precioDetal = parseFloat(producto.precioDetal) || 0;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...PINK);
    pdf.text(`$${precioDetal.toLocaleString('es-CO')}`, xPos + CARD_W / 2, fy + 13.5, { align: 'center' });

    // ── Card border ───────────────────────────────────────────────────────────
    pdf.setDrawColor(...PINK);
    pdf.setLineWidth(0.45);
    pdf.roundedRect(xPos, yPos, CARD_W, CARD_H, 3, 3);
}

// ─── Main export function ────────────────────────────────────────────────────
async function generarCatalogoPDF() {
    const button = document.getElementById('btn-descargar-catalogo-pdf');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando...';

    // Progress overlay
    const overlay = document.createElement('div');
    overlay.id = 'pdf-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;font-family:Arial;';
    overlay.innerHTML = `
        <style>
            @keyframes shimmer{0%{background-position:-1000px 0}100%{background-position:1000px 0}}
            @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
            .pc{width:440px;padding:44px;background:rgba(255,255,255,.06);border-radius:20px;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.1);text-align:center}
            .pico{font-size:52px;margin-bottom:16px;animation:pulse 2s ease-in-out infinite}
            .ptitle{font-size:28px;font-weight:700;margin-bottom:12px;background:linear-gradient(90deg,#D988B9,#F0B8D8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
            .pinfo{margin-top:14px;font-size:14px;color:#E5A8CB;line-height:1.6}
            .pbar-out{width:100%;height:36px;background:rgba(0,0,0,.3);border-radius:18px;overflow:hidden;box-shadow:inset 0 2px 8px rgba(0,0,0,.4);margin-top:12px}
            .pbar-in{height:100%;background:linear-gradient(90deg,#D988B9,#E5A8CB,#D988B9);background-size:200% 100%;animation:shimmer 2s infinite;transition:width .4s ease;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;text-shadow:0 2px 4px rgba(0,0,0,.3)}
            .pwarn{margin-top:14px;font-size:12px;color:#ffd700;display:flex;align-items:center;justify-content:center;gap:6px}
        </style>
        <div class="pc">
            <div class="pico">✨</div>
            <div class="ptitle">Generando Catálogo Premium</div>
            <div id="pinfo" class="pinfo">Iniciando...</div>
            <div class="pbar-out"><div id="pbar" class="pbar-in" style="width:0%">0%</div></div>
            <div class="pwarn"><span>⚠️</span><span>No cierres esta ventana — puede tomar varios minutos</span></div>
        </div>`;
    document.body.appendChild(overlay);

    const pinfo = document.getElementById('pinfo');
    const pbar  = document.getElementById('pbar');
    const setProgress = (pct, msg) => {
        pbar.style.width = pct + '%';
        pbar.textContent = pct + '%';
        pinfo.textContent = msg;
    };

    try {
        initFirebase();
        setProgress(3, 'Cargando productos…');
        const productos = await leerProductos();

        if (productos.length === 0) {
            alert('No hay productos para generar el catálogo.');
            return;
        }

        setProgress(6, `${productos.length} productos cargados. Preparando páginas…`);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4', true);

        // ── Page-flow state ───────────────────────────────────────────────────
        let col  = 0;
        let yPos = MARGIN + HEADER_H + GAP_Y;   // first content row starts after header

        drawHeader(pdf);

        for (let i = 0; i < productos.length; i++) {
            const pct = Math.floor(6 + ((i + 1) / productos.length) * 88);
            setProgress(pct, `Procesando ${i + 1} / ${productos.length}: ${productos[i].nombre}`);

            // Check if card fits in remaining vertical space (leave room for footer)
            const footerReserve = 48;
            if (yPos + CARD_H > PAGE_H - MARGIN - footerReserve) {
                pdf.addPage();
                yPos = MARGIN;
                col  = 0;
            }

            const xPos = MARGIN + col * (CARD_W + GAP_X);
            await drawCard(pdf, productos[i], xPos, yPos);

            col++;
            if (col >= COLS) {
                col  = 0;
                yPos += CARD_H + GAP_Y;
            }
        }

        // Advance yPos if we ended mid-row
        if (col !== 0) {
            yPos += CARD_H + GAP_Y;
        }

        // ── Footer ────────────────────────────────────────────────────────────
        const footerH = 38;
        if (yPos + footerH + 10 > PAGE_H - MARGIN) {
            pdf.addPage();
            yPos = MARGIN + 10;
        } else {
            yPos += 8;
        }

        drawFooterPage(pdf, yPos);

        // ── Save ──────────────────────────────────────────────────────────────
        setProgress(99, 'Descargando…');
        pdf.save('catalogo-mishell.pdf');

        await new Promise(r => setTimeout(r, 800));
        document.body.removeChild(overlay);

    } catch (error) {
        console.error('Error generando PDF:', error);
        alert(`Error al generar PDF: ${error.message}`);
        const el = document.getElementById('pdf-overlay');
        if (el) document.body.removeChild(el);
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-download me-2"></i>Descargar catálogo en PDF';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('btn-descargar-catalogo-pdf');
    if (button) button.addEventListener('click', generarCatalogoPDF);
});

export { generarCatalogoPDF };
