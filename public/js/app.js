// App.js - Main application logic v3 (Flexible Shifts)

// State
let currentYear = 2026;
let overrides = {}; // Date -> hours (if present, use this instead of default)
let settings = {
    hourly_rate: 12500,
    hours_short: 3,
    hours_long: 4,
    discount_percent: 15
};
let currentTab = 'calendar';
let selectedDate = null;

// Month names
const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

// DOM Elements
const calendarGrid = document.getElementById('calendarGrid');
const yearDisplay = document.getElementById('currentYear');
const usernameDisplay = document.getElementById('username');
const settingsModal = document.getElementById('settingsModal');
const editDayModal = document.getElementById('editDayModal');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const session = await fetch('/api/session').then(r => r.json());
    if (!session.authenticated) {
        window.location.href = '/login';
        return;
    }

    usernameDisplay.textContent = session.username;

    await loadSettings();
    await loadShifts();
    renderCalendar();

    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    // Tab navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Year navigation
    document.getElementById('prevYear').addEventListener('click', () => changeYear(-1));
    document.getElementById('nextYear').addEventListener('click', () => changeYear(1));

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Settings Modal
    document.getElementById('settingsBtn').addEventListener('click', () => openModal(settingsModal));
    document.getElementById('closeSettings').addEventListener('click', () => closeModal(settingsModal));

    // Settings Tabs
    setupSettingsTabs();

    // Save buttons for each tab
    document.getElementById('saveProfile').addEventListener('click', saveProfile);
    document.getElementById('savePayment').addEventListener('click', savePaymentSettings);
    document.getElementById('saveHours').addEventListener('click', saveHoursSettings);
    document.getElementById('changePasswordBtn').addEventListener('click', changePassword);

    // Profile photo upload
    document.getElementById('profilePhotoInput').addEventListener('change', handlePhotoUpload);
    document.getElementById('removePhotoBtn').addEventListener('click', removePhoto);

    // Edit Day Modal
    document.getElementById('closeEditDay').addEventListener('click', () => closeModal(editDayModal));
    document.getElementById('saveDayBtn').addEventListener('click', saveDayOverride);

    // Quick Actions
    document.getElementById('btnSetFree').addEventListener('click', () => setModalHours(0));
    document.getElementById('btnSetShort').addEventListener('click', () => setModalHours(settings.hours_short));
    document.getElementById('btnSetLong').addEventListener('click', () => setModalHours(settings.hours_long));
    document.getElementById('btnSetDefault').addEventListener('click', () => {
        document.getElementById('editDayHours').value = ''; // Empty means default
        document.getElementById('editDayHours').placeholder = 'Default';
    });

    // Close modals on overlay click
    [settingsModal, editDayModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(settingsModal);
            closeModal(editDayModal);
        }
    });

    // Update labels in modal
    document.getElementById('lblShort').textContent = settings.hours_short;
    document.getElementById('lblLong').textContent = settings.hours_long;
}

function setModalHours(hours) {
    document.getElementById('editDayHours').value = hours;
}

