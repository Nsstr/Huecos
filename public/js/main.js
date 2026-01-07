import { METADATA_TIENDAS } from './constants.js';
import { FirebaseService } from './firebase-service.js';
import { DataService } from './data-service.js';
import { PdfService } from './pdf-service.js';
import { UiManager } from './ui-manager.js';

const firebaseConfig = {
    apiKey: "AIzaSyBvL_rQFZf8427SuBG8Ua_7YNlNY9kclZ4",
    authDomain: "huecos-96c8c.firebaseapp.com",
    projectId: "huecos-96c8c",
    storageBucket: "huecos-96c8c.firebasestorage.app",
    messagingSenderId: "545038530680",
    appId: "1:545038530680:web:8a3bfdc4334a0ea0b4d58d",
    measurementId: "G-0YDTR33E5S"
};

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

                // Store for re-processing if reference data changes
                this.lastProcessedText = text;
                sessionStorage.setItem('last_huecos_text', text);

                // Clear textarea
                textarea.value = '';
                document.getElementById('contador-lineas').textContent = '';

                // Handle unknown products
                if (result.productosSinDepartamento.length > 0) {
                    this.ui.showNotification(`Atención: ${result.productosSinDepartamento.length} productos desconocidos`, 'warning');
                    this.ui.updateUnknownProducts(
                        result.productosSinDepartamento,
                        (data, div) => this.handleSaveCustomProduct(data, div),
                        this.data.getListaPasillos()
                    );
                }

                this.ui.showNotification(`Procesado: ${result.lineasProcesadas} items`, 'success');

                // Show Summary Modal automatically
                this.ui.showSummaryModal(result, () => {
                    // Trigger PDF generation if user clicks the button
                    document.getElementById('fecha-reporte').value = fecha;
                    document.getElementById('pasillo-reporte').value = '';
                    document.getElementById('btn-generar-pdf').click();
                });

                // Update Notification Badge
                const hasUnknown = result.productosSinDepartamento && result.productosSinDepartamento.length > 0;
                this.ui.updateBadge(hasUnknown);

                // Background save
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
                const nuevos = this.data.procesarReporteStock(text);

                if (nuevos.length > 0) {
                    this.ui.showNotification(`${nuevos.length} productos nuevos encontrados`, 'success');

                    // Save all to Firebase
                    for (const prod of nuevos) {
                        await this.firebase.saveCustomProductInfo(prod);
                    }

                    // Update current report view if necessary
                    const fecha = document.getElementById('fecha').value;
                    const idTienda = document.getElementById('select-tienda').value;
                    const report = this.data.getReportLocal(idTienda, fecha);
                    if (report) {
                        // Re-process current report to apply new info
                        const reprocessed = this.data.procesarCSV(
                            this.lastProcessedText || '',
                            fecha, idTienda, METADATA_TIENDAS[idTienda]
                        );

                        // Save re-processed report to Firebase so it's persisted
                        if (this.firebase.ready) {
                            await this.firebase.saveReport(reprocessed);
                        }

                        this.ui.updateUnknownProducts(
                            reprocessed.productosSinDepartamento,
                            (data, div) => this.handleSaveCustomProduct(data, div),
                            this.data.getListaPasillos()
                        );
                        // Refresh Resumen view
                        this.refreshResumen();
                    }
                } else {
                    this.ui.showNotification('No se encontraron productos nuevos en este reporte', 'warning');
                }

                // Save raw text to Firebase for recovery
                if (this.firebase.ready) {
                    await this.firebase.saveStockReportRaw(text);
                }
            } catch (error) {
                console.error(error);
                this.ui.showNotification('Error al importar reporte stock', 'error');
            } finally {
                e.target.value = ''; // Reset input
            }
        });

        // Danger Zone: Reset History
        document.getElementById('btn-danger-reset')?.addEventListener('click', async () => {
            const confirmed = confirm("⚠️ ¿Quieres borrar el historial de reportes? (La información aprendida de productos se mantendrá intacta).");
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
        if (!this.firebase.ready) {
            this.ui.showNotification('Firebase no está conectado', 'error');
            return;
        }

        try {
            this.ui.showNotification('Cargando historial...', 'processing');
            const idTienda = document.getElementById('select-tienda').value;
            const history = await this.firebase.getHistoricalSummaries(idTienda);
            this.ui.updateHistoryView(history, (tienda, fecha) => this.handleLoadHistoricalReport(tienda, fecha));
            this.ui.showNotification('Historial actualizado');
        } catch (error) {
            console.error(error);
            this.ui.showNotification('Error al cargar historial: ' + error.message, 'error');
        }
    }

    async handleLoadHistoricalReport(idTienda, fecha) {
        try {
            this.ui.showNotification('Cargando reporte...', 'processing');
            const report = await this.firebase.loadReport(idTienda, fecha);
            if (report) {
                this.data.setReportLocal(idTienda, fecha, report);

                // Update UI dates to match the loaded report
                document.getElementById('fecha-resumen').value = fecha;
                document.getElementById('fecha-reporte').value = fecha;

                this.ui.showSection('resumen');
                this.refreshResumen();
                this.ui.showNotification(`Reporte del ${fecha} cargado`);
            }
        } catch (error) {
            console.error(error);
            this.ui.showNotification('Error al cargar reporte: ' + error.message, 'error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
