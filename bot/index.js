require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, addDoc, query, where, serverTimestamp, onSnapshot, updateDoc, doc } = require('firebase/firestore');

// ─── Firebase ────────────────────────────────────────────────────────────────
const firebaseApp = initializeApp({
    apiKey:            process.env.FIREBASE_API_KEY,
    authDomain:        `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId:         process.env.FIREBASE_PROJECT_ID,
    storageBucket:     `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.FIREBASE_APP_ID,
});
const db = getFirestore(firebaseApp);

// ─── Estado por usuario ───────────────────────────────────────────────────────
// { [chatId]: { paso, carrito, categoriaActual, productosActuales, nombre, direccion } }
const sesiones = {};

function getSesion(chatId) {
    if (!sesiones[chatId]) {
        sesiones[chatId] = { paso: 'inicio', carrito: [], categoriaActual: null, productosActuales: [] };
    }
    return sesiones[chatId];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getProductos() {
    const snap = await getDocs(query(collection(db, 'productos'), where('disponible', '==', true)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function formatPrecio(n) {
    return `$${Number(n).toLocaleString('es-CO')}`;
}

function textoCarrito(carrito) {
    if (!carrito.length) return '🛒 Tu carrito está vacío.';
    let total = 0;
    let txt = '🛒 *Tu carrito:*\n';
    carrito.forEach((item, i) => {
        const sub = item.precio * item.cantidad;
        total += sub;
        txt += `${i + 1}. ${item.nombre} x${item.cantidad} — ${formatPrecio(sub)}\n`;
    });
    txt += `\n💰 *Total: ${formatPrecio(total)}*`;
    return txt;
}

function menuPrincipal() {
    return `✨ *Mishell Boutique* ✨\n\n¿Qué deseas hacer?\n\n1️⃣  Ver catálogo\n2️⃣  Ver mi carrito\n3️⃣  Finalizar pedido\n0️⃣  Empezar de nuevo\n\nResponde con el número de tu opción.`;
}

// ─── WhatsApp Client ──────────────────────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
    }
});

client.on('qr', qr => {
    console.log('\n📱 Escanea este QR con WhatsApp:\n');
    qrcode.generate(qr, { small: true });
});


client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
});

