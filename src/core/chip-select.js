// Menú con diseño para los filtros tipo chip (.pf-chip--select).
//
// La lista que abre un <select> nativo la dibuja el sistema operativo
// (en Windows sale como una caja gris sin estilo) y no se puede pintar con
// CSS. En computador se cambia por un menú propio; en celular/tablet se
// deja el selector nativo, que ahí es mejor (rueda de iOS, hoja de Android).
//
// El <select> sigue siendo la fuente de verdad: el menú lee sus <option>
// (se vuelve a armar solo si el código cambia las opciones) y al elegir
// fija select.value y dispara 'change', así que los filtros existentes no
// cambian en nada.

const esPunteroFino = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function mejorarChipSelect(select) {
    if (!select || select.dataset.chipMenu === '1' || !esPunteroFino()) return;
    const chip = select.closest('.pf-chip--select');
    if (!chip) return;
    select.dataset.chipMenu = '1';

    let menu = null;

    const cerrar = () => {
        if (!menu) return;
        menu.remove();
        menu = null;
        chip.classList.remove('is-open');
        document.removeEventListener('pointerdown', alTocarFuera, true);
        window.removeEventListener('resize', cerrar);
        window.removeEventListener('scroll', reubicar, true);
    };

    const alTocarFuera = (e) => {
        if (menu && !menu.contains(e.target) && !chip.contains(e.target)) cerrar();
    };

    const reubicar = () => {
        if (!menu) return;
        const r = chip.getBoundingClientRect();
        const alto = Math.min(menu.scrollHeight, 360);
        const abajo = window.innerHeight - r.bottom - 12;
        const arriba = r.top - 12;
        const haciaArriba = abajo < Math.min(alto, 220) && arriba > abajo;
        menu.style.minWidth = `${Math.max(r.width, 220)}px`;
        menu.style.left = `${Math.min(r.left, window.innerWidth - menu.offsetWidth - 12)}px`;
        menu.style.maxHeight = `${Math.max(160, Math.min(360, haciaArriba ? arriba : abajo))}px`;
        menu.style.top = haciaArriba ? '' : `${r.bottom + 6}px`;
        menu.style.bottom = haciaArriba ? `${window.innerHeight - r.top + 6}px` : '';
    };

    const elegir = (valor) => {
        cerrar();
        if (select.value !== valor) {
            select.value = valor;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        select.focus({ preventScroll: true });
    };

    const abrir = () => {
        if (menu) { cerrar(); return; }
        menu = document.createElement('div');
        menu.className = 'pf-chip-menu';
        menu.setAttribute('role', 'listbox');
        // Mismo tema (claro/oscuro) que la página: las variables cuelgan de body.
        Array.from(select.options).forEach((opt) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'pf-chip-menu-item' + (opt.value === select.value ? ' is-selected' : '') + (opt.value === '' ? ' is-all' : '');
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', opt.value === select.value ? 'true' : 'false');
            item.dataset.value = opt.value;
            const texto = document.createElement('span');
            texto.textContent = opt.dataset.label || opt.textContent;
            item.appendChild(texto);
            if (opt.dataset.count) {
                const n = document.createElement('span');
                n.className = 'pf-chip-menu-count';
                n.textContent = opt.dataset.count;
                item.appendChild(n);
            }
            if (opt.value === select.value) {
                const check = document.createElement('i');
                check.className = 'bi bi-check2';
                item.appendChild(check);
            }
            item.addEventListener('click', () => elegir(opt.value));
            menu.appendChild(item);
        });
        menu.addEventListener('keydown', (e) => {
            const items = Array.from(menu.querySelectorAll('.pf-chip-menu-item'));
            const i = items.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(i + 1, items.length - 1)]?.focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(i - 1, 0)]?.focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); cerrar(); select.focus({ preventScroll: true }); }
            else if (e.key === 'Tab') cerrar();
        });
        document.body.appendChild(menu);
        chip.classList.add('is-open');
        reubicar();
        (menu.querySelector('.is-selected') || menu.firstElementChild)?.focus({ preventScroll: true });
        menu.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
        document.addEventListener('pointerdown', alTocarFuera, true);
        window.addEventListener('resize', cerrar);
        window.addEventListener('scroll', reubicar, true);
    };

    // Clic en cualquier parte del chip: abre el menú en vez de la lista nativa.
    select.addEventListener('mousedown', (e) => { e.preventDefault(); abrir(); });
    chip.addEventListener('mousedown', (e) => {
        if (e.target === select || (menu && menu.contains(e.target))) return;
        e.preventDefault();
        abrir();
    });
    // Teclado: Enter/Espacio/flechas abren el menú (Tab sigue pasando de largo).
    select.addEventListener('keydown', (e) => {
        if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); if (!menu) abrir(); }
    });

    // Si el código vuelve a llenar las opciones con el menú abierto, se rehace.
    new MutationObserver(() => { if (menu) { cerrar(); abrir(); } }).observe(select, { childList: true });
}

export function mejorarChipSelects(raiz = document) {
    raiz.querySelectorAll('.pf-chip--select select').forEach(mejorarChipSelect);
}
