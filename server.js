// server.js - Sistema con guardado en Supabase
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configurar Supabase
const supabaseUrl = 'https://xeqhwchhcnpdblneautf.supabase.co';
const supabaseKey = 'sb_secret_D6nE35MKkEIN5zcgxqlZAQ_Ce_KW3nY';
const supabase = createClient(supabaseUrl, supabaseKey);

// Función para mapear códigos de departamento a nombres
function obtenerNombreDepartamento(codigo) {
  const mapeoDeptos = {
    '1': 'Galletitas y Golosinas',
    '82': 'Checkout',
    '92': 'Almacen seco',
    '95': 'Bebidas sin alcohol',
    '96': 'Bebidas con alcohol',
    '2': 'Perfumeria',
    '4': 'Papeles',
    '8': 'Mascotas',
    '13': 'Quimicos',
    '26': 'Bebes',
    '46': 'Cosmeticos',
    '21': 'AVES',
    '43': 'Carne Vacuno',
    '78': 'Pescadería Retail',
    '79': 'Carne Retail',
    '83': 'Pescaderia Costos',
    '86': 'Panaderia retail',
    '93': 'CERDO GRANJA',
    '98': 'Panaderia costos',
    '84': 'Prod. Secos y especias',
    '94': 'Frutas y Verduras',
    '69': 'Fiambreria',
    '80': 'Quesos',
    '81': 'Rotiseria y Deli',
    '90': 'Lacteos',
    '91': 'Congelados',
    '97': 'Envasados',
    '23': 'Caballeros',
    '24': 'Ninos',
    '25': 'Calzados',
    '27': 'Medias y Soquetes',
    '28': 'Bebes - Ropa',
    '30': 'Ropa interior',
    '33': 'Ninas',
    '34': 'Damas',
    '3': 'Libreria',
    '7': 'Jugueteria',
    '9': 'Deportes',
    '12': 'Pintureria',
    '16': 'Jardineria',
    '17': 'Muebles',
    '29': 'Bebes - Puericultura',
    '31': 'Equipajes - Accesorios',
    '5': 'Electronicos',
    '11': 'Ferreteria',
    '15': 'PEQ ELECTRO',
    '35': 'CLIMATIZACION',
    '36': 'LINEA BLANCA',
    '87': 'Informatica & Mobile',
    '14': 'Bazar',
    '18': 'Navidad',
    '19': 'Decoracion',
    '20': 'Cocina y Bano',
    '22': 'Blancos',
    '74': 'Organizacion',
    '40': 'Farmacia Venta Libre',
    '10': 'Automotor',
    '37': 'TLE servicio'
  };
  
  return mapeoDeptos[codigo] || `Departamento ${codigo}`;
}

// Función auxiliar para nombre del mes
function obtenerNombreMes(mes) {
  const meses = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic'
  ];
  return meses[parseInt(mes) - 1] || mes;
}

// Función para guardar en el historial
async function guardarEnHistorial(fecha, resultado) {
  try {
    const { error } = await supabase
      .from('scaneo_huecos')
      .insert({
        fecha: fecha,
        depto: resultado.departamentos.length.toString(),
        sku: resultado.totalItems.toString(),
        detalle: `Procesados: ${resultado.totalItems} items, Departamentos: ${resultado.departamentos.length}`,
        resumen_json: resultado
      });

    if (error) throw error;
    console.log('✅ Historial guardado en scaneo_huecos');
  } catch (error) {
    console.error('❌ Error guardando historial:', error);
  }
}

