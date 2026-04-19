require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, onSnapshot, updateDoc, doc } = require('firebase/firestore');

// ─── Firebase ─────────────────────────────────────────────────────────────────
const firebaseApp = initializeApp({
    apiKey:            process.env.FIREBASE_API_KEY,
    authDomain:        `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com`,
    projectId:         process.env.FIREBASE_PROJECT_ID,
    storageBucket:     `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.FIREBASE_APP_ID,
});
const db = getFirestore(firebaseApp);

// ─── Configuración ────────────────────────────────────────────────────────────
const OWNER_PHONE = process.env.OWNER_PHONE || '573017850041';

function formatPrecio(n) {
    return `$${Number(n).toLocaleString('es-CO')}`;
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

// ─── Al conectar: escuchar pedidos nuevos ─────────────────────────────────────
client.on('ready', async () => {
    console.log('✅ Bot de Mishell Boutique conectado y listo!');

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
                await updateDoc(doc(db, 'pedidosWeb', pedidoId), { notificadoBot: true });

                const items = (pedido.items || [])
                    .map(i => `  • ${i.nombre}${i.talla ? ' T:' + i.talla : ''}${i.color ? ' C:' + i.color : ''} x${i.cantidad} — ${formatPrecio(i.total || i.precio * i.cantidad)}`)
                    .join('\n');

                const tipo = pedido.tipoVenta === 'Mayorista' ? '🏪 *MAYORISTA*' : '🛍️ *DETAL*';

                const pagoStr = pedido.metodoPagoSolicitado +
                    (pedido.tipoTransferencia ? ` (${pedido.tipoTransferencia})` : '');

                const mensaje =
                    `🔔 *NUEVO PEDIDO* #${pedidoId.slice(-6).toUpperCase()}\n` +
                    `${tipo}\n\n` +
                    `👤 ${pedido.clienteNombre}\n` +
                    `📞 ${pedido.clienteCelular}\n` +
                    `🪪 CC: ${pedido.clienteCedula}\n` +
                    `📍 ${pedido.clienteCiudad}${pedido.clienteBarrio ? ', ' + pedido.clienteBarrio : ''}\n` +
                    `   ${pedido.clienteDireccion}\n` +
                    (pedido.observaciones ? `📝 ${pedido.observaciones}\n` : '') +
                    `\n*Productos:*\n${items}\n\n` +
                    `💳 Pago: ${pagoStr}\n` +
                    `📦 Envío: ${formatPrecio(pedido.costoEnvio || 0)}\n` +
                    `💰 *Total: ${formatPrecio(pedido.totalPedido)}*` +
                    (pedido.comprobanteUrl ? `\n\n🧾 *Comprobante:*\n${pedido.comprobanteUrl}` : '');

                await client.sendMessage(`${OWNER_PHONE}@c.us`, mensaje);
                console.log(`✅ Pedido #${pedidoId.slice(-6).toUpperCase()} notificado al dueño`);

            } catch (err) {
                console.error(`❌ Error notificando pedido ${pedidoId}:`, err.message);
            }
        }
    });
});

client.initialize();
