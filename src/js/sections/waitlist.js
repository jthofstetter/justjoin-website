import { reducedMotion, wait } from '../core/env.js';
import { animate, animateAll } from '../core/anim.js';

/*
  Waitlist: the city comes back. After signing up, a new hex lights
  up – yours.

  Connecting the form: add a data-endpoint="https://…" attribute to
  <form data-form> (e.g. Formspree, Getform, Brevo or your own backend).
  Without an endpoint nothing is saved and the page only shows the
  confirmation (fine for previews, not for production).
*/

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function initWaitlist({ city }) {
  const section = document.querySelector('[data-wait]');
  if (!section) return;
  const form = section.querySelector('[data-form]');
  const done = section.querySelector('[data-form-done]');
  const error = section.querySelector('[data-form-error]');
  const emailField = form.querySelector('#email').closest('.field');
  const button = form.querySelector('button[type="submit"]');

  const setError = (msg) => {
    error.textContent = msg;
    emailField.classList.toggle('is-invalid', !!msg);
    form.email.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  form.addEventListener('input', () => { if (error.textContent) setError(''); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!EMAIL.test(email)) {
      setError('Please enter a valid email address, for example you@example.com.');
      form.email.focus();
      if (!reducedMotion) animate(emailField, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }], { duration: 420, easing: 'linear', commit: false });
      return;
    }
    setError('');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        const res = await fetch(endpoint, { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(form) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        await wait(600);
        console.info('[JustJoin] No data-endpoint on the form – the sign-up was not saved.');
      }
      celebrate();
    } catch (err) {
      setError('Your sign-up wasn’t saved. Check your connection and try again.');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });

  async function celebrate() {
    if (!reducedMotion) await animate(form, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-16px)' }], { duration: 450, commit: false })?.finished;
    done.style.minHeight = `${form.offsetHeight}px`;
    form.hidden = true;
    done.hidden = false;
    animateAll(done.children, [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 1100 }, 100);
    done.setAttribute('tabindex', '-1');
    done.focus({ preventScroll: true });
    city?.lightUserCell('You’re in');
  }
}
