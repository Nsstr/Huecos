// /api/cargar-datos.js

const { createClient } = require('@supabase/supabase-js');
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils');

// --- 1. CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ ERROR FATAL: Variables de entorno SUPABASE_URL o SUPABASE_SERVICE_KEY no definidas.");
}

// Cliente Supabase (seguro crear en el scope global)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- 2. CACHE A NIVEL FUNCIÓN SERVERLESS ---
let mapaDataV2Cache = null;

// --- 3. FUNCIÓN QUE CARGA DATOS MAESTROS SOLO UNA VEZ ---
async function getMapaDataV2() {
    if (mapaDataV2Cache) return mapaDataV2Cache;

    console.log('Cargando catálogo DATAV2 desde Supabase...');

    try {
        const columnasSQL = '"SKU ID", "Clase DESC", "Código SKU ID"';

        const { data: rawData, error } = await supabase
            .from('data')
            .select(columnasSQL);

        if (error) {
            console.error("Error consultando catálogo:", error.message);
            mapaDataV2Cache = {}; 
            return mapaDataV2Cache;
        }

        const mapa = {};
        rawData.forEach(item => {
            const codigoInterno = item['SKU ID'] ? String(item['SKU ID']).trim() : '';

            if (codigoInterno) {
                mapa[codigoInterno] = {
                    codigo_interno: codigoInterno,
                    departamento: item['Clase DESC'] || 'N/A',
                    codigo_ean: item['Código SKU ID'] || '0'
                };
            }
        });

        console.log(`DATAV2 cargado correctamente: ${Object.keys(mapa).length} registros.`);
        mapaDataV2Cache = mapa;
        return mapa;

    } catch (err) {
        console.error("Fallo al cargar DATAV2:", err.message);
        mapaDataV2Cache = {};
        return mapaDataV2Cache;
    }
}

// --- 4. HANDLER PRINCIPAL ---
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        // 1. Cargar catálogo (cache seguro)
        const mapaDataV2 = await getMapaDataV2();

        if (Object.keys(mapaDataV2).length === 0) {
            return res.status(503).json({
                success: false,
                message: 'Catálogo de datos maestros no disponible.'
            });
        }

        // 2. Obtener datos del body
        const { rawData, fechaString } = req.body || {};

        if (!rawData || !fechaString) {
            return res.status(400).json({
                success: false,
                message: "Faltan datos de entrada (fecha o datos crudos)."
            });
        }

        const fechaNormalizada = convertirFormatoFecha(fechaString);
        if (!fechaNormalizada) {
            return res.status(400).json({
                success: false,
                message: "La fecha ingresada no es válida (use DD-MM-YYYY)."
            });
        }

        // 3. Procesar texto pegado
        const delimitador = detectarDelimitador(rawData);
        const filas = rawData.trim().split('\n').filter(l => l.trim() !== '');
        const filasProcesadas = [];

        const SC_CODIGO_INDEX = 0;
        const SC_CANTIDAD_HUECOS_INDEX = 7;

        for (const fila of filas) {
            const columnas = fila.split(delimitador);

            if (columnas.length <= SC_CANTIDAD_HUECOS_INDEX) continue;

            const codigoInterno = columnas[SC_CODIGO_INDEX]?.trim();
            const cantidadHuecos = parseInt(columnas[SC_CANTIDAD_HUECOS_INDEX], 10);

            if (!codigoInterno || isNaN(cantidadHuecos) || cantidadHuecos <= 0) continue;

            const dataMaestra = mapaDataV2[codigoInterno] || {};

            filasProcesadas.push({
                fecha_scaneo: fechaNormalizada,
                codigo_interno: codigoInterno,
                cantidad_huecos: cantidadHuecos,
                departamento: dataMaestra.departamento || 'N/A',
                codigo_ean: (dataMaestra.codigo_ean || '').padStart(13, '0')
            });
        }

        // 4. Insertar en Supabase
        if (filasProcesadas.length > 0) {
            const { error: insertError } = await supabase
                .from('scaneo_huecos')
                .insert(filasProcesadas);

            if (insertError) {
                console.error("Error al insertar:", insertError.message);
                throw insertError;
            }
        }

        return res.status(200).json({
            success: true,
            count: filasProcesadas.length
        });

    } catch (err) {
        console.error("Error fatal en cargar-datos:", err.message);

        return res.status(500).json({
            success: false,
            message: `Error interno del servidor: ${err.message}`
        });
    }
};
