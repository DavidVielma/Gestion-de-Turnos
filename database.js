const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

// Devolver NUMERIC como número y DATE como 'YYYY-MM-DD' (sin desfases de zona horaria)
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : parseFloat(v)));
types.setTypeParser(types.builtins.DATE, (v) => v);

// Vercel + Neon inyecta DATABASE_URL (o POSTGRES_URL) automáticamente
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error('❌ Error: DATABASE_URL debe estar definido (ver README)');
    process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10000
});

let schemaReady = null;

// Crea las tablas si no existen (idempotente, una vez por instancia)
function ensureSchema() {
    if (!schemaReady) {
        const sql = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
        schemaReady = pool.query(sql).catch((err) => {
            schemaReady = null;
            throw err;
        });
    }
    return schemaReady;
}

async function query(text, params) {
    await ensureSchema();
    return pool.query(text, params);
}

module.exports = { pool, query, ensureSchema };
