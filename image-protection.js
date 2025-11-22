/* ═══════════════════════════════════════════════════════════════════
   PROTECCIÓN AVANZADA DE IMÁGENES - MISHELL BOUTIQUE
   Sistema de marca de agua y protección anti-copia
   ═══════════════════════════════════════════════════════════════════ */

class ImageProtection {
    constructor() {
        this.watermarkText = 'MISHELL BOUTIQUE';
        this.watermarkOpacity = 0.15;
        this.watermarkColor = '#D988B9';
        this.watermarkSize = 30;
        this.init();
    }

    init() {
        console.log('🔒 Sistema de protección de imágenes inicializado');

        // Aplicar marca de agua a imágenes existentes
        this.applyWatermarkToExistingImages();

        // Observar nuevas imágenes
        this.observeNewImages();
    }

    /**
     * Crear canvas con marca de agua
     * @param {HTMLImageElement} img - Imagen original
     * @returns {string} - Data URL de la imagen con marca de agua
     */
    createWatermarkedImage(img) {
        try {
            // Crear canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Establecer dimensiones del canvas
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;

            // Dibujar imagen original
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Configurar marca de agua
            ctx.globalAlpha = this.watermarkOpacity;
            ctx.fillStyle = this.watermarkColor;
            ctx.font = `bold ${this.watermarkSize}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Rotar texto en diagonal
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(-Math.PI / 6); // -30 grados

            // Dibujar marca de agua múltiples veces
            const spacing = 200;
            for (let y = -canvas.height; y < canvas.height * 2; y += spacing) {
                for (let x = -canvas.width; x < canvas.width * 2; x += spacing) {
                    ctx.fillText(this.watermarkText, x, y);
                }
            }

            ctx.restore();
            ctx.globalAlpha = 1.0;

            // Retornar imagen con marca de agua como data URL
            return canvas.toDataURL('image/jpeg', 0.95);

        } catch (error) {
            console.error('Error aplicando marca de agua:', error);
            return null;
        }
    }

    /**
     * Aplicar marca de agua a una imagen específica
     * @param {HTMLImageElement} img - Imagen a proteger
     */
    applyWatermarkToImage(img) {
        // Solo aplicar a imágenes de productos (no logos, iconos, etc.)
        if (!img.classList.contains('modal-product-image') &&
            !img.closest('.product-card')) {
            return;
        }

        // Esperar a que la imagen cargue completamente
        if (!img.complete) {
            img.addEventListener('load', () => this.processImage(img), { once: true });
        } else {
            this.processImage(img);
        }
    }

    /**
     * Procesar imagen y aplicar marca de agua
     * @param {HTMLImageElement} img - Imagen a procesar
     */
    processImage(img) {
        // Evitar procesar si ya tiene marca de agua
        if (img.dataset.watermarked === 'true') {
            return;
        }

        // Solo aplicar a imágenes válidas (no placeholders)
        if (img.src.includes('placeholder') || !img.src.startsWith('http')) {
            return;
        }

        // Crear imagen con marca de agua
        const watermarkedSrc = this.createWatermarkedImage(img);

        if (watermarkedSrc) {
            // Guardar src original (por si se necesita)
            img.dataset.originalSrc = img.src;

            // Reemplazar con imagen con marca de agua
            img.src = watermarkedSrc;

            // Marcar como procesada
            img.dataset.watermarked = 'true';

            console.log('✅ Marca de agua aplicada a imagen');
        }
    }

    /**
     * Aplicar marca de agua a todas las imágenes existentes
     */
    applyWatermarkToExistingImages() {
        const productImages = document.querySelectorAll('.product-card img, .modal-product-image');
        productImages.forEach(img => this.applyWatermarkToImage(img));
    }

    /**
     * Observar nuevas imágenes agregadas al DOM
     */
    observeNewImages() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'IMG') {
                        this.applyWatermarkToImage(node);
                    }

                    if (node.querySelectorAll) {
                        const images = node.querySelectorAll('.product-card img, .modal-product-image');
                        images.forEach(img => this.applyWatermarkToImage(img));
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Desactivar marca de agua (solo para debugging)
     */
    disable() {
        console.warn('⚠️ Marca de agua desactivada');
        const images = document.querySelectorAll('img[data-watermarked="true"]');
        images.forEach(img => {
            if (img.dataset.originalSrc) {
                img.src = img.dataset.originalSrc;
                img.dataset.watermarked = 'false';
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN Y EXPORTACIÓN
// ═══════════════════════════════════════════════════════════════════

// NOTA: Descomenta la siguiente línea para activar marca de agua visible
// const imageProtection = new ImageProtection();

// Exportar para uso manual si es necesario
export default ImageProtection;
