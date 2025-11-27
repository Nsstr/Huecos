// ----------------------------------------------------------
// 🔧 FUNCIÓN NUEVA: normaliza saltos de línea en TODO el sistema
// ----------------------------------------------------------
function normalizarSaltos(texto) {
    return texto
        .replace(/\r\n/g, '\n') // Windows
        .replace(/\r/g, '\n')   // Mac viejo
        .replace(/\n{2,}/g, '\n'); // Limpia saltos múltiples
}

// ----------------------------------------------------------
// Configuración de Supabase
// ----------------------------------------------------------
const SUPABASE_URL = 'https://xeqhwchhcnpdblneautf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcWh3Y2hoY25wZGJsbmVhdXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjUxNDY0NDgsImV4cCI6MjA0MDcyMjQ0OH0.5vL4rD5N9HrW_9tQN7R5B7B7B7B7B7B7B7B7B7B7B7B7B';

let supabase;
let resumenActual = null;
let todasLasPartesCSV = [''];
let datosCargados = {}; // 🔥 NUEVO: Almacena los datos cargados por fecha

// ----------------------------------------------------------
// Inicialización
// ----------------------------------------------------------
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔄 DOM cargado, iniciando aplicación...');
    inicializarApp();
});

function inicializarApp() {
    console.log('🚀 Inicializando aplicación...');
    
    // Configurar Supabase
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase configurado correctamente');
    } catch (error) {
        console.error('❌ Error configurando Supabase:', error);
    }
    
    // Configurar fecha
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");
    
    document.getElementById('fecha').value = `${anio}-${mes}-${dia}`;
    document.getElementById('fecha-resumen').value = `${anio}-${mes}-${dia}`;
    document.getElementById('fecha-reporte').value = `${dia}-${mes}-${anio}`;
    
    // Configurar navegación
    document.getElementById('btn-cargar').addEventListener('click', () => mostrarSeccion('cargar'));
    document.getElementById('btn-resumen').addEventListener('click', () => {
        mostrarSeccion('resumen');
        // Mostrar los datos cargados para la fecha seleccionada
        mostrarResumenDesdeDatosCargados();
    });
    document.getElementById('btn-reporte').addEventListener('click', () => mostrarSeccion('reporte'));
    document.getElementById('btn-cargar-datos').addEventListener('click', procesarDatos);

    // Configurar actualización de resumen
    document.getElementById('btn-actualizar-resumen').addEventListener('click', function() {
        mostrarResumenDesdeDatosCargados();
    });

    // ------------------------------------------------------
    // EVENTO PASTE con normalización total
    // ------------------------------------------------------
    document.getElementById('texto').addEventListener('paste', function (e) {
        e.preventDefault();

        let textoPegado = e.clipboardData.getData('text');
        let textoCompleto = normalizarSaltos(textoPegado);
        e.target.value = textoCompleto;

        console.log("📏 Texto pegado:", textoCompleto.length, "caracteres");

        const lineas = textoCompleto.split("\n");
        console.log("📊 Líneas detectadas:", lineas.length);

        if (textoCompleto.length > 5000 && lineas.length > 50) {
            dividirYDistribuirCSV(textoCompleto);
        } else {
            todasLasPartesCSV = [textoCompleto];
            actualizarContador();
        }
    });

    // Evento input para el textarea principal
    document.getElementById('texto').addEventListener('input', function() {
        todasLasPartesCSV = [this.value];
        actualizarContador();
    });

    console.log('✅ Aplicación inicializada correctamente');
}

// ----------------------------------------------------------
// NAVEGACIÓN
// ----------------------------------------------------------
function mostrarSeccion(seccion) {
    console.log('🔍 Mostrando sección:', seccion);
    
    // Ocultar todas las secciones
    document.querySelectorAll('section').forEach(sec => {
        sec.classList.remove('seccion-activa');
        sec.classList.add('seccion-oculta');
    });
    
    // Mostrar la sección seleccionada
    const seccionElement = document.getElementById(`seccion-${seccion}`);
    if (seccionElement) {
        seccionElement.classList.remove('seccion-oculta');
        seccionElement.classList.add('seccion-activa');
    }
    
    // Actualizar botones de navegación
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Activar el botón correspondiente
    const boton = document.getElementById(`btn-${seccion}`);
    if (boton) {
        boton.classList.add('active');
    }
}

