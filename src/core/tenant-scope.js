/**
 * TENANT SCOPE
 * Punto único donde el panel decide a qué empresa (tenant) pertenece cada
 * dato que lee o escribe. Antes esto estaba repartido por admin.js como
 * filtros sueltos escritos a mano ("if (venta.tenantId === 'fabrica')
 * return;", "if (d.tenantId !== 'boutique') return;"), uno por sección —
 * cada empresa nueva o sección nueva había que recordar filtrarla.
 *
 * Aquí se envuelven query/getDocs/onSnapshot/addDoc de Firestore para que:
 *  - Toda lectura de una colección por empresa (TENANT_COLLECTIONS) llegue
 *    ya filtrada al tenant activo del panel.
 *  - Todo documento nuevo en esas colecciones quede marcado con su tenantId.
 *  - Ninguna lectura arranque antes de saber quién es el tenant activo (si
 *    no, la primera foto de datos podría mezclar empresas).
 *
 * El filtrado es del lado cliente a propósito: los datos anteriores al
 * multi-tenant no traen tenantId (se tratan como TENANT_LEGADO) y un
 * where('tenantId', '==', ...) los dejaría fuera, además de exigir índices
 * compuestos nuevos por cada consulta. El aislamiento real lo siguen
 * garantizando las Security Rules del lado servidor.
 */

// Empresa a la que pertenecen los documentos sin tenantId (los de antes de
// multi-tenant). Mismo criterio que firestore.rules (isActiveUser) y auth.js.
export const TENANT_LEGADO = 'boutique';

// Colecciones cuyos documentos pertenecen a UNA empresa. 'categorias' no
// está a propósito: es taxonomía compartida (ver firestore.rules).
export const TENANT_COLLECTIONS = new Set([
    'productos', 'ventas', 'clientes', 'pedidosWeb', 'apartados', 'abonos',
    'proveedores', 'repartidores', 'liquidaciones', 'cierresCaja',
    'movimientosFinancieros', 'movimientosBoutique', 'metas', 'cotizaciones',
    'ordenesRecepcion', 'chatConversations', 'promociones', 'promocionesGlobales',
    'movimientosFabrica', 'inventarioFabrica', 'productosFabrica',
    'historial_cargues', 'historial_cargues_fabrica', 'finanzas', 'pedidos'
]);

/** Empresa a la que pertenece un documento. */
export function tenantDe(data) {
    return data?.tenantId || TENANT_LEGADO;
}

/**
 * Empresa activa del panel según window.appContext:
 *  - undefined → todavía no se sabe quién inició sesión (hay que esperar).
 *  - null      → Super Admin sin ?empresa= (vista global, sin filtrar).
 *  - string    → la empresa del usuario (o la elegida por Super Admin).
 */
export function tenantActivo() {
    const ctx = window.appContext;
    if (!ctx) return undefined;
    if (ctx.isSuperAdmin) {
        return new URLSearchParams(window.location.search).get('empresa') || null;
    }
    return ctx.tenantId || TENANT_LEGADO;
}

export function esDelTenantActivo(data) {
    const tenant = tenantActivo();
    return !tenant || tenantDe(data) === tenant;
}

function esperarTenantActivo() {
    if (tenantActivo() !== undefined) return Promise.resolve();
    return new Promise(resolve => {
        window.addEventListener('adminAuthReady', () => resolve(), { once: true });
    });
}

// Imita la interfaz de QuerySnapshot que usa admin.js (forEach, docs,
// size, empty, docChanges, metadata, query) con solo los documentos de la
// empresa activa.
function filtrarSnapshot(snapshot) {
    const docs = snapshot.docs.filter(d => esDelTenantActivo(d.data()));
    if (docs.length === snapshot.docs.length) return snapshot;
    return {
        docs,
        size: docs.length,
        empty: docs.length === 0,
        metadata: snapshot.metadata,
        query: snapshot.query,
        forEach: (cb, thisArg) => docs.forEach(cb, thisArg),
        docChanges: (opts) => snapshot.docChanges(opts).filter(c => esDelTenantActivo(c.doc.data()))
    };
}

/**
 * Devuelve versiones de query/getDocs/onSnapshot/addDoc que respetan la
 * empresa activa. Reciben las funciones originales del SDK para no
 * depender de una versión concreta de Firestore.
 */
export function crearFirestoreConTenant(sdk) {
    // Colección de origen de cada Query creada con query(), para saber si
    // hay que filtrarla (una Query no expone su colección en la API pública).
    const coleccionDeQuery = new WeakMap();

    const coleccionDe = (ref) => {
        if (!ref) return null;
        if (ref.type === 'collection') return ref.id;
        return coleccionDeQuery.get(ref) || null;
    };
    const aplicaTenant = (ref) => TENANT_COLLECTIONS.has(coleccionDe(ref));

    function query(ref, ...constraints) {
        const q = sdk.query(ref, ...constraints);
        const coleccion = coleccionDe(ref);
        if (coleccion) coleccionDeQuery.set(q, coleccion);
        return q;
    }

    async function getDocs(ref) {
        if (!aplicaTenant(ref)) return sdk.getDocs(ref);
        await esperarTenantActivo();
        return filtrarSnapshot(await sdk.getDocs(ref));
    }

    function onSnapshot(ref, ...args) {
        if (ref?.type === 'document' || !aplicaTenant(ref)) return sdk.onSnapshot(ref, ...args);

        // Envolver el callback de datos, sea onSnapshot(ref, next, error),
        // onSnapshot(ref, options, next, error) u onSnapshot(ref, observer).
        const envueltos = args.map(arg => {
            if (typeof arg === 'function') return arg;
            if (arg && typeof arg.next === 'function') {
                return { ...arg, next: snap => arg.next(filtrarSnapshot(snap)) };
            }
            return arg;
        });
        const iNext = envueltos.findIndex(a => typeof a === 'function');
        if (iNext !== -1) {
            const next = envueltos[iNext];
            envueltos[iNext] = snap => next(filtrarSnapshot(snap));
        }

        if (tenantActivo() !== undefined) return sdk.onSnapshot(ref, ...envueltos);

        // Diferir la suscripción hasta conocer la empresa activa.
        let cancelado = false;
        let unsubscribe = null;
        esperarTenantActivo().then(() => {
            if (!cancelado) unsubscribe = sdk.onSnapshot(ref, ...envueltos);
        });
        return () => {
            cancelado = true;
            if (unsubscribe) unsubscribe();
        };
    }

    function addDoc(ref, data) {
        // Para escribir se usa el tenantId explícito del usuario (no el
        // TENANT_LEGADO de respaldo): las Security Rules lo comparan con el
        // tenantId guardado en su documento de 'usuarios'.
        const ctx = window.appContext;
        const tenant = ctx && !ctx.isSuperAdmin ? ctx.tenantId : tenantActivo();
        if (aplicaTenant(ref) && tenant && data && !('tenantId' in data)) {
            data = { ...data, tenantId: tenant };
        }
        return sdk.addDoc(ref, data);
    }

    return { query, getDocs, onSnapshot, addDoc };
}
