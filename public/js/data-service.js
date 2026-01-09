import { MAPA_DEPARTAMENTOS } from './constants.js';

export class DataService {
    constructor() {
        this.tablaReferencia = new Map(); // sku -> {descripcion, deptId, pasillo, upc}
        this.datosLocales = new Map(); // key -> data
        this._loadCache();
    }

    _loadCache() {
        try {
            const cacheRaw = localStorage.getItem('huecos_custom_products');
            if (cacheRaw) {
                const cache = JSON.parse(cacheRaw);
                Object.values(cache).forEach(p => {
                    this.tablaReferencia.set(p.sku, p);
                });
                console.log(`📦 Cache local cargado: ${Object.keys(cache).length} productos`);
            }
        } catch (e) {
            console.warn("No se pudo cargar la cache local", e);
        }
    }

    _saveCache() {
        try {
            const currentCache = JSON.parse(localStorage.getItem('huecos_custom_products') || '{}');
            this.tablaReferencia.forEach((info, sku) => {
                // Only cache items that are "custom" (likely not from data.csv)
                // We'll mark them with a flag or just cache everything that isn't the base CSV
                // For simplicity, let's cache everything that has been ADDED or ADJUSTED.
                if (info.isCustom || info.pasillo !== 'S/D' || info.deptId !== 'SIN_INFO') {
                    currentCache[sku] = info;
                }
            });
            localStorage.setItem('huecos_custom_products', JSON.stringify(currentCache));
        } catch (e) {
            console.error("Error guardando cache local", e);
        }
    }

