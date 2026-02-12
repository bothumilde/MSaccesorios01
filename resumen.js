const sql = require('mssql');

async function renderResumen(config) {
    let guias = [];

    try {
        let pool = await sql.connect(config);
        let result = await pool.request().query(`
            SELECT TOP 10 id, fecha, observaciones, fecha_et02, observaciones_et02, etapa01, etapa02
            FROM guias
            ORDER BY fecha DESC
        `);
        guias = result.recordset;
    } catch (err) {
        console.error("Error en Resumen:", err);
    }

    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resumen de Guías</title>
        <link rel="stylesheet" href="styles.css">
    </head>
    <body class="resumen">
        <div class="container">
            <h2>📊 Resumen de Guías - Top 10 Recientes</h2>
            <div class="guias-list">
                ${guias.map(guia => {
                    let progress = 0;
                    let statusText = 'Pendiente';
                    let color = '#ccc';
                    if (guia.etapa01) {
                        progress = 50;
                        statusText = 'Creada y Enviada';
                        color = '#ff9800';
                    }
                    if (guia.etapa02) {
                        progress = 100;
                        statusText = 'Completada';
                        color = '#4caf50';
                    }
                    return `
                        <div class="guia-item">
                            <div class="guia-header">
                                <span class="guia-id">Guía #${guia.id}</span>
                                <span class="guia-fecha">${new Date(guia.fecha).toLocaleDateString()}</span>
                            </div>
                            <div class="progress-container">
                                <div class="progress-bar" style="width: ${progress}%; background-color: ${color};"></div>
                            </div>
                            <div class="progress-text">${statusText} (${progress}%)</div>
                            <div class="guia-details">
                                <p><strong>Observaciones:</strong> ${guia.observaciones || 'Sin observaciones'}</p>
                                ${guia.fecha_et02 ? `<p><strong>Fecha Etapa 02:</strong> ${new Date(guia.fecha_et02).toLocaleDateString()}</p>` : ''}
                                ${guia.observaciones_et02 ? `<p><strong>Observaciones Etapa 02:</strong> ${guia.observaciones_et02}</p>` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <a href="/" class="btn-back">← Volver al Panel Principal</a>
        </div>
    </body>
    </html>`;
}

module.exports = { renderResumen };
