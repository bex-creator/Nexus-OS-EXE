const { ipcRenderer } = require('electron');

function visible(el) {
  if (!el) return false;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
}

let lastLoginSignature = '';

function describeInputs() {
  const inputs = [...document.querySelectorAll('input, textarea')].filter(visible);
  const fields = inputs.map((el, index) => {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const name = el.getAttribute('name') || '';
    const id = el.id || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    let kind = 'other';
    if (type === 'password' || /pass|pwd/i.test(`${name} ${id} ${autocomplete} ${placeholder}`)) kind = 'password';
    else if (type === 'email' || /email|e-mail|user(name)?|login/i.test(`${name} ${id} ${autocomplete} ${placeholder}`)) kind = 'username';
    return { index, kind, type, name, id, autocomplete, placeholder };
  });

  const hasLogin = fields.some(f => f.kind === 'password') && fields.some(f => f.kind === 'username');
  if (!hasLogin) return;

  const signature = `${location.href}|${JSON.stringify(fields)}`;
  if (signature === lastLoginSignature) return;
  lastLoginSignature = signature;
  ipcRenderer.sendToHost('nexus-login-fields', { url: location.href, fields });
}

function hookForms() {
  describeInputs();
  document.querySelectorAll('form').forEach(form => {
    if (form.dataset.nexusHooked) return;
    form.dataset.nexusHooked = '1';
    form.addEventListener('submit', () => setTimeout(describeInputs, 150));
  });
}

window.addEventListener('DOMContentLoaded', hookForms);
setTimeout(hookForms, 1000);
new MutationObserver(() => hookForms()).observe(document.documentElement, { subtree: true, childList: true });

function setValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function fillVisibleLogin(payload) {
  const fields = [...document.querySelectorAll('input, textarea')].filter(visible);
  if (payload?.username !== undefined) {
    const u = fields.find(el => /email|e-mail|user(name)?|login/i.test(`${el.name || ''} ${el.id || ''} ${el.autocomplete || ''} ${el.placeholder || ''}`))
      || fields.find(el => (el.type || '').toLowerCase() !== 'password');
    if (u) setValue(u, payload.username);
  }
  if (payload?.password !== undefined) {
    const p = fields.find(el => (el.type || '').toLowerCase() === 'password');
    if (p) setValue(p, payload.password);
  }
}

ipcRenderer.on('nexus-fill-login', (_event, payload) => fillVisibleLogin(payload));

window.addEventListener('message', (e) => {
  if (e.data?.type === 'NEXUS_FILL_LOGIN') {
    ipcRenderer.sendToHost('nexus-fill-request', e.data.payload);
    fillVisibleLogin(e.data.payload || {});
  }
});
