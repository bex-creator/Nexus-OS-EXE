const { ipcRenderer } = require('electron');

function visible(el) {
  if (!el) return false;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
}

function meta(el) {
  return `${el?.name || ''} ${el?.id || ''} ${el?.autocomplete || ''} ${el?.placeholder || ''} ${el?.ariaLabel || ''}`.toLowerCase();
}

function findLoginFields() {
  const fields = [...document.querySelectorAll('input, textarea')].filter(visible);
  const passwords = fields.filter(el => (el.type || '').toLowerCase() === 'password');
  if (!passwords.length) return null;

  const password = passwords[0];
  const nearby = fields.filter(el => el !== password && (el.type || '').toLowerCase() !== 'hidden');
  const username = nearby.find(el => /email|e-mail|user(name)?|login|identifier|account/.test(meta(el)))
    || nearby.find(el => /email|text|tel/.test((el.type || 'text').toLowerCase()));
  if (!username) return null;

  const form = password.form || username.form;
  const submit = form?.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  return { username, password, form, submit };
}

let lastSignature = '';
function describeLogin() {
  const result = findLoginFields();
  if (!result) return;
  const fields = [result.username, result.password].map(el => ({
    kind: el === result.password ? 'password' : 'username',
    type: el.type || 'text',
    name: el.name || '',
    id: el.id || '',
    autocomplete: el.autocomplete || '',
    placeholder: el.placeholder || ''
  }));
  const signature = `${location.href}|${fields.map(f => `${f.kind}:${f.name}:${f.id}`).join('|')}`;
  if (signature === lastSignature) return;
  lastSignature = signature;
  ipcRenderer.sendToHost('nexus-login-fields', { url: location.href, fields });
}

function hook() {
  describeLogin();
  document.querySelectorAll('form').forEach(form => {
    if (form.dataset.nexusHooked) return;
    form.dataset.nexusHooked = '1';
    form.addEventListener('submit', () => setTimeout(describeLogin, 300));
  });
}

window.addEventListener('DOMContentLoaded', hook);
window.addEventListener('pageshow', () => setTimeout(hook, 200));
setTimeout(hook, 1000);
new MutationObserver(() => {
  clearTimeout(window.__nexusLoginTimer);
  window.__nexusLoginTimer = setTimeout(hook, 120);
}).observe(document.documentElement || document, { subtree: true, childList: true });

function setValue(el, value) {
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
}

function fillVisibleLogin(payload = {}) {
  const result = findLoginFields();
  if (!result) return false;
  if (payload.username !== undefined) setValue(result.username, payload.username);
  if (payload.password !== undefined) setValue(result.password, payload.password);
  return true;
}

ipcRenderer.on('nexus-fill-login', (_event, payload) => fillVisibleLogin(payload));

window.addEventListener('message', e => {
  if (e.data?.type !== 'NEXUS_FILL_LOGIN') return;
  const ok = fillVisibleLogin(e.data.payload || {});
  if (!ok) ipcRenderer.sendToHost('nexus-login-fill-failed', { url: location.href });
});
