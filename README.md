# Turnos

Registro de turnos y cálculo de honorarios para personal de salud: matronas, enfermeras, TENS, médicos y cualquier persona a la que le pagan por hora o por turno.

- **Calendario mensual**: cada día muestra sus horas. Tócalo para marcarlo libre, de 12 h, de 24 h o con las horas que quieras.
- **Resumen anual**: lo ganado a la fecha, la proyección del año y el detalle por mes.
- **App instalable (PWA)**: se instala desde el navegador en Android, iPhone y escritorio.
- **Modo claro y oscuro** (o el del sistema).

Stack: Node + Express, PostgreSQL ([Neon](https://neon.tech)), HTML/CSS/JS sin framework, desplegado en Vercel.

## Por qué Neon y no Supabase

El plan gratis de Supabase **pausa el proyecto tras 7 días sin uso** y hay que reactivarlo a mano. Neon también "duerme" cuando nadie lo usa, pero **despierta solo** con la siguiente consulta, en menos de un segundo. No hay que hacer nada.

Además se conecta desde el panel de Vercel en un clic, y Vercel crea la variable `DATABASE_URL` por ti.

## Pasos para migrar (una sola vez)

1. **Crear la base en Vercel**: en tu proyecto, ve a *Storage → Create Database → Neon (Serverless Postgres)*, crea la base (plan Free) y conéctala al proyecto, marcando *Production*, *Preview* y *Development*. Esto agrega `DATABASE_URL`.
2. **Agregar `SESSION_SECRET`**: en *Settings → Environment Variables*, agrega un texto largo y aleatorio. Puedes generarlo con `openssl rand -hex 32`.
3. **Copiar tus datos desde Supabase**:
   - Si el proyecto de Supabase está pausado, reactívalo una última vez.
   - En tu computador, crea un `.env` con `DATABASE_URL` (cópiala desde Vercel), `SUPABASE_URL` y `SUPABASE_KEY`. Usa la *service_role key* si tienes RLS activado.
   - Ejecuta:
     ```bash
     npm install
     npm run migrate:supabase
     ```
   El script se puede correr varias veces sin duplicar datos. Los usuarios conservan su contraseña.
4. **Desplegar**: haz merge o push de la rama. Las tablas se crean solas al primer arranque (`db/schema.sql`).
5. Cuando confirmes que todo está bien, borra `SUPABASE_URL` y `SUPABASE_KEY` de Vercel y elimina el proyecto de Supabase.

## Instalar la app en el celular

- **Android (Chrome)**: abre la web y entra a *Ajustes → Instalar app*, o usa el menú ⋮ → *Instalar aplicación*.
- **iPhone (Safari)**: toca *Compartir* → *Agregar a inicio*.

## Desarrollo local

```bash
cp .env.example .env   # y completa DATABASE_URL
npm install
npm run dev            # http://localhost:3000
```
