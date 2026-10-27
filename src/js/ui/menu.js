import { reducedMotion } from '../core/env.js';
import { animate, animateAll, curve } from '../core/anim.js';

/* Fullscreen menu for small screens. Esc closes it, focus stays inside. */
export function initMenu({ menuState }) {
  const toggle = document.querySelector('[data-menu-toggle]');
  const menu = document.querySelector('[data-menu]');
  const nav = document.querySelector('[data-nav]');
  if (!toggle || !menu) return;
  const label = toggle.querySelector('[data-menu-label]');
  const links = [...menu.querySelectorAll('a')];
  const items = menu.querySelectorAll('.menu__list li');

  const open = () => {
    menuState.open = true;
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    label.textContent = 'Close';
    nav.classList.add('is-menu');
    document.documentElement.classList.add('menu-open');
    if (!reducedMotion) {
      animate(menu, [{ clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }], { duration: 800, easing: curve.inOutExpo, commit: false });
      animateAll(items, [{ opacity: 0, transform: 'translateY(40%)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 280 }, 55);
    }
    links[0]?.focus({ preventScroll: true });
  };

  const close = (after) => {
    menuState.open = false;
    toggle.setAttribute('aria-expanded', 'false');
    label.textContent = 'Menu';
    const finish = () => {
      menu.hidden = true;
      nav.classList.remove('is-menu');
      document.documentElement.classList.remove('menu-open');
      after?.();
    };
    if (reducedMotion) return finish();
    const a = animate(menu, [{ clipPath: 'inset(0% 0% 0% 0%)' }, { clipPath: 'inset(100% 0% 0% 0%)' }], { duration: 650, easing: curve.inOutExpo, commit: false });
    a ? a.finished.then(finish).catch(finish) : finish();
  };

  toggle.addEventListener('click', () => (menuState.open ? close(() => toggle.focus()) : open()));

  links.forEach((a) => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('#')) return;
      e.preventDefault();
      const target = document.querySelector(href);
      close(() => target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }));
    });
  });

  document.addEventListener('keydown', (e) => {
    if (!menuState.open) return;
    if (e.key === 'Escape') close(() => toggle.focus());
    if (e.key === 'Tab') {
      const focusables = [toggle, ...links];
      const i = focusables.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        focusables[focusables.length - 1].focus();
      } else if (!e.shiftKey && i === focusables.length - 1) {
        e.preventDefault();
        focusables[0].focus();
      }
    }
  });
}
