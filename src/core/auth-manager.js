/**
 * AUTH MANAGER MULTI-TENANT
 * Gestiona autenticación y permisos con soporte multi-tenant
 */

class AuthManager {
  constructor() {
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.unsubscribe = null;
  }

  /**
   * Inicializa el auth manager
   * @param {firebase.auth.Auth} firebaseAuth - Instancia de Firebase Auth
   * @param {firebase.firestore.Firestore} firebaseDb - Instancia de Firestore
   */
  initialize(firebaseAuth, firebaseDb) {
    this.auth = firebaseAuth;
    this.db = firebaseDb;

    // Listener de cambios de autenticación
    this.unsubscribe = this.auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        await this.handleUserLogin(firebaseUser);
      } else {
        this.handleUserLogout();
      }
    });
  }

  /**
   * Maneja el login del usuario
   */
  async handleUserLogin(firebaseUser) {
    try {
      console.log(`🔐 Usuario autenticado: ${firebaseUser.email}`);

      // 1. Cargar datos del usuario desde Firestore
      const userDoc = await this.db.collection('usuarios').doc(firebaseUser.uid).get();

      if (!userDoc.exists) {
        throw new Error('Usuario no encontrado en la base de datos');
      }

      const userData = userDoc.data();
      this.currentUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        ...userData
      };

      // 2. VALIDACIÓN CRÍTICA: Verificar tenantId match
      const currentTenantId = window.tenantResolver.getTenantId();

      if (this.currentUser.rol === 'SUPER_ADMIN') {
        // Super Admin puede acceder a cualquier tenant
        console.log('✅ Super Admin detectado - Acceso global permitido');
      } else {
        // Usuario normal - DEBE pertenecer al tenant actual
        if (this.currentUser.tenantId !== currentTenantId) {
          console.error(`❌ Usuario no autorizado para este tenant`);
          console.error(`Usuario pertenece a: ${this.currentUser.tenantId}`);
          console.error(`Intentando acceder a: ${currentTenantId}`);

          await this.logout();
          alert('No estás autorizado para acceder a esta tienda.');
          window.location.href = '/login.html';
          return;
        }
        console.log(`✅ Usuario autorizado para tenant: ${currentTenantId}`);
      }

      // 3. Verificar si el usuario está activo
      if (!this.currentUser.activo) {
        console.error('❌ Usuario inactivo');
        await this.logout();
        alert('Tu cuenta ha sido desactivada. Contacta al administrador.');
        window.location.href = '/login.html';
        return;
      }

      // 4. Guardar contexto global
      window.appContext = {
        tenantId: currentTenantId,
        userId: this.currentUser.uid,
        email: this.currentUser.email,
        nombre: this.currentUser.nombre,
        rol: this.currentUser.rol,
        permisos: this.currentUser.permisos || {},
        isSuperAdmin: this.currentUser.rol === 'SUPER_ADMIN'
      };

      // 5. Actualizar último acceso
      await this.db.collection('usuarios').doc(firebaseUser.uid).update({
        ultimoAcceso: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 6. Cargar UI según permisos
      this.initializeUI();

      console.log('✅ Autenticación completada');

      // 7. Disparar evento custom para que otros módulos sepan que el usuario está listo
      window.dispatchEvent(new CustomEvent('userReady', { detail: window.appContext }));

    } catch (error) {
      console.error('❌ Error al cargar datos del usuario:', error);
      await this.logout();
      alert('Error al iniciar sesión. Por favor intenta nuevamente.');
      window.location.href = '/login.html';
    }
  }

  /**
   * Maneja el logout del usuario
   */
  handleUserLogout() {
    console.log('👋 Usuario desconectado');
    this.currentUser = null;
    window.appContext = null;

    // Si estamos en una página protegida, redirigir a login
    const protectedPages = ['admin.html', 'super-admin.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
      window.location.href = '/login.html';
    }
  }

  /**
   * Login con email y password
   */
  async login(email, password) {
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      return userCredential.user;
    } catch (error) {
      console.error('Error en login:', error);
      throw this.translateAuthError(error);
    }
  }

  /**
   * Logout
   */
  async logout() {
    try {
      await this.auth.signOut();
      sessionStorage.clear();
      window.location.href = '/login.html';
    } catch (error) {
      console.error('Error en logout:', error);
    }
  }

  /**
   * Verifica si el usuario tiene un permiso específico
   * @param {string} permission - Nombre del permiso
   * @returns {boolean}
   */
  hasPermission(permission) {
    if (!window.appContext) return false;

    // Super Admin tiene todos los permisos
    if (window.appContext.isSuperAdmin) return true;

    // Verificar permiso específico
    return window.appContext.permisos[permission] === true;
  }

  /**
   * Verifica si el usuario tiene un rol específico
   * @param {string} rol - Nombre del rol
   * @returns {boolean}
   */
  hasRole(rol) {
    if (!window.appContext) return false;
    return window.appContext.rol === rol;
  }

  /**
   * Requiere autenticación - Redirige si no está autenticado
   * @returns {boolean}
   */
  requireAuth() {
    if (!this.auth.currentUser) {
      console.warn('⚠️ Acceso no autorizado - Redirigiendo a login');
      window.location.href = '/login.html';
      return false;
    }
    return true;
  }

  /**
   * Requiere un permiso específico - Muestra error si no lo tiene
   * @param {string} permission - Nombre del permiso
   * @returns {boolean}
   */
  requirePermission(permission) {
    if (!this.hasPermission(permission)) {
      console.error(`❌ Permiso requerido no encontrado: ${permission}`);
      alert('No tienes permisos para realizar esta acción.');
      return false;
    }
    return true;
  }

  /**
   * Inicializa la UI según permisos
   */
  initializeUI() {
    // Ocultar elementos según permisos
    document.querySelectorAll('[data-require-permission]').forEach(el => {
      const requiredPermission = el.dataset.requirePermission;
      if (!this.hasPermission(requiredPermission)) {
        el.style.display = 'none';
      }
    });

    // Ocultar elementos según rol
    document.querySelectorAll('[data-require-role]').forEach(el => {
      const requiredRole = el.dataset.requireRole;
      if (!this.hasRole(requiredRole)) {
        el.style.display = 'none';
      }
    });

    // Mostrar nombre del usuario
    document.querySelectorAll('[data-user-name]').forEach(el => {
      el.textContent = window.appContext.nombre;
    });

    // Mostrar email del usuario
    document.querySelectorAll('[data-user-email]').forEach(el => {
      el.textContent = window.appContext.email;
    });

    // Mostrar rol del usuario
    document.querySelectorAll('[data-user-rol]').forEach(el => {
      el.textContent = window.appContext.rol;
    });
  }

  /**
   * Traduce errores de Firebase a mensajes legibles
   */
  translateAuthError(error) {
    const errorMessages = {
      'auth/user-not-found': 'Usuario no encontrado',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/email-already-in-use': 'Este email ya está registrado',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
      'auth/invalid-email': 'Email inválido',
      'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde.',
      'auth/network-request-failed': 'Error de conexión. Verifica tu internet.'
    };

    return new Error(errorMessages[error.code] || error.message);
  }

  /**
   * Obtiene el usuario actual
   * @returns {Object|null}
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Verifica si hay un usuario autenticado
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.auth.currentUser && !!window.appContext;
  }

  /**
   * Limpia recursos al destruir
   */
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
}

// Exportar instancia global
if (typeof window !== 'undefined') {
  window.AuthManager = AuthManager;
  window.authManager = new AuthManager();
}
