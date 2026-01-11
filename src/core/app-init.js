/**
 * INICIALIZADOR DE LA APLICACIÓN
 * Este script se ejecuta en TODAS las páginas y configura el entorno multi-tenant
 */

(async function initializeApp() {
  try {
    console.log('🚀 Iniciando aplicación multi-tenant...');

    // 1. Inicializar Firebase
    const { db, auth, storage, analytics } = initializeFirebase();
    console.log('✅ Firebase inicializado');

    // 2. Resolver tenant (CRÍTICO - antes de cualquier otra cosa)
    try {
      await window.tenantResolver.initialize(db);
      console.log('✅ Tenant resuelto');
    } catch (error) {
      console.error('❌ Error al resolver tenant:', error);
      // Si es desarrollo, continuar
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.warn('⚠️ Continuando en modo desarrollo sin tenant');
      } else {
        throw error;
      }
    }

    // 3. Inicializar Auth Manager
    window.authManager.initialize(auth, db);
    console.log('✅ Auth Manager inicializado');

    // 4. Inicializar servicios
    window.productosService = new ProductosService(db, storage);
    window.ventasService = new VentasService(db);
    window.clientesService = new ClientesService(db);
    window.tenantsService = new TenantsService(db);
    console.log('✅ Servicios inicializados');

    // 5. Si estamos en página protegida, verificar autenticación
    const protectedPages = ['admin.html', 'super-admin.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
      // Esperar a que el usuario esté autenticado
      await waitForUser();
      window.authManager.requireAuth();
    }

    // 6. Disparar evento de app lista
    window.dispatchEvent(new CustomEvent('appReady', {
      detail: {
        db,
        auth,
        storage,
        analytics
      }
    }));

    console.log('✅ Aplicación inicializada correctamente');

  } catch (error) {
    console.error('❌ Error al inicializar aplicación:', error);

    // Mostrar modal de error al usuario
    showErrorModal(
      'Error al inicializar',
      'Ocurrió un error al cargar la aplicación. Por favor recarga la página.'
    );
  }
})();

/**
 * Espera a que el usuario esté autenticado (máximo 5 segundos)
 * @returns {Promise<void>}
 */
function waitForUser() {
  return new Promise((resolve, reject) => {
    let timeout;

    const checkUser = () => {
      if (window.appContext) {
        clearTimeout(timeout);
        resolve();
      }
    };

    // Listener de evento userReady
    window.addEventListener('userReady', () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });

    // Timeout de 5 segundos
    timeout = setTimeout(() => {
      // Si hay usuario de Firebase pero no hay contexto, es que está cargando
      if (firebase.auth().currentUser) {
        // Esperar un poco más
        setTimeout(() => {
          if (window.appContext) {
            resolve();
          } else {
            reject(new Error('Timeout esperando autenticación'));
          }
        }, 2000);
      } else {
        // No hay usuario - redirigir a login
        window.location.href = '/login.html';
      }
    }, 5000);

    // Check inmediato
    checkUser();
  });
}

/**
 * Muestra un modal de error
 * @param {string} title
 * @param {string} message
 */
function showErrorModal(title, message) {
  // Si Bootstrap está disponible
  if (typeof bootstrap !== 'undefined') {
    const modalHTML = `
      <div class="modal fade" id="errorModal" tabindex="-1">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header bg-danger text-white">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p>${message}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="location.reload()">
                Recargar Página
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modal = new bootstrap.Modal(document.getElementById('errorModal'));
    modal.show();
  } else {
    // Fallback: Alert
    alert(`${title}\n\n${message}`);
  }
}

/**
 * Helper para saber si la app está lista
 * @returns {boolean}
 */
window.isAppReady = function() {
  return !!window.appContext;
};

/**
 * Helper para ejecutar código cuando la app esté lista
 * @param {Function} callback
 */
window.onAppReady = function(callback) {
  if (window.isAppReady()) {
    callback();
  } else {
    window.addEventListener('appReady', callback, { once: true });
  }
};
