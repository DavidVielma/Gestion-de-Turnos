// App.js — Turnos v3

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const VIEW_TITLES = { calendar: 'Calendario', summary: 'Resumen', settings: 'Ajustes' };

const now = new Date();
const state = {
    view: 'calendar',
    year: now.getFullYear(),
    month: now.getMonth(),
    summaryYear: now.getFullYear(),
    overrides: {}, // { year: { 'YYYY-MM-DD': hours } }
    settings: { hourly_rate: 12500, hours_short: 3, hours_long: 4, discount_percent: 15.25 },
    username: '',
    selectedDate: null,
    calMode: (() => { try { return localStorage.getItem('cal_mode') || 'month'; } catch (e) { return 'month'; } })(),
    pendingPhoto: undefined
};

const $ = (id) => document.getElementById(id);

// ---------- Helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const toKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => {
    const t = new Date();
    return toKey(t.getFullYear(), t.getMonth(), t.getDate());
};
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const formatCurrency = (v) => clp.format(Math.round(v || 0));
const formatHours = (h) => `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')}`;
const netFactor = () => 1 - (Number(state.settings.discount_percent) || 0) / 100;

async function api(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (res.status === 401) {
        window.location.href = '/login';
        throw new Error('No autorizado');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Error de conexión');
    return data;
}

let toastTimer;
function toast(text, type = '') {
    const el = $('toast');
    el.textContent = text;
    el.className = `toast show ${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, 2200);
}

// ---------- Day logic ----------
function getDayInfo(key) {
    const [y, m, d] = key.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const yearOverrides = state.overrides[y] || {};
    const isOverride = Object.prototype.hasOwnProperty.call(yearOverrides, key);
    const s = state.settings;

    let hours;
    if (isOverride) hours = Number(yearOverrides[key]);
    else if (dow === 0) hours = 0;
    else if (dow <= 4) hours = Number(s.hours_short);
    else hours = Number(s.hours_long);

    let type = 'custom';
    if (hours === 0) type = 'off';
    else if (hours === Number(s.hours_short)) type = 'short';
    else if (hours === Number(s.hours_long)) type = 'long';

    return { hours, isOverride, dow, type };
}

function monthStats(year, month) {
    const days = new Date(year, month + 1, 0).getDate();
    const tKey = todayKey();
    let hours = 0, worked = 0, off = 0, hoursToDate = 0;

    for (let d = 1; d <= days; d++) {
        const key = toKey(year, month, d);
        const info = getDayInfo(key);
        hours += info.hours;
        if (key <= tKey) hoursToDate += info.hours;

        // Domingos solo cuentan si se editaron explícitamente
        if (info.dow === 0 && !info.isOverride) continue;
        if (info.hours > 0) worked++;
        else off++;
    }

    const rate = Number(state.settings.hourly_rate) || 0;
    return {
        hours,
        worked,
        off,
        bruto: hours * rate,
        liquido: hours * rate * netFactor(),
        liquidoToDate: hoursToDate * rate * netFactor()
    };
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', async () => {
    setupNavigation();
    setupCalendar();
    setupSheet();
    setupSettings();
    setupInstall();
    renderCalendar();

    const initialView = new URLSearchParams(location.search).get('view');
    if (VIEW_TITLES[initialView]) switchView(initialView);

    try {
        const session = await api('/api/session');
        if (!session.authenticated) {
            window.location.href = '/login';
            return;
        }
        state.username = session.username;
        await Promise.all([loadSettings(), loadYear(state.year)]);
        renderCalendar();
    } catch (err) {
        if (err.message !== 'No autorizado') toast('No se pudieron cargar tus datos', 'error');
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

async function loadYear(year, force = false) {
    if (state.overrides[year] && !force) return;
    state.overrides[year] = await api(`/api/shifts/${year}`);
}

async function loadSettings() {
    const s = await api('/api/settings');
    state.settings = s;
    if (s.username) state.username = s.username;

    $('hourlyRate').value = s.hourly_rate;
    $('discountPercent').value = s.discount_percent;
    $('hoursShort').value = s.hours_short;
    $('hoursLong').value = s.hours_long;
    $('displayName').value = s.display_name || '';
    $('usernameField').value = state.username;

    updateHoursLabels();
    updateIdentity(s.display_name, s.profile_photo);
    applyTheme(s.theme_mode || localStorage.getItem('theme_mode') || 'system');
}

function updateHoursLabels() {
    const { hours_short, hours_long } = state.settings;
    document.querySelectorAll('.legend-short').forEach(el => { el.textContent = formatHours(Number(hours_short)); });
    document.querySelectorAll('.legend-long').forEach(el => { el.textContent = formatHours(Number(hours_long)); });
    $('presetShort').textContent = `${formatHours(Number(hours_short))} h`;
    $('presetLong').textContent = `${formatHours(Number(hours_long))} h`;
    document.querySelector('[data-preset="short"]').dataset.hours = hours_short;
    document.querySelector('[data-preset="long"]').dataset.hours = hours_long;
}

function updateIdentity(displayName, photo) {
    const name = displayName || state.username || '';
    const first = name.split(' ')[0];
    const h = new Date().getHours();
    const hello = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    $('greeting').textContent = first ? `${hello}, ${first}` : hello;

    const initial = (name.trim().charAt(0) || 'U').toUpperCase();
    for (const [img, init] of [['avatarImg', 'avatarInitials'], ['profileImg', 'profileInitials']]) {
        $(init).textContent = initial;
        $(img).classList.toggle('hidden', !photo);
        $(init).classList.toggle('hidden', !!photo);
        if (photo) $(img).src = photo;
        else $(img).removeAttribute('src');
    }
    $('removePhotoBtn').classList.toggle('hidden', !photo);
}

// ---------- Navigation ----------
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });
    $('avatarBtn').addEventListener('click', () => switchView('settings'));
}

function switchView(view) {
    state.view = view;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
    $('viewTitle').textContent = VIEW_TITLES[view];
    window.scrollTo({ top: 0 });
    if (view === 'summary') loadSummary();
}

// ---------- Calendar ----------
function setupCalendar() {
    $('prevMonth').addEventListener('click', () => step(-1));
    $('nextMonth').addEventListener('click', () => step(1));
    $('todayBtn').addEventListener('click', () => {
        const t = new Date();
        goToMonth(t.getFullYear(), t.getMonth()).then(() => {
            if (state.calMode === 'year') scrollToCurrentMini();
        });
    });

    document.querySelectorAll('[data-cal-mode]').forEach(btn => {
        btn.addEventListener('click', () => setCalMode(btn.dataset.calMode));
    });

    $('daysGrid').addEventListener('click', (e) => {
        const day = e.target.closest('.day[data-date]');
        if (day) openSheet(day.dataset.date);
    });

    $('yearGrid').addEventListener('click', (e) => {
        const day = e.target.closest('.mini-day[data-date]');
        if (day) return openSheet(day.dataset.date);
        const head = e.target.closest('[data-open-month]');
        if (head) {
            state.month = Number(head.dataset.openMonth);
            setCalMode('month');
            window.scrollTo({ top: 0 });
        }
    });

    // Swipe horizontal para cambiar de mes (o de año en la vista anual)
    for (const el of [$('daysGrid'), $('yearGrid')]) {
        let startX = null, startY = null;
        el.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
            if (startX === null) return;
            const dx = e.changedTouches[0].clientX - startX;
            const dy = e.changedTouches[0].clientY - startY;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
            startX = null;
        });
    }

    setCalMode(state.calMode);
}

function setCalMode(mode) {
    state.calMode = mode === 'year' ? 'year' : 'month';
    try { localStorage.setItem('cal_mode', state.calMode); } catch (e) { /* sin almacenamiento */ }
    document.querySelectorAll('[data-cal-mode]').forEach(b => b.classList.toggle('active', b.dataset.calMode === state.calMode));
    $('prevMonth').setAttribute('aria-label', state.calMode === 'year' ? 'Año anterior' : 'Mes anterior');
    $('nextMonth').setAttribute('aria-label', state.calMode === 'year' ? 'Año siguiente' : 'Mes siguiente');
    renderCalendar();
}

function step(delta) {
    if (state.calMode === 'year') goToMonth(state.year + delta, state.month);
    else changeMonth(delta);
}

function changeMonth(delta) {
    let m = state.month + delta;
    let y = state.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    goToMonth(y, m);
}

async function goToMonth(year, month) {
    state.year = year;
    state.month = month;
    renderCalendar();
    if (!state.overrides[year]) {
        try {
            await loadYear(year);
            if (state.year === year) renderCalendar();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
}

function renderCalendar() {
    const isYear = state.calMode === 'year';
    $('monthView').classList.toggle('hidden', isYear);
    $('yearView').classList.toggle('hidden', !isYear);
    $('monthLabel').textContent = isYear ? String(state.year) : `${MONTHS[state.month]} ${state.year}`;
    if (isYear) renderYear();
    else renderMonth();
}

function renderMonth() {
    const { year, month } = state;

    const first = new Date(year, month, 1).getDay();
    const offset = first === 0 ? 6 : first - 1; // Semana inicia lunes
    const days = new Date(year, month + 1, 0).getDate();
    const tKey = todayKey();
    const loaded = !!state.overrides[year];

    let html = '';
    for (let i = 0; i < offset; i++) html += '<div class="day empty"></div>';

    for (let d = 1; d <= days; d++) {
        const key = toKey(year, month, d);
        const info = getDayInfo(key);
        const cls = ['day', info.type];
        if (info.isOverride) cls.push('override');
        if (key === tKey) cls.push('today');
        else if (key < tKey) cls.push('past');

        const label = `${d} de ${MONTHS[month]}: ${info.hours ? `${formatHours(info.hours)} horas` : 'libre'}`;
        html += `<button class="${cls.join(' ')}" data-date="${key}" aria-label="${label}"${loaded ? '' : ' disabled'}>
            <span class="day-n">${d}</span><span class="day-h">${formatHours(info.hours)}h</span>
        </button>`;
    }

    $('daysGrid').innerHTML = html;
    renderMonthSummary();
}

function renderMonthSummary() {
    const { year, month } = state;
    const s = monthStats(year, month);
    const t = new Date();
    const isCurrent = t.getFullYear() === year && t.getMonth() === month;
    const isPast = year < t.getFullYear() || (year === t.getFullYear() && month < t.getMonth());
    const pct = s.liquido > 0 ? Math.min(100, (s.liquidoToDate / s.liquido) * 100) : 0;

    let sub = `${formatHours(s.hours)} h · ${s.worked} ${s.worked === 1 ? 'día' : 'días'} de turno`;
    if (isCurrent) sub = `${formatCurrency(s.liquidoToDate)} ganados a la fecha`;

    $('monthSummary').innerHTML = `
        <div class="hero">
            <p class="eyebrow">Líquido ${isPast ? '' : 'estimado '}· ${MONTHS[month]}</p>
            <div class="hero-value num">${formatCurrency(s.liquido)}</div>
            <p class="hero-sub">${sub}</p>
            ${isCurrent ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        <div class="stats">
            <div class="stat"><div class="stat-label">Horas</div><div class="stat-value num">${formatHours(s.hours)}</div></div>
            <div class="stat"><div class="stat-label">Días de turno</div><div class="stat-value num">${s.worked}</div></div>
            <div class="stat"><div class="stat-label">Bruto</div><div class="stat-value num">${formatCurrency(s.bruto)}</div></div>
            <div class="stat"><div class="stat-label">Días libres</div><div class="stat-value num">${s.off}</div></div>
        </div>
    `;
}

// ---------- Year overview ----------
const clpCompact = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', notation: 'compact', maximumFractionDigits: 1 });

function renderYear() {
    const year = state.year;
    const t = new Date();
    const tKey = todayKey();
    const loaded = !!state.overrides[year];
    const currentMonth = t.getFullYear() === year ? t.getMonth() : -1;

    let totalLiquido = 0, totalToDate = 0, totalHours = 0, totalWorked = 0;
    let html = '';

    for (let m = 0; m < 12; m++) {
        const s = monthStats(year, m);
        totalLiquido += s.liquido;
        totalToDate += s.liquidoToDate;
        totalHours += s.hours;
        totalWorked += s.worked;

        const first = new Date(year, m, 1).getDay();
        const offset = first === 0 ? 6 : first - 1;
        const days = new Date(year, m + 1, 0).getDate();

        let cells = '';
        for (let i = 0; i < offset; i++) cells += '<span class="mini-day empty"></span>';
        for (let d = 1; d <= days; d++) {
            const key = toKey(year, m, d);
            const info = getDayInfo(key);
            const cls = ['mini-day', info.type];
            if (info.isOverride) cls.push('override');
            if (key === tKey) cls.push('today');
            else if (key < tKey) cls.push('past');
            const label = `${d} de ${MONTHS[m]}: ${info.hours ? `${formatHours(info.hours)} horas` : 'libre'}`;
            cells += `<button class="${cls.join(' ')}" data-date="${key}" aria-label="${label}"${loaded ? '' : ' disabled'}>${d}</button>`;
        }

        html += `
            <div class="mini${m === currentMonth ? ' current' : ''}" data-month="${m}">
                <button class="mini-head" data-open-month="${m}">
                    <span class="mini-name">${capitalize(MONTHS[m])}</span>
                    <span class="mini-value num">${clpCompact.format(s.liquido)}</span>
                </button>
                <div class="mini-days">${cells}</div>
                <div class="mini-foot">${formatHours(s.hours)} h · ${s.worked} ${s.worked === 1 ? 'turno' : 'turnos'}</div>
            </div>`;
    }

    $('yearGrid').innerHTML = html;

    const pct = totalLiquido > 0 ? Math.min(100, (totalToDate / totalLiquido) * 100) : 0;
    const isPast = year < t.getFullYear();
    const isFuture = year > t.getFullYear();
    $('yearSummary').innerHTML = `
        <div class="hero">
            <p class="eyebrow">Líquido ${isPast ? '' : 'proyectado '}· ${year}</p>
            <div class="hero-value num">${formatCurrency(totalLiquido)}</div>
            <p class="hero-sub">${isPast || isFuture
                ? `${formatHours(totalHours)} h · ${totalWorked} días de turno`
                : `${formatCurrency(totalToDate)} ganados a la fecha · ${pct.toFixed(0)}%`}</p>
            ${!isPast && !isFuture ? `<div class="progress"><i style="width:${pct}%"></i></div>` : ''}
        </div>
        <div class="stats stats-3">
            <div class="stat"><div class="stat-label">Horas</div><div class="stat-value num">${formatHours(totalHours)}</div></div>
            <div class="stat"><div class="stat-label">Días de turno</div><div class="stat-value num">${totalWorked}</div></div>
            <div class="stat"><div class="stat-label">Por mes</div><div class="stat-value num">${clpCompact.format(totalLiquido / 12)}</div></div>
        </div>`;
}

function scrollToCurrentMini() {
    const el = document.querySelector('.mini.current');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---------- Day sheet ----------
function setupSheet() {
    $('closeSheet').addEventListener('click', closeSheet);
    $('sheetBackdrop').addEventListener('click', closeSheet);
    $('saveDayBtn').addEventListener('click', () => saveDay(readSheetHours()));
    $('resetDayBtn').addEventListener('click', () => saveDay(null));
    $('hoursMinus').addEventListener('click', () => stepHours(-0.5));
    $('hoursPlus').addEventListener('click', () => stepHours(0.5));
    $('hoursInput').addEventListener('input', syncSheet);

    $('presets').addEventListener('click', (e) => {
        const p = e.target.closest('.preset');
        if (!p) return;
        $('hoursInput').value = p.dataset.hours;
        syncSheet();
    });

    document.addEventListener('keydown', (e) => {
        if (!document.body.classList.contains('sheet-open')) return;
        if (e.key === 'Escape') closeSheet();
        if (e.key === 'Enter') saveDay(readSheetHours());
    });

    // Deslizar hacia abajo para cerrar
    const sheet = $('daySheet');
    let y0 = null;
    sheet.addEventListener('touchstart', (e) => {
        if (e.target.closest('.presets, input')) return;
        y0 = e.touches[0].clientY;
    }, { passive: true });
    sheet.addEventListener('touchmove', (e) => {
        if (y0 === null) return;
        const dy = Math.max(0, e.touches[0].clientY - y0);
        sheet.style.transition = 'none';
        sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', (e) => {
        if (y0 === null) return;
        const dy = e.changedTouches[0].clientY - y0;
        sheet.style.transition = '';
        sheet.style.transform = '';
        y0 = null;
        if (dy > 90) closeSheet();
    });
}

function openSheet(key) {
    state.selectedDate = key;
    const info = getDayInfo(key);
    const [y, m, d] = key.split('-').map(Number);

    $('sheetWeekday').textContent = WEEKDAYS_LONG[info.dow] + (info.isOverride ? ' · editado' : '');
    $('sheetTitle').textContent = `${d} de ${MONTHS[m - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
    $('hoursInput').value = info.hours;
    $('resetDayBtn').classList.toggle('hidden', !info.isOverride);
    syncSheet();

    document.body.classList.add('sheet-open');
}

function closeSheet() {
    document.body.classList.remove('sheet-open');
    state.selectedDate = null;
}

function readSheetHours() {
    const v = parseFloat(String($('hoursInput').value).replace(',', '.'));
    return Number.isFinite(v) ? Math.min(24, Math.max(0, v)) : 0;
}

function stepHours(delta) {
    $('hoursInput').value = Math.min(24, Math.max(0, readSheetHours() + delta));
    syncSheet();
}

function syncSheet() {
    const h = readSheetHours();
    document.querySelectorAll('.preset').forEach(p => p.classList.toggle('active', Number(p.dataset.hours) === h));
    const earn = h * (Number(state.settings.hourly_rate) || 0) * netFactor();
    $('sheetEarn').textContent = h > 0 ? `≈ ${formatCurrency(earn)} líquido` : 'Día libre';
}

async function saveDay(hours) {
    const key = state.selectedDate;
    if (!key) return;
    const year = Number(key.slice(0, 4));
    const yearOverrides = state.overrides[year] || (state.overrides[year] = {});
    const had = Object.prototype.hasOwnProperty.call(yearOverrides, key);
    const previous = yearOverrides[key];

    // Actualización optimista
    if (hours === null) delete yearOverrides[key];
    else yearOverrides[key] = hours;
    closeSheet();
    renderCalendar();

    try {
        await api('/api/shift', { method: 'POST', body: { date: key, hours } });
        toast(hours === null ? 'Día restablecido' : 'Turno guardado');
    } catch (err) {
        if (had) yearOverrides[key] = previous;
        else delete yearOverrides[key];
        renderCalendar();
        toast(err.message, 'error');
    }
}

// ---------- Summary ----------
function setupSummaryNav() {
    $('prevYear').addEventListener('click', () => { state.summaryYear--; loadSummary(); });
    $('nextYear').addEventListener('click', () => { state.summaryYear++; loadSummary(); });
}

async function loadSummary() {
    const year = state.summaryYear;
    $('yearLabel').textContent = year;
    try {
        const data = await api(`/api/annual-summary/${year}`);
        if (year === state.summaryYear) renderSummary(data, year);
    } catch (err) {
        toast(err.message, 'error');
    }
}

function renderSummary(data, year) {
    const t = new Date();
    const pct = data.totalLiquido > 0 ? Math.min(100, (data.totalLiquidoReal / data.totalLiquido) * 100) : 0;
    const max = Math.max(...data.monthlyData.map(m => m.liquido), 1);
    const currentMonth = t.getFullYear() === year ? t.getMonth() : -1;

    const bars = data.monthlyData.map((m, i) => {
        const h = (m.liquido / max) * 100;
        const fill = m.liquido > 0 ? (m.liquidoReal / m.liquido) * 100 : 0;
        return `<div class="bar-col${i === currentMonth ? ' current' : ''}" title="${capitalize(MONTHS[i])}: ${formatCurrency(m.liquido)}">
            <div class="bar" style="height:${Math.max(h, 3)}%"><i style="height:${fill}%"></i></div>
            <span class="bar-label">${MONTHS[i].charAt(0).toUpperCase()}</span>
        </div>`;
    }).join('');

    const rows = data.monthlyData.map((m, i) => `
        <button class="row${i === currentMonth ? ' current' : ''}" data-month="${i}" style="width:100%;text-align:left">
            <span class="row-title">${capitalize(MONTHS[i])}</span>
            <span class="row-value num">${formatCurrency(m.liquido)}</span>
            <span class="row-sub">${formatHours(m.hours)} h · ${m.daysOff} libres</span>
            <span class="row-sub num" style="text-align:right">${m.liquidoReal > 0 && m.liquidoReal < m.liquido - 1 ? `${formatCurrency(m.liquidoReal)} a la fecha` : formatCurrency(m.bruto) + ' bruto'}</span>
        </button>`).join('');

    $('summaryContent').innerHTML = `
        <div class="hero span-2">
            <p class="eyebrow">Ganado a la fecha · ${year}</p>
            <div class="hero-value num">${formatCurrency(data.totalLiquidoReal)}</div>
            <p class="hero-sub">de ${formatCurrency(data.totalLiquido)} proyectados · ${pct.toFixed(0)}%</p>
            <div class="progress"><i style="width:${pct}%"></i></div>
        </div>

        <div class="stats stats-4 span-2">
            <div class="stat"><div class="stat-label">Promedio mensual</div><div class="stat-value num">${formatCurrency(data.avgMonthlyLiquido)}</div></div>
            <div class="stat"><div class="stat-label">Bruto anual</div><div class="stat-value num">${formatCurrency(data.totalBruto)}</div></div>
            <div class="stat"><div class="stat-label">Horas al año</div><div class="stat-value num">${formatHours(data.totalHours)}</div></div>
            <div class="stat"><div class="stat-label">Horas / mes</div><div class="stat-value num">${formatHours(Math.round(data.avgMonthlyHours))}</div></div>
            <div class="stat"><div class="stat-label">Días trabajados</div><div class="stat-value num">${data.totalDaysWorked}</div></div>
            <div class="stat"><div class="stat-label">Días proyectados</div><div class="stat-value num">${data.totalProjectedDays}</div></div>
            <div class="stat"><div class="stat-label">Días libres hábiles</div><div class="stat-value num">${data.totalDaysOff}</div></div>
            <div class="stat"><div class="stat-label">Retención</div><div class="stat-value num">${String(data.settings.discountPercent).replace('.', ',')}%</div></div>
        </div>

        <div class="card">
            <p class="section-title" style="margin:0 0 10px">Líquido por mes</p>
            <div class="chart">${bars}</div>
            <div class="chart-legend">
                <span><i style="background:var(--accent)"></i>Ganado</span>
                <span><i style="background:var(--surface-2);border:1px solid var(--line-strong)"></i>Proyectado</span>
            </div>
        </div>

        <div class="card list" style="padding:0">${rows}</div>
    `;

    $('summaryContent').querySelectorAll('[data-month]').forEach(row => {
        row.addEventListener('click', () => {
            switchView('calendar');
            goToMonth(year, Number(row.dataset.month));
        });
    });
}

// ---------- Settings ----------
function setupSettings() {
    setupSummaryNav();

    $('saveProfile').addEventListener('click', saveProfile);
    $('savePayment').addEventListener('click', savePayment);
    $('saveHours').addEventListener('click', saveHours);
    $('changePasswordBtn').addEventListener('click', changePassword);
    $('photoInput').addEventListener('change', handlePhoto);
    $('removePhotoBtn').addEventListener('click', () => {
        state.pendingPhoto = '';
        $('photoInput').value = '';
        showPhotoPreview('');
    });
    $('logoutBtn').addEventListener('click', logout);

    document.querySelectorAll('[data-theme-opt]').forEach(btn => {
        btn.addEventListener('click', () => {
            applyTheme(btn.dataset.themeOpt);
            api('/api/settings', { method: 'PUT', body: { themeMode: btn.dataset.themeOpt } }).catch(() => {});
        });
    });
}

function applyTheme(mode) {
    const root = document.documentElement;
    if (mode === 'dark' || mode === 'light') root.setAttribute('data-theme', mode);
    else root.removeAttribute('data-theme');
    try {
        if (mode === 'dark' || mode === 'light') localStorage.setItem('theme_mode', mode);
        else localStorage.removeItem('theme_mode');
    } catch (e) { /* almacenamiento no disponible */ }
    document.querySelectorAll('[data-theme-opt]').forEach(b => {
        const on = b.dataset.themeOpt === (mode || 'system');
        b.classList.toggle('active', on);
        b.setAttribute('aria-checked', on);
    });
}

function showPhotoPreview(src) {
    $('profileImg').classList.toggle('hidden', !src);
    $('profileInitials').classList.toggle('hidden', !!src);
    if (src) $('profileImg').src = src;
    $('removePhotoBtn').classList.toggle('hidden', !src);
}

// Redimensiona la foto a 256px para que sea liviana
function handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        state.pendingPhoto = canvas.toDataURL('image/jpeg', 0.85);
        showPhotoPreview(state.pendingPhoto);
        URL.revokeObjectURL(url);
    };
    img.onerror = () => toast('No se pudo leer la imagen', 'error');
    img.src = url;
}

async function saveProfile() {
    const displayName = $('displayName').value.trim();
    const body = { displayName };
    if (state.pendingPhoto !== undefined) body.profilePhoto = state.pendingPhoto;

    try {
        await api('/api/user/profile', { method: 'PUT', body });
        state.settings.display_name = displayName;
        if (state.pendingPhoto !== undefined) state.settings.profile_photo = state.pendingPhoto;
        state.pendingPhoto = undefined;
        updateIdentity(displayName, state.settings.profile_photo);
        toast('Perfil actualizado');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function savePayment() {
    const hourlyRate = parseFloat($('hourlyRate').value);
    const discountPercent = parseFloat($('discountPercent').value);
    if (!Number.isFinite(hourlyRate) || !Number.isFinite(discountPercent)) {
        return toast('Revisa los valores', 'error');
    }
    try {
        await api('/api/settings', { method: 'PUT', body: { hourlyRate, discountPercent } });
        state.settings.hourly_rate = hourlyRate;
        state.settings.discount_percent = discountPercent;
        renderCalendar();
        toast('Honorarios guardados');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function saveHours() {
    const hoursShort = parseFloat($('hoursShort').value);
    const hoursLong = parseFloat($('hoursLong').value);
    if (!Number.isFinite(hoursShort) || !Number.isFinite(hoursLong)) {
        return toast('Revisa los valores', 'error');
    }
    try {
        await api('/api/settings', { method: 'PUT', body: { hoursShort, hoursLong } });
        state.settings.hours_short = hoursShort;
        state.settings.hours_long = hoursLong;
        updateHoursLabels();
        renderCalendar();
        toast('Jornada guardada');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function changePassword() {
    const currentPassword = $('currentPassword').value;
    const newPassword = $('newPassword').value;
    const confirmPassword = $('confirmPassword').value;

    if (!currentPassword || !newPassword) return toast('Completa los campos', 'error');
    if (newPassword !== confirmPassword) return toast('Las contraseñas no coinciden', 'error');
    if (newPassword.length < 4) return toast('Mínimo 4 caracteres', 'error');

    try {
        await api('/api/user/change-password', { method: 'POST', body: { currentPassword, newPassword } });
        ['currentPassword', 'newPassword', 'confirmPassword'].forEach(id => { $(id).value = ''; });
        toast('Contraseña actualizada');
    } catch (err) {
        toast(err.message, 'error');
    }
}

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
        window.location.href = '/login';
    }
}

// ---------- Install (PWA) ----------
let deferredPrompt = null;

function setupInstall() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (standalone) {
        $('installGroup').classList.add('hidden');
        return;
    }

    if (isIOS) {
        $('installHint').innerHTML = 'En Safari toca <b>Compartir</b> y luego <b>Agregar a inicio</b>.';
        $('installBtn').innerHTML = '<svg class="ico"><use href="#i-share"/></svg>Cómo instalar';
        $('installBtn').addEventListener('click', () => toast('Compartir → Agregar a inicio'));
        return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
        $('installGroup').classList.add('hidden');
        toast('App instalada');
    });

    $('installBtn').addEventListener('click', async () => {
        if (!deferredPrompt) {
            toast('Abre el menú del navegador → Instalar app');
            return;
        }
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
    });
}
