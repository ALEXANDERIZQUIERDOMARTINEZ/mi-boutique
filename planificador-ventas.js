// ============================================================
// PLANIFICADOR DE VENTAS DINÁMICO CON IA
// Sistema completo: Input minimalista + Motor adaptativo + Mix productos + Burndown + Coach IA
// ============================================================
(function() {
    console.log("🚀 Inicializando Planificador de Ventas Dinámico con IA...");

    const btnGenerarPlan = document.getElementById('btn-generar-plan');
    const planContainer = document.getElementById('plan-ventas-container');

    let metaActual = null; // Variable global para la meta activa

    // ===============================
    // BOTÓN: GENERAR PLAN AUTOMÁTICO
    // ===============================
    if (btnGenerarPlan) {
        btnGenerarPlan.addEventListener('click', async () => {
            const montoInput = document.getElementById('meta-monto-simple').value.trim();
            const fechaLimite = document.getElementById('meta-fecha-simple').value;

            if (!montoInput || !fechaLimite) {
                alert('⚠️ Por favor ingresa el monto y la fecha límite');
                return;
            }

            const monto = parseFloat(eliminarFormatoNumero(montoInput));
            if (isNaN(monto) || monto <= 0) {
                alert('⚠️ El monto debe ser un número válido mayor a 0');
                return;
            }

            // Mostrar loading
            planContainer.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary mb-3" role="status">
                        <span class="visually-hidden">Generando plan...</span>
                    </div>
                    <p class="text-muted">🤖 La IA está analizando tu historial y generando el plan perfecto...</p>
                </div>
            `;

            try {
                // Guardar o actualizar meta en Firebase
                const metaData = {
                    montoObjetivo: monto,
                    fechaLimite: fechaLimite,
                    fechaCreacion: new Date(),
                    activa: true
                };

                // Buscar si ya existe una meta activa
                const metasSnapshot = await getDocs(query(metasCollection, where('activa', '==', true)));

                if (!metasSnapshot.empty) {
                    // Actualizar meta existente
                    const metaExistenteDoc = metasSnapshot.docs[0];
                    await updateDoc(doc(db, 'metas', metaExistenteDoc.id), metaData);
                    metaActual = { id: metaExistenteDoc.id, ...metaData };
                } else {
                    // Crear nueva meta
                    const nuevaMeta = await addDoc(metasCollection, metaData);
                    metaActual = { id: nuevaMeta.id, ...metaData };
                }

                // Generar y mostrar el plan completo
                await generarYMostrarPlan(metaActual);

                showToast('✅ Plan generado exitosamente', 'success');
            } catch (error) {
                console.error('Error generando plan:', error);
                planContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="bi bi-exclamation-triangle"></i>
                        Error generando el plan. Intenta de nuevo.
                    </div>
                `;
            }
        });
    }

    // ===============================
    // GENERAR Y MOSTRAR PLAN COMPLETO
    // ===============================
    async function generarYMostrarPlan(meta) {
        // 1. Analizar ventas históricas
        const ventasHistoricas = await obtenerVentasHistoricas();
        const promediosPorDia = calcularPromediosPorDia(ventasHistoricas);

        // 2. Calcular progreso actual
        const ventasActuales = await calcularVentasDesde(meta.fechaCreacion);

        // 3. Motor de recálculo dinámico
        const planDiario = calcularPlanDinamico(meta, ventasActuales, promediosPorDia);

        // 4. Mix de productos recomendado
        const mixProductos = await calcularMixProductos(planDiario.metaHoy);

        // 5. Análisis de progreso (Burndown)
        const analisisProgreso = analizarProgreso(meta, ventasActuales, planDiario);

        // 6. Coach con IA
        const recomendacionesIA = await generarRecomendacionesCoach(meta, analisisProgreso, mixProductos);

        // Renderizar vista completa
        renderizarPlanCompleto(meta, planDiario, mixProductos, analisisProgreso, recomendacionesIA);
    }

    // ===============================
    // MOTOR DINÁMICO: RECÁLCULO DIARIO
    // ===============================
    function calcularPlanDinamico(meta, ventasActuales, promediosPorDia) {
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const fechaLimite = new Date(meta.fechaLimite);
        fechaLimite.setHours(23, 59, 59, 999);

        const diasRestantes = Math.ceil((fechaLimite - hoy) / (1000 * 60 * 60 * 24));
        const faltante = meta.montoObjetivo - ventasActuales;

        // Si ya se cumplió la meta
        if (faltante <= 0) {
            return {
                diasRestantes: 0,
                faltante: 0,
                metaHoy: 0,
                metaDiaria: 0,
                tablaDias: []
            };
        }

        // LÓGICA DE REBALSE: Redistribuir faltante entre días restantes
        const metaDiariaPromedio = faltante / Math.max(diasRestantes, 1);

        // Generar tabla día por día
        const tablaDias = [];
        let fechaActual = new Date(hoy);

        for (let i = 0; i < Math.min(diasRestantes, 30); i++) {
            const diaSemana = fechaActual.getDay();
            const nombreDia = promediosPorDia[diaSemana].nombre;
            const porcentajeDia = promediosPorDia[diaSemana].porcentajeDelTotal;

            // Ajustar meta según patrón histórico del día
            const ajuste = porcentajeDia / 14.28; // 14.28 = 100/7 (promedio uniforme)
            const metaAjustada = metaDiariaPromedio * ajuste;

            tablaDias.push({
                fecha: new Date(fechaActual),
                nombreDia: nombreDia,
                meta: metaAjustada,
                esHoy: i === 0
            });

            fechaActual.setDate(fechaActual.getDate() + 1);
        }

        return {
            diasRestantes,
            faltante,
            metaHoy: tablaDias[0]?.meta || 0,
            metaDiaria: metaDiariaPromedio,
            tablaDias
        };
    }

    // ===============================
    // MIX DE PRODUCTOS RECOMENDADO
    // ===============================
    async function calcularMixProductos(metaHoy) {
        try {
            const productosSnapshot = await getDocs(productsCollection);
            const productos = [];

            productosSnapshot.forEach(doc => {
                const producto = doc.data();
                const costoCompra = parseFloat(producto.costoCompra) || 0;
                const precioDetal = parseFloat(producto.precioDetal) || 0;
                const variaciones = producto.variaciones || [];

                const stockTotal = variaciones.reduce((sum, v) => sum + (parseInt(v.stock, 10) || 0), 0);
                const margen = precioDetal - costoCompra;

                if (stockTotal > 0 && margen > 0) {
                    productos.push({
                        id: doc.id,
                        nombre: producto.nombre,
                        precio: precioDetal,
                        margen: margen,
                        stock: stockTotal,
                        rentabilidad: margen / costoCompra // ROI
                    });
                }
            });

            // Ordenar por rentabilidad (mayor ROI primero)
            productos.sort((a, b) => b.rentabilidad - a.rentabilidad);

            // Calcular mix para alcanzar la meta de hoy
            const mix = [];
            let montoAcumulado = 0;

            for (const producto of productos.slice(0, 5)) { // Top 5 productos
                if (montoAcumulado >= metaHoy) break;

                const faltante = metaHoy - montoAcumulado;
                const unidadesNecesarias = Math.ceil(faltante / producto.precio);
                const unidadesRecomendadas = Math.min(unidadesNecesarias, producto.stock);

                if (unidadesRecomendadas > 0) {
                    mix.push({
                        ...producto,
                        unidades: unidadesRecomendadas,
                        subtotal: unidadesRecomendadas * producto.precio
                    });
                    montoAcumulado += unidadesRecomendadas * producto.precio;
                }
            }

            return mix;
        } catch (error) {
            console.error('Error calculando mix de productos:', error);
            return [];
        }
    }

    // ===============================
    // ANÁLISIS DE PROGRESO (BURNDOWN)
    // ===============================
    function analizarProgreso(meta, ventasActuales, planDiario) {
        const fechaInicio = new Date(meta.fechaCreacion);
        const fechaLimite = new Date(meta.fechaLimite);
        const hoy = new Date();

        const diasTotales = Math.ceil((fechaLimite - fechaInicio) / (1000 * 60 * 60 * 24));
        const diasTranscurridos = Math.ceil((hoy - fechaInicio) / (1000 * 60 * 60 * 24));

        const progresoReal = (ventasActuales / meta.montoObjetivo) * 100;
        const progresoEsperado = (diasTranscurridos / diasTotales) * 100;

        const vaBien = progresoReal >= progresoEsperado;
        const diferenciaPorcentual = progresoReal - progresoEsperado;

        return {
            progresoReal,
            progresoEsperado,
            vaBien,
            diferenciaPorcentual,
            ventasActuales,
            metaTotal: meta.montoObjetivo,
            diasTranscurridos,
            diasTotales
        };
    }

    // ===============================
    // COACH CON IA: RECOMENDACIONES CONTEXTUALES
    // ===============================
    async function generarRecomendacionesCoach(meta, analisis, mixProductos) {
        const hoy = new Date();
        const nombreDia = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][hoy.getDay()];

        let recomendaciones = [];

        // Análisis de brecha
        if (analisis.vaBien) {
            recomendaciones.push({
                tipo: 'exito',
                titulo: '🎉 ¡Vas por buen camino!',
                mensaje: `Llevas ${analisis.progresoReal.toFixed(1)}% de avance con ${analisis.progresoEsperado.toFixed(1)}% del tiempo transcurrido. Estás ${Math.abs(analisis.diferenciaPorcentual).toFixed(1)}% adelantado.`
            });
        } else {
            recomendaciones.push({
                tipo: 'alerta',
                titulo: '⚠️ Necesitas acelerar el ritmo',
                mensaje: `Llevas ${analisis.progresoReal.toFixed(1)}% de avance pero ya pasó ${analisis.progresoEsperado.toFixed(1)}% del tiempo. Estás ${Math.abs(analisis.diferenciaPorcentual).toFixed(1)}% rezagado.`
            });
        }

        // Estrategia contextual según día de la semana
        if (['Viernes', 'Sábado'].includes(nombreDia) && !analisis.vaBien) {
            recomendaciones.push({
                tipo: 'estrategia',
                titulo: '💡 Estrategia para el fin de semana',
                mensaje: `Como hoy es ${nombreDia} y vas rezagado, aprovecha que es un día de mayores ventas. Considera lanzar una promoción flash en tus productos más rentables.`
            });
        }

        // Recomendación de productos
        if (mixProductos.length > 0) {
            const top3 = mixProductos.slice(0, 3).map(p => p.nombre).join(', ');
            recomendaciones.push({
                tipo: 'productos',
                titulo: '🎯 Enfócate en estos productos',
                mensaje: `Para maximizar tu utilidad hoy, concéntrate en: ${top3}. Son los que tienen mejor margen de ganancia.`
            });
        }

        return recomendaciones;
    }

    // Continúa en siguiente mensaje por límite de caracteres...