// ─── Lógica principal ─────────────────────────────────────────────────────────
client.on('message', async msg => {
    if (msg.isGroupMsg) return;
    if (msg.isStatus) return;
    if (msg.from === 'status@broadcast') return;
    const chatId = msg.from;
    const texto  = msg.body.trim().toLowerCase();
    const sesion = getSesion(chatId);

    try {
        // ── Siempre disponible ────────────────────────────────────────────────
        if (texto === '0' || texto === 'menu' || texto === 'inicio') {
            sesiones[chatId] = { paso: 'menu', carrito: sesion.carrito, categoriaActual: null, productosActuales: [] };
            await msg.reply(menuPrincipal());
            return;
        }

        // ── Paso: inicio / menu ───────────────────────────────────────────────
        if (sesion.paso === 'inicio' || sesion.paso === 'menu') {
            if (texto === '1' || texto.includes('catalogo') || texto.includes('catálogo') || texto.includes('producto')) {
                const productos = await getProductos();
                const categorias = [...new Set(productos.map(p => p.categoria).filter(Boolean))].sort();

                if (!categorias.length) {
                    await msg.reply('😔 No hay productos disponibles en este momento.\n\nEscribe *0* para volver al menú.');
                    return;
                }

                let txt = '📦 *Categorías disponibles:*\n\n';
                categorias.forEach((cat, i) => {
                    txt += `${i + 1}. ${cat}\n`;
                });
                txt += '\nResponde con el *número* de la categoría que deseas ver.';

                sesion.paso = 'elegir_categoria';
                sesion.categorias = categorias;
                await msg.reply(txt);

            } else if (texto === '2' || texto.includes('carrito')) {
                await msg.reply(textoCarrito(sesion.carrito) + '\n\nEscribe *0* para volver al menú.');

            } else if (texto === '3' || texto.includes('pedido') || texto.includes('finalizar')) {
                if (!sesion.carrito.length) {
                    await msg.reply('🛒 Tu carrito está vacío. Primero agrega productos.\n\nEscribe *0* para volver al menú.');
                    return;
                }
                sesion.paso = 'pedir_nombre';
                await msg.reply('📝 Para completar tu pedido necesito algunos datos.\n\n¿Cuál es tu *nombre completo*?');

            } else {
                await msg.reply(menuPrincipal());
            }
            return;
        }

        // ── Paso: elegir categoría ────────────────────────────────────────────
        if (sesion.paso === 'elegir_categoria') {
            const num = parseInt(texto);
            if (!sesion.categorias || num < 1 || num > sesion.categorias.length) {
                await msg.reply(`Por favor responde con un número del 1 al ${sesion.categorias?.length || '?'}.\n\nEscribe *0* para volver al menú.`);
                return;
            }

            const catElegida = sesion.categorias[num - 1];
            const productos  = await getProductos();
            const filtrados  = productos.filter(p => p.categoria === catElegida);

            if (!filtrados.length) {
                await msg.reply('😔 No hay productos en esta categoría. Escribe *0* para volver al menú.');
                return;
            }

            let txt = `👗 *${catElegida}*\n\n`;
            filtrados.forEach((p, i) => {
                txt += `${i + 1}. *${p.nombre}*\n`;
                txt += `   💰 ${formatPrecio(p.precioVenta || p.precio || 0)}`;
                if (p.stock !== undefined) txt += `  |  Stock: ${p.stock}`;
                txt += '\n\n';
            });
            txt += 'Responde con el *número* del producto que deseas agregar al carrito.\nEscribe *0* para volver al menú.';

            sesion.paso             = 'elegir_producto';
            sesion.categoriaActual  = catElegida;
            sesion.productosActuales = filtrados;
            await msg.reply(txt);
            return;
        }

        // ── Paso: elegir producto ─────────────────────────────────────────────
        if (sesion.paso === 'elegir_producto') {
            const num = parseInt(texto);
            if (!num || num < 1 || num > sesion.productosActuales.length) {
                await msg.reply(`Por favor responde con un número del 1 al ${sesion.productosActuales.length}.\n\nEscribe *0* para volver al menú.`);
                return;
            }

            const prod = sesion.productosActuales[num - 1];
            sesion.productoSeleccionado = prod;
            sesion.paso = 'elegir_cantidad';

            await msg.reply(`✅ *${prod.nombre}*\n💰 ${formatPrecio(prod.precioVenta || prod.precio || 0)}\n\n¿Cuántas unidades deseas? (Responde con el número)`);
            return;
        }

        // ── Paso: elegir cantidad ─────────────────────────────────────────────
        if (sesion.paso === 'elegir_cantidad') {
            const cant = parseInt(texto);
            if (!cant || cant < 1) {
                await msg.reply('Por favor responde con un número mayor a 0.');
                return;
            }

            const prod  = sesion.productoSeleccionado;
            const precio = prod.precioVenta || prod.precio || 0;

            // Actualizar carrito
            const existente = sesion.carrito.find(i => i.id === prod.id);
            if (existente) {
                existente.cantidad += cant;
            } else {
                sesion.carrito.push({ id: prod.id, nombre: prod.nombre, precio, cantidad: cant });
            }

            sesion.paso = 'menu';
            const total = sesion.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
            await msg.reply(
                `✅ *${prod.nombre} x${cant}* agregado al carrito!\n\n` +
                textoCarrito(sesion.carrito) +
                `\n\n¿Qué deseas hacer ahora?\n1️⃣ Seguir comprando\n3️⃣ Finalizar pedido\n0️⃣ Menú principal`
            );
            return;
        }

        // ── Paso: pedir nombre ────────────────────────────────────────────────
        if (sesion.paso === 'pedir_nombre') {
            sesion.nombre = msg.body.trim();
            sesion.paso   = 'pedir_direccion';
            await msg.reply(`Hola *${sesion.nombre}*! 👋\n\n¿Cuál es tu *dirección de entrega*? (ciudad, barrio, dirección)`);
            return;
        }

        // ── Paso: pedir dirección ─────────────────────────────────────────────
        if (sesion.paso === 'pedir_direccion') {
            sesion.direccion = msg.body.trim();
            sesion.paso      = 'confirmar_pedido';

            const resumen = textoCarrito(sesion.carrito);
            await msg.reply(
                `📋 *Resumen de tu pedido:*\n\n` +
                `👤 *Nombre:* ${sesion.nombre}\n` +
                `📍 *Dirección:* ${sesion.direccion}\n\n` +
                resumen +
                `\n\n¿Confirmas tu pedido?\n✅ Responde *SI* para confirmar\n❌ Responde *NO* para cancelar`
            );
            return;
        }

        // ── Paso: confirmar pedido ────────────────────────────────────────────
        if (sesion.paso === 'confirmar_pedido') {
            if (texto === 'si' || texto === 'sí' || texto === 's') {
                const total = sesion.carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);

                // Guardar en Firestore
                const pedidoRef = await addDoc(collection(db, 'pedidosWeb'), {
                    nombre:    sesion.nombre,
                    direccion: sesion.direccion,
                    telefono:  chatId.replace('@c.us', ''),
                    items:     sesion.carrito,
                    total,
                    canal:     'whatsapp-bot',
                    estado:    'pendiente',
                    fecha:     serverTimestamp(),
                });

                // Limpiar sesión
                sesiones[chatId] = { paso: 'menu', carrito: [], categoriaActual: null, productosActuales: [] };

                await msg.reply(
                    `🎉 *¡Pedido confirmado!*\n\n` +
                    `📦 N° de pedido: *${pedidoRef.id.slice(-6).toUpperCase()}*\n` +
                    `💰 Total: *${formatPrecio(total)}*\n\n` +
                    `En breve nos contactamos contigo para coordinar el pago y la entrega. ¡Gracias por comprar en Mishell Boutique! 💕\n\n` +
                    `Escribe *0* si deseas hacer otro pedido.`
                );

                console.log(`✅ Nuevo pedido de ${sesion.nombre} — ${formatPrecio(total)}`);

            } else if (texto === 'no' || texto === 'n') {
                sesion.paso = 'menu';
                await msg.reply('❌ Pedido cancelado. Tu carrito se mantuvo.\n\n' + menuPrincipal());
            } else {
                await msg.reply('Por favor responde *SI* para confirmar o *NO* para cancelar.');
            }
            return;
        }

        // ── Fallback ──────────────────────────────────────────────────────────
        sesion.paso = 'menu';
        await msg.reply(menuPrincipal());

    } catch (error) {
        console.error('Error procesando mensaje:', error);
        await msg.reply('😔 Ocurrió un error. Por favor escribe *0* para reiniciar.');
    }
});

