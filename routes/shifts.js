const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database');

const router = express.Router();

const USER_FIELDS = 'hourly_rate, hours_short, hours_long, discount_percent, theme_mode, display_name, profile_photo';

const isValidYear = (y) => /^\d{4}$/.test(String(y));
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));
const toNumber = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

async function getUser(userId) {
    const { rows } = await query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [userId]);
    return rows[0];
}

async function getOverrides(userId, year) {
    const { rows } = await query(
        'SELECT date, hours FROM daily_shifts WHERE user_id = $1 AND date BETWEEN $2 AND $3',
        [userId, `${year}-01-01`, `${year}-12-31`]
    );
    const result = {};
    rows.forEach(s => { result[s.date] = s.hours; });
    return result;
}

// Get daily shifts overrides for a year
router.get('/shifts/:year', async (req, res) => {
    try {
        const { year } = req.params;
        if (!isValidYear(year)) return res.status(400).json({ error: 'Año inválido' });

        res.json(await getOverrides(req.session.userId, year));
    } catch (error) {
        console.error('Get shifts error:', error);
        res.status(500).json({ error: 'Error al obtener turnos' });
    }
});

// Update specific day
router.post('/shift', async (req, res) => {
    try {
        const { date, hours } = req.body;
        const userId = req.session.userId;

        if (!date || !isValidDate(date)) {
            return res.status(400).json({ error: 'Fecha requerida' });
        }

        // If hours is null, we remove the override (reset to default)
        if (hours === null || hours === undefined || hours === '') {
            await query('DELETE FROM daily_shifts WHERE user_id = $1 AND date = $2', [userId, date]);
            return res.json({ success: true, message: 'Día restablecido a valor por defecto' });
        }

        const value = Number(hours);
        if (!Number.isFinite(value) || value < 0 || value > 24) {
            return res.status(400).json({ error: 'Horas inválidas (0 a 24)' });
        }

        await query(
            `INSERT INTO daily_shifts (user_id, date, hours) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, date) DO UPDATE SET hours = EXCLUDED.hours`,
            [userId, date, value]
        );

        res.json({ success: true, message: 'Horas actualizadas' });
    } catch (error) {
        console.error('Update shift error:', error);
        res.status(500).json({ error: 'Error al actualizar día' });
    }
});

// Helper: Get hours for a specific date
function getHoursForDate(dateStr, user, overrides) {
    // If we have an override (including 0), use it
    if (overrides[dateStr] !== undefined) {
        return parseFloat(overrides[dateStr]);
    }

    const [y, m, d] = dateStr.split('-').map(Number);
    const dayOfWeek = new Date(y, m - 1, d).getDay();

    if (dayOfWeek === 0) return 0;                          // Domingo
    if (dayOfWeek >= 1 && dayOfWeek <= 4) return user.hours_short; // Lun-Jue
    return user.hours_long;                                 // Vie-Sáb
}

