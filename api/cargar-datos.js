// /api/cargar-datos.js

const { createClient } = require('@supabase/supabase-js');
const { convertirFormatoFecha, detectarDelimitador } = require('../lib/utils');

// --- 1. CONFIGURACIÓN DE SUPABASE ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ ERROR: Variables SUPABASE_URL o SUPABASE_SERVICE_KEY no definidas.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- 2. CACHE INTERNO ---
let mapaDataV2Cache = null;

// --- 3. CARGA DE CATÁLOGO ---
async function getMapaDataV2() {
    if (mapaDataV2Cache) return mapaDataV2Cache;

    try {
        console.log("Cargando catálogo desde Supabase...");

        const columnasSQL = '"SKU ID", "Clase DESC", "Código SKU"';

        const { data, error } = await supabase
            .from('data')
            .select(columnasSQL);

        if (error) throw error;

        const mapa = {};
        data.forEach(item => {
            const codigo = item['SKU ID']?.toString().trim();
            if (!codigo) return;

            mapa[codigo] = {
                codigo_interno: codigo,
                departamento: item['Clase DESC'] || 'N/A',
                codigo_ean: item['Código SKU'] || '0'
            };
        });

        mapaDataV2Cache = mapa;
        return mapa;

    } catch (err) {
        console.error("Error cargando catálogo:", err.message);
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
        const mapaDataV2 = await getMapaDataV2();

        if (!mapaDataV2 || Object.keys(mapaDataV2).length === 0) {
            return res.status(503).json({ success: false, message: "Catálogo no disponible." });
        }

        const { rawData, fechaString } = req.body || {};

        if (!rawData || !fechaString) {
            return res.status(400).json({
                success: false,
                message: "Faltan datos: fecha o texto pegado."
            });
        }

        const fecha = convertirFormatoFecha(fechaString);
        if (!fecha) {
            return res.status(400).json({ success: false, message: "Fecha inválida." });
        }

        // --- PROCESAMIENTO DE TEXTO ---
        const delimitador = detectarDelimitador(rawData);
        const filas = rawData.trim().split('\n').filter(l => l.trim() !== '');
        const filasProcesadas = [];

        const INDEX_CODIGO = 0;
        const INDEX_CANTIDAD = 1; // ← CORREGIDO

        for (const fila of filas) {
            const cols = fila.split(delimitador);

            if (cols.length < 2) continue;

            const codigo = cols[INDEX_CODIGO].trim();
            const huecos = parseInt(cols[INDEX_CANTIDAD], 10);

            if (!codigo || isNaN(huecos) || huecos <= 0) continue;

            const maestro = mapaDataV2[codigo] || {};

            filasProcesadas.push({
                fecha_scaneo: fecha,
                codigo_interno: codigo,
                cantidad_huecos: huecos,
                departamento: maestro.departamento || 'N/A',
                codigo_ean: (maestro.codigo_ean || '0').padStart(13, '0')
            });
        }

        // --- INSERT ---
        if (filasProcesadas.length > 0) {
            const { error } = await supabase
                .from('scaneo_huecos')
                .insert(filasProcesadas);

            if (error) throw error;
        }

        return res.status(200).json({
            success: true,
            count: filasProcesadas.length
        });

    } catch (err) {
        console.error("❌ Error fatal:", err.message);
        return res.status(500).json({
            success: false,
            message: "Error del servidor: " + err.message
        });
    }
};