// FUNCIÓN DE PROCESAMIENTO
async function procesarDatosMasivo(csvData, fecha) {
  const lineas = csvData.split('\n').filter(linea => linea.trim());
  
  console.log(`📊 Procesando ${lineas.length} líneas del CSV...`);

  // Extraer SKUs del CSV
  const skus = [];
  const lineasConSKU = [];

  for (let i = 0; i < lineas.length; i++) {
    const campos = lineas[i].split(',');
    if (campos.length >= 1) {
      const sku = campos[0].trim();
      const descripcion = campos[1] ? campos[1].trim() : 'Sin descripción';
      
      if (sku && sku !== '0') {
        skus.push(sku);
        lineasConSKU.push({ 
          sku, 
          descripcion,
          linea: lineas[i], 
          index: i + 1 
        });
      }
    }
  }

  console.log(`🔍 Buscando ${skus.length} SKUs en Supabase...`);

  // Buscar departamentos en Supabase
  const { data: productos, error } = await supabase
    .from('data')
    .select('"SKU ID", "Dept ID", "SKU DESC"')
    .in('"SKU ID"', skus);

  if (error) {
    console.error('❌ Error en consulta Supabase:', error);
    throw error;
  }

  console.log(`✅ Encontrados ${productos.length} productos en Supabase`);

  // Crear mapa de SKU -> Departamento
  const mapaSKUDepto = {};
  const mapaSKUDesc = {};
  const skusEncontrados = new Set();
  
  productos.forEach(producto => {
    const sku = producto['SKU ID'].toString();
    const depto = producto['Dept ID'] ? producto['Dept ID'].toString() : null;
    const desc = producto['SKU DESC'] || 'Sin descripción';
    
    mapaSKUDepto[sku] = depto;
    mapaSKUDesc[sku] = desc;
    skusEncontrados.add(sku);
  });

  // Identificar SKUs no encontrados
  const skusNoEncontrados = [];
  
  lineasConSKU.forEach(item => {
    if (!skusEncontrados.has(item.sku)) {
      skusNoEncontrados.push({
        sku: item.sku,
        descripcion: item.descripcion,
        linea: item.index,
        razon: 'NO ENCONTRADO EN SUPABASE'
      });
    }
  });

  // MOSTRAR SKUs NO ENCONTRADOS
  if (skusNoEncontrados.length > 0) {
    console.log(`\n🔍 SKUs NO ENCONTRADOS EN SUPABASE (${skusNoEncontrados.length}):`);
    skusNoEncontrados.forEach(item => {
      console.log(`   Línea ${item.linea}: ${item.sku} - ${item.descripcion}`);
    });
    console.log('\n');
  }

  // Contar por departamento
  const departamentos = {};
  let totalItems = 0;

  lineasConSKU.forEach(item => {
    const deptoId = mapaSKUDepto[item.sku];
    
    if (deptoId && deptoId !== '0') {
      if (!departamentos[deptoId]) {
        departamentos[deptoId] = {
          codigo: deptoId,
          cantidad: 0,
          nombre: obtenerNombreDepartamento(deptoId)
        };
      }
      departamentos[deptoId].cantidad += 1;
      totalItems += 1;
    }
  });

  console.log(`✅ ${totalItems} items contados en ${Object.keys(departamentos).length} departamentos`);
  console.log(`❌ SKUs no encontrados: ${skusNoEncontrados.length}`);

  // GENERAR RESUMEN PRINCIPAL
  const resumenHuecos = generarResumenHuecos(fecha, totalItems, Object.values(departamentos));
  
  // GENERAR LISTADO DE PROBLEMAS
  const listadoProblemas = generarListadoProblemas([], skusNoEncontrados);

  const resultado = {
    totalItems: totalItems,
    lineasOriginales: lineas.length,
    lineasProcesadas: totalItems,
    skusNoEncontrados: skusNoEncontrados.length,
    departamentos: Object.values(departamentos).sort((a, b) => a.codigo - b.codigo),
    fecha: fecha,
    resumenTexto: resumenHuecos,
    listadoProblemas: listadoProblemas
  };

  // Guardar en historial
  await guardarEnHistorial(fecha, resultado);

  return resultado;
}

// FUNCIÓN: Generar resumen de huecos
function generarResumenHuecos(fecha, totalItems, departamentos) {
  const fechaObj = new Date(fecha);
  const dia = fechaObj.getDate().toString().padStart(2, '0');
  const mes = (fechaObj.getMonth() + 1).toString().padStart(2, '0');
  const anio = fechaObj.getFullYear();
  
  let resumen = `# Resumen de Huecos\n\n`;
  resumen += `Fecha:  \n`;
  resumen += `${dia} ${obtenerNombreMes(mes)} ${anio}  \n\n`;
  resumen += `Actualizar  \n\n`;
  resumen += `---\n\n`;
  resumen += `## Fecha: ${dia}/${mes}/${anio}\n`;
  resumen += `Total Items: ${totalItems}  \n\n`;
  resumen += `| DEPTO | CANT | DETALLE |\n`;
  resumen += `|---|---|---|\n`;
  
  departamentos
    .sort((a, b) => parseInt(a.codigo) - parseInt(b.codigo))
    .forEach(depto => {
      resumen += `| ${depto.codigo} | ${depto.cantidad} | ${depto.nombre} |\n`;
    });
  
  return resumen;
}

// FUNCIÓN: Generar listado de problemas
function generarListadoProblemas(skusSinDepto, skusNoEncontrados) {
  let listado = `## SKUs con Problemas\n\n`;
  
  if (skusSinDepto.length === 0 && skusNoEncontrados.length === 0) {
    listado += `✅ Todos los SKUs fueron procesados correctamente\n`;
    return listado;
  }

  if (skusNoEncontrados.length > 0) {
    listado += `### SKUs No Encontrados en Supabase: ${skusNoEncontrados.length}\n\n`;
    skusNoEncontrados.forEach(item => {
      listado += `- **${item.sku}** - ${item.descripcion}\n`;
    });
  }

  return listado;
}

