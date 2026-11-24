import { supabase } from './supabase.js';

const form = document.querySelector('#loginForm');
const userInput = document.querySelector('#loginUser');
const passwordInput = document.querySelector('#loginPassword');
const feedback = document.querySelector('#loginFeedback');
const submit = form?.querySelector('button[type="submit"]');
const forgotPassword = document.querySelector('#forgotPassword');
const inviteFlow = /(?:type=(?:invite|recovery)|access_token=)/.test(window.location.hash);
const showFeedback = (message, type = 'is-error') => { feedback.textContent = message; feedback.className = `login-feedback ${type}`; };

const { data: { session } } = await supabase.auth.getSession();
if (inviteFlow && session) {
  window.location.replace(`./set-password.html${window.location.hash}`);
} else if (session) {
  window.location.replace('./analytics.html');
} else {
  document.documentElement.classList.remove('auth-pending');
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
  forgotPassword?.addEventListener('click', async () => {
    const email = userInput.value.trim().toLowerCase();
    if (!email) return showFeedback('Digite seu email para receber o link de recuperação.');
    forgotPassword.disabled = true;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}set-password.html` });
    if (error) {
      const errorText = `${error.code || ''} ${error.message || ''}`.toLowerCase();
      if (errorText.includes('rate limit') || errorText.includes('over_email_send_rate_limit')) {
        showFeedback('O limite de emails do projeto foi atingido. Tente novamente mais tarde.');
      } else if (errorText.includes('redirect')) {
        showFeedback('O endereço de recuperação ainda não está autorizado no Supabase.');
      } else {
        showFeedback('Não foi possível solicitar a recuperação agora.');
      }
    } else showFeedback('Enviamos um link de recuperação para seu email.', 'is-success');
    forgotPassword.disabled = false;
  });
}
