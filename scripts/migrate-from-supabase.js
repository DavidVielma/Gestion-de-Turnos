/**
 * Copia usuarios y turnos desde Supabase a la nueva base PostgreSQL (Neon).
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_KEY=... DATABASE_URL=... npm run migrate:supabase
 *
 * - Usa la API REST de Supabase (no requiere instalar @supabase/supabase-js).
 * - Es idempotente: se puede ejecutar varias veces sin duplicar datos.
 * - Si el proyecto de Supabase está pausado, reactívalo una última vez antes de correrlo.
 */
require('dotenv').config();

const { pool, ensureSchema } = require('../database');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Define SUPABASE_URL y SUPABASE_KEY (usa la service_role key si tienes RLS activado)');
    process.exit(1);
}

async function fetchAll(table) {
    const pageSize = 1000;
    const rows = [];
    for (let from = 0; ; from += pageSize) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                Range: `${from}-${from + pageSize - 1}`
            }
        });
        if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
        const page = await res.json();
        rows.push(...page);
        if (page.length < pageSize) return rows;
    }
}

async function main() {
    await ensureSchema();

    const users = await fetchAll('users');
    const shifts = await fetchAll('daily_shifts');
    console.log(`📥 Supabase: ${users.length} usuarios, ${shifts.length} turnos`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Mapa id de Supabase -> id nuevo (por si los ids no coinciden)
        const idMap = new Map();
        for (const u of users) {
            const { rows } = await client.query(
                `INSERT INTO users (username, password_hash, hourly_rate, hours_short, hours_long,
                                    discount_percent, theme_mode, display_name, profile_photo)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (username) DO UPDATE SET
                    password_hash = EXCLUDED.password_hash,
                    hourly_rate = EXCLUDED.hourly_rate,
                    hours_short = EXCLUDED.hours_short,
                    hours_long = EXCLUDED.hours_long,
                    discount_percent = EXCLUDED.discount_percent,
                    theme_mode = EXCLUDED.theme_mode,
                    display_name = EXCLUDED.display_name,
                    profile_photo = EXCLUDED.profile_photo
                 RETURNING id`,
                [
                    u.username, u.password_hash,
                    u.hourly_rate ?? 12500, u.hours_short ?? 3, u.hours_long ?? 4,
                    u.discount_percent ?? 15.25, u.theme_mode ?? null,
                    u.display_name ?? null, u.profile_photo ?? null
                ]
            );
            idMap.set(String(u.id), rows[0].id);
        }

        let copied = 0;
        for (const s of shifts) {
            const userId = idMap.get(String(s.user_id));
            if (!userId) continue;
            await client.query(
                `INSERT INTO daily_shifts (user_id, date, hours) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, date) DO UPDATE SET hours = EXCLUDED.hours`,
                [userId, String(s.date).slice(0, 10), s.hours]
            );
            copied++;
        }

        await client.query('COMMIT');
        console.log(`✅ Migración completa: ${idMap.size} usuarios, ${copied} turnos`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('❌ Error en la migración:', err.message);
    process.exit(1);
});
