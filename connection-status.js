// ════════════════════════════════════════════════════════════════════════
// 🟢 BOTÓN DE ESTADO DE CONEXIÓN
// Botón pequeño en el topbar (móvil y escritorio) que se enciende en verde/
// ámbar/rojo según la conexión, y al hacer clic muestra el ping y el motivo
// de una conexión lenta o fallida. Se apoya en:
//  - navigator.onLine / eventos 'online' y 'offline' (sin internet).
//  - un ping propio (HEAD a un archivo estático del mismo sitio) para medir
//    la latencia real hacia el servidor.
//  - el aviso "dashboard-slow-banner" que ya existe en admin.js cuando
//    Firestore tarda más de 12s en responder.
//  - errores reales de Firestore reportados por admin.js vía
//    window.reportConnError(fuente, error).
// ════════════════════════════════════════════════════════════════════════
(function () {
    const STATE = {
        online: navigator.onLine,
        checking: false,
        pingMs: null,
        pingOk: null,
        lastCheckedAt: null,
        lastError: null, // { source, code, message, time }
        dashboardSlow: false,
    };

    const PING_TIMEOUT_MS = 8000;
    const PING_INTERVAL_MS = 20000;
    const ERROR_RELEVANT_MS = 30000; // un error "reciente" cuenta durante 30s
    const PING_SLOW_MS = 1200;

    const FIREBASE_ERROR_MESSAGES = {
        'permission-denied': 'Tu usuario no tiene permiso para leer estos datos',
        'unauthenticated': 'Tu sesión expiró o no está autenticada. Intenta cerrar sesión y volver a entrar',
        'unavailable': 'El servidor de la base de datos no está disponible (red inestable o el servicio está caído)',
        'resource-exhausted': 'Se alcanzó un límite de uso de la base de datos (cuota excedida)',
        'deadline-exceeded': 'La base de datos tardó demasiado en responder (tiempo de espera agotado)',
        'cancelled': 'La operación fue cancelada antes de completarse',
        'not-found': 'No se encontró la información solicitada',
        'internal': 'Error interno del servidor de la base de datos',
        'failed-precondition': 'La operación no se pudo completar en el estado actual de la base de datos',
    };

    function describeFirebaseError(info) {
        const code = info && info.code;
        const friendly = code && FIREBASE_ERROR_MESSAGES[code];
        if (friendly) return `${friendly} (código: ${code}).`;
        return `Error al conectar con la base de datos${info && info.message ? `: ${info.message}` : ''}.`;
    }

    function computeStatus() {
        if (!STATE.online) {
            return {
                level: 'bad',
                label: 'Sin conexión',
                reason: 'Tu dispositivo no tiene conexión a internet. Revisa el wifi o los datos móviles.',
            };
        }
        if (STATE.lastError && (Date.now() - STATE.lastError.time) < ERROR_RELEVANT_MS) {
            return {
                level: 'bad',
                label: 'Error de conexión',
                reason: describeFirebaseError(STATE.lastError),
            };
        }
        if (STATE.checking && STATE.pingMs === null) {
            return { level: 'checking', label: 'Comprobando…', reason: 'Verificando la conexión…' };
        }
        if (STATE.pingOk === false) {
            return {
                level: 'bad',
                label: 'Sin respuesta del servidor',
                reason: 'El servidor no respondió a tiempo. Puede deberse a una red muy débil, una VPN/firewall bloqueando la conexión, o el servicio caído.',
            };
        }
        if (STATE.dashboardSlow) {
            return {
                level: 'warn',
                label: 'Conexión lenta',
                reason: `El servidor respondió${STATE.pingMs != null ? ` en ${STATE.pingMs} ms` : ''}, pero la base de datos está tardando más de lo normal en enviar los datos. Prueba con mejor señal o recarga la página.`,
            };
        }
        if (STATE.pingMs != null && STATE.pingMs > PING_SLOW_MS) {
            return {
                level: 'warn',
                label: 'Conexión lenta',
                reason: `El ping es alto (${STATE.pingMs} ms). Es probable que tengas una red débil o inestable.`,
            };
        }
        if (STATE.pingMs == null) {
            return { level: 'checking', label: 'Comprobando…', reason: 'Verificando la conexión…' };
        }
        return { level: 'good', label: 'Conectado', reason: 'La conexión funciona con normalidad.' };
    }

    function render() {
        const status = computeStatus();

        document.querySelectorAll('.conn-status-btn').forEach((btn) => {
            const dot = btn.querySelector('.conn-status-dot');
            if (dot) dot.className = 'conn-status-dot conn-status-dot--' + status.level;
            btn.setAttribute('aria-label', 'Estado de conexión: ' + status.label);
        });

        document.querySelectorAll('.conn-status-dropdown').forEach((panel) => {
            const led = panel.querySelector('[data-conn="led"]');
            if (led) led.className = 'conn-status-led conn-status-led--' + status.level;

            const label = panel.querySelector('[data-conn="label"]');
            if (label) label.textContent = status.label;

            const ping = panel.querySelector('[data-conn="ping"]');
            if (ping) {
                ping.textContent = STATE.checking
                    ? 'Midiendo…'
                    : (STATE.pingMs != null ? `${STATE.pingMs} ms` : '—');
            }

            const reason = panel.querySelector('[data-conn="reason"]');
            if (reason) reason.textContent = status.reason;

            const updated = panel.querySelector('[data-conn="updated"]');
            if (updated) {
                updated.textContent = STATE.lastCheckedAt
                    ? `Última comprobación: ${new Date(STATE.lastCheckedAt).toLocaleTimeString('es-CO')}`
                    : '';
            }
        });
    }

    async function measurePing() {
        const url = window.location.origin + '/icon.svg?_ping=' + Date.now();
        const start = performance.now();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
        try {
            const res = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
            clearTimeout(timeout);
            const elapsed = Math.round(performance.now() - start);
            if (!res.ok) return { ok: false, ms: elapsed };
            return { ok: true, ms: elapsed };
        } catch (err) {
            clearTimeout(timeout);
            const elapsed = Math.round(performance.now() - start);
            return { ok: false, ms: elapsed };
        }
    }

    async function runPing() {
        if (!navigator.onLine) {
            STATE.online = false;
            render();
            return;
        }
        STATE.checking = true;
        render();
        const result = await measurePing();
        STATE.checking = false;
        STATE.pingMs = result.ms;
        STATE.pingOk = result.ok;
        STATE.lastCheckedAt = Date.now();
        render();
    }

    let pingTimer = null;
    function schedulePing() {
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = setInterval(() => {
            if (!document.hidden) runPing();
        }, PING_INTERVAL_MS);
    }

    // API pública: admin.js llama esto cuando un listener de Firestore falla,
    // pasando la fuente ("dashboard-productos", etc.) y el error real.
    window.reportConnError = function (source, error) {
        STATE.lastError = {
            source,
            code: error && error.code,
            message: error && error.message,
            time: Date.now(),
        };
        render();
    };

    function watchDashboardSlowBanner() {
        const el = document.getElementById('dashboard-slow-banner');
        if (!el) return;
        const update = () => {
            STATE.dashboardSlow = !el.classList.contains('d-none');
            render();
        };
        update();
        const obs = new MutationObserver(update);
        obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    }

    function closeAllConnDropdowns() {
        document.querySelectorAll('.conn-status-dropdown').forEach((p) => p.classList.remove('show'));
        document.querySelectorAll('.conn-status-btn').forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-expanded', 'false');
        });
    }
    window.closeConnStatusDropdowns = closeAllConnDropdowns;

    function initButtons() {
        document.querySelectorAll('.conn-status-btn').forEach((btn) => {
            const targetId = btn.getAttribute('data-conn-target');
            const panel = targetId ? document.getElementById(targetId) : null;
            if (!panel) return;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasOpen = panel.classList.contains('show');
                if (window.closeTopbarDropdowns) window.closeTopbarDropdowns();
                closeAllConnDropdowns();
                if (!wasOpen) {
                    panel.classList.add('show');
                    btn.classList.add('active');
                    btn.setAttribute('aria-expanded', 'true');
                    runPing();
                }
            });

            const retryBtn = panel.querySelector('.conn-status-retry');
            if (retryBtn) {
                retryBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    runPing();
                });
            }

            panel.addEventListener('click', (e) => e.stopPropagation());
        });

        document.addEventListener('click', closeAllConnDropdowns);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllConnDropdowns();
        });
    }

    window.addEventListener('online', () => { STATE.online = true; runPing(); });
    window.addEventListener('offline', () => { STATE.online = false; STATE.pingOk = false; render(); });

    document.addEventListener('DOMContentLoaded', () => {
        initButtons();
        watchDashboardSlowBanner();
        render();
        runPing();
        schedulePing();
    });
})();
