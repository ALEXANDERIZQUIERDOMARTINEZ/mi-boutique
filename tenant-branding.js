/**
 * tenant-branding.js — utilidades de marca por empresa (logo, nombre, color).
 * Sin estado ni datos sensibles: solo lee tenants/{tenantId} (lectura
 * pública en firestore.rules, igual que planes) y aplica el color como
 * variables CSS. Lo usan login.html (selector de empresa), admin-auth-init.js
 * y admin-fabrica-auth-init.js — cada uno pinta SU propio panel con la marca
 * de SU tenant, nunca la de otro.
 */
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Valores de siempre, por si el documento tenants/{id} todavía no existe
// (Boutique nunca lo necesitó para funcionar) o falla la lectura.
export const MARCA_DEFAULT = {
    boutique: { nombre: "Mishell's Boutique", nombreCorto: 'Boutique', logoUrl: 'icon.svg', color: '#D988B9' },
    fabrica:  { nombre: "Mishell's Fábrica",  nombreCorto: 'Fábrica',  logoUrl: 'icon.svg', color: '#5b6b8c' }
};

// Únicas empresas con panel propio construido hoy (ver Fase 6 del plan).
// Una empresa nueva creada desde Super Admin sin panel real aquí se
// muestra en el selector como "Próximamente", no rompe nada.
export const PANEL_POR_TENANT = {
    boutique: 'admin.html',
    fabrica: 'admin-fabrica.html'
};

function datosPorDefecto(tenantId) {
    return MARCA_DEFAULT[tenantId] || {
        nombre: tenantId,
        nombreCorto: tenantId.charAt(0).toUpperCase() + tenantId.slice(1),
        logoUrl: 'icon.svg',
        color: '#7a7570'
    };
}

/** Trae la marca (nombre/logo/color) de una sola empresa. */
export async function obtenerMarcaTenant(db, tenantId) {
    const id = tenantId || 'boutique';
    const base = datosPorDefecto(id);
    try {
        const snap = await getDoc(doc(db, 'tenants', id));
        if (!snap.exists()) return { id, ...base };
        const data = snap.data();
        return {
            id,
            nombre: data.nombre || base.nombre,
            nombreCorto: data.nombreCorto || base.nombreCorto,
            logoUrl: data.logoUrl || base.logoUrl,
            color: data.colorPrimario || base.color,
            estado: data.estado || 'activo'
        };
    } catch (error) {
        console.warn('No se pudo cargar la marca de "' + id + '", usando valores por defecto:', error);
        return { id, ...base };
    }
}

/**
 * Trae todas las empresas para el selector post-login: las que tengan
 * documento en tenants/ más 'boutique' (que puede no tenerlo todavía).
 */
export async function obtenerTodasLasMarcas(db) {
    const resultado = new Map();
    resultado.set('boutique', { id: 'boutique', ...datosPorDefecto('boutique') });
    try {
        const snap = await getDocs(collection(db, 'tenants'));
        snap.forEach(d => {
            const data = d.data();
            const base = datosPorDefecto(d.id);
            resultado.set(d.id, {
                id: d.id,
                nombre: data.nombre || base.nombre,
                nombreCorto: data.nombreCorto || base.nombreCorto,
                logoUrl: data.logoUrl || base.logoUrl,
                color: data.colorPrimario || base.color,
                estado: data.estado || 'activo'
            });
        });
    } catch (error) {
        console.warn('No se pudo cargar la lista completa de empresas:', error);
    }
    return Array.from(resultado.values());
}

// ── Matemática de color: aclarar/oscurecer un solo hex sin librerías ──────

function hexToHsl(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h /= 6;
    }
    return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
}

function ajustarLuz(hex, delta) {
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h, s, Math.max(0, Math.min(100, l + delta)));
}

function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Sobrescribe en :root las variables de marca que admin-styles.css usa en
 * todo el panel (botones, enlaces activos, badges…), generando la escala
 * clara/oscura a partir del único color que el dueño elige en Super Admin.
 */
export function aplicarColorMarca(color) {
    if (!color) return;
    const root = document.documentElement.style;
    root.setProperty('--brand-400', ajustarLuz(color, 12));
    root.setProperty('--brand-500', color);
    root.setProperty('--brand-600', ajustarLuz(color, -10));
    root.setProperty('--brand-700', ajustarLuz(color, -20));
    root.setProperty('--grad-brand', `linear-gradient(135deg, ${ajustarLuz(color, 12)} 0%, ${color} 45%, ${ajustarLuz(color, -15)} 100%)`);
    root.setProperty('--shadow-brand', `0 4px 16px ${hexToRgba(color, 0.25)}, 0 2px 4px ${hexToRgba(color, 0.15)}`);
    root.setProperty('--border-brand', hexToRgba(color, 0.35));
    root.setProperty('--shadow-glow', `0 0 0 3px ${hexToRgba(color, 0.18)}, 0 0 20px ${hexToRgba(color, 0.12)}`);
}

/** Pinta el logo/nombre del rail lateral del panel con la marca de la empresa. */
export function aplicarMarcaEnPanel(marca) {
    if (!marca) return;
    const logoImg = document.querySelector('.rail-logo-img');
    if (logoImg && marca.logoUrl) logoImg.src = marca.logoUrl;
    const nombreEl = document.querySelector('.rail-brand-name');
    if (nombreEl) nombreEl.textContent = marca.nombreCorto || marca.nombre;
    document.title = document.title.replace(/^[^-]+/, (marca.nombre || '') + ' ');
    aplicarColorMarca(marca.color);
}