// Tab switching
function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}Tab`).classList.add('active');

    if (tab === 'dashboard') {
        loadDashboard();
    }
}

// API Functions
async function loadSettings() {
    try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        settings = data;

        // Update form values
        document.getElementById('hourlyRate').value = settings.hourly_rate;
        document.getElementById('discountPercent').value = settings.discount_percent;
        document.getElementById('hoursShort').value = settings.hours_short;
        document.getElementById('hoursLong').value = settings.hours_long;

        // Update labels
        document.getElementById('legendShort').textContent = settings.hours_short;
        document.getElementById('legendLong').textContent = settings.hours_long;
        document.getElementById('lblShort').textContent = settings.hours_short;
        document.getElementById('lblLong').textContent = settings.hours_long;

        // Profile Data
        if (settings.display_name) {
            document.getElementById('displayName').value = settings.display_name;
            document.getElementById('username').textContent = settings.display_name;
        }

        // Profile Photo
        if (settings.profile_photo) {
            updateHeaderAvatar(settings.profile_photo, settings.display_name || 'U');

            // Update preview in modal
            document.getElementById('profilePhotoImg').src = settings.profile_photo;
            document.getElementById('profilePhotoImg').classList.remove('hidden');
            document.getElementById('profileInitials').classList.add('hidden');
            document.getElementById('removePhotoBtn').classList.remove('hidden');
        } else {
            updateHeaderAvatar(null, settings.display_name || 'U');
        }

        // Apply Theme
        if (settings.theme_mode) {
            applyTheme(settings.theme_mode);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function updateHeaderAvatar(photo, name) {
    const initials = name ? name.charAt(0).toUpperCase() : 'U';

    // Header
    const headerInitials = document.getElementById('headerInitials');
    const headerImg = document.getElementById('headerAvatarImg');

    if (photo) {
        headerImg.src = photo;
        headerImg.classList.remove('hidden');
        headerInitials.classList.add('hidden');
    } else {
        headerImg.src = '';
        headerImg.classList.add('hidden');
        headerInitials.textContent = initials;
        headerInitials.classList.remove('hidden');
    }

    // Modal Preview (if name changes but no photo)
    document.getElementById('profileInitials').textContent = initials;
}

// Theme Logic
async function toggleTheme() {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme_mode', next);

    // Guardar en la base de datos
    try {
        await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ themeMode: next })
        });
    } catch (error) {
        console.error('Error saving theme:', error);
    }
}

function applyTheme(theme) {
    const btn = document.getElementById('themeToggleBtn');
    if (theme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        if (btn) btn.textContent = '☀️';
    } else {
        document.body.removeAttribute('data-theme');
        if (btn) btn.textContent = '🌙';
    }
}

// Init theme on load
const savedTheme = localStorage.getItem('theme_mode');
if (savedTheme) applyTheme(savedTheme);

async function loadShifts() {
    try {
        const response = await fetch(`/api/shifts/${currentYear}`);
        overrides = await response.json(); // Returns object { date: hours }
    } catch (error) {
        console.error('Error loading shifts:', error);
    }
}

// Render Functions
function renderCalendar() {
    calendarGrid.innerHTML = '';

    for (let month = 0; month < 12; month++) {
        const monthCard = createMonthCard(month);
        calendarGrid.appendChild(monthCard);
    }
}

function createMonthCard(month) {
    const card = document.createElement('div');
    card.className = 'month-card';

    const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
    const firstDayOfWeek = getFirstDayOfWeek(currentYear, month);

    // Calculate stats
    const monthStats = calculateMonthStats(month);

    card.innerHTML = `
        <div class="month-header">${MONTHS[month]}</div>
        <div class="month-days">
            <div class="weekday-header">
                ${WEEKDAYS.map(d => `<span>${d}</span>`).join('')}
            </div>
            <div class="days-grid">
                ${createDaysHTML(month, daysInMonth, firstDayOfWeek)}
            </div>
        </div>
        <div class="month-stats">
            <div class="month-stats-row">
                <span>Horas trabajadas</span>
                <span>${monthStats.totalHours}h</span>
            </div>
            <div class="month-stats-row">
                <span>Días trabajados</span>
                <span>${monthStats.daysWorked}</span>
            </div>
            <div class="month-stats-row">
                <span>Días libres</span>
                <span>${monthStats.daysOff}</span>
            </div>
            <div class="month-stats-row">
                <span>Total bruto</span>
                <span>${formatCurrency(monthStats.totalBruto)}</span>
            </div>
            <div class="month-stats-row total">
                <span>Total líquido</span>
                <span>${formatCurrency(monthStats.totalLiquido)}</span>
            </div>
        </div>
    `;

    // Add click handlers for days
    card.querySelectorAll('.day:not(.empty)').forEach(day => {
        day.addEventListener('click', () => openEditDayModal(day.dataset.date));
    });

    return card;
}

function createDaysHTML(month, daysInMonth, firstDayOfWeek) {
    let html = '';
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Empty cells
    for (let i = 0; i < firstDayOfWeek; i++) {
        html += '<div class="day empty"></div>';
    }

    // Days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        const dayInfo = getDayInfo(date);

        let classes = 'day';
        let style = '';
        let title = '';

        // Determine style based on hours
        if (dayInfo.hours === 0) {
            // Day off or Sunday
            if (dayInfo.isSunday && !dayInfo.isOverride) {
                classes += ' sunday';
                style = 'background: #cbd5e0; color: #1a202c;';
            } else {
                classes += ' day-off';
                style = 'background: #fed7d7;';
            }
        } else {
            // Worked
            classes += ' worked';
            if (dayInfo.hours == settings.hours_short) {
                style = 'background: #90cdf4;'; // Blue
            } else if (dayInfo.hours == settings.hours_long) {
                style = 'background: #f6e05e;'; // Yellow
            } else {
                style = 'background: #b2f5ea;'; // Teal for custom hours
            }
        }

        if (dayInfo.isOverride) classes += ' override';
        if (date === todayStr) classes += ' today';

        title = `${dayInfo.hours} horas`;
        if (dayInfo.isOverride) title += ' (Editado)';

        html += `<div class="${classes}" data-date="${date}" style="${style}" title="${title}">${day}</div>`;
    }

    return html;
}

// Utility Functions
function openModal(modal) {
    modal.classList.add('active');
}

function getDayInfo(date) {
    // Fix: Ensure correct timezone handling or simply use UTC day
    // Using simple date creation often leads to timezone issues where Monday shows as Sunday
    const [y, m, d] = date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

    const isOverride = overrides.hasOwnProperty(date);

    if (isOverride) {
        return { hours: Number(overrides[date]), isOverride: true, isSunday: dayOfWeek === 0 };
    }

    // Default logic
    let hours = 0;
    if (dayOfWeek === 0) {
        // Sunday is Free by default
        hours = 0;
    } else if (dayOfWeek >= 1 && dayOfWeek <= 4) {
        // Mon (1) to Thu (4)
        hours = settings.hours_short;
    } else if (dayOfWeek >= 5 && dayOfWeek <= 6) {
        // Fri (5) and Sat (6)
        hours = settings.hours_long;
    }

    return { hours, isOverride: false, isSunday: dayOfWeek === 0 };
}

function getFirstDayOfWeek(year, month) {
    // Fix: Month is 0-indexed in JS Date
    let day = new Date(year, month, 1).getDay();
    // Adjust for Monday start if needed, but standard calendar usually starts Sunday (0) or Monday (1)
    // Let's assume standard JS getDay: 0=Sun, 1=Mon...6=Sat
    // If we want visual calendar starting on Monday:
    return day === 0 ? 6 : day - 1;
}

function calculateMonthStats(month) {
    const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
    let totalHours = 0;
    let daysWorked = 0;
    let daysOff = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayInfo = getDayInfo(date);
        const [y, m, d] = date.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        const dayOfWeek = dateObj.getDay(); // 0 = Sunday

        totalHours += dayInfo.hours;

        // Para domingos: solo contar si el usuario lo marcó explícitamente (isOverride)
        // Para otros días: contar normalmente
        if (dayOfWeek === 0) {
            // Domingo
            if (dayInfo.isOverride) {
                if (dayInfo.hours > 0) {
                    daysWorked++;
                } else {
                    daysOff++;
                }
            }
            // Si no tiene override, no se cuenta
        } else {
            // Lunes a Sábado (días hábiles)
            if (dayInfo.hours > 0) {
                daysWorked++;
            } else {
                daysOff++;
            }
        }
    }

    const totalBruto = totalHours * settings.hourly_rate;
    const totalLiquido = totalBruto * (1 - settings.discount_percent / 100);

    return { totalHours, totalBruto, totalLiquido, daysWorked, daysOff };
}

// Edit Day
function openEditDayModal(date) {
    selectedDate = date;
    const dayInfo = getDayInfo(date);

    const dateObj = new Date(date + 'T00:00:00'); // Valid parsing
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('editDayTitle').textContent = dateObj.toLocaleDateString('es-ES', options);

    // Set input value
    const input = document.getElementById('editDayHours');
    if (dayInfo.isOverride) {
        input.value = dayInfo.hours;
    } else {
        input.value = dayInfo.hours;
    }

    openModal(editDayModal);
    input.focus();
    input.select();
}

async function saveDayOverride() {
    if (!selectedDate) return;

    const input = document.getElementById('editDayHours');
    let hours = input.value === '' ? null : parseFloat(input.value);

    // Check if it's default
    if (hours !== null) {
        // If user enters same as default, we could remove override, but maybe they want to enforce it?
        // Let's just sending whatever they assigned.
    }

    try {
        const response = await fetch('/api/shift', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: selectedDate, hours })
        });

        if (response.ok) {
            if (hours === null) {
                delete overrides[selectedDate];
            } else {
                overrides[selectedDate] = hours;
            }

            renderCalendar();
            closeModal(editDayModal);

            if (currentTab === 'dashboard') {
                loadDashboard();
            }
        }
    } catch (error) {
        console.error('Error saving shift:', error);
        alert('Error al guardar cambio');
    }
}

// Dashboard
async function loadDashboard() {
    try {
        document.getElementById('dashboardYear').textContent = currentYear;

        const response = await fetch(`/api/annual-summary/${currentYear}`);
        const data = await response.json();

        renderDashboardStats(data);
        renderMonthlyChart(data.monthlyData);
        renderMonthlyTable(data.monthlyData);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function renderDashboardStats(data) {
    // Calculo de porcentaje
    const progressPercent = data.totalLiquido > 0
        ? Math.min((data.totalLiquidoReal / data.totalLiquido) * 100, 100)
        : 0;

    const statsHtml = `
        <div class="progress-card">
            <div class="progress-header">
                <span class="progress-title">💰 Totalizador Anual (Meta)</span>
                <span class="progress-values">
                    <strong>${formatCurrency(data.totalLiquidoReal)}</strong> <small class="text-muted">Real</small> / 
                    <span class="text-muted">${formatCurrency(data.totalLiquido)}</span> <small class="text-muted">Proyectado</small>
                    <span style="margin-left:8px; color:var(--success); font-weight:bold;">${progressPercent.toFixed(1)}%</span>
                </span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${progressPercent}%"></div>
            </div>
        </div>

        <div class="dashboard-section-title">📊 Real (A la fecha)</div>
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-icon">💰</div>
                <div class="stat-value">${formatCurrency(data.totalLiquidoReal)}</div>
                <div class="stat-label">Total Líquido Real</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">✅</div>
                <div class="stat-value">${data.totalDaysWorked}</div>
                <div class="stat-label">Días Trabajados</div>
            </div>
        </div>

        <div class="dashboard-section-title">🔮 Proyección Anual (Estimado)</div>
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-icon">📈</div>
                <div class="stat-value">${formatCurrency(data.totalLiquido)}</div>
                <div class="stat-label">Total Líquido Proyectado</div>
            </div>
            <div class="stat-card">
                 <div class="stat-icon">💵</div>
                 <div class="stat-value">${formatCurrency(data.totalBruto)}</div>
                 <div class="stat-label">Total Bruto Anual</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📆</div>
                <div class="stat-value">${data.totalProjectedDays}</div>
                <div class="stat-label">Días Proyectados</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">⏱️</div>
                <div class="stat-value">${data.totalHours}h</div>
                <div class="stat-label">Horas Totales</div>
            </div>
        </div>

        <div class="dashboard-section-title">📉 Métricas y Promedios</div>
        <div class="stats-row">
             <div class="stat-card highlight">
                <div class="stat-icon">📊</div>
                <div class="stat-value">${formatCurrency(data.avgMonthlyLiquido)}</div>
                <div class="stat-label">Promedio Mensual ($)</div>
            </div>
            <div class="stat-card highlight-alt">
                <div class="stat-icon">⌚</div>
                <div class="stat-value">${Math.round(data.avgMonthlyHours)}h</div>
                <div class="stat-label">Promedio Mensual (h)</div>
            </div>
             <div class="stat-card">
                <div class="stat-icon">🏖️</div>
                <div class="stat-value">${data.totalDaysOff}</div>
                <div class="stat-label">Días Libres (Hábiles)</div>
            </div>
        </div>
    `;

    document.getElementById('dashboardStats').innerHTML = statsHtml;
}

function renderMonthlyChart(monthlyData) {
    // Escalar independientemente para mejor visualización
    const maxLiquido = Math.max(...monthlyData.map(m => m.liquido), 1);
    const maxHours = Math.max(...monthlyData.map(m => m.hours), 1);

    const barsHtml = monthlyData.map((m, i) => {
        const heightLiquido = (m.liquido / maxLiquido) * 100;
        const heightHours = (m.hours / maxHours) * 100;

        const displayH_Liq = Math.max(heightLiquido, 5);
        const displayH_Hrs = Math.max(heightHours, 5);

        return `
            <div class="chart-group">
                <div class="bars-container">
                    <div class="chart-bar" style="height: ${displayH_Liq}%;" title="${formatCurrency(m.liquido)}">
                        <span class="chart-bar-value">${formatCurrencyShort(m.liquido)}</span>
                    </div>
                    <div class="chart-bar hours-bar" style="height: ${displayH_Hrs}%;" title="${m.hours}h">
                        <span class="chart-bar-value">${m.hours}h</span>
                    </div>
                </div>
                <div class="chart-bar-label">${MONTHS[i].substring(0, 3)}</div>
            </div>
        `;
    }).join('');

    document.getElementById('monthlyChart').innerHTML = barsHtml;
}

function renderMonthlyTable(monthlyData) {
    const rowsHtml = monthlyData.map((m, i) => `
        <tr>
            <td>${MONTHS[i]}</td>
            <td>${m.hours}h</td>
            <td>${m.daysWorked}</td>
            <td>${m.daysOff}</td>
            <td>${formatCurrency(m.bruto)}</td>
            <td style="color: var(--primary); font-weight: bold;">${formatCurrency(m.liquidoReal)}</td>
            <td style="color: var(--success); font-weight: bold;">${formatCurrency(m.liquido)}</td>
        </tr>
    `).join('');

    document.getElementById('monthlyTableBody').innerHTML = rowsHtml;
}

// Settings & Profile Logic
function setupSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    const contents = document.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Activate clicked
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
        });
    });
}

// Profile Photo Handling
function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 500 * 1024) { // 500KB limit
            alert('La imagen es muy grande. Máximo 500KB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const base64 = e.target.result;
            // Update preview
            document.getElementById('profilePhotoImg').src = base64;
            document.getElementById('profilePhotoImg').classList.remove('hidden');
            document.getElementById('profileInitials').classList.add('hidden');
            document.getElementById('removePhotoBtn').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
}

function removePhoto() {
    document.getElementById('profilePhotoInput').value = '';
    document.getElementById('profilePhotoImg').src = '';
    document.getElementById('profilePhotoImg').classList.add('hidden');
    document.getElementById('profileInitials').classList.remove('hidden');
    document.getElementById('removePhotoBtn').classList.add('hidden');
}

// Save Profile
async function saveProfile() {
    const displayName = document.getElementById('displayName').value.trim();
    const photoImg = document.getElementById('profilePhotoImg');
    // Check if image is visible (meaning we have a photo)
    let profilePhoto = null;
    if (!photoImg.classList.contains('hidden') && photoImg.src) {
        profilePhoto = photoImg.src;
    } else {
        // Explicitly set to empty string or null to remove it if needed?
        // Actually if user removed photo, profilePhotoImg is hidden. 
        // We should send empty string to remove in DB or check logic.
        // For now let's send what we see.
        profilePhoto = ''; // Send empty to remove if it was removed
    }

    try {
        const response = await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName, profilePhoto })
        });

        if (response.ok) {
            alert('Perfil actualizado correctamente');
            // Update header immediately
            document.getElementById('username').textContent = displayName || settings.username || 'Usuario';
            updateHeaderAvatar(profilePhoto, displayName || settings.username);
        } else {
            alert('Error al actualizar perfil');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error de conexión');
    }
}

// Save Payment Settings
async function savePaymentSettings() {
    const hourlyRate = parseFloat(document.getElementById('hourlyRate').value);
    const discountPercent = parseFloat(document.getElementById('discountPercent').value);

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hourlyRate, discountPercent })
        });

        if (response.ok) {
            settings.hourly_rate = hourlyRate;
            settings.discount_percent = discountPercent;
            renderCalendar(); // Re-calc stats
            if (currentTab === 'dashboard') loadDashboard();
            alert('Configuración de pago guardada');
        }
    } catch (error) {
        console.error('Error saving payment settings:', error);
    }
}

// Save Hours Settings
async function saveHoursSettings() {
    const hoursShort = parseFloat(document.getElementById('hoursShort').value);
    const hoursLong = parseFloat(document.getElementById('hoursLong').value);

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hoursShort, hoursLong })
        });

        if (response.ok) {
            settings.hours_short = hoursShort;
            settings.hours_long = hoursLong;

            // Update UI
            document.getElementById('legendShort').textContent = hoursShort;
            document.getElementById('legendLong').textContent = hoursLong;
            document.getElementById('lblShort').textContent = hoursShort;
            document.getElementById('lblLong').textContent = hoursLong;

            renderCalendar();
            if (currentTab === 'dashboard') loadDashboard();
            alert('Configuración de horas guardada');
        }
    } catch (error) {
        console.error('Error saving hours settings:', error);
    }
}

// Change Password
async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const messageDiv = document.getElementById('passwordMessage');

    messageDiv.classList.add('hidden');
    messageDiv.className = 'message';

    if (!currentPassword || !newPassword || !confirmPassword) {
        showMessage('Por favor completa todos los campos', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showMessage('Las nuevas contraseñas no coinciden', 'error');
        return;
    }

    if (newPassword.length < 4) {
        showMessage('La nueva contraseña debe tener al menos 4 caracteres', 'error');
        return;
    }

    try {
        const response = await fetch('/api/user/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            showMessage(data.message, 'success');
            // Clear fields
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            showMessage(data.error || 'Error al cambiar contraseña', 'error');
        }
    } catch (error) {
        showMessage('Error de conexión', 'error');
    }

    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.classList.remove('hidden');
    }
}

// Utility Functions
function openModal(modal) {
    modal.classList.add('active');
}

function closeModal(modal) {
    modal.classList.remove('active');
}

function changeYear(delta) {
    currentYear += delta;
    yearDisplay.textContent = currentYear;
    loadShifts().then(() => {
        renderCalendar();
        if (currentTab === 'dashboard') loadDashboard();
    });
}

function formatCurrency(value) {
    return new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

function formatCurrencyShort(value) {
    if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
        return `$${Math.round(value / 1000)}K`;
    }
    return formatCurrency(value);
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
    } catch (error) {
        console.error('Error logging out:', error);
    }
}
