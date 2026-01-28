const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../database');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: 'El usuario ya existe' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user with default settings
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                username,
                password_hash: passwordHash,
                hourly_rate: 12500,
                hours_short: 3,
                hours_long: 4,
                discount_percent: 15.25
            })
            .select()
            .single();

        if (error) {
            console.error('Register error:', error);
            return res.status(500).json({ error: 'Error al registrar usuario' });
        }

        // Set session
        req.session.userId = newUser.id;
        req.session.username = newUser.username;

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
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        // Find user
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (error || !user) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }

        // Set session
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
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }
        res.json({ success: true, message: 'Sesión cerrada' });
    });
});

module.exports = router;
