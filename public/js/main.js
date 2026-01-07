import { firebaseConfig } from './config.js';
import { FirebaseService } from './firebase-service.js';
import { DataService } from './data-service.js';
import { PdfService } from './pdf-service.js';
import { UiManager } from './ui-manager.js';
import { METADATA_TIENDAS } from './constants.js';

class App {
    constructor() {
        this.firebase = new FirebaseService(firebaseConfig);
        this.data = new DataService();
        this.pdf = new PdfService();
        this.ui = new UiManager();
        this.lastProcessedText = sessionStorage.getItem('last_huecos_text') || '';
    }

    async init() {
        console.log('🚀 Iniciando aplicación...');

        // Setup Store Selector
        this.ui.updateStoreSelector(METADATA_TIENDAS);

        // Set default dates
        const today = new Date().toISOString().split('T')[0];
        document.querySelectorAll('input[type="date"]').forEach(input => {
            input.value = today;
        });

        // Event Listeners
        this.setupEventListeners();

        // Load reference data
        try {
            const count = await this.data.cargarTablaReferencia();
            this.ui.showNotification(`Tabla cargada: ${count.toLocaleString()} SKUs`);
        } catch (e) {
            this.ui.showNotification('Error al cargar tabla de referencia', 'error');
        }

        // Init Firebase
        const ok = await this.firebase.init();
        if (ok) {
            document.getElementById('firebase-status-bar').className = 'firebase-status firebase-connected';
            document.getElementById('firebase-status-bar').innerHTML = '✅ Conectado a Firebase';

            // Load custom products
            const customProducts = await this.firebase.loadCustomProducts();
            customProducts.forEach(p => this.data.addReferenciaPersonalizada(p));
            if (customProducts.length > 0) {
                this.ui.showNotification(`${customProducts.length} productos personalizados cargados`);
            }

            // If we have text in session, help the user by processing it
            if (this.lastProcessedText) {
                setTimeout(() => {
                    const fecha = document.getElementById('fecha').value;
                    const idTienda = document.getElementById('select-tienda').value;
                    if (this.data.tablaReferencia.size > 0) {
                        try {
                            const result = this.data.procesarCSV(this.lastProcessedText, fecha, idTienda, METADATA_TIENDAS[idTienda]);
                            if (result.productosSinDepartamento.length > 0) {
                                this.ui.updateUnknownProducts(
                                    result.productosSinDepartamento,
                                    (data, div) => this.handleSaveCustomProduct(data, div),
                                    this.data.getListaPasillos()
                                );
                            }
                        } catch (e) { console.warn("Auto-process failed", e); }
                    }
                }, 1000);
            }

            // Recovery: Try to load last Stock Report from Firebase
            const savedStockRaw = await this.firebase.loadStockReportRaw();
            if (savedStockRaw) {
                console.log("♻️ Recuperando Reporte Stock desde Firebase...");
                this.data.procesarReporteStock(savedStockRaw);
            }
        } else {
            document.getElementById('firebase-status-bar').className = 'firebase-status firebase-error';
            document.getElementById('firebase-status-bar').innerHTML = '⚠️ Modo local (Sin Firebase)';
        }
    }