// ----------------------------------------------------------
// DIVIDIR CSV
// ----------------------------------------------------------
function dividirYDistribuirCSV(textoCompleto) {
    const lineas = normalizarSaltos(textoCompleto).split('\n');

    const maxLineasPorParte = 80;
    const partes = [];
    
    for (let i = 0; i < lineas.length; i += maxLineasPorParte) {
        const chunk = lineas.slice(i, i + maxLineasPorParte).join('\n');
        partes.push(chunk);
    }
    
    todasLasPartesCSV = partes;
    
    crearTextareasDinamicos(partes);
    
    console.log(`📦 Dividido en ${partes.length} partes, ${lineas.length} líneas totales`);
    actualizarContador();
}

// ----------------------------------------------------------
// CREAR TEXTAREAS DINÁMICOS
// ----------------------------------------------------------
function crearTextareasDinamicos(partes) {
    const contenedor = document.getElementById('contenedor-partes');
    contenedor.innerHTML = '';
    
    partes.forEach((parte, index) => {
        const textarea = document.createElement('textarea');
        textarea.className = 'form-control csv-part mt-2';
        textarea.style.minHeight = '150px';
        textarea.style.fontFamily = 'monospace';
        textarea.style.fontSize = '11px';
        textarea.placeholder = `Parte ${index + 1} de ${partes.length} (${normalizarSaltos(parte).split('\n').length} líneas)`;
        textarea.value = parte;
        
        textarea.addEventListener('input', function() {
            todasLasPartesCSV[index] = this.value;
            actualizarContador();
        });
        
        contenedor.appendChild(textarea);
    });
}

// ----------------------------------------------------------
// CSV COMPLETO
// ----------------------------------------------------------
function obtenerCSVCompleto() {
    if (todasLasPartesCSV.some(parte => parte.trim())) {
        return normalizarSaltos(todasLasPartesCSV.join('\n'));
    } else {
        return normalizarSaltos(document.getElementById('texto').value);
    }
}

// ----------------------------------------------------------
// CONTADOR
// ----------------------------------------------------------
function actualizarContador() {
    const csv = normalizarSaltos(obtenerCSVCompleto());
    const lineasTotales = csv.split('\n').filter(l => l.trim()).length;
    const caracteresTotales = csv.length;
    
    let mensaje = `📊 <strong>${lineasTotales} líneas</strong> - ${caracteresTotales} caracteres`;
    
    if (todasLasPartesCSV.length > 1) {
        mensaje += ` (en ${todasLasPartesCSV.length} partes)`;
    }
    
    document.getElementById('contador-lineas').innerHTML = mensaje;
    
    console.log('📈 Total acumulado:', lineasTotales, 'líneas');
}

