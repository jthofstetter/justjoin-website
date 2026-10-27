/*
  JustJoin – website
  Entry point: city of hexes, sections, intro.
  No external libraries – everything lives here in src/js.
*/
import { reducedMotion, hasWebGL2, cityQuality, isMobile, wait } from './core/env.js';
import { initScroll, inView, measureAll } from './core/scroll.js';
import { HexCity } from './city/HexCity.js';
import { createLoader } from './sections/loader.js';
import { initHero } from './sections/hero.js';
import { initManifest } from './sections/manifest.js';
import { initTour } from './sections/tour.js';
import { initQuickJoin } from './sections/quickjoin.js';
import { initShards } from './sections/shards.js';
import { initFaq } from './sections/faq.js';
import { initWaitlist } from './sections/waitlist.js';
import { initNav } from './ui/nav.js';
import { initMenu } from './ui/menu.js';
import { initMagnetic } from './ui/magnetic.js';

function createCity() {
  const canvas = document.querySelector('[data-city-canvas]');
  if (!canvas || !hasWebGL2()) {
    document.documentElement.classList.add('no-webgl');
    return null;
  }
  try {
    const city = new HexCity(canvas, {
      quality: cityQuality(),
      labelsEl: document.querySelector('[data-city-labels]'),
      mobile: isMobile(),
    });
    city.onLost = () => document.documentElement.classList.add('no-webgl');
    return city;
  } catch (err) {
    console.warn('[JustJoin] WebGL not available:', err);
    document.documentElement.classList.add('no-webgl');
    return null;
  }
}

/* One city, two stages: hero and waitlist. In between it rests. */
function directCity(city) {
  const hero = document.querySelector('[data-hero]');
  const waitSec = document.querySelector('[data-wait]');
  const stage = document.querySelector('[data-city]');
  let heroOn = true;
  let waitOn = false;
  let mode = null;
  const apply = () => {
    const next = heroOn ? 'hero' : waitOn ? 'wait' : null;
    stage.classList.toggle('is-off', !next);
    if (!next) {
      city.stop();
      mode = null;
      return;
    }
    if (next !== mode) city.setView(next, { instant: true });
    mode = next;
    if (!document.hidden) city.start();
  };
  inView(hero, (v) => { heroOn = v; apply(); });
  inView(waitSec, (v) => { waitOn = v; apply(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) city.stop();
    else if (mode) city.start();
  });
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      city.setMobile(isMobile());
      city.resize();
    }, 150);
  });
  apply();
}

async function boot() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  const root = document.documentElement;
  root.classList.add('is-loading');
  initScroll();

  const loader = createLoader();
  const city = createCity();
  loader.setProgress(0.4);

  await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), wait(2500)]);
  loader.setProgress(0.75);
  await wait(reducedMotion ? 50 : 650);

  const menuState = { open: false };
  // each section on its own: an error in one does not take down the whole page
  const safe = (name, fn) => {
    try {
      return fn();
    } catch (err) {
      console.error(`[JustJoin] ${name}:`, err);
      return null;
    }
  };
  const hero = safe('Hero', () => initHero({ city })) || { intro() {} };
  safe('Manifest', initManifest);
  safe('Tour', initTour);
  safe('QuickJoin', initQuickJoin);
  safe('Shards', initShards);
  safe('FAQ', initFaq);
  safe('Waitlist', () => initWaitlist({ city }));
  safe('Navigation', () => initNav({ menuState }));
  safe('Menu', () => initMenu({ menuState }));
  safe('Magnetic', initMagnetic);
  if (city) safe('City', () => directCity(city));
  measureAll();
  loader.setProgress(1);

  const done = loader.finish();
  await wait(reducedMotion ? 0 : 1000);
  root.classList.remove('is-loading');
  hero.intro();
  await done;
  measureAll();

  // placeholder links (social, legal notice …) do not jump to the top
  document.querySelectorAll('a[data-todo]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      console.info(`[JustJoin] The link "${a.dataset.todo}" has not been set up yet.`);
    });
  });

  window.__jj = { city };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