    setupEventListeners() {
        // Settings Toggle
        document.getElementById('btn-settings')?.addEventListener('click', () => {
            this.ui.toggleSettingsMenu();
        });

        // Navigation
        document.querySelectorAll('.menu-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.id.replace('btn-', '');
                if (id === 'metricas') {
                    window.location.href = 'metricas.html';
                    return;
                }
                this.ui.showSection(id);
                if (id === 'resumen') this.refreshResumen();
                if (id === 'historico') this.handleRefreshHistory();
            });
        });

        // Historial listeners
        document.getElementById('btn-actualizar-historial').addEventListener('click', () => this.handleRefreshHistory());

        // Ajustar Pasillo listeners
        document.getElementById('btn-buscar-ajuste').addEventListener('click', () => this.handleSearchAjuste());
        document.getElementById('btn-guardar-ajuste').addEventListener('click', () => this.handleSaveAjuste());
        document.getElementById('input-busqueda-ajuste').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearchAjuste();
        });

        // Process Data
        document.getElementById('btn-cargar-datos').addEventListener('click', async () => {
            const textarea = document.getElementById('texto-csv');
            const text = textarea.value;
            const fecha = document.getElementById('fecha').value;
            const idTienda = document.getElementById('select-tienda').value;

            if (!text || !fecha || !idTienda) {
                this.ui.showNotification('Faltan campos requeridos', 'error');
                return;
            }

            try {
                this.ui.showNotification('Procesando datos...', 'processing');
                const result = this.data.procesarCSV(text, fecha, idTienda, METADATA_TIENDAS[idTienda]);

                this.lastProcessedText = text;
                sessionStorage.setItem('last_huecos_text', text);

                textarea.value = '';
                document.getElementById('contador-lineas').textContent = '';

                if (result.productosSinDepartamento.length > 0) {
                    this.ui.showNotification(`Atención: ${result.productosSinDepartamento.length} productos desconocidos`, 'warning');
                    this.ui.updateUnknownProducts(
                        result.productosSinDepartamento,
                        (data, div) => this.handleSaveCustomProduct(data, div),
                        this.data.getListaPasillos()
                    );
                }

                this.ui.showNotification(`Procesado: ${result.lineasProcesadas} items`, 'success');

                this.ui.showSummaryModal(result, () => {
                    document.getElementById('fecha-reporte').value = fecha;
                    document.getElementById('pasillo-reporte').value = '';
                    document.getElementById('btn-generar-pdf').click();
                });

                this.ui.updateBadge(result.productosSinDepartamento.length > 0);

                if (this.firebase.ready) {
                    this.firebase.saveReport(result)
                        .then(() => this.ui.showNotification('Guardado en la nube ✅'))
                        .catch(e => this.ui.showNotification('Error guardando en la nube: ' + e.message, 'error'));
                }
            } catch (e) {
                this.ui.showNotification(e.message, 'error');
            }
        });

        // PDF Generation
        document.getElementById('btn-generar-pdf').addEventListener('click', async () => {
            const fecha = document.getElementById('fecha-reporte').value;
            const idTienda = document.getElementById('select-tienda').value;
            const pasillo = document.getElementById('pasillo-reporte').value;

            let report = this.data.getReportLocal(idTienda, fecha);
            if (!report && this.firebase.ready) {
                this.ui.showNotification('Cargando de la nube...', 'processing');
                report = await this.firebase.loadReport(idTienda, fecha);
                if (report) this.data.setReportLocal(idTienda, fecha, report);
            }

            if (!report) {
                this.ui.showNotification('No hay datos para esta fecha', 'error');
                return;
            }

            try {
                this.ui.showNotification('Generando PDF...', 'processing');
                const pdfData = await this.pdf.generateReport(report, pasillo);
                this.ui.showPdfModal(pdfData);
                this.ui.showNotification('PDF listo ✅');
            } catch (error) {
                this.ui.showNotification('Error al generar PDF: ' + error.message, 'error');
            }
        });

        // Load from Cloud
        document.getElementById('btn-cargar-desde-firebase').addEventListener('click', async () => {
            const fecha = document.getElementById('fecha-resumen').value;
            const idTienda = document.getElementById('select-tienda').value;

            this.ui.showNotification('Sincronizando...', 'processing');
            const data = await this.firebase.loadReport(idTienda, fecha);
            if (data) {
                this.data.setReportLocal(idTienda, fecha, data);
                this.refreshResumen();
                this.ui.showNotification('Datos actualizados');
            } else {
                this.ui.showNotification('No se encontraron datos en la nube', 'warning');
            }
        });

        // Import Stock Report
        document.getElementById('input-reporte-stock').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                this.ui.showNotification('Importando reporte stock...', 'processing');
                const text = await file.text();
                const { productos, suggestions } = this.data.procesarReporteStock(text);

                const finalizedSave = async (listToSave) => {
                    this.ui.showNotification(`Guardando ${listToSave.length} productos...`, 'processing');
                    for (const prod of listToSave) {
                        await this.firebase.saveCustomProductInfo(prod);
                    }

                    const fecha = document.getElementById('fecha').value;
                    const idTienda = document.getElementById('select-tienda').value;
                    const report = this.data.getReportLocal(idTienda, fecha);

                    if (report && this.lastProcessedText) {
                        const reprocessed = this.data.procesarCSV(
                            this.lastProcessedText,
                            fecha, idTienda, METADATA_TIENDAS[idTienda]
                        );
                        if (this.firebase.ready) await this.firebase.saveReport(reprocessed);

                        this.ui.updateUnknownProducts(
                            reprocessed.productosSinDepartamento,
                            (data, div) => this.handleSaveCustomProduct(data, div),
                            this.data.getListaPasillos()
                        );
                        this.ui.updateBadge(reprocessed.productosSinDepartamento.length > 0);
                    }

                    this.ui.showNotification('Sincronización completa ✅', 'success');
                    this.refreshResumen();
                    if (this.firebase.ready) await this.firebase.saveStockReportRaw(text);
                };

                if (suggestions.length > 0) {
                    this.ui.showBulkConfirmationModal(suggestions, async (confirmed) => {
                        confirmed.forEach(cluster => {
                            cluster.products.forEach(p => {
                                p.pasillo = cluster.aisle;
                                this.data.addReferenciaPersonalizada(p);
                            });
                        });
                        await finalizedSave(productos);
                    });
                } else if (productos.length > 0) {
                    await finalizedSave(productos);
                } else {
                    this.ui.showNotification('No se encontraron productos nuevos.', 'info');
                }

            } catch (error) {
                console.error(error);
                this.ui.showNotification('Error al importar reporte stock', 'error');
            } finally {
                e.target.value = '';
            }
        });

        // Reset History
        document.getElementById('btn-danger-reset')?.addEventListener('click', async () => {
            const confirmed = confirm("⚠️ ¿Borrar historial de reportes? (Los productos aprendidos se mantienen).");
            if (!confirmed) return;

            try {
                this.ui.showNotification('Limpiando historial...', 'processing');
                await this.firebase.clearHistoricalData();
                this.ui.showNotification('Historial reiniciado ✨');
                this.handleRefreshHistory();
                this.refreshResumen();
            } catch (e) {
                this.ui.showNotification('Error: ' + e.message, 'error');
            }
        });
    }

    async handleSaveCustomProduct(data, div) {
        this.ui.showNotification('Guardando...', 'processing');
        const ok = await this.firebase.saveCustomProductInfo(data);
        if (ok) {
            this.data.addReferenciaPersonalizada(data);
            this.ui.showNotification('Información guardada ✅');
            div.style.opacity = '0.5';
            div.style.pointerEvents = 'none';
            div.innerHTML = `<p style="text-align:center; padding:1rem; color:var(--success)">✅ SKU ${data.sku} Actualizado</p>`;
            setTimeout(() => div.remove(), 2000);
        } else {
            this.ui.showNotification('Error al guardar', 'error');
        }
    }

    refreshResumen() {
        const fecha = document.getElementById('fecha-resumen').value;
        const idTienda = document.getElementById('select-tienda').value;
        const data = this.data.getReportLocal(idTienda, fecha);

        const container = document.getElementById('resumen-contenido');
        if (!data) {
            container.innerHTML = '<div style="text-align:center; padding:3rem; color:#64748b;">No hay datos para mostrar.</div>';
            return;
        }

        const deptos = Object.entries(data.departamentos).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }));

        container.innerHTML = `
            <div style="margin-bottom: 2rem;">
                <h3 style="font-size: 1.25rem; font-weight: 700;">${data.nombreTienda}</h3>
                <p style="color: var(--text-muted)">Reporte del ${data.fecha}</p>
                <p style="margin-top: 0.5rem">Total: <strong>${data.totalItems}</strong> items</p>
            </div>
            <table class="resumen-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Departamento</th>
                        <th style="text-align:right">Cantidad</th>
                    </tr>
                </thead>
                <tbody>
                    ${deptos.map(([id, info]) => `
                        <tr>
                            <td><code style="background:#f1f5f9; padding:2px 4px; border-radius:4px">${id}</code></td>
                            <td>${info.nombre}</td>
                            <td style="text-align:right; font-weight:600">${info.cantidad}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async handleRefreshHistory() {
        if (!this.firebase.ready) return;
        try {
            this.ui.showNotification('Cargando historial...', 'processing');
            const idTienda = document.getElementById('select-tienda').value;
            const history = await this.firebase.getHistoricalSummaries(idTienda);
            this.ui.updateHistoryView(history, (tienda, fecha) => this.handleLoadHistoricalReport(tienda, fecha));
            this.ui.showNotification('Historial actualizado');
        } catch (error) {
            console.error(error);
            this.ui.showNotification('Error al cargar historial', 'error');
        }
    }

    async handleLoadHistoricalReport(idTienda, fecha) {
        try {
            this.ui.showNotification('Cargando reporte...', 'processing');
            const report = await this.firebase.loadReport(idTienda, fecha);
            if (report) {
                this.data.setReportLocal(idTienda, fecha, report);
                document.getElementById('fecha-resumen').value = fecha;
                document.getElementById('fecha-reporte').value = fecha;
                this.ui.showSection('resumen');
                this.refreshResumen();
                this.ui.showNotification(`Reporte del ${fecha} cargado`);
            }
        } catch (error) {
            console.error(error);
            this.ui.showNotification('Error al cargar reporte', 'error');
        }
    }

    handleSearchAjuste() {
        const query = document.getElementById('input-busqueda-ajuste').value;
        if (!query) {
            this.ui.showNotification('Ingresa un código para buscar', 'warning');
            return;
        }

        const product = this.data.buscarProducto(query);
        const detalleDiv = document.getElementById('detalle-ajuste');
        const vacioDiv = document.getElementById('resultado-vacio-ajuste');

        if (product) {
            detalleDiv.style.display = 'block';
            vacioDiv.style.display = 'none';

            // Populate Pasillo Select
            const selectPasillo = document.getElementById('ajuste-pasillo');
            let pasillos = this.data.getListaPasillos();

            // If product has a CURRENT aisle not in the list, add it
            if (product.pasillo && !pasillos.includes(product.pasillo)) {
                pasillos.push(product.pasillo);
                pasillos.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            }

            selectPasillo.innerHTML = '<option value="">-- Seleccionar --</option>';
            pasillos.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = p;
                selectPasillo.appendChild(opt);
            });

            document.getElementById('ajuste-descripcion').value = product.descripcion || '';
            document.getElementById('ajuste-pasillo').value = product.pasillo || '';
            document.getElementById('ajuste-depto').value = product.deptId || '';
            document.getElementById('ajuste-clase').value = product.clase || '';
            document.getElementById('ajuste-sku').value = product.sku || '';
            document.getElementById('ajuste-upc').value = product.upc || '';
        } else {
            detalleDiv.style.display = 'none';
            vacioDiv.style.display = 'block';
        }
    }

    async handleSaveAjuste() {
        const sku = document.getElementById('ajuste-sku').value;
        const upc = document.getElementById('ajuste-upc').value;
        const descripcion = document.getElementById('ajuste-descripcion').value;
        const pasillo = document.getElementById('ajuste-pasillo').value;
        const deptId = document.getElementById('ajuste-depto').value;
        const clase = document.getElementById('ajuste-clase').value;

        if (!sku || !descripcion || !pasillo || !deptId) {
            this.ui.showNotification('Completa todos los campos obligatorios', 'error');
            return;
        }

        const info = { sku, upc, descripcion, pasillo, deptId, clase };

        try {
            this.ui.showNotification('Guardando cambios permanentes...', 'processing');
            const ok = await this.firebase.saveCustomProductInfo(info);
            if (ok) {
                this.data.addReferenciaPersonalizada(info);
                this.ui.showNotification('Producto actualizado perpetuamente ✅');

                // Clear and hide
                document.getElementById('input-busqueda-ajuste').value = '';
                document.getElementById('detalle-ajuste').style.display = 'none';
            } else {
                throw new Error("No se pudo guardar en Firebase");
            }
        } catch (error) {
            console.error(error);
            this.ui.showNotification('Error al guardar: ' + error.message, 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
