// Firebase imports
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
    getFirestore, collection, getDocs, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let app, db;

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
    db  = getFirestore(app);
}

async function cargarCategorias() {
    const snap = await getDocs(query(collection(db, 'categorias'), orderBy('nombre')));
    return snap.docs.map(d => ({ id: d.id, nombre: d.data().nombre }));
}

async function cargarProductos(categoriaId = null) {
    let q = query(collection(db, 'productos'), where('visible', '==', true));
    if (categoriaId) {
        q = query(collection(db, 'productos'), where('visible', '==', true), where('categoriaId', '==', categoriaId));
    }
    const snap = await getDocs(q);
    return snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter(p => {
            // Excluir productos completamente agotados
            if (!p.variaciones || p.variaciones.length === 0) return false;
            return p.variaciones.some(v => (parseInt(v.stock) || 0) > 0);
        });
}

// Carga la imagen y la recorta (object-fit: cover) al ratio targetW:targetH.
// Así jsPDF nunca estira la imagen — lo que entra ya tiene el tamaño exacto.
async function imagenABase64(url, targetW, targetH) {
    if (!url || !url.startsWith('http')) return PLACEHOLDER_SVG;
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const targetRatio = targetW / targetH;
                const imgRatio    = img.naturalWidth / img.naturalHeight;

                let sx, sy, sw, sh;
                if (imgRatio > targetRatio) {
                    // Imagen más ancha que el target → recortar los lados
                    sh = img.naturalHeight;
                    sw = sh * targetRatio;
                    sx = (img.naturalWidth - sw) / 2;
                    sy = 0;
                } else {
                    // Imagen más alta que el target → recortar arriba/abajo
                    // Anclamos en el tercio superior para mantener rostros/cabeza visible
                    sw = img.naturalWidth;
                    sh = sw / targetRatio;
                    sx = 0;
                    sy = img.naturalHeight * 0.05; // 5% desde arriba
                    if (sy + sh > img.naturalHeight) sy = img.naturalHeight - sh;
                }

                const c = document.createElement('canvas');
                // Salida a resolución razonable para PDF (~150 dpi)
                c.width  = Math.round(targetW * 6);
                c.height = Math.round(targetH * 6);
                c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.80));
            } catch { resolve(PLACEHOLDER_SVG); }
        };
        img.onerror = () => resolve(PLACEHOLDER_SVG);
        setTimeout(() => resolve(PLACEHOLDER_SVG), 5000);
        img.src = url;
    });
}

// ─── Layout constants ─────────────────────────────────────────────────────────
const M         = 7;      // page margin mm
const PW        = 210;
const PH        = 297;
const HDR_H     = 28;     // slim header band
const GAP_X     = 5;      // gap between columns
const GAP_Y     = 6;      // gap between rows
const COLS      = 2;
const CARD_W    = (PW - M * 2 - GAP_X) / COLS;   // ≈ 96 mm
const CARD_IMG_H = Math.round(CARD_W * 0.86);      // portrait fashion ratio ≈ 82 mm
const CARD_FOOT = 36;                               // footer strip height
const CARD_H    = CARD_IMG_H + CARD_FOOT;          // ≈ 118 mm

// Brand colours [R, G, B]
const PINK  = [217, 136, 185];
const DARK  = [28,  28,  28 ];
const LGREY = [250, 247, 250];
const GREY  = [155, 155, 155];
const WHITE = [255, 255, 255];
const GREEN = [37,  211, 102];
// ─────────────────────────────────────────────────────────────────────────────

function drawHeader(pdf) {
    pdf.setFillColor(...LGREY);
    pdf.rect(0, 0, PW, HDR_H, 'F');

    pdf.setDrawColor(...PINK);
    pdf.setLineWidth(0.7);
    pdf.line(0, HDR_H, PW, HDR_H);

    // Dots
    pdf.setFillColor(...PINK);
    [[5, 7, 1.5], [5, 14, 1.1], [5, 21, 1.5]].forEach(([x, y, r]) => {
        pdf.circle(x, y, r, 'F');
        pdf.circle(PW - x, y, r, 'F');
    });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(26);
    pdf.setTextColor(...PINK);
    pdf.text('M I S H E L L', PW / 2, 13, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...GREY);
    pdf.text('& C A T Á L O G O   D E   P R O D U C T O S  &', PW / 2, 20, { align: 'center' });

    const fecha = new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
    pdf.setFontSize(6.5);
    pdf.text(fecha, PW / 2, 25.5, { align: 'center' });
}

