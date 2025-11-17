// /public/script.js

const messageDiv = document.getElementById('message');

function showMessage(type, content) {
    messageDiv.className = type;
    messageDiv.innerHTML = content;
    messageDiv.style.display = 'block';
}

async function cargarDatos() {
    const rawData = document.getElementById('datosRaw').value;
    const fechaString = document.getElementById('fechaCarga').value.trim();

    if (!fechaString || !rawData) {
        return showMessage('error', 'Por favor, ingrese la fecha y pegue los datos.');
    }

    showMessage('loading', 'Cargando datos. Por favor, espere...');

    try {
        const response = await fetch('/api/cargar-datos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rawData, fechaString })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showMessage('success', `✅ Carga exitosa. ${result.count} registros insertados en la base de datos.`);
            document.getElementById('datosRaw').value = ''; // Limpiar el área de texto
        } else {
            showMessage('error', `❌ Error en la carga: ${result.message || 'Error desconocido del servidor.'}`);
        }

    } catch (error) {
        showMessage('error', `❌ Error de conexión: No se pudo contactar el servidor (${error.message}).`);
    }
}

async function generarPDF() {
    const fecha = document.getElementById('fechaReporte').value.trim();
    const pasillo = document.getElementById('pasillo').value;

    if (!fecha) {
        return showMessage('error', 'Por favor, ingrese la fecha para el reporte.');
    }

    showMessage('loading', 'Generando PDF. Esto puede tardar unos segundos...');

    try {
        const response = await fetch('/api/generar-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fecha, pasillo })
        });

        if (response.ok) {
            // El endpoint Serverless debe devolver un PDF blob
            const pdfBlob = await response.blob();
            const url = URL.createObjectURL(pdfBlob);
            window.open(url, '_blank');
            showMessage('success', '✅ PDF generado y abierto en una nueva pestaña.');
        } else {
            const errorResult = await response.json();
            showMessage('error', `❌ Error al generar PDF: ${errorResult.message || 'Error desconocido del servidor.'}`);
        }
    } catch (error) {
        showMessage('error', `❌ Error de conexión: No se pudo contactar el servidor (${error.message}).`);
    }
}