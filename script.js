'use strict';
/* ============ SETTINGS ============ */
const WHATSAPP_NUMBER = '2348145407297';
// Get your free access key at https://web3forms.com (enter bololubori82@gmail.com, then check that inbox).
const WEB3FORMS_ACCESS_KEY = 'fc6b15d2-d5be-4638-a88b-99baa0fb2fc9';
const EMAIL_ENDPOINT  = 'https://api.web3forms.com/submit';
// Optional second backup: paste a Google Apps Script web app URL here. Leave empty to skip.
const BACKUP_ENDPOINT_URL = '';

const PACKS = {
  starter: { label: '3 Shirts + 1 FREE Cap', price: 20000, shirts: ['Black', 'White', 'Pink'] },
  double:  { label: '6 Shirts + 2 FREE Caps', price: 60000, shirts: ['Black #1', 'White #1', 'Pink #1', 'Black #2', 'White #2', 'Pink #2'] }
};
const SIZES = ['Small', 'Medium', 'Large', 'XLarge', 'XXL'];
const $ = (s, r = document) => r.querySelector(s);
const naira = n => '₦' + n.toLocaleString('en-NG');

/* ============ FOOTER YEAR ============ */
$('#year').textContent = new Date().getFullYear();

/* ============ FORM: SIZES + SUMMARY ============ */
const form = $('#orderForm');
const sizesBox = $('#sizes');
const summary = $('#summary');
const submitBtn = $('#submitBtn');
const statusEl = $('#status');
const currentPack = () => form.package.value;

function renderSizes() {
  const kept = [...sizesBox.querySelectorAll('select')].map(s => s.value);
  sizesBox.innerHTML = PACKS[currentPack()].shirts.map((label, i) =>
    `<div><label for="size${i}">${label} shirt</label><select id="size${i}" name="size${i}">` +
    SIZES.map(s => `<option${s === (kept[i] || 'Medium') ? ' selected' : ''}>${s}</option>`).join('') +
    `</select></div>`).join('');
}
function getSizes() {
  return PACKS[currentPack()].shirts.map((label, i) => `${label}: ${$('#size' + i).value}`);
}
function updateSummary() {
  const p = PACKS[currentPack()];
  summary.innerHTML = `<b>${p.label}</b><br>Sizes: ${getSizes().join(', ')}<br>Total to pay on delivery: <b>${naira(p.price)}</b>`;
  submitBtn.textContent = `Buy Now! — ${naira(p.price)}`;
}
function refreshForm() { renderSizes(); updateSummary(); }
form.addEventListener('change', e => { if (e.target.name === 'package') renderSizes(); updateSummary(); });
refreshForm();

/* Package buttons: pre-select package, then scroll to the form (anchor handles the scroll) */
document.querySelectorAll('[data-package]').forEach(btn => btn.addEventListener('click', () => {
  const radio = form.querySelector(`input[name="package"][value="${btn.dataset.package}"]`);
  if (radio) { radio.checked = true; refreshForm(); }
}));

/* ============ VALIDATION ============ */
function setErr(id, msg) {
  const field = $('#' + id).closest('.field');
  $(`.err[data-for="${id}"]`).textContent = msg;
  field.classList.toggle('bad', !!msg);
  return !msg;
}
function validate() {
  const name = $('#name').value.trim();
  const phone = $('#phone').value.replace(/[\s-]/g, '');
  const address = $('#address').value.trim();
  const a = setErr('name', name.length < 2 ? 'Enter your name.' : '');
  const b = setErr('phone', /^(\+?234|0)[789][01]\d{8}$/.test(phone) ? '' : 'Enter a valid Nigerian phone number, e.g. 08012345678.');
  const c = setErr('address', address.length < 8 ? 'Enter your full delivery address.' : '');
  if (!(a && b && c)) (form.querySelector('.bad input, .bad textarea') || {}).focus?.();
  return a && b && c;
}

/* ============ ORDER SENDING ============ */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const newOrderId = () => 'ORD-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();