// ENDPOINT PARA GUARDAR CSV EN SUPABASE
app.post('/api/guardar-csv', async (req, res) => {
  try {
    const { fecha, csv_content } = req.body;
    
    const lineas = csv_content.split('\n').filter(linea => linea.trim());
    
    console.log(`💾 Guardando CSV en Supabase - ${lineas.length} líneas`);

    // GUARDAR EN SUPABASE
    const { data, error } = await supabase
      .from('raw_csv_data')
      .insert({
        fecha: fecha,
        csv_content: csv_content,
        lineas_count: lineas.length,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ CSV guardado en Supabase - ID: ${data.id}`);
    
    res.json({ 
      success: true, 
      id: data.id,
      lineas_guardadas: lineas.length,
      message: 'CSV guardado correctamente en base de datos'
    });
    
  } catch (error) {
    console.error('❌ Error guardando CSV:', error);
    res.status(500).json({ error: error.message });
  }
});

// ENDPOINT PARA PROCESAR DESDE SUPABASE
app.post('/api/procesar-desde-supabase', async (req, res) => {
  try {
    const { fecha } = req.body;
    
    console.log(`📂 Buscando CSV guardado para fecha: ${fecha}`);

    // BUSCAR CSV GUARDADO
    const { data, error } = await supabase
      .from('raw_csv_data')
      .select('csv_content, lineas_count')
      .eq('fecha', fecha)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.log('❌ No se encontró CSV guardado para esta fecha');
      return res.status(404).json({ error: 'No se encontró CSV guardado para esta fecha' });
    }

    console.log(`🔍 CSV encontrado - ${data.lineas_count} líneas`);
    
    // PROCESAR
    const resultado = await procesarDatosMasivo(data.csv_content, fecha);
    
    res.json({ 
      success: true, 
      resumen: resultado,
      lineas_procesadas: data.lineas_count,
      message: `Procesado desde base de datos: ${data.lineas_count} líneas`
    });
    
  } catch (error) {
    console.error('❌ Error procesando desde Supabase:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para obtener resumen del historial
app.get('/api/resumen', async (req, res) => {
  try {
    const { fecha } = req.query;
    
    console.log('📋 Buscando resumen para fecha:', fecha);
    
    const { data, error } = await supabase
      .from('scaneo_huecos')
      .select('resumen_json')
      .eq('fecha', fecha)
      .single();

    if (error) {
      console.log('❌ No se encontró resumen para la fecha:', fecha);
      res.json({
        fecha: fecha,
        totalItems: 0,
        departamentos: []
      });
      return;
    }

    console.log('✅ Resumen encontrado en historial');
    res.json(data.resumen_json);
    
  } catch (error) {
    console.error('❌ Error obteniendo resumen:', error);
    res.status(500).json({ error: 'Error obteniendo resumen' });
  }
});

// Endpoint para reporte PDF
app.post('/api/reporte', async (req, res) => {
  try {
    const { fecha, pasillo } = req.body;
    
    console.log('📊 Generando reporte PDF para:', fecha, pasillo);
    
    const { data } = await supabase
      .from('scaneo_huecos')
      .select('resumen_json')
      .eq('fecha', fecha)
      .single();

    if (!data) {
      throw new Error('No se encontraron datos para la fecha especificada');
    }

    const resumen = data.resumen_json;
    
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Reporte_Huecos_${fecha}.pdf`);
    
    doc.pipe(res);
    
    doc.fontSize(20).text('REPORTE DE HUECOS', 100, 100);
    doc.fontSize(12).text(`Fecha: ${fecha}`, 100, 150);
    doc.text(`Pasillo: ${pasillo || 'Todos'}`, 100, 170);
    doc.text(`Total Items: ${resumen.totalItems}`, 100, 190);
    doc.text(`Departamentos: ${resumen.departamentos.length}`, 100, 210);
    
    let y = 250;
    resumen.departamentos.forEach(depto => {
      if (y > 700) {
        doc.addPage();
        y = 100;
      }
      doc.text(`${depto.codigo} - ${depto.nombre}: ${depto.cantidad} items`, 100, y);
      y += 20;
    });
    
    doc.end();
    
  } catch (error) {
    console.error('❌ Error generando PDF:', error);
    res.status(500).json({ error: 'Error generando reporte PDF' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor API en http://localhost:${PORT}`);
  console.log(`📊 Supabase configurado: ${supabaseUrl}`);
  console.log(`💾 Tablas: public.data + public.scaneo_huecos + public.raw_csv_data`);
  console.log(`✅ SISTEMA CON SUPABASE: CSV se guarda y procesa desde base de datos`);
});