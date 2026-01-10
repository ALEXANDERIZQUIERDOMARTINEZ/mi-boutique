/**
 * sidebar-control.js - Control del Sidebar Moderno
 * Maneja la apertura/cierre del sidebar y overlay en mobile
 */

(function() {
    'use strict';

    // Referencias a elementos
    const sidebar = document.getElementById('adminSidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const contentWrapper = document.querySelector('.admin-content-wrapper');
    let overlay = null;

    // Crear overlay si no existe
    function createOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.id = 'sidebarOverlay';
        document.body.appendChild(overlay);

        // Cerrar sidebar al hacer click en el overlay
        overlay.addEventListener('click', closeSidebar);
    }

    // Abrir sidebar
    function openSidebar() {
        if (!sidebar) return;

        sidebar.classList.add('expanded');

        // Mostrar overlay en mobile
        if (window.innerWidth < 992 && overlay) {
            overlay.classList.add('show');
            document.body.style.overflow = 'hidden'; // Prevenir scroll
        }

        // Guardar estado
        localStorage.setItem('sidebarExpanded', 'true');
    }

    // Cerrar sidebar
    function closeSidebar() {
        if (!sidebar) return;

        sidebar.classList.remove('expanded');

        // Ocultar overlay
        if (overlay) {
            overlay.classList.remove('show');
            document.body.style.overflow = ''; // Restaurar scroll
        }

        // Guardar estado
        localStorage.setItem('sidebarExpanded', 'false');
    }

    // Toggle sidebar
    function toggleSidebar() {
        if (sidebar.classList.contains('expanded')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    // Manejar cambio de tamaño de ventana
    function handleResize() {
        const isDesktop = window.innerWidth >= 1200;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 992;

        if (isDesktop) {
            // En desktop, expandir automáticamente
            openSidebar();
            if (overlay) {
                overlay.classList.remove('show');
            }
            document.body.style.overflow = '';
        } else if (isTablet) {
            // En tablet, colapsar por defecto
            closeSidebar();
        } else {
            // En mobile, mantener cerrado
            closeSidebar();
        }
    }

    // Manejar dropdowns
    function handleDropdowns() {
        const dropdownToggles = document.querySelectorAll('.nav-item.dropdown > .nav-link');

        dropdownToggles.forEach(toggle => {
            toggle.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                const dropdownItem = this.closest('.nav-item.dropdown');
                const isOpen = dropdownItem.classList.contains('show');

                // Cerrar otros dropdowns
                document.querySelectorAll('.nav-item.dropdown.show').forEach(item => {
                    if (item !== dropdownItem) {
                        item.classList.remove('show');
                    }
                });

                // Toggle este dropdown
                dropdownItem.classList.toggle('show');

                // Si estamos en modo colapsado y no es desktop, expandir sidebar
                if (!sidebar.classList.contains('expanded') && window.innerWidth < 1200) {
                    openSidebar();
                }
            });
        });

        // Cerrar dropdowns al hacer click fuera
        document.addEventListener('click', function(e) {
            if (!e.target.closest('.nav-item.dropdown')) {
                document.querySelectorAll('.nav-item.dropdown.show').forEach(item => {
                    item.classList.remove('show');
                });
            }
        });
    }

    // Manejar clicks en enlaces de navegación
    function handleNavLinks() {
        const navLinks = document.querySelectorAll('.sidebar-nav .nav-link:not(.dropdown-toggle)');

        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                // En mobile, cerrar sidebar después de hacer click
                if (window.innerWidth < 992) {
                    setTimeout(() => {
                        closeSidebar();
                    }, 300);
                }
            });
        });
    }

    // Añadir tooltips a los enlaces cuando el sidebar está colapsado
    function addTooltips() {
        const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');

        navLinks.forEach(link => {
            const span = link.querySelector('span');
            if (span && span.textContent.trim()) {
                link.setAttribute('data-tooltip', span.textContent.trim());
            }
        });
    }

    // Restaurar estado del sidebar
    function restoreState() {
        const savedState = localStorage.getItem('sidebarExpanded');
        const isDesktop = window.innerWidth >= 1200;

        if (isDesktop || savedState === 'true') {
            openSidebar();
        }
    }

    // Inicializar
    function init() {
        if (!sidebar || !toggleBtn) {
            console.warn('Sidebar o toggle button no encontrado');
            return;
        }

        // Crear overlay
        createOverlay();

        // Event listeners
        toggleBtn.addEventListener('click', toggleSidebar);

        // Manejar resize con debounce
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(handleResize, 250);
        });

        // Manejar dropdowns
        handleDropdowns();

        // Manejar nav links
        handleNavLinks();

        // Añadir tooltips
        addTooltips();

        // Restaurar estado
        restoreState();

        // Ajuste inicial
        handleResize();

        console.log('Sidebar moderno inicializado ✓');
    }

    // Esperar a que el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exponer funciones globalmente para uso en otros scripts
    window.sidebarControl = {
        open: openSidebar,
        close: closeSidebar,
        toggle: toggleSidebar
    };

})();
