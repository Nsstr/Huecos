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
                const partes = lineas[i].split(',').map(p => p.trim());
                if (partes.length >= 6) {
                    const sku = this._normalizeCode(partes[0]);
                    const upc = this._normalizeCode(partes[5]);
                    const deptId = partes[2];
                    const pasillo = partes[3];
                    const descripcion = partes[4].replace(/"/g, '');

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

    getListaPasillos() {
        const pasillos = new Set();
        this.tablaReferencia.forEach(info => {
            if (info.pasillo && info.pasillo !== 'S/D' && info.pasillo !== 'SIN PASILLO') {
                pasillos.add(info.pasillo);
            }
        });
        return Array.from(pasillos).sort((a, b) => {
            // Sort numerically if possible
            const numA = parseInt(a);
            const numB = parseInt(b);
            if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
    }

    // Generic normalization for SKUs and UPCs
    _normalizeCode(code) {
        if (!code) return '';
        let val = code.toString().toUpperCase().replace(/"/g, '').trim();

        // Handle scientific notation (e.g., 1.04E+8)
        if (val.includes('E+')) {
            const numeric = Number(val);
            if (!isNaN(numeric)) val = BigInt(Math.floor(numeric)).toString();
        }

        // Remove decimal part (1.0 -> 1)
        val = val.split('.')[0].split(',')[0];

        // Remove non-alphanumeric (except maybe some separators if needed)
        // Keep only alphanumeric characters and remove leading zeros

        // Keep ONLY alphanumeric
        return val.replace(/[^A-Z0-9]/g, '');
    }

    _normalizeHeader(h) {
        if (!h) return '';
        return h.toString().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^A-Z0-9]/g, '').trim();
    }

    procesarCSV(texto, fecha, idTienda, metadataTienda) {
        if (this.tablaReferencia.size === 0) throw new Error("Tabla de referencia no cargada");

        const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');
        const lineasDatos = lineas.slice(1);

        const departamentos = {};
        let totalItems = 0;
        let lineasProcesadas = 0;
        const productosSinDepartamento = [];
        const productosConInfo = [];

        for (const linea of lineasDatos) {
            const del = linea.includes(';') ? ';' : ',';
            const partes = linea.split(del).map(p => p.trim());

            if (partes.length >= 8) {
                const sku = this._normalizeCode(partes[0]);
                const stock = parseInt(partes[7]) || 0;

                if (sku && sku !== 'SKU' && sku !== 'ITEM') {
                    const info = this.tablaReferencia.get(sku);

                    if (info && info.deptId !== 'SIN_INFO') {
                        const { deptId, descripcion, pasillo, upc } = info;
                        const nombreDepto = MAPA_DEPARTAMENTOS[deptId] || `Depto ${deptId}`;

                        if (!departamentos[deptId]) {
                            departamentos[deptId] = { nombre: nombreDepto, cantidad: 0 };
                        }

                        departamentos[deptId].cantidad++;
                        totalItems++;
                        lineasProcesadas++;

                        const productObj = {
                            sku, descripcion, deptId, pasillo, upc, stock
                        };

                        productosConInfo.push(productObj);

                        if (!pasillo || pasillo === 'S/D' || pasillo === 'SIN PASILLO') {
                            productosSinDepartamento.push(productObj);
                        }
                    } else {
                        // Product not found or placeholder
                        const unknownProduct = {
                            sku,
                            stock,
                            descripcion: (info && info.descripcion !== 'PRODUCTO DESCONOCIDO') ? info.descripcion : 'PRODUCTO DESCONOCIDO',
                            deptId: (info && info.deptId !== 'SIN_INFO') ? info.deptId : 'SIN_INFO',
                            pasillo: (info && info.pasillo !== 'S/D') ? info.pasillo : 'S/D',
                            upc: (info && info.upc) ? info.upc : ''
                        };

                        productosSinDepartamento.push(unknownProduct);
                        productosConInfo.push(unknownProduct);

                        if (!departamentos['SIN_INFO']) {
                            departamentos['SIN_INFO'] = { nombre: 'SIN INFORMACIÓN', cantidad: 0 };
                        }
                        departamentos['SIN_INFO'].cantidad++;
                        totalItems++;
                    }
                }
            }
        }

        const result = {
            fecha, idTienda, ...metadataTienda,
            totalItems, lineasProcesadas, lineasTotales: lineasDatos.length,
            departamentos, productosSinDepartamento, productosConInfo,
            timestamp: new Date().toISOString()
        };

        this.datosLocales.set(`${idTienda}_${fecha}`, result);
        return result;
    }

    addReferenciaPersonalizada(datos) {
        if (datos && datos.sku) {
            const normalizedSku = this._normalizeCode(datos.sku);
            this.tablaReferencia.set(normalizedSku, {
                descripcion: datos.descripcion,
                deptId: datos.deptId,
                pasillo: datos.pasillo,
                upc: this._normalizeCode(datos.upc)
            });
        }
    }

    getReportLocal(idTienda, fecha) {
        return this.datosLocales.get(`${idTienda}_${fecha}`);
    }

    setReportLocal(idTienda, fecha, data) {
        this.datosLocales.set(`${idTienda}_${fecha}`, data);
    }

    getDeptToPasilloMap() {
        const mapa = new Map(); // deptId -> Map(pasillo -> count)
        const result = new Map(); // deptId -> pasillo (most frequent)

        this.tablaReferencia.forEach(info => {
            if (info.deptId && info.pasillo && info.pasillo !== 'S/D' && info.pasillo !== 'SIN PASILLO') {
                if (!mapa.has(info.deptId)) mapa.set(info.deptId, new Map());
                const counts = mapa.get(info.deptId);
                counts.set(info.pasillo, (counts.get(info.pasillo) || 0) + 1);
            }
        });

        mapa.forEach((counts, deptId) => {
            let maxCount = 0;
            let bestPasillo = 'S/D';
            counts.forEach((count, pasillo) => {
                if (count > maxCount) {
                    maxCount = count;
                    bestPasillo = pasillo;
                }
            });
            result.set(deptId, bestPasillo);
        });

        return result;
    }

    procesarReporteStock(texto) {
        if (!texto) return [];

        const cleanText = texto.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lineasRaw = cleanText.split('\n').map(l => l.trim()).filter(l => l !== '');

        const deptToPasillo = this.getDeptToPasilloMap();
        const nuevosProductos = [];

        // Advanced delimiter detection
        const testLine = lineasRaw.find(l => (l.match(/,/g) || []).length > 2 || (l.match(/;/g) || []).length > 2) || '';
        const del = (testLine.match(/;/g) || []).length > (testLine.match(/,/g) || []).length ? ';' : ',';

        console.log(`[Import] Delimiter: "${del}"`);

        let colIndex = { dept: -1, upc: -1, sku: -1, desc: -1 };
        let startIndex = 0;

        const synonyms = {
            sku: ['SKU', 'ITEM', 'CODIGO', 'ARTICULO', 'ID', 'MATERIAL', 'PROD'],
            upc: ['UPC', 'EAN', 'BARCODE', 'CODIGODEBARRAS', 'BARRAS', 'EAN13', 'EAN8'],
            dept: ['DEPARTAMENTO', 'DEPTO', 'CATEGORIA', 'SECCION', 'DIVISION', 'GERENCIA'],
            desc: ['DESCRIPCION', 'NOMBRE', 'PRODUCTO', 'DETAIL']
        };

        for (let i = 0; i < Math.min(30, lineasRaw.length); i++) {
            const innerPartes = lineasRaw[i].split(del).map(p => this._normalizeHeader(p));

            synonyms.sku.forEach(s => { if (colIndex.sku === -1) colIndex.sku = innerPartes.indexOf(s); });
            synonyms.upc.forEach(s => { if (colIndex.upc === -1) colIndex.upc = innerPartes.indexOf(s); });
            synonyms.dept.forEach(s => { if (colIndex.dept === -1) colIndex.dept = innerPartes.indexOf(s); });
            synonyms.desc.forEach(s => { if (colIndex.desc === -1) colIndex.desc = innerPartes.indexOf(s); });

            if (colIndex.sku !== -1 || colIndex.upc !== -1) {
                startIndex = i + 1;
                console.log(`[Import] Headers found at line ${i}:`, innerPartes);
                break;
            }
        }

        // Hard fallbacks for the user's specific format if not detected
        if (colIndex.sku === -1) colIndex.sku = 3;
        if (colIndex.upc === -1) colIndex.upc = 2;
        if (colIndex.dept === -1) colIndex.dept = 0;
        if (colIndex.desc === -1) colIndex.desc = 4;

        console.log("[Import] Calculated Mapping:", colIndex);

        for (let i = startIndex; i < lineasRaw.length; i++) {
            const partes = lineasRaw[i].split(del).map(p => p.trim());

            if (partes.length < 4) continue;

            const sku = this._normalizeCode(partes[colIndex.sku]);
            const upc = this._normalizeCode(partes[colIndex.upc]);
            const rawDept = partes[colIndex.dept] || '';
            const rawDesc = partes[colIndex.desc] || '';

            if (sku && sku.length >= 3) {
                const existing = this.tablaReferencia.get(sku);

                // If not in reference OR exists but is incomplete, update it!
                if (!existing || existing.deptId === 'SIN_INFO' || existing.descripcion === 'PRODUCTO DESCONOCIDO') {
                    const deptParts = rawDept.replace(/"/g, '').split('-');
                    const deptId = deptParts[0].trim();
                    const pasillo = deptToPasillo.get(deptId) || (existing ? existing.pasillo : 'S/D');

                    const info = {
                        sku,
                        upc,
                        deptId: deptId || 'SIN_DEPT',
                        pasillo,
                        descripcion: rawDesc.replace(/"/g, '').trim() || deptParts.slice(1).join('-').trim() || 'PRODUCTO IMPORTADO'
                    };

                    this.addReferenciaPersonalizada(info);
                    nuevosProductos.push(info);
                }
            }
        }

        console.log(`[Import] Finished. New/Updated: ${nuevosProductos.length}. Total Ref Size: ${this.tablaReferencia.size}`);
        return nuevosProductos;
    }
}
