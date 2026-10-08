// Auth.js - Login and registration

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('authForm');
    const submitBtn = document.getElementById('submitBtn');
    const passwordInput = document.getElementById('password');
    const messageDiv = document.getElementById('message');
    const tabs = document.querySelectorAll('[data-mode]');

    let mode = 'login';

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            mode = tab.dataset.mode;
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            submitBtn.textContent = mode === 'login' ? 'Ingresar' : 'Crear cuenta';
            passwordInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
            passwordInput.placeholder = mode === 'login' ? '' : 'Mínimo 4 caracteres';
            hideMessage();
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            return showMessage('Completa usuario y contraseña', 'error');
        }
        if (mode === 'register' && password.length < 4) {
            return showMessage('La contraseña debe tener al menos 4 caracteres', 'error');
        }

        submitBtn.disabled = true;
        try {
            const response = await fetch(`/api/auth/${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();

            if (response.ok) {
                window.location.href = '/';
            } else {
                showMessage(data.error || 'No se pudo continuar', 'error');
            }
        } catch (error) {
            showMessage('Sin conexión. Inténtalo de nuevo.', 'error');
        } finally {
            submitBtn.disabled = false;
        }
    });

    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
    }

    function hideMessage() {
        messageDiv.className = 'message hidden';
    }
});
