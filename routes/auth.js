const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const username = (req.body.username || '').trim();
        const { password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
        if (existing.rows.length) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const { rows } = await query(
            `INSERT INTO users (username, password_hash) VALUES ($1, $2)
             RETURNING id, username`,
            [username, passwordHash]
        );

        req.session.userId = rows[0].id;
        req.session.username = rows[0].username;

        console.log(`✅ Usuario registrado: ${username}`);
        res.json({ success: true, message: 'Usuario registrado exitosamente' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const username = (req.body.username || '').trim();
        const { password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        const { rows } = await query(
            'SELECT id, username, password_hash FROM users WHERE username = $1',
            [username]
        );
        const user = rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        req.session.userId = user.id;
        req.session.username = user.username;

        console.log(`✅ Login: ${username}`);
        res.json({ success: true, message: 'Inicio de sesión exitoso' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session = null;
    res.json({ success: true, message: 'Sesión cerrada' });
});

module.exports = router;
