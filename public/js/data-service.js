import { MAPA_DEPARTAMENTOS } from './constants.js';

export class DataService {
    constructor() {
        this.tablaReferencia = new Map(); // sku -> {descripcion, deptId, pasillo, upc}
        this.datosLocales = new Map(); // key -> data
    }

    async cargarTablaReferencia(url = './data.csv') {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);

            const csvText = await response.text();
            const lineas = csvText.split('\n').filter(linea => linea.trim() !== '');

            // Skip header
            for (let i = 1; i < lineas.length; i++) {
                const partes = lineas[i].split(',').map(p => p.trim().replace(/"/g, ''));
                if (partes.length >= 6) {
                    const [sku, , deptId, pasillo, descripcion, upc] = partes;
                    if (sku && deptId) {
                        this.tablaReferencia.set(sku, {
                            descripcion,
                            deptId,
                            pasillo,
                            upc
                        });
                    }
                }
            }
            return this.tablaReferencia.size;
        } catch (error) {
            console.error('❌ Error cargando tabla de referencia:', error);
            throw error;
        }
    }

    procesarCSV(texto, fecha, idTienda, metadataTienda) {
        if (this.tablaReferencia.size === 0) throw new Error("Tabla de referencia no cargada");

        const lineas = texto.split('\n').map(l => l.trim()).filter(l => l !== '');
        const lineasDatos = lineas.slice(1);

        const departamentos = {};
        let totalItems = 0;
        let lineasProcesadas = 0;
        const productosSinDepartamento = [];
        const productosConInfo = [];

        for (const linea of lineasDatos) {
            const partes = linea.split(',').map(p => p.trim());
            if (partes.length >= 8) {
                const sku = partes[0];
                const stock = parseInt(partes[7]) || 0;

                if (sku && sku !== 'sku/item') {
                    const info = this.tablaReferencia.get(sku);

                    if (info) {
                        const { deptId, descripcion, pasillo, upc } = info;
                        const nombreDepto = MAPA_DEPARTAMENTOS[deptId] || `Depto ${deptId}`;

                        if (!departamentos[deptId]) {
                            departamentos[deptId] = { nombre: nombreDepto, cantidad: 0 };
                        }

                        departamentos[deptId].cantidad++;
                        totalItems++;
                        lineasProcesadas++;

                        productosConInfo.push({
                            sku,
                            descripcion,
                            deptId,
                            pasillo,
                            upc,
                            stock
                        });
                    } else {
                        productosSinDepartamento.push(sku);
                    }
                }
            }
        }

        const result = {
            fecha,
            idTienda,
            ...metadataTienda,
            totalItems,
            lineasProcesadas,
            lineasTotales: lineasDatos.length,
            departamentos,
            productosSinDepartamento,
            productosConInfo,
            timestamp: new Date().toISOString()
        };

        this.datosLocales.set(`${idTienda}_${fecha}`, result);
        return result;
    }

    getReportLocal(idTienda, fecha) {
        return this.datosLocales.get(`${idTienda}_${fecha}`);
    }

    setReportLocal(idTienda, fecha, data) {
        this.datosLocales.set(`${idTienda}_${fecha}`, data);
    }
}
