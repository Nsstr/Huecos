// Configuración de Supabase - REEMPLAZA con tus credenciales reales
const SUPABASE_URL = 'https://xeqhwchhcnpdblneautf.supabase.co';
const SUPABASE_ANON_KEY = 'tu-anon-key-publica';

// Inicializar Supabase solo si las credenciales no son las de ejemplo
if (SUPABASE_URL !== 'https://tu-proyecto.supabase.co' && SUPABASE_ANON_KEY !== 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcWh3Y2hoY25wZGJsbmVhdXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1MDQ4NzMsImV4cCI6MjA3OTA4MDg3M30.26qq4eEy-gx9Rr6DsOeE_uSpHneu1PSwXvhcnj_P7CY') {
    const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn('Configura las credenciales de Supabase en script.js');
}

// Variables globales
let currentSection = 'cargar';

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    inicializarApp();
});

function inicializarApp() {
    // Configurar fecha actual por defecto
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");
    
    document.getElementById('fecha').value = `${anio}-${mes}-${dia}`;
    document.getElementById('fecha-resumen').value = `${anio}-${mes}-${dia}`;
    document.getElementById('fecha-reporte').value = `${dia}-${mes}-${anio}`;
    
    // Configurar event listeners para navegación
    document.getElementById('btn-cargar').addEventListener('click', () => mostrarSeccion('cargar'));
    document.getElementById('btn-resumen').addEventListener('click', () => mostrarSeccion('resumen'));
    document.getElementById('btn-reporte').addEventListener('click', () => mostrarSeccion('reporte'));
    
    // Configurar event listeners para botones de acción
    document.getElementById('btn-cargar-datos').addEventListener('click', cargarDatos);
    document.getElementById('btn-generar-reporte').addEventListener('click', generarReporte);
    
    // Configurar event listener para el botón de actualizar resumen
    const btnActualizarResumen = document.querySelector('#seccion-resumen button');
    if (btnActualizarResumen) {
        btnActualizarResumen.addEventListener('click', cargarResumen);
    }
}

// Navegación entre secciones
function mostrarSeccion(seccion) {
    // Ocultar todas las secciones
    document.querySelectorAll('section').forEach(sec => {
        sec.classList.remove('seccion-activa');
        sec.classList.add('seccion-oculta');
    });
    
    // Remover clase activa de todos los botones
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Mostrar sección seleccionada
    document.getElementById(`seccion-${seccion}`).classList.remove('seccion-oculta');
    document.getElementById(`seccion-${seccion}`).classList.add('seccion-activa');
    
    // Activar botón correspondiente
    document.getElementById(`btn-${seccion}`).classList.add('active');
    
    currentSection = seccion;
}

// Función para cargar datos
async function cargarDatos() {
    const fechaSeleccionada = document.getElementById('fecha').value;
    const textoDatos = document.getElementById('texto').value;
    const statusEl = document.getElementById('status');
    const btnCargar = document.getElementById('btn-cargar-datos');

    // Validaciones
    if (!fechaSeleccionada) {
        mostrarEstado("Error: Por favor, selecciona una fecha.", "error");
        return;
    }
    if (!textoDatos.trim()) {
        mostrarEstado("Error: Por favor, pega la información a cargar.", "error");
        return;
    }

    try {
        // Mostrar estado de procesamiento
        mostrarEstado("Procesando datos...", "processing");
        btnCargar.disabled = true;

        // Llamar a la API
        const response = await fetch('/api/datos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fecha: fechaSeleccionada,
                datos: textoDatos
            })
        });

        const resultado = await response.json();

        if (resultado.success) {
            mostrarEstado("¡Datos cargados correctamente!", "success");
            document.getElementById('texto').value = "";
            
            // Mostrar resumen después de cargar
            setTimeout(() => {
                mostrarSeccion('resumen');
                cargarResumen();
            }, 1000);
        } else {
            mostrarEstado("Error al cargar datos: " + resultado.error, "error");
        }
    } catch (error) {
        mostrarEstado("Error en la conexión: " + error.message, "error");
    } finally {
        btnCargar.disabled = false;
    }
}

// Función para cargar resumen
async function cargarResumen() {
    const fechaSeleccionada = document.getElementById('fecha-resumen').value;
    const resumenContenido = document.getElementById('resumen-contenido');

    // Mostrar loading
    resumenContenido.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <p>Cargando datos...</p>
        </div>
    `;

    try {
        const response = await fetch(`/api/resumen?fecha=${fechaSeleccionada}`);
        const datos = await response.json();

        if (datos.error) {
            mostrarErrorResumen(datos.error);
            return;
        }

        mostrarResumen(datos);
    } catch (error) {
        mostrarErrorResumen("Error al cargar los datos: " + error.message);
    }
}

// Función para mostrar resumen
function mostrarResumen(datos) {
    const resumenContenido = document.getElementById('resumen-contenido');

    if (!datos.departamentos || datos.departamentos.length === 0) {
        resumenContenido.innerHTML = `
            <div class="summary-box">
                <div>Fecha: <span class="summary-value">${datos.fecha}</span></div>
                <div>Total Items: <span class="summary-value">${datos.totalItems || 0}</span></div>
            </div>
            <div class="no-data">No hay datos para mostrar en esta fecha</div>
        `;
        return;
    }

    let html = `
        <div class="summary-box">
            <div>Fecha: <span class="summary-value">${datos.fecha}</span></div>
            <div>Total Items: <span class="summary-value">${datos.totalItems}</span></div>
        </div>
        <table>
            <thead>
                <tr>
                    <th class="depto-col">DEPTO</th>
                    <th class="cantidad-col">CANT</th>
                    <th>DETALLE</th>
                </tr>
            </thead>
            <tbody>
    `;

    datos.departamentos.forEach(depto => {
        html += `
            <tr>
                <td class="depto-col">${depto.codigo}</td>
                <td class="cantidad-col">${depto.cantidad}</td>
                <td>${depto.nombre}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    resumenContenido.innerHTML = html;
}

// Función para generar reporte PDF
async function generarReporte() {
    const fecha = document.getElementById('fecha-reporte').value.trim();
    const pasillo = document.getElementById('pasillo').value;
    const progresoEl = document.getElementById('progreso-reporte');

    if (!fecha) {
        alert("Por favor, ingrese una fecha.");
        return;
    }

    try {
        progresoEl.style.display = 'block';

        const response = await fetch('/api/reporte', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                fecha: fecha,
                pasillo: pasillo
            })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `Reporte_${fecha}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } else {
            alert('Error al generar el reporte');
        }
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        progresoEl.style.display = 'none';
    }
}

// Funciones auxiliares
function mostrarEstado(mensaje, tipo) {
    const statusEl = document.getElementById('status');
    statusEl.innerHTML = mensaje;
    statusEl.className = tipo;
    statusEl.style.display = 'block';
}

function mostrarErrorResumen(mensaje) {
    const resumenContenido = document.getElementById('resumen-contenido');
    resumenContenido.innerHTML = `
        <div class="error-message">
            ${mensaje}
        </div>
    `;
}

// Función para detectar delimitador
function detectarDelimitador(linea) {
    const delimitadores = [";", ",", ":", ".", "/", "-", "_", "|"];
    let maxParts = 0;
    let delActual = ";";
    
    for (const del of delimitadores) {
        const partes = linea.split(del).length;
        if (partes > maxParts) {
            maxParts = partes;
            delActual = del;
        }
    }
    return delActual;
}