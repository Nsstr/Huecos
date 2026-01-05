export class PdfService {
    constructor() {
        this.isGenerating = false;
    }

    async generateReport(reportData, pasilloFiltro = null) {
        this.isGenerating = true;
        try {
            const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
            if (!jsPDF) {
                throw new Error("Librería jsPDF no encontrada. Verifique su conexión a internet.");
            }
            const doc = new jsPDF();

            let productos = reportData.productosConInfo || [];
            if (pasilloFiltro) {
                productos = productos.filter(p => p.pasillo === pasilloFiltro);
            }

            if (productos.length === 0) {
                throw new Error("No hay productos para generar el PDF" + (pasilloFiltro ? ` en el pasillo ${pasilloFiltro}` : ""));
            }

            // Group by pasillo
            const grouped = {};
            productos.forEach(p => {
                const pasillo = p.pasillo || 'SIN PASILLO';
                if (!grouped[pasillo]) grouped[pasillo] = [];
                grouped[pasillo].push(p);
            });

            const marginLeft = 5;
            const marginTop = 10;
            const pageWidth = doc.internal.pageSize.getWidth();
            const usableWidth = pageWidth - 10;

            const pasillos = Object.keys(grouped).sort();

            for (let i = 0; i < pasillos.length; i++) {
                if (i > 0) doc.addPage();

                const pasillo = pasillos[i];
                let currentY = marginTop;

                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.text(`Reporte de Huecos en Góndola - ${reportData.nombreTienda} - ${reportData.fecha}`, marginLeft, currentY);
                currentY += 5;
                doc.text(`Pasillo: ${pasillo}`, marginLeft, currentY);
                currentY += 5;

                const tableData = grouped[pasillo].map(p => [
                    p.deptId,
                    '', // Ajuste
                    p.sku,
                    p.descripcion,
                    p.stock,
                    p.upc,
                    '' // Barcode placeholder
                ]);

                const columnWidths = {
                    0: 8, 1: 8, 2: 18, 4: 10, 5: 22, 6: 50
                };

                // Flexible width for description
                const fixedWidthTotal = Object.values(columnWidths).reduce((a, b) => a + b, 0);
                columnWidths[3] = usableWidth - fixedWidthTotal;

                doc.autoTable({
                    startY: currentY,
                    head: [['depto', '*', 'sku', 'detalle', 'PI', 'Código', 'Cód Barras']],
                    body: tableData,
                    margin: { left: marginLeft, right: 5 },
                    styles: { fontSize: 7, cellPadding: 1, minCellHeight: 12, valign: 'middle' },
                    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
                    columnStyles: columnWidths,
                    didDrawCell: (data) => {
                        if (data.section === 'body' && data.column.index === 6) {
                            const p = grouped[pasillo][data.row.index];
                            const code = p.upc || p.sku;
                            if (code && code.length >= 8) {
                                this._drawBarcode(doc, code, data.cell);
                            }
                        }
                    }
                });
            }

            const blob = doc.output('blob');
            return URL.createObjectURL(blob);
        } finally {
            this.isGenerating = false;
        }
    }

    _drawBarcode(doc, code, cell) {
        try {
            const canvas = document.createElement('canvas');
            JsBarcode(canvas, code, {
                format: "EAN13",
                width: 2,
                height: 40,
                displayValue: false,
                margin: 0
            });

            const imgData = canvas.toDataURL('image/png');
            const bWidth = 35;
            const bHeight = 8;
            const x = cell.x + (cell.width - bWidth) / 2;
            const y = cell.y + (cell.height - bHeight) / 2;

            doc.addImage(imgData, 'PNG', x, y, bWidth, bHeight);
        } catch (e) {
            console.warn(`Barcode error for ${code}:`, e);
        }
    }
}
