import { onScroll, inView } from '../core/scroll.js';

/*
  Navigation: transparent over the city, then with a glass background.
  It slides away when you scroll down and comes back when you scroll up.
*/
export function initNav({ menuState }) {
  const nav = document.querySelector('[data-nav]');
  if (!nav) return;
  let hidden = false;
  const setHidden = (h) => {
    if (h === hidden) return;
    hidden = h;
    nav.classList.toggle('is-hidden', h);
  };

  onScroll((st) => {
    const y = st.y;
    const vh = st.vh || window.innerHeight;
    nav.classList.toggle('is-solid', y > vh * 0.8);
    if (menuState.open || y < vh * 0.8) return setHidden(false);
    if (st.dir === 1 && st.velocity > 300) setHidden(true);
    else if (st.dir === -1) setHidden(false);
  });

  // focus inside the navigation brings it back
  nav.addEventListener('focusin', () => setHidden(false));

  // current section
  const links = [...nav.querySelectorAll('.nav__links a')];
  links.forEach((a) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    inView(target, (on) => {
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }, { rootMargin: '-50% 0px -50% 0px' });
  });
}
