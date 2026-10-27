/*
  Split text into words. The original text stays as a hidden copy for
  screen readers; the word spans are aria-hidden.
*/
export function splitWords(el, cls = 'w') {
  if (!el) return [];
  const text = el.textContent.replace(/\s+/g, ' ').trim();
  el.textContent = '';
  const sr = document.createElement('span');
  sr.className = 'visually-hidden';
  sr.textContent = text;
  el.appendChild(sr);
  const wrap = document.createElement('span');
  wrap.setAttribute('aria-hidden', 'true');
  const words = [];
  text.split(' ').forEach((w, i, arr) => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = w;
    wrap.appendChild(s);
    words.push(s);
    if (i < arr.length - 1) wrap.appendChild(document.createTextNode(' '));
  });
  el.appendChild(wrap);
  return words;
}
