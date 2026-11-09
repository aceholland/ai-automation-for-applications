let token = '';
export function setToken(value) { token = value; }
export function getToken() { return token; }
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node && !key.startsWith('aria') && !key.includes('-')) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export function button(text, handler, style = '', props = {}) {
  return el('button', {type:'button', class:`button ${style}`, onClick:handler, ...props}, text);
}
export function field(label, name, value = '', {type = 'text', help = '', required = false, options = null, full = false, rows = 4, placeholder = ''} = {}) {
  const id = `field-${name}`;
  const props = {id, name, value: value || '', required, placeholder, 'aria-describedby':`${id}-help`};
  const input = options ? el('select', props, options.map(x => el('option', {value:typeof x === 'string' ? x : x.value}, typeof x === 'string' ? x : x.label))) :
    type === 'textarea' ? el('textarea', {...props, rows}) : el('input', {...props, type});
  if (options) input.value = value || '';
  return el('div', {class:`field ${full ? 'full' : ''}`}, el('label', {htmlFor:id}, label + (required ? ' *' : '')), input, el('small', {id:`${id}-help`}, help));
}
export function formError(form, message) {
  let error = form.querySelector('.form-error');
  if (!error) { error = el('p', {class:'form-error', role:'alert'}); form.append(error); }
  error.textContent = message || '';
}
export function validate(form) {
  let invalid;
  form.querySelectorAll('[required]').forEach(input => {
    const bad = !input.value.trim() || (input.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value));
    input.setAttribute('aria-invalid', String(bad));
    if (bad && !invalid) invalid = input;
  });
  if (invalid) { formError(form, 'Complete the required fields with valid values.'); invalid.focus(); return false; }
  return true;
}
export async function busy(control, operation, form = null) {
  if (control.disabled) return;
  control.disabled = true; control.setAttribute('aria-busy', 'true');
  if (form) formError(form, '');
  try { await operation(); }
  catch (error) { if (form) formError(form, error.message); else announce(error.message, 'error'); }
  finally { control.disabled = false; control.removeAttribute('aria-busy'); }
}
export async function api(path, method = 'GET', payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const result = await fetch(path, {method, headers:{'Content-Type':'application/json', 'X-Opportunity-Token':token},
      ...(payload === undefined ? {} : {body:JSON.stringify(payload)}), signal:controller.signal});
    const data = await result.json();
    if (!result.ok) throw new Error(data.error || `Request failed (${result.status}).`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('This request timed out. Check your saved data before retrying.');
    if (error instanceof TypeError) throw new Error('The local service is unavailable. Start the agent and retry; your input is still here.');
    throw error;
  } finally { clearTimeout(timer); }
}
export function announce(message, tone = 'info') {
  const region = document.getElementById('status');
  region.textContent = message; region.dataset.tone = tone;
}
export async function download(path, filename) {
  const response = await fetch(path, {headers:{'X-Opportunity-Token':token}});
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Download failed.'); }
  const url = URL.createObjectURL(await response.blob());
  const link = el('a', {href:url, download:filename}); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function heading(eyebrow, title, description, actions = []) {
  return el('div', {class:'page-heading'}, el('div', {}, el('p', {class:'eyebrow'}, eyebrow), el('h1', {}, title), description ? el('p', {}, description) : null), el('div', {class:'actions'}, actions));
}
export function info(text, warning = false) { return el('div', {class:`info${warning ? ' warning' : ''}`}, text); }
export function formatDate(value) {
  if (!value) return 'Deadline not recorded';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Intl.DateTimeFormat(undefined, {day:'numeric',month:'short',year:'numeric'}).format(new Date(value + 'T12:00:00'));
  const date = new Date(value);
  return Number.isNaN(+date) ? value : new Intl.DateTimeFormat(undefined, {dateStyle:'medium',timeStyle:'short'}).format(date);
}
export function showDialog(title, content) {
  const previous = document.activeElement;
  const dialog = el('dialog', {class:'dialog'}, el('div', {class:'dialog-header'}, el('h2', {id:'dialog-title'}, title), button('Close', () => dialog.close(), 'ghost')), content);
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.addEventListener('close', () => { dialog.remove(); previous?.focus(); }, {once:true});
  document.body.append(dialog); dialog.showModal(); return dialog;
}
export function confirmDiscard() {
  return new Promise(resolve => {
    let accepted = false;
    const dialog = showDialog('Keep your edits?', el('div', {}, el('p', {}, 'You have unsaved changes. Save them before leaving, or discard them to continue.'), el('div', {class:'actions'},
      button('Keep editing', () => dialog.close(), 'primary'), button('Discard changes', () => { accepted = true; dialog.close(); }))));
    dialog.addEventListener('close', () => resolve(accepted), {once:true});
  });
}
