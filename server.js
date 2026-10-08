require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');

// Import database (validates DATABASE_URL)
require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

if (isProduction && !process.env.SESSION_SECRET) {
    console.warn('⚠️  SESSION_SECRET no está definido: usa uno propio en producción');
}

app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Sesión en cookie firmada: funciona en serverless (Vercel) sin almacenamiento en servidor
app.use(cookieSession({
    name: 'turnos_session',
    keys: [process.env.SESSION_SECRET || 'gestion-turnos-secret-key-2026'],
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
}));

// Renueva la cookie en cada visita para que la sesión no caduque mientras se usa
app.use((req, res, next) => {
    if (req.session && req.session.userId) req.session.touchedAt = Math.floor(Date.now() / 60000);
    next();
});

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Auth middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

// Import routes
const authRoutes = require('./routes/auth');
const shiftsRoutes = require('./routes/shifts');

// Check session status
app.get('/api/session', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ authenticated: true, username: req.session.username });
    } else {
        res.json({ authenticated: false });
    }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, shiftsRoutes);

// Serve login page
app.get('/login', (req, res) => {
    if (req.session && req.session.userId) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve main app
app.get('/', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server (local). En Vercel se usa el app exportado.
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        console.log('📅 Gestión de Turnos v3 - PostgreSQL');
    });
}

module.exports = app;
