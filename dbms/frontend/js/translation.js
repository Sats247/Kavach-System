/* translation.js — i18n engine */
const SUPPORTED_LANGS = ['en', 'hi', 'ta', 'bn'];
let _translations = {};
let _currentLang  = localStorage.getItem('dbms_lang') || 'en';

async function _loadAndApply(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = 'en';
  try {
    const res = await fetch(`/assets/translations/${lang}.json`);
    _translations = await res.json();
  } catch {
    if (lang !== 'en') { await _loadAndApply('en'); return; }
    _translations = {};
  }
  _currentLang = lang;
  localStorage.setItem('dbms_lang', lang);
  document.documentElement.lang = lang;
  _applyToDOM();
  document.querySelectorAll('.lang-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.lang === lang)
  );
}

function _applyToDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = key.split('.').reduce((o, k) => o?.[k], _translations);
    if (val) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = key.split('.').reduce((o, k) => o?.[k], _translations);
    if (val) el.placeholder = val;
  });
}

window.i18n = {
  init:   () => _loadAndApply(_currentLang),
  switch: (lang) => _loadAndApply(lang),
  t:      (key) => key.split('.').reduce((o,k) => o?.[k], _translations) || key
};