function drawFooter(pdf, yStart) {
    const H = 36;
    pdf.setFillColor(...LGREY);
    pdf.rect(M - 3, yStart - 4, PW - M * 2 + 6, H, 'F');

    pdf.setDrawColor(...PINK);
    pdf.setLineWidth(0.7);
    pdf.line(M, yStart - 4, PW - M, yStart - 4);

    pdf.setFillColor(...PINK);
    pdf.circle(PW / 2, yStart + 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(...PINK);
    pdf.text('¡ R E A L I Z A  T U  P E D I D O !', PW / 2, yStart + 10, { align: 'center' });

    pdf.setFillColor(...GREEN);
    pdf.roundedRect(PW / 2 - 40, yStart + 13, 80, 10, 3, 3, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...WHITE);
    pdf.text('+57 301 785 0041', PW / 2, yStart + 19.5, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6);
    pdf.setTextColor(...GREY);
    pdf.text(
        `© ${new Date().getFullYear()} MISHELL'ES BOUTIQUE — Todos los derechos reservados`,
        PW / 2, yStart + 28, { align: 'center' }
    );
}

async function drawCard(pdf, producto, x, y) {
    // Shadow
    pdf.setFillColor(215, 205, 215);
    pdf.roundedRect(x + 1.5, y + 1.5, CARD_W, CARD_H, 3, 3, 'F');

    // White background
    pdf.setFillColor(...WHITE);
    pdf.roundedRect(x, y, CARD_W, CARD_H, 3, 3, 'F');

    // ── Image (pre-cropped to exact card ratio → sin distorsión) ─────────────
    const imgUrl = producto.imagenUrl || producto.imagen;
    const b64    = await imagenABase64(imgUrl, CARD_W, CARD_IMG_H);
    try {
        pdf.addImage(b64, 'JPEG', x, y, CARD_W, CARD_IMG_H, undefined, 'FAST');
    } catch {
        pdf.setFillColor(245, 240, 244);
        pdf.rect(x, y, CARD_W, CARD_IMG_H, 'F');
    }

    // ── Footer strip ──────────────────────────────────────────────────────────
    const fy = y + CARD_IMG_H;

    // Subtle separator
    pdf.setDrawColor(230, 220, 228);
    pdf.setLineWidth(0.25);
    pdf.line(x + 4, fy, x + CARD_W - 4, fy);

    // Name
    const nombre = (producto.nombre || '').toUpperCase();
    const nombreCorto = nombre.length > 26 ? nombre.slice(0, 25) + '…' : nombre;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...DARK);
    pdf.text(nombreCorto, x + CARD_W / 2, fy + 5.5, { align: 'center', maxWidth: CARD_W - 6 });

    // Description (max 2 lines, italic)
    let descY = fy + 10.5;
    if (producto.descripcion && producto.descripcion.trim()) {
        const desc = producto.descripcion.trim();
        const descShort = desc.length > 70 ? desc.slice(0, 68) + '…' : desc;
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(6);
        pdf.setTextColor(...GREY);
        const lines = pdf.splitTextToSize(descShort, CARD_W - 8).slice(0, 2);
        pdf.text(lines, x + CARD_W / 2, descY, { align: 'center', maxWidth: CARD_W - 8 });
        descY += lines.length * 3.5;
    }

    // Thin rule before variations
    descY += 1;
    pdf.setDrawColor(235, 225, 232);
    pdf.setLineWidth(0.2);
    pdf.line(x + 6, descY, x + CARD_W - 6, descY);
    descY += 3;

    // ── Available variations (stock > 0, grouped by color) ──────────────────
    const disponibles = (producto.variaciones || []).filter(v => (parseInt(v.stock) || 0) > 0);

    // Group: { color → [talla, …] }
    const grupos = {};
    disponibles.forEach(v => {
        const color = (v.color || '').toUpperCase().trim() || null;
        const talla = (v.talla || '').toUpperCase().trim() || null;
        const key   = color || '—';
        if (!grupos[key]) grupos[key] = [];
        if (talla && !grupos[key].includes(talla)) grupos[key].push(talla);
    });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.8);
    pdf.setTextColor(60, 50, 65);

    const colorKeys = Object.keys(grupos);
    let maxLines = 4; // safety cap to stay inside card
    let linesUsed = 0;

    for (const color of colorKeys) {
        if (linesUsed >= maxLines) break;
        const tallas  = grupos[color];
        const tallaTxt = tallas.length > 0 ? `T. ${tallas.join(' · ')}` : '';
        const lineTxt  = tallaTxt ? `${color}  —  ${tallaTxt}` : color;
        const wrapped  = pdf.splitTextToSize(lineTxt, CARD_W - 8);
        pdf.text(wrapped[0], x + CARD_W / 2, descY, { align: 'center' });
        descY   += 3.8;
        linesUsed++;
    }

    // Price — anchored to bottom of card footer
    const priceY = y + CARD_H - 4;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...PINK);
    pdf.text(
        `$${(parseFloat(producto.precioDetal) || 0).toLocaleString('es-CO')}`,
        x + CARD_W / 2, priceY, { align: 'center' }
    );

    // Card border
    pdf.setDrawColor(...PINK);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(x, y, CARD_W, CARD_H, 3, 3);
}

