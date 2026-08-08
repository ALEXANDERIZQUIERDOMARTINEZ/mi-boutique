// ── Recorrido guiado reutilizable ───────────────────────────────────────
// Motor genérico: recibe una lista de "pasos" (selector CSS + texto) y
// dibuja un overlay oscuro con un hueco de luz alrededor del elemento
// señalado, más una burbuja con el texto y botones Anterior/Siguiente/
// Saltar. No depende de ninguna página en concreto — cada página decide
// sus propios pasos y cuándo mostrarlo (normalmente: la primera vez que
// alguien entra) y cuándo repetirlo (un botón de ayuda "?").
//
// Uso:
//   import { startGuideTour, hasSeenGuide } from './guide-tour.js';
//   startGuideTour('mayor', steps);           // solo la primera vez
//   startGuideTour('mayor', steps, { force: true }); // repetir a pedido

const STORAGE_PREFIX = 'mishell_guide_seen_';

export function hasSeenGuide(key) {
    try {
        return localStorage.getItem(STORAGE_PREFIX + key) === '1';
    } catch {
        return false;
    }
}

function markGuideSeen(key) {
    try {
        localStorage.setItem(STORAGE_PREFIX + key, '1');
    } catch { /* almacenamiento no disponible: no es crítico */ }
}

let activeTour = null;

export function startGuideTour(key, steps, options = {}) {
    if (!steps || steps.length === 0) return;
    if (!options.force && hasSeenGuide(key)) return;
    if (activeTour) activeTour.destroy();
    activeTour = createTour(key, steps);
    activeTour.start();
}

function createTour(key, steps) {
    let stepIndex = 0;
    let repositionHandler = null;

    const root = document.createElement('div');
    root.className = 'gtour-root';
    root.innerHTML = `
        <div class="gtour-overlay"></div>
        <div class="gtour-spot" style="display:none"></div>
        <div class="gtour-tooltip" role="dialog" aria-live="polite">
            <div class="gtour-tooltip-arrow"></div>
            <button type="button" class="gtour-close" aria-label="Cerrar guía">
                <i class="bi bi-x-lg"></i>
            </button>
            <div class="gtour-dots"></div>
            <p class="gtour-title"></p>
            <p class="gtour-text"></p>
            <div class="gtour-actions">
                <button type="button" class="gtour-btn gtour-btn-skip">Saltar</button>
                <div class="gtour-actions-right">
                    <button type="button" class="gtour-btn gtour-btn-back">Atrás</button>
                    <button type="button" class="gtour-btn gtour-btn-next">Siguiente</button>
                </div>
            </div>
        </div>
    `;

    const overlayEl = root.querySelector('.gtour-overlay');
    const spotEl = root.querySelector('.gtour-spot');
    const tooltipEl = root.querySelector('.gtour-tooltip');
    const dotsEl = root.querySelector('.gtour-dots');
    const titleEl = root.querySelector('.gtour-title');
    const textEl = root.querySelector('.gtour-text');
    const backBtn = root.querySelector('.gtour-btn-back');
    const nextBtn = root.querySelector('.gtour-btn-next');
    const skipBtn = root.querySelector('.gtour-btn-skip');
    const closeBtn = root.querySelector('.gtour-close');

    function finish() {
        markGuideSeen(key);
        destroy();
    }

    function destroy() {
        window.removeEventListener('resize', repositionHandler);
        window.removeEventListener('scroll', repositionHandler, true);
        document.removeEventListener('keydown', onKeydown);
        root.remove();
        document.body.classList.remove('gtour-locked');
        if (activeTour && activeTour.destroy === destroy) activeTour = null;
    }

    function onKeydown(e) {
        if (e.key === 'Escape') finish();
        else if (e.key === 'ArrowRight') goNext();
        else if (e.key === 'ArrowLeft') goBack();
    }

    function goNext() {
        if (stepIndex >= steps.length - 1) { finish(); return; }
        stepIndex += 1;
        renderStep();
    }

    function goBack() {
        if (stepIndex <= 0) return;
        stepIndex -= 1;
        renderStep();
    }

    function positionForTarget(targetEl) {
        if (!targetEl) {
            spotEl.style.display = 'none';
            tooltipEl.classList.add('gtour-tooltip-center');
            tooltipEl.style.top = '';
            tooltipEl.style.left = '';
            tooltipEl.style.transform = '';
            tooltipEl.dataset.arrow = 'none';
            return;
        }
        const rect = targetEl.getBoundingClientRect();
        const pad = 8;
        spotEl.style.display = 'block';
        spotEl.style.top = `${rect.top - pad}px`;
        spotEl.style.left = `${rect.left - pad}px`;
        spotEl.style.width = `${rect.width + pad * 2}px`;
        spotEl.style.height = `${rect.height + pad * 2}px`;

        tooltipEl.classList.remove('gtour-tooltip-center');
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const tooltipH = tooltipEl.offsetHeight || 180;
        let top;
        let arrow;
        if (spaceBelow >= tooltipH + 20 || spaceBelow >= spaceAbove) {
            top = rect.bottom + pad + 10;
            arrow = 'top';
        } else {
            top = rect.top - pad - 10 - tooltipH;
            arrow = 'bottom';
        }
        top = Math.max(12, Math.min(top, window.innerHeight - tooltipH - 12));
        tooltipEl.dataset.arrow = arrow;

        const tooltipW = tooltipEl.offsetWidth || 300;
        let left = rect.left + rect.width / 2 - tooltipW / 2;
        left = Math.max(12, Math.min(left, window.innerWidth - tooltipW - 12));

        tooltipEl.style.top = `${top}px`;
        tooltipEl.style.left = `${left}px`;
        tooltipEl.style.transform = 'none';

        const arrowLeft = Math.max(16, Math.min(rect.left + rect.width / 2 - left, tooltipW - 16));
        tooltipEl.querySelector('.gtour-tooltip-arrow').style.left = `${arrowLeft}px`;
    }

    function renderStep() {
        const step = steps[stepIndex];
        const targetEl = step.selector ? document.querySelector(step.selector) : null;

        titleEl.textContent = step.title || '';
        textEl.textContent = step.text || '';
        dotsEl.innerHTML = steps.map((_, i) =>
            `<span class="gtour-dot${i === stepIndex ? ' is-active' : ''}"></span>`
        ).join('');
        backBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
        nextBtn.textContent = stepIndex === steps.length - 1 ? 'Entendido' : 'Siguiente';

        const reposition = () => positionForTarget(document.querySelector(step.selector || '__none__'));

        if (targetEl && targetEl.scrollIntoView) {
            targetEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setTimeout(() => positionForTarget(targetEl), 280);
        } else {
            positionForTarget(null);
        }

        window.removeEventListener('resize', repositionHandler);
        window.removeEventListener('scroll', repositionHandler, true);
        repositionHandler = () => positionForTarget(document.querySelector(step.selector || '__none__'));
        window.addEventListener('resize', repositionHandler);
        window.addEventListener('scroll', repositionHandler, true);
    }

    nextBtn.addEventListener('click', goNext);
    backBtn.addEventListener('click', goBack);
    skipBtn.addEventListener('click', finish);
    closeBtn.addEventListener('click', finish);
    overlayEl.addEventListener('click', finish);

    return {
        start() {
            document.body.appendChild(root);
            document.body.classList.add('gtour-locked');
            document.addEventListener('keydown', onKeydown);
            renderStep();
        },
        destroy,
    };
}
