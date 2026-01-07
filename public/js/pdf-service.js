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

            const margin = 10; // 1cm margin
            const marginLeft = margin;
            const marginTop = margin;
            const marginRight = margin;
            const pageWidth = doc.internal.pageSize.getWidth();
            const usableWidth = pageWidth - (marginLeft + marginRight);

            const pasillos = Object.keys(grouped).sort((a, b) => {
                const isSD_A = a === 'S/D' || a === 'SIN PASILLO';
                const isSD_B = b === 'S/D' || b === 'SIN PASILLO';
                if (isSD_A && !isSD_B) return 1;
                if (!isSD_A && isSD_B) return -1;

                const numA = parseInt(a);
                const numB = parseInt(b);
                if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
                return a.localeCompare(b);
            });

            for (let i = 0; i < pasillos.length; i++) {
                if (i > 0) doc.addPage();

                const pasillo = pasillos[i];
                let currentY = marginTop;

                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                const nombreTienda = reportData.nombre || reportData.nombreTienda || 'Tienda';
                doc.text(`Reporte de Huecos en Góndola - ${nombreTienda} - ${reportData.fecha}`, marginLeft, currentY);
                currentY += 5;
                doc.text(`Pasillo: ${pasillo}`, marginLeft, currentY);
                currentY += 5;

                const tableData = (grouped[pasillo] || [])
                    .filter(p => p) // Safety check
                    .map(p => [
                        p.deptId || '',
                        '', // Ajuste
                        p.sku || '',
                        p.descripcion || '',
                        p.stock || 0,
                        p.upc || '',
                        '' // Barcode placeholder
                    ]);

                const columnWidths = {
                    0: 8, 1: 8, 2: 18, 4: 10, 5: 22, 6: 50
                };

                // Flexible width for description
                const fixedWidthTotal = Object.values(columnWidths).reduce((a, b) => a + b, 0);
                columnWidths[3] = usableWidth - fixedWidthTotal;

                const isSD = pasillo === 'S/D' || pasillo === 'SIN PASILLO';
                const headColor = isSD ? [245, 158, 11] : [37, 99, 235]; // Orange for S/D, Blue for others

                doc.autoTable({
                    startY: currentY,
                    head: [['depto', '*', 'sku', 'detalle', 'PI', 'Código', 'Cód Barras']],
                    body: tableData,
                    margin: { top: margin, right: margin, bottom: margin, left: margin },
                    styles: { fontSize: 7, cellPadding: 1, minCellHeight: 12, valign: 'middle' },
                    headStyles: { fillColor: headColor, textColor: 255 },
                    columnStyles: columnWidths,
                    didDrawCell: (data) => {
                        if (data.section === 'body' && data.column.index === 6) {
                            const row = data.row.raw;
                            // row[5] is 'upc', row[2] is 'sku' based on tableData mapping
                            const code = row[5] || row[2];
                            if (code) {
                                this._drawBarcode(doc, String(code), data.cell);
                            }
                        }
                    }
                });
            }

            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);

            // Generate filename
            const storeName = (reportData.nombre || reportData.nombreTienda || 'Tienda').replace(/\s+/g, '_');
            const dateStr = (reportData.fecha || '').replace(/-/g, '');
            const pasilloStr = pasilloFiltro ? `_Pasillo_${pasilloFiltro}` : '';
            const filename = `Reporte_Huecos_${storeName}_${dateStr}${pasilloStr}.pdf`;

            return { url, blob, filename };
        } finally {
            this.isGenerating = false;
        }
    }

    _drawBarcode(doc, code, cell) {
        try {
            const canvas = document.createElement('canvas');
            // Use EAN13 for long codes (standard barcodes), CODE128 for shorter ones (SKUs)
            const format = code.length >= 12 ? "EAN13" : "CODE128";
            JsBarcode(canvas, code, {
                format: format,
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