// ─── Notificaciones de pedidos web ───────────────────────────────────────────
const OWNER_PHONE = process.env.OWNER_PHONE || '573017850041'; // número del dueño

function formatPrecioBot(n) {
    return `$${Number(n).toLocaleString('es-CO')}`;
}

client.on('ready', async () => {
    console.log('✅ Bot de Mishell Boutique conectado y listo!');

    // Escuchar pedidos nuevos sin notificar (notificadoBot != true)
    const pedidosQuery = query(
        collection(db, 'pedidosWeb'),
        where('notificadoBot', '==', false)
    );

    onSnapshot(pedidosQuery, async (snapshot) => {
        for (const change of snapshot.docChanges()) {
            if (change.type !== 'added') continue;

            const pedido = change.doc.data();
            const pedidoId = change.doc.id;

            try {
                // Marcar primero para evitar doble envío
                await updateDoc(doc(db, 'pedidosWeb', pedidoId), { notificadoBot: true });

                const items = (pedido.items || [])
                    .map(i => `  • ${i.nombre}${i.talla ? ' T:' + i.talla : ''}${i.color ? ' C:' + i.color : ''} x${i.cantidad} — ${formatPrecioBot(i.total || i.precio * i.cantidad)}`)
                    .join('\n');

                const tipo = pedido.tipoVenta === 'Mayorista' ? '🏪 *MAYORISTA*' : '🛍️ *DETAL*';
                const msg =
                    `🔔 *NUEVO PEDIDO WEB* #${pedidoId.slice(-6).toUpperCase()}\n` +
                    `${tipo}\n\n` +
                    `👤 ${pedido.clienteNombre}\n` +
                    `📞 ${pedido.clienteCelular}\n` +
                    `🪪 CC: ${pedido.clienteCedula}\n` +
                    `📍 ${pedido.clienteCiudad}${pedido.clienteBarrio ? ', ' + pedido.clienteBarrio : ''}\n` +
                    `   ${pedido.clienteDireccion}\n` +
                    (pedido.observaciones ? `📝 ${pedido.observaciones}\n` : '') +
                    `\n*Productos:*\n${items}\n\n` +
                    `💳 Pago: ${pedido.metodoPagoSolicitado}\n` +
                    `📦 Envío: ${formatPrecioBot(pedido.costoEnvio || 0)}\n` +
                    `💰 *Total: ${formatPrecioBot(pedido.totalPedido)}*`;

                await client.sendMessage(`${OWNER_PHONE}@c.us`, msg);
                console.log(`✅ Notificación enviada al dueño — Pedido #${pedidoId.slice(-6).toUpperCase()}`);

            } catch (err) {
                console.error(`❌ Error notificando pedido ${pedidoId}:`, err.message);
            }
        }
    });
});

client.initialize();
