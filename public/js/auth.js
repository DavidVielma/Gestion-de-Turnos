// Auth.js - Login and Registration handling

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const toggleBtn = document.getElementById('toggleForm');
    const messageDiv = document.getElementById('message');

    let isLoginMode = true;

    // Toggle between login and register
    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;

        if (isLoginMode) {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            toggleBtn.textContent = 'Regístrate';
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            toggleBtn.textContent = 'Iniciar Sesión';
        }

        hideMessage();
    });

    // Login form submit
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            showMessage('Por favor completa todos los campos', 'error');
            return;
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage('¡Bienvenido!', 'success');
                setTimeout(() => {
                    window.location.href = '/';
                }, 500);
            } else {
                showMessage(data.error || 'Error al iniciar sesión', 'error');
            }
        } catch (error) {
            showMessage('Error de conexión', 'error');
        }
    });

    // Register form submit
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('regUsername').value.trim();
        const password = document.getElementById('regPassword').value;

        if (!username || !password) {
            showMessage('Por favor completa todos los campos', 'error');
            return;
        }

        if (password.length < 4) {
            showMessage('La contraseña debe tener al menos 4 caracteres', 'error');
            return;
        }

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage('¡Cuenta creada exitosamente!', 'success');
                setTimeout(() => {
                    window.location.href = '/';
                }, 500);
            } else {
                showMessage(data.error || 'Error al registrar', 'error');
            }
        } catch (error) {
            showMessage('Error de conexión', 'error');
        }
    });

    function showMessage(text, type) {
        messageDiv.textContent = text;
        messageDiv.className = `message ${type}`;
        messageDiv.classList.remove('hidden');
    }

    function hideMessage() {
        messageDiv.classList.add('hidden');
    }
});
