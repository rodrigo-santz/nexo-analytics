const AUTH_KEY = 'nexo.analytics.auth';

// Credenciais temporárias para validar o fluxo. A autenticação real deve usar
// um backend antes de proteger dados sensíveis em produção.
const USERS = Object.freeze({ nexo: 'nexo2026' });

const form = document.querySelector('#loginForm');
const userInput = document.querySelector('#loginUser');
const passwordInput = document.querySelector('#loginPassword');
const feedback = document.querySelector('#loginFeedback');
const submit = form?.querySelector('button[type="submit"]');

form?.addEventListener('submit', event => {
  event.preventDefault();
  const login = userInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  feedback.textContent = '';
  feedback.className = 'login-feedback';

  if (!login || !password) {
    feedback.textContent = 'Informe o login e a senha para continuar.';
    feedback.classList.add('is-error');
    return;
  }

  if (USERS[login] !== password) {
    feedback.textContent = 'Login ou senha inválidos.';
    feedback.classList.add('is-error');
    passwordInput.select();
    return;
  }

  sessionStorage.setItem(AUTH_KEY, 'ok');
  submit.disabled = true;
  submit.textContent = 'ACESSO CONFIRMADO';
  feedback.textContent = 'Verificação concluída. Abrindo o Analytics...';
  feedback.classList.add('is-success');
  window.setTimeout(() => { window.location.href = './analytics.html'; }, 450);
});