    clearLocalData() {
        this.datosLocales.clear();
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
                    const pasillo = this._normalizeAisle(partes[3]);
                    const descripcion = partes[4].replace(/"/g, '');

                    if (sku && deptId) {
                        const clase = partes[1] || '';
                        this.tablaReferencia.set(sku, {
                            descripcion,
                            deptId,
                            pasillo,
                            upc,
                            clase
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

        // Keep ONLY alphanumeric and REMOVE LEADING ZEROS
        val = val.replace(/[^A-Z0-9]/g, '');

        // Only strip leading zeros if it's purely numeric
        if (/^\d+$/.test(val)) {
            val = val.replace(/^0+/, '');
        }

        return val || '0';
    }

    _normalizeHeader(h) {
        if (!h) return '';
        return h.toString().toUpperCase()
            .replace(/"/g, '') // Remove quotes
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/[^A-Z0-9]/g, '').trim();
    }

    _normalizeAisle(aisle) {
        if (!aisle) return 'S/D';
        let val = aisle.toString().trim().toUpperCase();

        // Regla específica para corregir variaciones detectadas por el usuario
        if (val === 'HARINAS Y ACEITES') return 'HARINAS Y ACEITE';
        if (val === 'SIN PASILLO' || val === 'S/P' || val === 'S/D') return 'S/D';

        return val;
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
            const info = {
                sku: normalizedSku,
                descripcion: datos.descripcion,
                deptId: datos.deptId,
                pasillo: this._normalizeAisle(datos.pasillo),
                upc: this._normalizeCode(datos.upc),
                clase: datos.clase || '',
                isCustom: true
            };
            this.tablaReferencia.set(normalizedSku, info);
            this._saveCache();
        }
    }

    buscarProducto(codigo) {
        const normalized = this._normalizeCode(codigo);
        if (!normalized) return null;

        // Try direct SKU match
        if (this.tablaReferencia.has(normalized)) {
            return { sku: normalized, ...this.tablaReferencia.get(normalized) };
        }

        // Try UPC search (less efficient but necessary)
        let found = null;
        for (const [sku, info] of this.tablaReferencia.entries()) {
            if (info.upc === normalized || info.upc.endsWith(normalized)) {
                found = { sku, ...info };
                break;
            }
        }
        return found;
    }

    getReportLocal(idTienda, fecha) {
        return this.datosLocales.get(`${idTienda}_${fecha}`);
    }

    setReportLocal(idTienda, fecha, data) {
        this.datosLocales.set(`${idTienda}_${fecha}`, data);
    }

    // Learns keywords from existing names and maps them to aisles
    _buildKeywordAisleMap() {
        const keywordStats = new Map(); // keyword -> Map(pasillo -> count)

        this.tablaReferencia.forEach(info => {
            if (!info.pasillo || info.pasillo === 'S/D') return;

            // Extract tokens from description (long words, no numbers)
            const tokens = info.descripcion.toUpperCase().split(/[^A-Z]/)
                .filter(t => t.length > 3);

            tokens.forEach(token => {
                if (!keywordStats.has(token)) keywordStats.set(token, new Map());
                const counts = keywordStats.get(token);
                counts.set(info.pasillo, (counts.get(info.pasillo) || 0) + 1);
            });
        });

        const result = new Map();
        keywordStats.forEach((counts, token) => {
            let total = 0;
            let bestPasillo = '';
            let maxCount = 0;
            counts.forEach((count, pasillo) => {
                total += count;
                if (count > maxCount) {
                    maxCount = count;
                    bestPasillo = pasillo;
                }
            });
            // Only suggest if one aisle is dominant (>80%) and has enough samples
            if (maxCount / total > 0.8 && total >= 2) {
                result.set(token, bestPasillo);
            }
        });
        return result;
    }

    // Maps (deptId + category) -> Pasillo (most frequent)
    getCategoryMapping() {
        const freqMap = new Map(); // "deptId|category" -> Map(pasillo -> count)
        const result = new Map();

        this.tablaReferencia.forEach(info => {
            if (info.deptId && info.clase && info.pasillo && info.pasillo !== 'S/D' && info.pasillo !== 'SIN PASILLO') {
                const key = `${info.deptId}|${info.clase.toUpperCase()}`;
                if (!freqMap.has(key)) freqMap.set(key, new Map());
                const counts = freqMap.get(key);
                counts.set(info.pasillo, (counts.get(info.pasillo) || 0) + 1);
            }
        });

        freqMap.forEach((counts, key) => {
            let maxCount = 0;
            let bestPasillo = '';
            counts.forEach((count, pasillo) => {
                if (count > maxCount) {
                    maxCount = count;
                    bestPasillo = pasillo;
                }
            });
            result.set(key, bestPasillo);
        });

        return result;
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
        const categoryMap = this.getCategoryMapping();
        const nuevosProductos = [];

        // Advanced delimiter detection
        const testLine = lineasRaw.find(l => (l.match(/,/g) || []).length > 2 || (l.match(/;/g) || []).length > 2) || '';
        const del = (testLine.match(/;/g) || []).length > (testLine.match(/,/g) || []).length ? ';' : ',';

        console.log(`[Import] Delimiter: "${del}"`);

        let colIndex = { dept: -1, upc: -1, sku: -1, desc: -1, cat: -1 };
        let startIndex = 0;

        const synonyms = {
            sku: ['SKU', 'ITEM', 'CODIGO', 'ARTICULO', 'ID', 'MATERIAL', 'PROD'],
            upc: ['UPC', 'EAN', 'BARCODE', 'CODIGODEBARRAS', 'BARRAS', 'EAN13', 'EAN8'],
            dept: ['DEPARTAMENTO', 'DEPTO', 'DIVISION', 'GERENCIA'],
            desc: ['DESCRIPCION', 'NOMBRE', 'PRODUCTO', 'DETAIL'],
            cat: ['CLASE', 'CATEGORIA', 'SECCION', 'RUBRO', 'FAMILIA']
        };

        for (let i = 0; i < Math.min(30, lineasRaw.length); i++) {
            const innerPartes = lineasRaw[i].split(del).map(p => this._normalizeHeader(p));

            // Use .some() or find to be more flexible than indexOf
            const findCol = (syns) => innerPartes.findIndex(p => syns.some(s => p.includes(s) || s.includes(p)));

            if (colIndex.sku === -1) colIndex.sku = findCol(synonyms.sku);
            if (colIndex.upc === -1) colIndex.upc = findCol(synonyms.upc);
            if (colIndex.dept === -1) colIndex.dept = findCol(synonyms.dept);
            if (colIndex.desc === -1) colIndex.desc = findCol(synonyms.desc);
            if (colIndex.cat === -1) colIndex.cat = findCol(synonyms.cat);

            if (colIndex.sku !== -1 || colIndex.upc !== -1) {
                startIndex = i + 1;
                console.log(`[Import] Headers found at line ${i}:`, innerPartes);
                break;
            }
        }

        // Optimized defaults for the specific user format observed
        if (colIndex.dept === -1) colIndex.dept = 0;
        if (colIndex.upc === -1) colIndex.upc = 2;
        if (colIndex.sku === -1) colIndex.sku = 3;
        if (colIndex.desc === -1) colIndex.desc = 4;
        if (colIndex.cat === -1) colIndex.cat = 1;

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

                // Allow update if information is MORE COMPLETE than before
                const isPlaceholder = !existing ||
                    existing.deptId === 'SIN_INFO' ||
                    existing.descripcion === 'PRODUCTO DESCONOCIDO' ||
                    existing.pasillo === 'S/D';

                if (isPlaceholder) {
                    const deptParts = (partes[colIndex.dept] || '').replace(/"/g, '').split('-');
                    const deptId = deptParts[0].trim();
                    const rawCat = (partes[colIndex.cat] || '').replace(/"/g, '').trim().toUpperCase();

                    // Logic: 1. Granular mapping (Dept + Category) 2. General mapping (Dept) 3. Existing 4. S/D
                    let pasillo = categoryMap.get(`${deptId}|${rawCat}`) ||
                        deptToPasillo.get(deptId) ||
                        (existing ? existing.pasillo : 'S/D');

                    const info = {
                        sku,
                        upc,
                        deptId: deptId || 'SIN_DEPT',
                        pasillo,
                        clase: rawCat,
                        descripcion: rawDesc.replace(/"/g, '').trim() || deptParts.slice(1).join('-').trim() || 'PRODUCTO IMPORTADO'
                    };

                    this.addReferenciaPersonalizada(info);
                    nuevosProductos.push(info);
                }
            }
        }

        console.log(`[Import] Finished. New/Updated: ${nuevosProductos.length}. Total Ref Size: ${this.tablaReferencia.size}`);

        // Group suggestions for bulk confirmation
        const suggestions = this._generateSuggestions(nuevosProductos);

        return {
            productos: nuevosProductos,
            suggestions: suggestions
        };
    }

    _generateSuggestions(nuevos) {
        const keywordMap = this._buildKeywordAisleMap();
        const clusters = new Map(); // aisle -> { products: [], keywords: [] }

        nuevos.forEach(p => {
            if (p.pasillo !== 'S/D') return;

            const tokens = p.descripcion.toUpperCase().split(/[^A-Z]/).filter(t => t.length > 3);
            let suggestedAisle = null;

            for (const t of tokens) {
                if (keywordMap.has(t)) {
                    suggestedAisle = keywordMap.get(t);
                    break;
                }
            }

            if (suggestedAisle) {
                if (!clusters.has(suggestedAisle)) clusters.set(suggestedAisle, { aisle: suggestedAisle, products: [] });
                clusters.get(suggestedAisle).products.push(p);
            }
        });

        return Array.from(clusters.values());
    }
}
