/**
 * api/usuarios-password.js — Función serverless de Vercel
 *
 * Permite que un administrador cambie la contraseña de OTRO usuario del panel.
 * Desde el navegador (SDK cliente de Firebase) eso es imposible: solo se puede
 * cambiar la contraseña propia. Aquí se usa una cuenta de servicio de Google
 * contra la API REST de Firebase Auth (Identity Toolkit), sin dependencias npm.
 *
 * Configuración (una sola vez, en Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT = contenido completo del JSON de la cuenta de
 *   servicio (Firebase Console → Configuración del proyecto → Cuentas de
 *   servicio → Generar nueva clave privada).
 *
 * Petición: POST /api/usuarios-password
 *   Authorization: Bearer <ID token de Firebase del admin que hace el cambio>
 *   { "uid": "<uid del usuario>", "password": "<nueva contraseña>" }
 *
 * Reglas (las mismas que firestore.rules para editar usuarios):
 *   - Quien llama debe estar activo y ser Super Admin o tener usuarios_editar.
 *   - Si no es Super Admin, el usuario destino debe ser de su misma empresa
 *     y no puede ser Super Admin.
 */

const crypto = require('crypto');

// Clave web pública de Firebase (la misma de app.js); solo sirve para
// validar el ID token de quien llama.
const WEB_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI';
const MIN_LENGTH = 6;

let cachedToken = null; // { token, exp }

function leerCuentaServicio() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) return null;
    try {
        const sa = JSON.parse(raw);
        if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
        return sa;
    } catch {
        return null;
    }
}

function base64url(input) {
    return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function tokenDeServicio(sa) {
    const ahora = Math.floor(Date.now() / 1000);
    if (cachedToken && cachedToken.exp - 60 > ahora) return cachedToken.token;

    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat: ahora,
        exp: ahora + 3600
    }));
    const firma = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
    const jwt = `${header}.${claims}.${base64url(firma)}`;

    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error('No se pudo autenticar la cuenta de servicio: ' + (data.error_description || data.error));
    cachedToken = { token: data.access_token, exp: ahora + (data.expires_in || 3600) };
    return cachedToken.token;
}

// Valida el ID token de quien llama y devuelve su uid.
async function uidDeIdToken(idToken) {
    const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${WEB_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.users?.[0]?.localId || null;
}

// Lee usuarios/{uid} de Firestore y lo convierte a objeto plano (solo los
// campos que se necesitan aquí).
async function leerUsuario(projectId, accessToken, uid) {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (resp.status === 404) return null;
    if (!resp.ok) throw new Error('No se pudo leer el usuario en Firestore');
    const f = (await resp.json()).fields || {};
    const permisos = {};
    Object.entries(f.permisos?.mapValue?.fields || {}).forEach(([k, v]) => { permisos[k] = v.booleanValue === true; });
    return {
        rol: f.rol?.stringValue || null,
        activo: f.activo?.booleanValue === true,
        tenantId: f.tenantId?.stringValue ?? null,
        email: f.email?.stringValue || null,
        nombre: f.nombre?.stringValue || null,
        permisos
    };
}

// Igual que esTiendaPrincipal() en firestore.rules: la tienda al detal
// tiene tres identificadores que son la misma empresa.
function esTiendaPrincipal(t) {
    return t == null || t === 'boutique' || t === 'tenant_mishell_001';
}
function mismaEmpresa(a, b) {
    return a === b || (esTiendaPrincipal(a) && esTiendaPrincipal(b));
}

function responder(res, status, body) {
    res.status(status).setHeader('Cache-Control', 'no-store');
    res.json(body);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return responder(res, 405, { error: 'Método no permitido' });
    }

    const sa = leerCuentaServicio();
    if (!sa) {
        return responder(res, 501, {
            error: 'El servidor no tiene configurada la cuenta de servicio de Firebase (FIREBASE_SERVICE_ACCOUNT).',
            code: 'not-configured'
        });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { body = {}; }
    }
    const uid = typeof body?.uid === 'string' ? body.uid.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!uid) return responder(res, 400, { error: 'Falta el usuario' });
    if (password.length < MIN_LENGTH) return responder(res, 400, { error: `La contraseña debe tener al menos ${MIN_LENGTH} caracteres` });
    if (password.length > 128) return responder(res, 400, { error: 'La contraseña es demasiado larga' });

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return responder(res, 401, { error: 'Sesión no válida' });

    try {
        const callerUid = await uidDeIdToken(idToken);
        if (!callerUid) return responder(res, 401, { error: 'Sesión no válida o vencida. Vuelve a iniciar sesión.' });

        const projectId = sa.project_id;
        const accessToken = await tokenDeServicio(sa);

        const caller = await leerUsuario(projectId, accessToken, callerUid);
        const callerEsSuper = caller?.rol === 'SUPER_ADMIN';
        if (!caller || !caller.activo || !(callerEsSuper || caller.permisos.usuarios_editar)) {
            return responder(res, 403, { error: 'No tienes permiso para cambiar contraseñas' });
        }

        const destino = await leerUsuario(projectId, accessToken, uid);
        if (!destino) return responder(res, 404, { error: 'Usuario no encontrado' });

        if (!callerEsSuper) {
            if (destino.rol === 'SUPER_ADMIN') {
                return responder(res, 403, { error: 'Solo el Super Administrador puede cambiar esta contraseña' });
            }
            if (!mismaEmpresa(caller.tenantId, destino.tenantId)) {
                return responder(res, 403, { error: 'Ese usuario no pertenece a tu empresa' });
            }
        }

        const upd = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ localId: uid, password })
        });
        if (!upd.ok) {
            const err = await upd.json().catch(() => ({}));
            const msg = err.error?.message || '';
            if (msg.startsWith('WEAK_PASSWORD')) return responder(res, 400, { error: 'La contraseña es muy débil' });
            if (msg === 'USER_NOT_FOUND') return responder(res, 404, { error: 'La cuenta de acceso de este usuario no existe' });
            console.error('accounts:update falló:', msg || upd.status);
            return responder(res, 502, { error: 'Firebase no aceptó el cambio de contraseña' });
        }

        return responder(res, 200, { ok: true });
    } catch (error) {
        console.error('Error al cambiar contraseña:', error);
        return responder(res, 500, { error: 'Error interno al cambiar la contraseña' });
    }
};
