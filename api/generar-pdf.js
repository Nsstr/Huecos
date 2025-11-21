// /api/generar-pdf.js

const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
const { convertirFormatoFecha } = require('../lib/utils');

// --- CONFIGURACIÓN SUPABASE ---
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    try {
        const { fecha, pasillo } = req.body || {};

        if (!fecha) {
            return res.status(400).json({
                success: false,
                message: "Debe ingresar la fecha."
            });
        }

        // Convertimos la fecha
        const fechaNormalizada = convertirFormatoFecha(fecha);
        if (!fechaNormalizada) {
            return res.status(400).json({
                success: false,
                message: "Formato de fecha inválido (DD-MM-YYYY)."
            });
        }

        // --- CONSULTAR DB ---
        let query = supabase
            .from('scaneo_huecos')
            .select('*')
            .eq('fecha_scaneo', fechaNormalizada)
            .order('departamento', { ascending: true });

        if (pasillo && pasillo !== "todos") {
            query = query.eq('departamento', pasillo);
        }

        const { data, error } = await query;

        if (error) {
            console.error("Error DB:", error);
            return res.status(500).json({
                success: false,
                message: "No se pudo obtener datos desde Supabase."
            });
        }

        // --- INICIO PDF ---
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 40, bottom: 40, left: 40, right: 40 }
        });

        // Headers PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=reporte_huecos.pdf');

        // Pipe directo (streaming)
        doc.pipe(res);

        // --- TÍTULO ---
        doc.fontSize(20).text('Reporte de Huecos', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Fecha del escaneo: ${fechaNormalizada}`);
        if (pasillo && pasillo !== "todos") {
            doc.text(`Pasillo: ${pasillo}`);
        }
        doc.moveDown(1.5);

        // --- LISTADO ---
        if (!data || data.length === 0) {
            doc.fontSize(14).text("No hay registros para esta fecha.", { align: 'center' });
            doc.end();
            return;
        }

        doc.fontSize(12).text(`Total de registros: ${data.length}`);
        doc.moveDown();

        data.forEach(item => {
            doc
                .fontSize(11)
                .text(
                    `• SKU interno: ${item.codigo_interno} | Cant: ${item.cantidad_huecos}` +
                    ` | Dep: ${item.departamento} | EAN: ${item.codigo_ean}`
                );
        });

        doc.end();

    } catch (err) {
        console.error("Error general generar-pdf:", err.message);
        return res.status(500).json({
            success: false,
            message: `Error interno del servidor: ${err.message}`
        });
    }
};
