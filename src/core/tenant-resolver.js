/**
 * TENANT RESOLVER
 * Detecta el tenant desde la URL (subdominio o ?tenant= en desarrollo) y,
 * si ya existe un documento para ese tenant en Firestore, inyecta su
 * branding (colores + nombre) en la página actual.
 *
 * Fase de transición: mientras la colección `tenants` esté vacía (todavía
 * no se migró ningún dato), esto no debe romper nada — si no encuentra un
 * tenant simplemente no hace nada y la app sigue exactamente igual que hoy.
 * Cuando se migren los datos (fase posterior de este plan), dejará de ser
 * silencioso y pasará a exigir un tenant válido.
 */
import { collection, query, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let currentTenant = null;

const TENANT_DEV_FALLBACK = null; // sin valor por defecto: cada entorno de prueba pasa ?tenant=<slug> explícitamente

/**
 * Extrae el slug del tenant desde la URL actual.
 * @returns {string|null}
 */
function extractTenantSlug() {
    const hostname = window.location.hostname;

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const params = new URLSearchParams(window.location.search);
        return params.get('tenant') || TENANT_DEV_FALLBACK;
    }

    // Producción: subdominio — eleganza.miplataforma.com → "eleganza"
    const parts = hostname.split('.');
    if (parts.length >= 3) {
        const subdomain = parts[0];
        return subdomain === 'www' ? null : subdomain;
    }

    // Dominio raíz (mishelles.store) o dominio custom: sin tenant explícito
    // en esta fase — se resuelve más adelante cuando existan tenants reales.
    return null;
}

/**
 * Resuelve el tenant actual contra Firestore e inyecta su branding.
 * No lanza errores hacia arriba: un fallo aquí nunca debe tumbar la app.
 * @param {import("https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js").Firestore} db
 * @returns {Promise<Object|null>} el tenant resuelto, o null si no aplica todavía
 */
export async function resolveTenant(db) {
    const slug = extractTenantSlug();

    if (!slug) {
        return null;
    }

    try {
        const tenantsQuery = query(
            collection(db, 'tenants'),
            where('slug', '==', slug),
            where('estado', 'in', ['activo', 'trial']),
            limit(1)
        );
        const snapshot = await getDocs(tenantsQuery);

        if (snapshot.empty) {
            // Normal mientras no se haya migrado ningún tenant todavía.
            return null;
        }

        const tenantDoc = snapshot.docs[0];
        currentTenant = { id: tenantDoc.id, ...tenantDoc.data() };
        sessionStorage.setItem('currentTenant', JSON.stringify(currentTenant));

        injectBranding(currentTenant);
        console.log(`✅ Tenant activo: ${currentTenant.nombre || currentTenant.id}`);
        return currentTenant;

    } catch (error) {
        console.warn('⚠️ No se pudo resolver el tenant (no bloqueante):', error.message);
        return null;
    }
}

/**
 * @returns {Object|null} el tenant resuelto en esta sesión, o null
 */
export function getCurrentTenant() {
    return currentTenant;
}

/**
 * Inyecta colores y textos del tenant en la página vía CSS custom
 * properties y atributos data-tenant-*. No toca nada si el tenant no
 * trae branding configurado.
 */
function injectBranding(tenant) {
    const branding = tenant?.branding;
    if (!branding) return;

    const root = document.documentElement;
    if (branding.colorPrimario) root.style.setProperty('--color-primario', branding.colorPrimario);
    if (branding.colorSecundario) root.style.setProperty('--color-secundario', branding.colorSecundario);
    if (branding.colorAccento) root.style.setProperty('--color-acento', branding.colorAccento);

    const nombreTienda = branding.textos?.nombreTienda || tenant.nombre;

    if (branding.logo) {
        document.querySelectorAll('[data-tenant-logo]').forEach(el => {
            el.src = branding.logo;
            if (nombreTienda) el.alt = nombreTienda;
        });
    }
    if (nombreTienda) {
        document.querySelectorAll('[data-tenant-title]').forEach(el => {
            el.textContent = nombreTienda;
        });
    }
    if (branding.textos?.tagline) {
        document.querySelectorAll('[data-tenant-tagline]').forEach(el => {
            el.textContent = branding.textos.tagline;
        });
    }
}
