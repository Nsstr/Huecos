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
        } else {
            document.getElementById('firebase-status-bar').className = 'firebase-status firebase-error';
            document.getElementById('firebase-status-bar').innerHTML = '⚠️ Modo local (Sin Firebase)';
        }
    }

    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.id.replace('btn-', '');
                this.ui.showSection(id);
                if (id === 'resumen') this.refreshResumen();
            });
        });

        // Process Data
        document.getElementById('btn-cargar-datos').addEventListener('click', async () => {
            const text = document.getElementById('texto-csv').value;
            const fecha = document.getElementById('fecha').value;
            const idTienda = document.getElementById('select-tienda').value;

            if (!text || !fecha || !idTienda) {
                this.ui.showNotification('Faltan campos requeridos', 'error');
                return;
            }

            try {
                this.ui.showNotification('Procesando datos...', 'processing');
                const result = this.data.procesarCSV(text, fecha, idTienda, METADATA_TIENDAS[idTienda]);
                this.ui.showNotification(`Procesado: ${result.lineasProcesadas} items`, 'success');

                // Switch to resumo
                this.ui.showSection('resumen');
                this.refreshResumen();

                // Save to firebase in background
                if (this.firebase.ready) {
                    this.firebase.saveReport(result)
                        .then(() => this.ui.showNotification('Guardado en la nube ✅'))
                        .catch(e => this.ui.showNotification('Error guardando en la nube', 'error'));
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

            this.ui.showNotification('Generando PDF...', 'processing');
            const url = await this.pdf.generateReport(report, pasillo);
            window.open(url, '_blank');
            this.ui.showNotification('PDF listo ✅');
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

        const deptos = Object.entries(data.departamentos).sort((a, b) => b[1].cantidad - a[1].cantidad);

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
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
