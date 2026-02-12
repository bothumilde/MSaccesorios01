const express = require('express');
const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { renderEtapa01 } = require('./etapa01');
const { renderEtapa02 } = require('./etapa02');
const { renderEtapa03 } = require('./etapa03');
const { renderResumen } = require('./resumen');

const app = express();
const port = process.env.PORT || 3000;

// Servir archivos estáticos (CSS, JS, etc.)
app.use(express.static('.'));

// IMPORTANTE: Middleware para leer los JSON que enviamos desde el navegador
app.use(express.json());

const config = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: 1433,
    authentication: {
        type: 'azure-active-directory-msi-app-service'
    },
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
};

app.get('/', async (req, res) => {
    let sqlStatus = "";
    let sqlVersion = "";

    try {
        let pool = await sql.connect(config);
        let result = await pool.request().query("SELECT @@VERSION as version");
        sqlVersion = result.recordset[0].version;
        sqlStatus = "✅ Nexo con Azure SQL: OK";
    } catch (err) {
        sqlStatus = "❌ Error de conexión: " + err.message;
        sqlVersion = "No disponible";
    }

    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Control de Accesorios FMC</title>
        <link rel="stylesheet" href="styles.css">
    </head>
    <body>
        <div class="container">
            <button class="btn-etapa01" onclick="location.href='/etapa01'">ETAPA 01: CREACIÓN</button>
            <button class="btn-etapa02" onclick="location.href='/etapa02'">ETAPA 02: ENTREGA</button>
            <button class="btn-resumen" onclick="location.href='/resumen'"> BARRA DE PROGRESO</button>
        </div>
        <div class="footer-info">
            <p class="status-badge">${sqlStatus}</p>
            <p>Versión detectada: <br> ${sqlVersion}</p>
        </div>
    </body>
    </html>`);
});

// PÁGINA ETAPA 01
app.get('/etapa01', async (req, res) => {
    try {
        const html = await renderEtapa01(config);
        res.send(html);
    } catch (err) {
        res.status(500).send("Error al cargar Etapa 01: " + err.message);
    }
});

// PÁGINA ETAPA 02
app.get('/etapa02', async (req, res) => {
    try {
        const html = await renderEtapa02(config);
        res.send(html);
    } catch (err) {
        res.status(500).send("Error al cargar Etapa 02: " + err.message);
    }
});

// PÁGINA ETAPA 03 (Temporal)
app.get('/etapa03', async (req, res) => {
    try {
        const html = await renderEtapa03(config);
        res.send(html);
    } catch (err) {
        res.status(500).send("Error al cargar Etapa 03: " + err.message);
    }
});

// PÁGINA RESUMEN
app.get('/resumen', async (req, res) => {
    try {
        const html = await renderResumen(config);
        res.send(html);
    } catch (err) {
        res.status(500).send("Error al cargar Resumen: " + err.message);
    }
});

// --- 2. RUTAS DE API (PROCESAMIENTO) ---

// GUARDAR NUEVA GUÍA (ETAPA 01)
app.post('/api/guardar-guia', async (req, res) => {
    const { items, observaciones } = req.body;
    try {
        let pool = await sql.connect(config);
        const resultGuia = await pool.request()
            .input('obs', sql.NVarChar, observaciones || 'Sin observaciones')
            .query("INSERT INTO guias (observaciones, etapa01) VALUES (@obs, 1); SELECT SCOPE_IDENTITY() AS nueva_id;");
        
        const guiaId = resultGuia.recordset[0].nueva_id;

        for (let item of items) {
            await pool.request()
                .input('g_id', sql.Int, guiaId)
                .input('a_id', sql.Int, item.id)
                .input('cant', sql.Int, item.cantidad)
                .query("INSERT INTO guias_detalle (guias_id, accesorios_id, cantidad) VALUES (@g_id, @a_id, @cant)");
        }
        res.json({ success: true, message: "Guía #" + guiaId + " guardada con éxito." });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// CONSULTAR GUÍA Y VISTA (ETAPA 02)
app.get('/api/consultar-guia/:id', async (req, res) => {
    const guiaId = req.params.id;
    try {
        let pool = await sql.connect(config);
        const resCabecera = await pool.request()
            .input('id', sql.Int, guiaId)
            .query("SELECT fecha, observaciones, etapa02, observaciones_et02, etapa03 FROM guias WHERE id = @id");

        if (resCabecera.recordset.length === 0) {
            return res.json({ success: false, message: "La guía no existe." });
        }

        const resDetalles = await pool.request()
            .input('id', sql.Int, guiaId)
            .query("SELECT * FROM vista_detalle_guia WHERE guias_id = @id");

        res.json({ success: true, cabecera: resCabecera.recordset[0], detalles: resDetalles.recordset });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// EJECUTAR PROCEDIMIENTO ALMACENADO (VALIDACIÓN ETAPA 02)
app.post('/api/validar-etapa02', async (req, res) => {
    const { guiaId, obs } = req.body; // Recibimos ambos datos
    try {
        let pool = await sql.connect(config);
        
        const result = await pool.request()
            .input('guia', sql.Int, guiaId)
            .input('observaciones', sql.NVarChar(1000), obs || '') // Mapea a @observaciones en SQL
            .execute('bnd_etapa02');

        const mensaje = result.recordset[0].Resultado;
        res.json({ success: true, message: mensaje });
    } catch (err) {
        console.error("Error en sqlSP Etapa 02:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/validar-etapa03', async (req, res) => {
    const { guiaId, obs } = req.body;
    try {
        let pool = await sql.connect(config);
        const result = await pool.request()
            .input('guia', sql.Int, guiaId)
            .input('observaciones', sql.NVarChar(1000), obs || '')
            .execute('bnd_etapa03');

        res.json({ success: true, message: result.recordset[0].Resultado });
    } catch (err) {
        console.error("Error en sqlSP Etapa 03:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- 3. INICIO ---
app.listen(port, () => {
    console.log(`Servidor escuchando en el puerto ${port}`);
});