// ----------------------------------------------------------
// PROCESAR DATOS - MODIFICADO para guardar datos exactos
// ----------------------------------------------------------
async function procesarDatos() {
    const fecha = document.getElementById('fecha').value;
    
    const csvCompleto = obtenerCSVCompleto();
    const lineasTotales = normalizarSaltos(csvCompleto).split('\n').filter(l => l.trim()).length;

    if (!fecha) return mostrarEstado("❌ Selecciona fecha", "error");
    if (lineasTotales === 0) return mostrarEstado("❌ No hay datos para procesar", "error");

    console.log('🔍 Procesando TOTAL:', lineasTotales, 'líneas');

    try {
        mostrarEstado(`⏳ Procesando ${lineasTotales} líneas...`, "processing");
        document.getElementById('btn-cargar-datos').disabled = true;

        // 🔥 GUARDAR DATOS EXACTOS EN MEMORIA
        datosCargados[fecha] = {
            csv: csvCompleto,
            lineas: lineasTotales,
            fecha: fecha,
            timestamp: new Date().toISOString()
        };

        console.log('💾 Datos guardados en memoria para fecha:', fecha);

        // Guardar CSV en backend (opcional - si aún lo necesitas)
        const guardarResponse = await fetch('http://localhost:3001/api/guardar-csv', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({fecha, csv_content: csvCompleto})
        });

        const guardarResult = await guardarResponse.json();
        if (!guardarResult.success) {
            console.warn('⚠️ No se pudo guardar en backend, pero los datos están en memoria');
        } else {
            console.log('✅ CSV guardado en backend:', guardarResult.lineas_guardadas, 'líneas');
        }

        mostrarEstado(`✅ ${lineasTotales} líneas procesadas correctamente`, "success");

        // Limpiar formulario
        todasLasPartesCSV = [''];
        document.getElementById('texto').value = '';
        document.getElementById('contenedor-partes').innerHTML = '';
        actualizarContador();
        
        // Ir directamente al resumen con los datos cargados
        setTimeout(() => {
            mostrarSeccion('resumen');
            mostrarResumenDesdeDatosCargados();
        }, 1000);

    } catch (error) {
        console.error('Error:', error);
        mostrarEstado("❌ Error: " + error.message, "error");
    } finally {
        document.getElementById('btn-cargar-datos').disabled = false;
    }
}

// ----------------------------------------------------------
// 🔥 NUEVA FUNCIÓN: Mostrar resumen desde datos cargados
// ----------------------------------------------------------
function mostrarResumenDesdeDatosCargados() {
    const fechaResumen = document.getElementById('fecha-resumen').value;
    
    if (!fechaResumen) {
        mostrarEstado("❌ Selecciona una fecha para el resumen", "error");
        return;
    }

    const datosFecha = datosCargados[fechaResumen];
    
    if (!datosFecha) {
        mostrarResumenVacio(fechaResumen);
        mostrarEstado("ℹ️ No hay datos cargados para esta fecha", "processing");
        return;
    }

    console.log('📊 Mostrando datos cargados para:', fechaResumen);
    mostrarResumenExacto(datosFecha);
    mostrarEstado("✅ Mostrando datos cargados", "success");
}

// ----------------------------------------------------------
// 🔥 NUEVA FUNCIÓN: Mostrar resumen exacto con datos cargados
// ----------------------------------------------------------
function mostrarResumenExacto(datos) {
    const contenedor = document.getElementById('resumen-contenido');
    if (!contenedor) return;

    const fechaObj = new Date(datos.fecha);
    const opciones = { day: 'numeric', month: 'short', year: 'numeric' };
    const fechaFormateada = fechaObj.toLocaleDateString('es-ES', opciones);
    
    let totalItems = 0;
    let filasHTML = '';

    // PROCESAR EXACTAMENTE lo que se cargó
    const lineas = datos.csv.split('\n').filter(linea => linea.trim());
    
    lineas.forEach(linea => {
        // Separar por coma (formato CSV estándar)
        const partes = linea.split(',').map(p => p.trim());
        
        if (partes.length >= 3) {
            const depto = partes[0];
            const cant = parseInt(partes[1]) || 0;
            const detalle = partes.slice(2).join(', '); // Por si el detalle tiene comas
            
            if (depto && !isNaN(cant)) {
                totalItems += cant;
                filasHTML += `
                    <tr>
                        <td>${depto}</td>
                        <td>${cant}</td>
                        <td>${detalle}</td>
                    </tr>
                `;
            }
        }
    });

    // Si no se pudieron procesar las líneas, mostrar el texto completo
    if (filasHTML === '' && lineas.length > 0) {
        filasHTML = `
            <tr>
                <td colspan="3">
                    <div style="background: #fff3cd; padding: 10px; border-radius: 4px;">
                        <strong>Formato no reconocido. Datos originales:</strong>
                        <div style="white-space: pre-wrap; margin-top: 10px; font-family: monospace; font-size: 12px;">
                            ${datos.csv}
                        </div>
                    </div>
                </td>
            </tr>
        `;
        totalItems = datos.lineas;
    }

    const html = `
        <div class="resumen-header">
            <div class="resumen-title">Resumen de Huecos</div>
            <div class="resumen-date">Fecha: ${fechaFormateada}</div>
        </div>
        
        <button class="update-button" onclick="mostrarResumenDesdeDatosCargados()">Actualizar</button>
        
        <hr>
        
        <div class="resumen-total">
            <strong>Fecha: ${datos.fecha.split('-').reverse().join('/')}</strong><br>
            Total Items: ${totalItems}
        </div>
        
        <table class="resumen-table">
            <thead>
                <tr>
                    <th>DEPTO</th>
                    <th>CANT</th>
                    <th>DETALLE</th>
                </tr>
            </thead>
            <tbody>
                ${filasHTML}
            </tbody>
        </table>
        
        <div style="margin-top: 20px; padding: 10px; background: #f8f9fa; border-radius: 4px; font-size: 12px;">
            <strong>Información:</strong> ${datos.lineas} líneas procesadas · 
            Cargado: ${new Date(datos.timestamp).toLocaleTimeString()}
        </div>
    `;
    
    contenedor.innerHTML = html;
}