function buildOrder() {
  const p = PACKS[currentPack()];
  return {
    id: newOrderId(), package: p.label, sizes: getSizes().join(', '), total: naira(p.price),
    name: $('#name').value.trim(), phone: $('#phone').value.trim(),
    address: $('#address').value.trim(), notes: $('#notes').value.trim() || 'None',
    time: new Date().toLocaleString('en-NG')
  };
}
async function postJSON(url, data, timeout = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data), signal: ctrl.signal
    });
    const j = await res.json().catch(() => ({}));
    return res.ok && String(j.success) !== 'false';
  } finally { clearTimeout(timer); }
}
function emailPayload(o) {
  return {
    access_key: WEB3FORMS_ACCESS_KEY,
    subject: `NEW ORDER ${o.id}: Unisex Style Combo`,
    from_name: 'Unisex Style Combo Website',
    'Order ID': o.id, Package: o.package, Sizes: o.sizes, Total: o.total,
    Name: o.name, Phone: o.phone, Address: o.address, Notes: o.notes, Time: o.time
  };
}
/* Try up to 3 times. Returns true only when the email service confirms success. */
async function sendEmail(order) {
  if (WEB3FORMS_ACCESS_KEY.startsWith('PASTE_')) { console.error('Add your Web3Forms access key in script.js'); return false; }
  for (let i = 0; i < 3; i++) {
    try { if (await postJSON(EMAIL_ENDPOINT, emailPayload(order))) return true; } catch (e) { /* retry */ }
    await sleep(1000 * (i + 1));
  }
  return false;
}
async function sendBackup(order) {
  if (!BACKUP_ENDPOINT_URL) return true;
  try { return await postJSON(BACKUP_ENDPOINT_URL, order); } catch (e) { return false; }
}

/* Pending-order safety net (saved on the customer's device until the email is confirmed) */
const KEY = 'pendingOrders';
const loadPending = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } };
const savePending = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ } };
const addPending = o => savePending([...loadPending().filter(x => x.id !== o.id), o]);
const removePending = id => savePending(loadPending().filter(x => x.id !== id));

/* On every page load, silently re-send any order that never got confirmed */
(async function retryPending() {
  for (const o of loadPending()) { if (await sendEmail(o)) removePending(o.id); }
})();

function whatsappURL(o) {
  const text = [
    'Hello, I just placed an order on your website.',
    `Order ID: ${o.id}`, `Name: ${o.name}`, `Package: ${o.package}`, `Sizes: ${o.sizes}`,
    `Phone: ${o.phone}`, `Address: ${o.address}`, `Notes: ${o.notes}`, `Total (pay on delivery): ${o.total}`
  ].join('\n');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

let sending = false;
form.addEventListener('submit', async e => {
  e.preventDefault();
  if (sending || !validate()) return;       // block duplicate submits
  sending = true; submitBtn.disabled = true;
  statusEl.className = 'status'; statusEl.textContent = 'Sending your order...';

  const order = buildOrder();
  addPending(order);                         // save first, so nothing is lost
  const [emailed] = await Promise.all([sendEmail(order), sendBackup(order)]);

  if (emailed) {
    removePending(order.id);
    statusEl.className = 'status ok';
    statusEl.textContent = 'Order received! Opening WhatsApp to confirm...';
  } else {
    statusEl.className = 'status warn';
    statusEl.textContent = 'Opening WhatsApp to confirm your order...';
  }
  await sleep(700);
  window.location.href = whatsappURL(order); // always redirect, even if the email failed
});

/* ============ NAV CTA + FADE-IN ============ */
const nav = $('#nav');
const heroCta = $('#heroCta');
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([en]) => nav.classList.toggle('show-cta', !en.isIntersecting)).observe(heroCta);
  const io = new IntersectionObserver((entries, obs) => entries.forEach(en => {
    if (en.isIntersecting) { en.target.classList.add('in'); obs.unobserve(en.target); }
  }), { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
} else {
  nav.classList.add('show-cta');
  document.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
}