// Get annual summary (Dashboard) including monthly data
router.get('/annual-summary/:year', async (req, res) => {
    try {
        const { year } = req.params;
        if (!isValidYear(year)) return res.status(400).json({ error: 'Año inválido' });
        const userId = req.session.userId;

        const user = await getUser(userId);
        const overrides = await getOverrides(userId, year);

        let totalHours = 0;
        let totalDaysWorked = 0; // Until today
        let totalProjectedDays = 0; // Whole year
        let totalDaysOff = 0; // Excluding Sundays
        let totalLiquidoReal = 0; // Accumulated income until today
        const monthlyData = [];

        // Today in Chile/Santiago
        const santiagoDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());

        const [sy, sm, sd] = santiagoDateStr.split('-').map(Number);
        const today = new Date(sy, sm - 1, sd);
        const net = 1 - user.discount_percent / 100;

        for (let month = 1; month <= 12; month++) {
            const monthPadded = String(month).padStart(2, '0');
            const daysInMonth = new Date(year, month, 0).getDate();
            let monthHours = 0;
            let monthDaysWorked = 0;
            let monthDaysOff = 0;
            let monthLiquidoReal = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${monthPadded}-${String(day).padStart(2, '0')}`;
                const dateObj = new Date(Number(year), month - 1, day);
                const hours = getHoursForDate(dateStr, user, overrides);

                if (hours > 0) {
                    monthHours += hours;
                    totalProjectedDays++;

                    if (dateObj <= today) {
                        monthDaysWorked++;
                        const dailyLiquido = hours * user.hourly_rate * net;
                        totalLiquidoReal += dailyLiquido;
                        monthLiquidoReal += dailyLiquido;
                    }
                } else if (dateObj.getDay() !== 0) {
                    monthDaysOff++;
                }
            }

            totalHours += monthHours;
            totalDaysWorked += monthDaysWorked;
            totalDaysOff += monthDaysOff;

            monthlyData.push({
                month,
                hours: monthHours,
                bruto: monthHours * user.hourly_rate,
                liquido: monthHours * user.hourly_rate * net,
                liquidoReal: monthLiquidoReal,
                daysWorked: monthDaysWorked,
                daysOff: monthDaysOff
            });
        }

        const totalBruto = totalHours * user.hourly_rate;
        const totalLiquido = totalBruto * net;

        res.json({
            totalHours,
            totalBruto,
            totalLiquido,
            totalLiquidoReal,
            totalDaysWorked,
            totalProjectedDays,
            totalDaysOff,
            avgMonthlyLiquido: totalLiquido / 12,
            avgMonthlyHours: totalHours / 12,
            monthlyData,
            settings: {
                hourlyRate: user.hourly_rate,
                hoursShort: user.hours_short,
                hoursLong: user.hours_long,
                discountPercent: user.discount_percent
            }
        });
    } catch (error) {
        console.error('Get annual summary error:', error);
        res.status(500).json({ error: 'Error al obtener resumen anual' });
    }
});

// Get user settings
router.get('/settings', async (req, res) => {
    try {
        const user = await getUser(req.session.userId);
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ ...user, username: req.session.username });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// Update user settings
router.put('/settings', async (req, res) => {
    try {
        const fields = {
            hourly_rate: toNumber(req.body.hourlyRate),
            hours_short: toNumber(req.body.hoursShort),
            hours_long: toNumber(req.body.hoursLong),
            discount_percent: toNumber(req.body.discountPercent),
            theme_mode: req.body.themeMode
        };

        const sets = [];
        const values = [];
        for (const [col, val] of Object.entries(fields)) {
            if (val === undefined) continue;
            if (col !== 'theme_mode' && !Number.isFinite(val)) {
                return res.status(400).json({ error: 'Valores inválidos' });
            }
            values.push(val);
            sets.push(`${col} = $${values.length}`);
        }

        if (sets.length) {
            values.push(req.session.userId);
            await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
        }

        res.json({ success: true, message: 'Configuración actualizada' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
});

// Update user profile (display name and photo)
router.put('/user/profile', async (req, res) => {
    try {
        const { displayName, profilePhoto } = req.body;

        if (profilePhoto && profilePhoto.length > 700000) {
            return res.status(400).json({ error: 'La imagen es muy grande. Máximo 500KB' });
        }

        await query(
            `UPDATE users SET
                display_name = COALESCE($1, display_name),
                profile_photo = CASE WHEN $2::boolean THEN $3 ELSE profile_photo END
             WHERE id = $4`,
            [
                displayName === undefined ? null : displayName,
                profilePhoto !== undefined,
                profilePhoto || null,
                req.session.userId
            ]
        );

        res.json({ success: true, message: 'Perfil actualizado' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

// Change password
router.post('/user/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.session.userId;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseñas requeridas' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
        }

        const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
        if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, userId]);

        res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

module.exports = router;