// ----------------------------------------------------------
// FUNCIÓN: Mostrar resumen vacío
// ----------------------------------------------------------
function mostrarResumenVacio(fecha) {
    const contenedor = document.getElementById('resumen-contenido');
    if (!contenedor) return;

    const fechaObj = new Date(fecha);
    const opciones = { day: 'numeric', month: 'short', year: 'numeric' };
    const fechaFormateada = fechaObj.toLocaleDateString('es-ES', opciones);

    const html = `
        <div class="resumen-header">
            <div class="resumen-title">Resumen de Huecos</div>
            <div class="resumen-date">Fecha: ${fechaFormateada}</div>
        </div>
        
        <button class="update-button" onclick="mostrarResumenDesdeDatosCargados()">Actualizar</button>
        
        <hr>
        
        <div style="text-align: center; padding: 40px; color: #6c757d;">
            <h3>No hay datos cargados</h3>
            <p>No se han cargado datos para la fecha ${fecha.split('-').reverse().join('/')}</p>
            <p>Ve a la sección "Cargar Datos" para agregar información.</p>
        </div>
    `;
    
    contenedor.innerHTML = html;
}

// ----------------------------------------------------------
// AUXILIARES
// ----------------------------------------------------------
function mostrarEstado(mensaje, tipo) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.innerHTML = mensaje;
        statusEl.className = tipo;
        statusEl.style.display = 'block';
        if (tipo === 'success') setTimeout(() => statusEl.style.display = 'none', 5000);
    }
}

// ----------------------------------------------------------
// GENERAR REPORTE PDF
// ----------------------------------------------------------
document.getElementById('btn-generar-pdf').addEventListener('click', async function() {
    const fecha = document.getElementById('fecha-reporte').value;
    const pasillo = document.getElementById('pasillo').value;
    
    if (!fecha) {
        mostrarEstado("❌ Ingresa una fecha para el reporte", "error");
        return;
    }
    
    try {
        const progreso = document.getElementById('progreso-reporte');
        progreso.style.display = 'block';
        progreso.innerHTML = '<p>Generando reporte PDF...</p>';
        
        const response = await fetch('http://localhost:3001/api/generar-pdf', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({fecha, pasillo})
        });
        
        const resultado = await response.json();
        
        if (resultado.success) {
            progreso.innerHTML = `<p>✅ Reporte generado correctamente. <a href="${resultado.url}" target="_blank">Descargar PDF</a></p>`;
        } else {
            throw new Error(resultado.error);
        }
    } catch (error) {
        console.error('Error generando PDF:', error);
        document.getElementById('progreso-reporte').innerHTML = `<p>❌ Error: ${error.message}</p>`;
    }
});