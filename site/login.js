import { supabase } from './supabase.js';

const form = document.querySelector('#loginForm');
const userInput = document.querySelector('#loginUser');
const passwordInput = document.querySelector('#loginPassword');
const feedback = document.querySelector('#loginFeedback');
const submit = form?.querySelector('button[type="submit"]');
const inviteFlow = /(?:type=(?:invite|recovery)|access_token=)/.test(window.location.hash);
const showFeedback = (message, type = 'is-error') => { feedback.textContent = message; feedback.className = `login-feedback ${type}`; };

const { data: { session } } = await supabase.auth.getSession();
if (inviteFlow && session) {
  window.location.replace(`./set-password.html${window.location.hash}`);
} else if (session) {
  window.location.replace('./analytics.html');
} else {
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const email = userInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    showFeedback('');
    if (!email || !password) return showFeedback('Informe seu email e sua senha para continuar.');
    submit.disabled = true; submit.textContent = 'VERIFICANDO...';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      showFeedback('Email ou senha inválidos.'); passwordInput.select(); submit.disabled = false;
      submit.innerHTML = 'CONFIRMAR ACESSO <span aria-hidden="true">↗</span>'; return;
    }
    showFeedback('Acesso confirmado. Abrindo o Analytics...', 'is-success'); submit.textContent = 'ACESSO CONFIRMADO';
    window.setTimeout(() => { window.location.href = './analytics.html'; }, 450);
  });
}