// ─── Selection modal ─────────────────────────────────────────────────────────
function mostrarModalSeleccion(categorias) {
    return new Promise(resolve => {
        // Inject responsive styles once
        if (!document.getElementById('cat-modal-styles')) {
            const st = document.createElement('style');
            st.id = 'cat-modal-styles';
            st.textContent = `
                #cat-modal-overlay {
                    position: fixed; inset: 0; z-index: 999999;
                    background: rgba(20,10,25,.75);
                    display: flex; align-items: flex-end; justify-content: center;
                    font-family: 'Inter', Arial, sans-serif;
                    backdrop-filter: blur(5px);
                    padding: 0;
                }
                @media (min-height: 600px) {
                    #cat-modal-overlay { align-items: center; padding: 16px; }
                }
                #cat-modal-card {
                    background: #fff;
                    border-radius: 24px 24px 0 0;
                    width: 100%;
                    max-width: 440px;
                    max-height: 92vh;
                    display: flex; flex-direction: column;
                    box-shadow: 0 -8px 40px rgba(0,0,0,.25);
                    overflow: hidden;
                }
                @media (min-height: 600px) {
                    #cat-modal-card {
                        border-radius: 20px;
                        max-height: 88vh;
                        box-shadow: 0 24px 60px rgba(0,0,0,.3);
                    }
                }
                #cat-modal-header {
                    padding: 20px 24px 12px;
                    text-align: center;
                    border-bottom: 1px solid #f0e8f0;
                    flex-shrink: 0;
                }
                #cat-modal-header .brand {
                    font-size: 22px; font-weight: 800;
                    color: #D988B9; letter-spacing: 3px; margin-bottom: 3px;
                }
                #cat-modal-header .subtitle {
                    font-size: 13px; color: #888; font-weight: 500;
                }
                #cat-modal-scroll {
                    flex: 1 1 auto;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                    padding: 14px 20px;
                    display: flex; flex-direction: column; gap: 8px;
                }
                #cat-modal-scroll::-webkit-scrollbar { width: 4px; }
                #cat-modal-scroll::-webkit-scrollbar-track { background: transparent; }
                #cat-modal-scroll::-webkit-scrollbar-thumb { background: #e8c8e0; border-radius: 4px; }
                .cat-opt {
                    display: flex; align-items: center; gap: 14px;
                    padding: 12px 14px; border-radius: 12px; cursor: pointer;
                    border: 2px solid #eee; background: #fafafa;
                    transition: border-color .15s, background .15s;
                    user-select: none; -webkit-tap-highlight-color: transparent;
                }
                .cat-opt.selected {
                    border-color: #D988B9; background: #fdf4f9;
                }
                .cat-opt input[type=radio] {
                    accent-color: #D988B9; width: 17px; height: 17px;
                    cursor: pointer; flex-shrink: 0;
                }
                .cat-opt span {
                    font-weight: 600; font-size: 13px; color: #222;
                    line-height: 1.3;
                }
                #cat-modal-footer {
                    padding: 14px 20px 20px;
                    border-top: 1px solid #f0e8f0;
                    flex-shrink: 0;
                    /* Safe area for iPhone home bar */
                    padding-bottom: max(20px, env(safe-area-inset-bottom));
                }
                #btn-generar-pdf {
                    width: 100%; padding: 15px; border: none; border-radius: 13px;
                    background: linear-gradient(135deg, #D988B9, #c96ea0);
                    color: #fff; font-size: 15px; font-weight: 700;
                    cursor: pointer; letter-spacing: .3px;
                    box-shadow: 0 6px 20px rgba(217,136,185,.4);
                    transition: opacity .15s, transform .15s;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                }
                #btn-generar-pdf:active { opacity: .85; transform: scale(.98); }
                #btn-cancelar-pdf {
                    display: block; width: 100%; margin-top: 10px;
                    background: none; border: none;
                    color: #aaa; font-size: 13px; cursor: pointer; padding: 4px;
                }
            `;
            document.head.appendChild(st);
        }

        const overlay = document.createElement('div');
        overlay.id = 'cat-modal-overlay';

        const opciones = [{ id: '', label: 'Todo el catálogo' }];
        categorias.forEach(c => opciones.push({ id: c.id, label: c.nombre }));

        overlay.innerHTML = `
            <div id="cat-modal-card">
                <div id="cat-modal-header">
                    <div class="brand">MISHELL</div>
                    <div class="subtitle">¿Qué catálogo deseas generar?</div>
                </div>
                <div id="cat-modal-scroll">
                    ${opciones.map((o, i) => `
                        <label class="cat-opt${i === 0 ? ' selected' : ''}">
                            <input type="radio" name="cat-sel" value="${o.id}" ${i === 0 ? 'checked' : ''}>
                            <span>${o.label}</span>
                        </label>
                    `).join('')}
                </div>
                <div id="cat-modal-footer">
                    <button id="btn-generar-pdf">
                        <i class="bi bi-download"></i> Generar PDF
                    </button>
                    <button id="btn-cancelar-pdf">Cancelar</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Highlight on change
        overlay.querySelectorAll('.cat-opt').forEach(label => {
            label.addEventListener('change', () => {
                overlay.querySelectorAll('.cat-opt').forEach(l => l.classList.remove('selected'));
                label.classList.add('selected');
            });
        });

        // Close on backdrop tap
        overlay.addEventListener('click', e => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
                resolve(null);
            }
        });

        overlay.querySelector('#btn-generar-pdf').addEventListener('click', () => {
            const sel = overlay.querySelector('input[name="cat-sel"]:checked');
            document.body.removeChild(overlay);
            resolve(sel ? sel.value : '');
        });

        overlay.querySelector('#btn-cancelar-pdf').addEventListener('click', () => {
            document.body.removeChild(overlay);
            resolve(null);
        });
    });
}

// ─── Progress overlay ─────────────────────────────────────────────────────────
function crearOverlayProgreso() {
    const overlay = document.createElement('div');
    overlay.id = 'pdf-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);z-index:999999;display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;font-family:Inter,Arial;';
    overlay.innerHTML = `
        <style>
            @keyframes sh{0%{background-position:-1000px 0}100%{background-position:1000px 0}}
            @keyframes pu{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
            .pc2{width:440px;padding:44px;background:rgba(255,255,255,.06);border-radius:20px;
                 backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,.4);
                 border:1px solid rgba(255,255,255,.1);text-align:center}
            .pico2{font-size:46px;margin-bottom:16px;animation:pu 2s ease-in-out infinite}
            .ptitle2{font-size:24px;font-weight:800;margin-bottom:14px;
                     background:linear-gradient(90deg,#D988B9,#F0B8D8);
                     -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
                     letter-spacing:2px}
            .pinfo2{font-size:13px;color:#E5A8CB;margin-bottom:14px;line-height:1.5}
            .pbar-o{width:100%;height:32px;background:rgba(0,0,0,.3);border-radius:16px;overflow:hidden;
                    box-shadow:inset 0 2px 8px rgba(0,0,0,.4)}
            .pbar-i{height:100%;background:linear-gradient(90deg,#D988B9,#E5A8CB,#D988B9);
                    background-size:200% 100%;animation:sh 2s infinite;
                    transition:width .4s ease;display:flex;align-items:center;justify-content:center;
                    font-size:13px;font-weight:700;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.3)}
            .pwarn2{margin-top:14px;font-size:11px;color:#ffd700;display:flex;align-items:center;justify-content:center;gap:6px}
        </style>
        <div class="pc2">
            <div class="pico2">✨</div>
            <div class="ptitle2">GENERANDO CATÁLOGO</div>
            <div id="pinfo2" class="pinfo2">Iniciando…</div>
            <div class="pbar-o"><div id="pbar2" class="pbar-i" style="width:0%">0%</div></div>
            <div class="pwarn2"><span>⚠️</span><span>No cierres esta ventana — puede tardar varios minutos</span></div>
        </div>`;
    document.body.appendChild(overlay);
    return {
        set(pct, msg) {
            document.getElementById('pbar2').style.width  = pct + '%';
            document.getElementById('pbar2').textContent  = pct + '%';
            document.getElementById('pinfo2').textContent = msg;
        },
        remove() {
            const el = document.getElementById('pdf-overlay');
            if (el) document.body.removeChild(el);
        }
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function generarCatalogoPDF() {
    const button = document.getElementById('btn-descargar-catalogo-pdf');
    if (!button) return;

    initFirebase();

    // Load categories, show modal
    let categorias = [];
    try {
        categorias = await cargarCategorias();
    } catch (e) {
        console.warn('No se pudieron cargar categorías:', e);
    }

    const categoriaSeleccionada = await mostrarModalSeleccion(categorias);
    if (categoriaSeleccionada === null) return; // cancelled

    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Generando…';

    const progreso = crearOverlayProgreso();

    try {
        progreso.set(4, 'Cargando productos disponibles…');
        const productos = await cargarProductos(categoriaSeleccionada || null);

        if (productos.length === 0) {
            alert('No hay productos disponibles para la selección.');
            return;
        }

        progreso.set(8, `${productos.length} productos. Preparando PDF…`);

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4', true);

        // Page-flow state
        let col  = 0;
        let yPos = M + HDR_H + 5;   // first row starts after header gap

        drawHeader(pdf);

        for (let i = 0; i < productos.length; i++) {
            const pct = Math.floor(8 + ((i + 1) / productos.length) * 86);
            progreso.set(pct, `Procesando ${i + 1} / ${productos.length}: ${productos[i].nombre}`);

            // Nueva página solo cuando la tarjeta no cabe en el margen inferior
            if (yPos + CARD_H > PH - M) {
                pdf.addPage();
                yPos = M;
                col  = 0;
            }

            const x = M + col * (CARD_W + GAP_X);
            await drawCard(pdf, productos[i], x, yPos);

            col++;
            if (col >= COLS) {
                col  = 0;
                yPos += CARD_H + GAP_Y;
            }
        }

        // Advance if mid-row
        if (col !== 0) yPos += CARD_H + GAP_Y;

        // Footer
        const footH = 36;
        if (yPos + footH + 6 > PH - M) {
            pdf.addPage();
            yPos = M + 10;
        } else {
            yPos += 8;
        }
        drawFooter(pdf, yPos);

        progreso.set(99, 'Descargando…');
        const nombreCat = categorias.find(c => c.id === categoriaSeleccionada)?.nombre || 'completo';
        const filename  = categoriaSeleccionada
            ? `catalogo-mishell-${nombreCat.toLowerCase().replace(/\s+/g, '-')}.pdf`
            : 'catalogo-mishell.pdf';
        pdf.save(filename);

        await new Promise(r => setTimeout(r, 700));
        progreso.remove();

    } catch (error) {
        console.error('Error generando PDF:', error);
        alert(`Error al generar PDF: ${error.message}`);
        progreso.remove();
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-download me-1"></i>Catálogo PDF';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-descargar-catalogo-pdf');
    if (btn) btn.addEventListener('click', generarCatalogoPDF);
});

export { generarCatalogoPDF };
