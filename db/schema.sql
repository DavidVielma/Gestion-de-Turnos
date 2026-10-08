-- Esquema de Gestión de Turnos (PostgreSQL / Neon)
-- Se aplica automáticamente al iniciar el servidor; también puedes ejecutarlo a mano.

CREATE TABLE IF NOT EXISTS users (
    id               BIGSERIAL PRIMARY KEY,
    username         TEXT UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    hourly_rate      NUMERIC NOT NULL DEFAULT 12500,
    hours_short      NUMERIC NOT NULL DEFAULT 3,
    hours_long       NUMERIC NOT NULL DEFAULT 4,
    discount_percent NUMERIC NOT NULL DEFAULT 15.25,
    theme_mode       TEXT,
    display_name     TEXT,
    profile_photo    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_shifts (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       DATE NOT NULL,
    hours      NUMERIC NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, date)
);
