import { supabase } from './supabase.js';

const form = document.querySelector('#passwordForm');
const password = document.querySelector('#newPassword');
const confirmation = document.querySelector('#confirmPassword');
const feedback = document.querySelector('#passwordFeedback');
const submit = form?.querySelector('button[type="submit"]');
const showFeedback = (message, type = 'is-error') => { feedback.textContent = message; feedback.className = `login-feedback ${type}`; };
const { data: { session } } = await supabase.auth.getSession();
document.documentElement.classList.remove('auth-pending');

if (!session) {
  showFeedback('Este convite expirou ou já foi utilizado. Solicite um novo convite.');
  submit.disabled = true;
} else {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (password.value.length < 8) return showFeedback('A senha precisa ter pelo menos 8 caracteres.');
    if (password.value !== confirmation.value) return showFeedback('As senhas não conferem.');
    submit.disabled = true; submit.textContent = 'SALVANDO...';
    const { error } = await supabase.auth.updateUser({ password: password.value });
    if (error) { showFeedback('Não foi possível salvar a senha. Tente novamente.'); submit.disabled = false; submit.innerHTML = 'SALVAR SENHA <span aria-hidden="true">↗</span>'; return; }
    showFeedback('Senha criada. Abrindo o Analytics...', 'is-success'); submit.textContent = 'SENHA SALVA';
    window.setTimeout(() => { window.location.href = './analytics.html'; }, 500);
  });
}
