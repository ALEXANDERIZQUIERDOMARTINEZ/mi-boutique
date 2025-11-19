/* ═══════════════════════════════════════════════════════════════════
   CHATBOT INTELIGENTE - MISHELL BOUTIQUE
   Motor de respuestas automáticas con IA básica
   ═══════════════════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Configuración Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBB55I4aWpH5hOtqK6FdNzZCuYCRm1siiI",
    authDomain: "mishell-boutique-admin.firebaseapp.com",
    projectId: "mishell-boutique-admin",
    storageBucket: "mishell-boutique-admin.firebasestorage.app",
    messagingSenderId: "399662956877",
    appId: "1:399662956877:web:084236f5bb3cf6f0a8f704"
};

// Usar nombre único para evitar conflictos con app.js
const chatbotApp = initializeApp(firebaseConfig, 'chatbot-app');
const db = getFirestore(chatbotApp);

// ═══════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DEL CHATBOT
// ═══════════════════════════════════════════════════════════════════

class Chatbot {
    constructor() {
        this.messagesContainer = document.getElementById('chatbot-messages');
        this.input = document.getElementById('chatbot-input');
        this.sendButton = document.getElementById('chatbot-send');
        this.typingIndicator = document.getElementById('chatbot-typing');
        this.conversationId = this.generateConversationId();
        this.productsCache = new Map();

        this.init();
        this.loadProducts();
    }

    init() {
        // Event listeners
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Mensaje de bienvenida
        setTimeout(() => {
            this.addBotMessage(
                '¡Hola! 👋 Soy el asistente virtual de Mishell Boutique. ¿En qué puedo ayudarte hoy?',
                [
                    'Ver catálogo',
                    'Buscar producto',
                    'Horarios y ubicación',
                    'Métodos de pago',
                    'Hablar con humano'
                ]
            );
        }, 500);
    }

    generateConversationId() {
        return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async loadProducts() {
        try {
            const productosSnapshot = await getDocs(collection(db, 'productos'));
            productosSnapshot.forEach(doc => {
                this.productsCache.set(doc.id, { id: doc.id, ...doc.data() });
            });
            console.log(`✅ ${this.productsCache.size} productos cargados`);
        } catch (error) {
            console.error('Error cargando productos:', error);
        }
    }

    sendMessage() {
        const message = this.input.value.trim();
        if (!message) return;

        // Agregar mensaje del usuario
        this.addUserMessage(message);
        this.input.value = '';

        // Procesar respuesta
        this.processMessage(message);

        // Guardar conversación en Firestore
        this.saveMessage('user', message);
    }

    addUserMessage(text) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chatbot-message user';
        messageEl.innerHTML = `
            <div class="chatbot-message-avatar">
                <i class="bi bi-person-fill"></i>
            </div>
            <div class="chatbot-message-content">
                <div class="chatbot-message-bubble">${this.escapeHtml(text)}</div>
                <div class="chatbot-message-time">${this.getCurrentTime()}</div>
            </div>
        `;
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    addBotMessage(text, quickReplies = []) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chatbot-message bot';

        let quickRepliesHtml = '';
        if (quickReplies.length > 0) {
            quickRepliesHtml = '<div class="chatbot-quick-replies">';
            quickReplies.forEach(reply => {
                quickRepliesHtml += `<button class="chatbot-quick-reply" onclick="chatbot.handleQuickReply('${this.escapeHtml(reply)}')">${reply}</button>`;
            });
            quickRepliesHtml += '</div>';
        }

        messageEl.innerHTML = `
            <div class="chatbot-message-avatar">
                <i class="bi bi-robot"></i>
            </div>
            <div class="chatbot-message-content">
                <div class="chatbot-message-bubble">${text}</div>
                <div class="chatbot-message-time">${this.getCurrentTime()}</div>
                ${quickRepliesHtml}
            </div>
        `;
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();

        // Guardar en Firestore
        this.saveMessage('bot', text);
    }

    showTyping() {
        this.typingIndicator.classList.add('active');
        this.scrollToBottom();
    }

    hideTyping() {
        this.typingIndicator.classList.remove('active');
    }

    async processMessage(message) {
        this.showTyping();

        // Simular delay de procesamiento
        await this.delay(800);

        const messageLower = message.toLowerCase();
        let response = null;

        // ═══════════════════════════════════════════════════════════════
        // MOTOR DE RESPUESTAS INTELIGENTES
        // ═══════════════════════════════════════════════════════════════

        // 1. SALUDOS
        if (this.matchesKeywords(messageLower, ['hola', 'buenas', 'buenos días', 'buenas tardes', 'buenos noches', 'hey', 'hi'])) {
            response = {
                text: '¡Hola! 😊 ¿En qué te puedo ayudar hoy?',
                quickReplies: ['Ver catálogo', 'Buscar producto', 'Horarios', 'Hablar con humano']
            };
        }

        // 2. CATÁLOGO
        else if (this.matchesKeywords(messageLower, ['catálogo', 'catalogo', 'productos', 'qué venden', 'que venden', 'ver ropa', 'mostrar'])) {
            response = {
                text: '📦 Tenemos una gran variedad de productos:\n\n• Blusas\n• Pantalones\n• Vestidos\n• Faldas\n• Accesorios\n\n¿Qué te gustaría ver?',
                quickReplies: ['Blusas', 'Vestidos', 'Pantalones', 'Todo']
            };
        }

        // 3. BÚSQUEDA DE PRODUCTOS
        else if (this.matchesKeywords(messageLower, ['buscar', 'tienes', 'tienen', 'hay', 'disponible', 'stock'])) {
            const products = await this.searchProducts(messageLower);
            if (products.length > 0) {
                response = { text: `Encontré ${products.length} producto(s):` };
                this.hideTyping();
                this.addBotMessage(response.text);
                products.slice(0, 3).forEach(product => this.addProductCard(product));
                return;
            } else {
                response = {
                    text: 'Lo siento, no encontré productos con esa descripción. 😔\n\n¿Quieres que te muestre todo el catálogo?',
                    quickReplies: ['Sí, mostrar todo', 'Buscar otra cosa', 'Hablar con humano']
                };
            }
        }

        // 4. PRECIOS
        else if (this.matchesKeywords(messageLower, ['precio', 'cuánto cuesta', 'cuanto cuesta', 'valor', 'cuánto vale'])) {
            response = {
                text: 'Los precios varían según el producto. 💰\n\n¿Qué producto específico te interesa? Puedo buscarlo para ti.',
                quickReplies: ['Buscar producto', 'Ver catálogo', 'Hablar con humano']
            };
        }

        // 5. HORARIOS
        else if (this.matchesKeywords(messageLower, ['horario', 'hora', 'abierto', 'cerrado', 'cuándo abren', 'cuando abren'])) {
            response = {
                text: '🕐 Nuestros horarios son:\n\n📅 Lunes a Sábado: 9:00 AM - 7:00 PM\n📅 Domingos: 10:00 AM - 5:00 PM\n\n¿Necesitas algo más?',
                quickReplies: ['Ubicación', 'Métodos de pago', 'Ver catálogo']
            };
        }

        // 6. UBICACIÓN
        else if (this.matchesKeywords(messageLower, ['ubicación', 'ubicacion', 'dirección', 'direccion', 'dónde', 'donde están', 'cómo llego'])) {
            response = {
                text: '📍 Estamos ubicados en:\n\n[Tu dirección aquí]\n\n¿Te gustaría que te envíe la ubicación por WhatsApp?',
                quickReplies: ['Sí, enviar ubicación', 'Horarios', 'Ver catálogo']
            };
        }

        // 7. MÉTODOS DE PAGO
        else if (this.matchesKeywords(messageLower, ['pago', 'pagar', 'efectivo', 'transferencia', 'tarjeta', 'cómo pago'])) {
            response = {
                text: '💳 Aceptamos:\n\n✅ Efectivo\n✅ Transferencia bancaria\n✅ Nequi/Daviplata\n✅ Tarjetas débito/crédito\n\n¿Algo más en que te pueda ayudar?',
                quickReplies: ['Ver catálogo', 'Horarios', 'Hablar con humano']
            };
        }

        // 8. ENVÍOS/DOMICILIOS
        else if (this.matchesKeywords(messageLower, ['envío', 'envio', 'domicilio', 'entrega', 'envían', 'envian'])) {
            response = {
                text: '🚚 ¡Sí! Hacemos envíos a domicilio.\n\nEl costo del envío depende de tu ubicación. ¿Quieres que te conecte con un asesor para calcular el envío?',
                quickReplies: ['Sí, conectar asesor', 'Ver catálogo', 'Métodos de pago']
            };
        }

        // 9. HABLAR CON HUMANO
        else if (this.matchesKeywords(messageLower, ['humano', 'persona', 'asesor', 'asesora', 'vendedor', 'vendedora', 'ayuda real'])) {
            response = {
                text: '👤 ¡Por supuesto! Te voy a conectar con un asesor por WhatsApp.\n\n¿Quieres que le envíe tu consulta?',
                quickReplies: ['Sí, conectar WhatsApp', 'No, seguir con el bot']
            };
        }

        // 10. AGRADECER
        else if (this.matchesKeywords(messageLower, ['gracias', 'muchas gracias', 'perfecto', 'ok', 'vale', 'genial', 'excelente'])) {
            response = {
                text: '😊 ¡De nada! ¿Hay algo más en lo que pueda ayudarte?',
                quickReplies: ['Ver catálogo', 'Buscar producto', 'No, eso es todo']
            };
        }

        // 11. DESPEDIDA
        else if (this.matchesKeywords(messageLower, ['adiós', 'adios', 'chao', 'hasta luego', 'nos vemos', 'bye'])) {
            response = {
                text: '👋 ¡Hasta pronto! Gracias por visitar Mishell Boutique. ¡Vuelve cuando quieras!',
                quickReplies: []
            };
        }

        // 12. RESPUESTA POR DEFECTO (No entendió)
        else {
            response = {
                text: '🤔 No estoy seguro de entender tu pregunta.\n\n¿Quieres que te conecte con un asesor humano?',
                quickReplies: ['Sí, hablar con humano', 'Ver catálogo', 'Buscar producto']
            };
        }

        this.hideTyping();
        this.addBotMessage(response.text, response.quickReplies || []);
    }

    handleQuickReply(text) {
        // Manejar respuestas rápidas especiales
        if (text === 'Sí, conectar WhatsApp' || text === 'Sí, conectar asesor' || text === 'Hablar con humano') {
            this.addUserMessage(text);
            this.showTyping();
            setTimeout(() => {
                this.hideTyping();
                this.addBotMessage('Perfecto! Te voy a redirigir a WhatsApp para que hables con un asesor. 📱');
                setTimeout(() => {
                    window.open('https://wa.me/573046084971?text=Hola,%20vengo%20del%20chatbot%20y%20necesito%20ayuda', '_blank');
                }, 1000);
            }, 500);
        } else if (text === 'No, eso es todo') {
            this.addUserMessage(text);
            this.showTyping();
            setTimeout(() => {
                this.hideTyping();
                this.addBotMessage('¡Perfecto! Que tengas un excelente día. 😊');
            }, 500);
        } else {
            // Para las demás, simular que el usuario escribió el texto
            this.input.value = text;
            this.sendMessage();
        }
    }

    async searchProducts(query) {
        const results = [];
        const keywords = query.split(' ').filter(word => word.length > 2);

        this.productsCache.forEach(product => {
            const productText = `${product.nombre} ${product.descripcion || ''} ${product.categoria || ''}`.toLowerCase();

            const score = keywords.reduce((acc, keyword) => {
                return acc + (productText.includes(keyword) ? 1 : 0);
            }, 0);

            if (score > 0) {
                results.push({ ...product, score });
            }
        });

        return results.sort((a, b) => b.score - a.score);
    }

    addProductCard(product) {
        const messageEl = document.createElement('div');
        messageEl.className = 'chatbot-message bot';

        const precio = product.precioMayor > 0
            ? `Detal: $${product.precioDetal?.toLocaleString()} / Mayor: $${product.precioMayor?.toLocaleString()}`
            : `$${product.precioDetal?.toLocaleString()}`;

        messageEl.innerHTML = `
            <div class="chatbot-message-avatar">
                <i class="bi bi-robot"></i>
            </div>
            <div class="chatbot-message-content">
                <div class="chatbot-message-bubble">
                    <div class="chatbot-product-card">
                        <img src="${product.imagenUrl || 'https://via.placeholder.com/60'}"
                             alt="${product.nombre}"
                             class="chatbot-product-image">
                        <div class="chatbot-product-info">
                            <div class="chatbot-product-name">${product.nombre}</div>
                            <div class="chatbot-product-price">${precio}</div>
                            <div class="chatbot-product-stock">
                                ${product.variaciones ? 'Varias tallas/colores disponibles' : 'Consultar disponibilidad'}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="chatbot-message-time">${this.getCurrentTime()}</div>
            </div>
        `;
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    matchesKeywords(text, keywords) {
        return keywords.some(keyword => text.includes(keyword));
    }

    async saveMessage(sender, message) {
        try {
            await addDoc(collection(db, 'chatConversations'), {
                conversationId: this.conversationId,
                sender, // 'user' or 'bot'
                message,
                timestamp: serverTimestamp()
            });
        } catch (error) {
            console.error('Error saving message:', error);
        }
    }

    getCurrentTime() {
        const now = new Date();
        return now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Inicializar chatbot cuando el DOM esté listo
let chatbot;
document.addEventListener('DOMContentLoaded', () => {
    chatbot = new Chatbot();

    // Toggle ventana del chat
    const chatButton = document.querySelector('.chatbot-button');
    const chatWindow = document.querySelector('.chatbot-window');
    const closeButton = document.querySelector('.chatbot-close');

    chatButton.addEventListener('click', () => {
        chatWindow.classList.toggle('active');
        chatButton.style.display = chatWindow.classList.contains('active') ? 'none' : 'flex';
    });

    closeButton.addEventListener('click', () => {
        chatWindow.classList.remove('active');
        chatButton.style.display = 'flex';
    });
});

// Exportar para usar en quick replies
window.chatbot = chatbot;
