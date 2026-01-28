const express = require('express');
const { supabase } = require('../database');

const router = express.Router();

// Get daily shifts overrides for a year
router.get('/shifts/:year', async (req, res) => {
    try {
        const { year } = req.params;
        const userId = req.session.userId;

        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        const { data: shifts, error } = await supabase
            .from('daily_shifts')
            .select('date, hours')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate);

        if (error) throw error;

        // Return object with date keys for easier lookup
        const result = {};
        shifts.forEach(s => {
            result[s.date] = s.hours;
        });

        res.json(result);
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

        if (!date) {
            return res.status(400).json({ error: 'Fecha requerida' });
        }

        // Check if we already have an override
        const { data: existing } = await supabase
            .from('daily_shifts')
            .select('id')
            .eq('user_id', userId)
            .eq('date', date)
            .single();

        // If hours is null, we remove the override (reset to default)
        if (hours === null || hours === undefined) {
            if (existing) {
                await supabase.from('daily_shifts').delete().eq('id', existing.id);
            }
            return res.json({ success: true, message: 'Día restablecido a valor por defecto' });
        }

        // Upsert logic (Insert or Update)
        if (existing) {
            await supabase
                .from('daily_shifts')
                .update({ hours })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('daily_shifts')
                .insert({ user_id: userId, date, hours });
        }

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

    // Parse date safely avoiding UTC/timezone shifts
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();

    // Default logic
    // Sunday (0)
    if (dayOfWeek === 0) return 0;

    // Mon-Thu (1-4)
    if (dayOfWeek >= 1 && dayOfWeek <= 4) return user.hours_short;

    // Fri-Sat (5-6)
    if (dayOfWeek >= 5 && dayOfWeek <= 6) return user.hours_long;

    return 0;
}

// Get annual summary (Dashboard) including monthly data
router.get('/annual-summary/:year', async (req, res) => {
    try {
        const { year } = req.params;
        const userId = req.session.userId;

        // Get user settings
        const { data: user } = await supabase
            .from('users')
            .select('hourly_rate, hours_short, hours_long, discount_percent, theme_mode, display_name, profile_photo')
            .eq('id', userId)
            .single();

        // Get overrides for the year
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        const { data: shifts } = await supabase
            .from('daily_shifts')
            .select('date, hours')
            .eq('user_id', userId)
            .gte('date', startDate)
            .lte('date', endDate);

        const overrides = {};
        if (shifts) {
            shifts.forEach(s => {
                overrides[s.date] = s.hours;
            });
        }

        // Calculate stats
        let totalHours = 0;
        let totalDaysWorked = 0; // Until today
        let totalProjectedDays = 0; // Whole year
        let totalDaysOff = 0; // Excluding Sundays
        const monthlyData = [];

        // Calculate today based on Chile/Santiago Timezone (GMT-3/GMT-4)
        const santiagoDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Santiago',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());

        const [sy, sm, sd] = santiagoDateStr.split('-').map(Number);
        const today = new Date(sy, sm - 1, sd); // Local Midnight of Santiago/Today

        let totalLiquidoReal = 0; // Accumulated income until today

        for (let month = 1; month <= 12; month++) {
            const monthPadded = String(month).padStart(2, '0');
            const daysInMonth = new Date(year, month, 0).getDate();
            let monthHours = 0;
            let monthDaysWorked = 0;
            let monthDaysOff = 0;

            let monthLiquidoReal = 0;

            for (let day = 1; day <= daysInMonth; day++) {
                const dateStr = `${year}-${monthPadded}-${String(day).padStart(2, '0')}`;

                // Parse date safely
                const [y, m, d] = dateStr.split('-').map(Number);
                const dateObj = new Date(y, m - 1, d); // Local time 00:00:00

                const hours = getHoursForDate(dateStr, user, overrides);

                if (hours > 0) {
                    monthHours += hours;
                    totalProjectedDays++;

                    // Only count as worked if date is <= today
                    if (dateObj <= today) {
                        monthDaysWorked++;
                        // Calculate real income contribution
                        // Note: Daily calculation avoids monthly approximation errors
                        const dailyBruto = hours * user.hourly_rate;
                        const dailyLiquido = dailyBruto * (1 - user.discount_percent / 100);
                        totalLiquidoReal += dailyLiquido;
                        monthLiquidoReal += dailyLiquido;
                    }
                } else {
                    // Check if it's a working day (Mon-Sat -> 1-6)
                    const dayOfWeek = dateObj.getDay();
                    if (dayOfWeek !== 0) {
                        monthDaysOff++;
                    }
                }
            }

            totalHours += monthHours;
            totalDaysWorked += monthDaysWorked;
            totalDaysOff += monthDaysOff;

            monthlyData.push({
                month,
                hours: monthHours,
                bruto: monthHours * user.hourly_rate,
                liquido: monthHours * user.hourly_rate * (1 - user.discount_percent / 100),
                liquidoReal: monthLiquidoReal,
                daysWorked: monthDaysWorked, // This will be 0 for future months in terms of "worked so far" logic? 
                // Wait, user usually wants to see projected income in monthly chart, but "days worked" strictly accumulated.
                // Let's keep monthlyData generic but we return separate total counters.
                daysOff: monthDaysOff
            });
        }

        const totalBruto = totalHours * user.hourly_rate;
        const totalLiquido = totalBruto * (1 - user.discount_percent / 100);

        // Average over 12 months for projection
        const avgMonthly = totalLiquido / 12;
        const avgMonthlyHours = totalHours / 12;

        res.json({
            totalHours,
            totalBruto,
            totalLiquido,
            totalLiquidoReal, // New field
            totalDaysWorked,
            totalProjectedDays,
            totalDaysOff,
            avgMonthlyLiquido: avgMonthly,
            avgMonthlyHours: avgMonthlyHours,
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
        const userId = req.session.userId;

        const { data: user, error } = await supabase
            .from('users')
            .select('hourly_rate, hours_short, hours_long, discount_percent, theme_mode, display_name, profile_photo')
            .eq('id', userId)
            .single();

        if (error) throw error;
        res.json(user);
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
});

// Update user settings
router.put('/settings', async (req, res) => {
    try {
        const { hourlyRate, hoursShort, hoursLong, discountPercent, themeMode } = req.body;
        const userId = req.session.userId;

        const updates = {};
        if (hourlyRate !== undefined) updates.hourly_rate = hourlyRate;
        if (hoursShort !== undefined) updates.hours_short = hoursShort;
        if (hoursLong !== undefined) updates.hours_long = hoursLong;
        if (discountPercent !== undefined) updates.discount_percent = discountPercent;
        if (themeMode !== undefined) updates.theme_mode = themeMode;

        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);

        if (error) throw error;
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
        const userId = req.session.userId;

        const updates = {};
        if (displayName !== undefined) updates.display_name = displayName;
        if (profilePhoto !== undefined) {
            // Validate base64 size (limit to ~500KB)
            if (profilePhoto && profilePhoto.length > 700000) {
                return res.status(400).json({ error: 'La imagen es muy grande. Máximo 500KB' });
            }
            updates.profile_photo = profilePhoto;
        }

        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', userId);

        if (error) throw error;
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

        // Get current user
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('password_hash')
            .eq('id', userId)
            .single();

        if (fetchError) throw fetchError;

        // Verify current password
        const bcrypt = require('bcryptjs');
        const isValid = await bcrypt.compare(currentPassword, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        const { error: updateError } = await supabase
            .from('users')
            .update({ password_hash: hashedPassword })
            .eq('id', userId);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

module.exports = router;
