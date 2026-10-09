'use strict';

const $ = id => document.getElementById(id);
const TZ = 'Europe/Kyiv';
const OFFSITE = 'https://www.cherkasyoblenergo.com/off';
const ALL_Q = Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat();
const STORAGE_KEY = 'svitlo-addresses-v3';
const LEGACY_KEY = 'svitlo-addresses-v2';
const STATES = {
  on: 'Зараз: зі світлом за графіком',
  off: 'Зараз: без світла за графіком',
  unknown: 'Даних немає'
};

let schedules = { days: [], lastChecked: null };
let index = { keys: {}, streets: {}, localities: {} };
let addresses = loadAddresses();
let activeId = null;
let chosenDay = null;
let editing = null;
let selectedStreet = null;
let matchedQ = null;
let statusTimer = null;

function loadAddresses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stash() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

const today = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const kyivClock = () => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return +parts.hour * 60 + +parts.minute;
};

const offsetDay = (date, n) => {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const getDay = date => schedules.days.find(x => x.date === date && x.verified === true);

function min(s) {
  if (s === '24:00') return 1440;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s || '')) throw new Error('Invalid time ' + s);
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

const prettyMinute = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[’ʼ`]/g, "'")
    .replace(/^(вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|прв\.?|б-р\.?|бульвар|узвіз)\s+/i, '')
    .replace(/[\s.,-]+/g, '')
    .replace(/[^\p{L}\p{N}/']/gu, '');
}

function normalizeHouse(value) {
  return String(value || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/[’ʼ`]/g, "'")
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/[^\p{L}\p{N}/]/gu, '');
}

function normalizeLocality(value) {
  return String(value || '')
    .toLocaleLowerCase('uk-UA')
    .replace(/^(м\.?|місто|с\.?|село|смт\.?|селище)\s+/i, '')
    .replace(/[’ʼ`]/g, "'")
    .replace(/[\s.-]+/g, '')
    .replace(/[^\p{L}\p{N}']/gu, '');
}

function displayName(item) {
  return item.house ? `${item.street}, ${item.house}` : item.street;
}

function locality(item) {
  return item.settlement || 'Черкаси';
}

function wholeAddress(item) {
  return `${locality(item)} · ${displayName(item)}`;
}

function flash(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function formatPub(s) {
  if (!s) return 'невідомо';
  const d = new Date(s);
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
    : String(s);
}

function appendText(parent, tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = content;
  parent.appendChild(node);
  return node;
}

function timeline(day, queue) {
  const d = getDay(day);
  const item = d?.queues?.[queue];
  if (!item) return null;
  try {
    const knownFrom = min(item.knownFrom || '00:00');
    const arr = new Int8Array(1440);
    arr.fill(-1);
    arr.fill(0, knownFrom);
    let last = -1;
    for (const [ss, ee] of item.off || []) {
      const s = min(ss), e = min(ee);
      if (!(s < e && s >= last && e <= 1440)) return null;
      arr.fill(1, Math.max(s, knownFrom), e);
      last = e;
    }
    return arr;
  } catch {
    return null;
  }
}

function currentState(item) {
  const t = timeline(today(), item.queue);
  if (!t) return 'unknown';
  const v = t[kyivClock()];
  return v === 1 ? 'off' : v === 0 ? 'on' : 'unknown';
}

function tinyState(item) {
  const s = currentState(item);
  return {
    s,
    t: s === 'on' ? 'Зі світлом за графіком' : s === 'off' ? 'Без світла за графіком' : 'Графік ще недоступний'
  };
}

function renderHome() {
  const list = $('addressList');
  list.replaceChildren();
  $('addressCount').textContent = addresses.length;
  $('emptyState').hidden = addresses.length > 0;

  for (const item of addresses) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'address-card reveal';
    card.style.setProperty('--delay', `${Math.min(addresses.indexOf(item) * 70, 320)}ms`);
    appendText(card, 'span', 'location', displayName(item));
    appendText(card, 'span', 'place-label', `⌖ ${locality(item)}`);
    appendText(card, 'span', 'q-label', `Підчерга ${item.queue || 'не визначена'}${item.method === 'manual' ? ' · обрано вручну' : ''}`);
    const foot = appendText(card, 'div', 'card-foot', '');
    const s = tinyState(item);
    appendText(foot, 'span', `card-status ${s.s === 'unknown' ? 'unk' : s.s}`, s.t);
    appendText(foot, 'span', 'chevron', '›');
    card.onclick = () => openDetail(item.id);
    list.appendChild(card);
  }

  const date = getDay(today());
  $('globalUpdated').textContent = date
    ? `Остання публікація: ${formatPub(date.publishedAt)}. ${schedules.lastChecked ? `Перевірено: ${formatPub(schedules.lastChecked)}.` : ''}`
    : 'На сьогодні немає підтвердженого графіка. Перевірте сайт Черкасиобленерго.';
}

function openDetail(id) {
  activeId = id;
  chosenDay = today();
  $('home').hidden = true;
  $('detail').hidden = false;
  renderDetail();
  window.scrollTo({ top: 0, behavior: 'instant' });
  history.pushState({ svitlo: 'detail' }, '', location.href);
}

function back(force = false) {
  if (!force && history.state?.svitlo === 'detail') {
    history.back();
    return;
  }
  $('detail').hidden = true;
  $('home').hidden = false;
  activeId = null;
  renderHome();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderDetail() {
  const item = addresses.find(x => x.id === activeId);
  if (!item) {
    back(true);
    return;
  }
  $('detailAddress').textContent = wholeAddress(item);
  $('detailQueue').textContent = `Підчерга ${item.queue || '—'}`;
  $('detailSubtitle').textContent = `${locality(item)} · прогноз за графіком`;

  const state = currentState(item);
  $('detailStatus').className = `tag ${state === 'unknown' ? 'unknown' : state === 'on' ? 'present' : 'absent'}`;
  $('detailStatus').textContent = STATES[state];

  const day = getDay(chosenDay);
  $('dateLabel').textContent = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(chosenDay + 'T12:00:00Z'));
  $('daySource').textContent = day ? `Опубліковано ${formatPub(day.publishedAt)}` : 'Ще не опубліковано';
  $('sourceLink').href = day?.source || 'https://www.cherkasyoblenergo.com/news';
  $('dataSourceInfo').textContent = day ? `Офіційна публікація · ${formatPub(day.publishedAt)}` : 'Публікацію для цього дня не знайдено';

  renderWeek();
  renderGrid(item.queue);
  showNext(item.queue);
}

function renderWeek() {
  const root = $('week');
  root.replaceChildren();
  const date = chosenDay;
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const monday = offsetDay(date, -((weekday + 6) % 7));
  ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'].forEach((name, i) => {
    const day = offsetDay(monday, i);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'weekday' + (day === chosenDay ? ' active' : '');
    button.setAttribute('aria-label', day);
    button.setAttribute('aria-pressed', day === chosenDay ? 'true' : 'false');
    button.textContent = name;
    const em = document.createElement('em');
    em.textContent = +day.slice(8);
    button.appendChild(em);
    button.onclick = () => {
      chosenDay = day;
      renderDetail();
    };
    root.appendChild(button);
  });
}

function boltIcon() {
  const span = document.createElement('span');
  span.className = 'time-icon';
  span.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.3 1.2 3.5 8.1h3.4l-.5 6.6 6.1-8H9.1z" fill="currentColor"></path></svg>';
  return span;
}

function renderGrid(queue) {
  const box = $('timeGrid');
  box.replaceChildren();
  const arr = timeline(chosenDay, queue);
  const nowHour = Math.floor(kyivClock() / 60);
  for (let h = 0; h < 24; h++) {
    const cell = document.createElement('div');
    let type = 'unknown', offN = 0, onN = 0;
    if (arr) {
      for (let i = h * 60; i < (h + 1) * 60; i++) {
        if (arr[i] === 1) offN++;
        if (arr[i] === 0) onN++;
      }
      type = offN === 60 ? 'absent' : onN === 60 ? 'present' : offN && onN ? 'mixed' : 'unknown';
    }
    cell.className = `time-cell ${type}` + (chosenDay === today() && h === nowHour ? ' now' : '');
    if (type === 'mixed') cell.style.setProperty('--dark-pct', `${(offN / 60) * 100}%`);
    cell.appendChild(boltIcon());
    appendText(cell, 'span', '', `${String(h).padStart(2, '0')}:00`);
    cell.title = type === 'mixed'
      ? 'Перехід посеред години: перевірте офіційний графік'
      : type === 'unknown'
        ? 'Немає підтверджених даних'
        : 'Плановий стан';
    box.appendChild(cell);
  }
}

function showNext(queue) {
  const t = timeline(today(), queue);
  const now = kyivClock();
  let title = 'Графік на сьогодні недоступний';
  let note = 'Офіційні дані ще не отримані';
  if (t && t[now] !== -1) {
    let changed = -1;
    for (let m = now + 1; m < 1440; m++) {
      if (t[m] !== t[now]) { changed = m; break; }
    }
    if (changed > 0) {
      const diff = changed - now;
      title = `${Math.floor(diff / 60)} год ${String(diff % 60).padStart(2, '0')} хв`;
      note = `До ${t[changed] === 1 ? 'відключення' : 'відновлення'} за графіком о ${prettyMinute(changed)}`;
    } else {
      title = 'Змін до кінця дня немає';
      note = 'Перевіряйте можливі оновлення офіційного графіка';
    }
  }
  $('nextChange').textContent = title;
  $('nextInfo').textContent = note;
}

function currentSettlement() {
  return $('settlement').value === 'Інше' ? $('settlementCustom').value.trim() : $('settlement').value;
}

function currentLocalityData() {
  const settlement = currentSettlement();
  const normalized = normalizeLocality(settlement);
  if (!settlement || normalized === normalizeLocality('Черкаси')) {
    return { keys: index.keys || {}, streets: index.streets || {}, supported: true, source: 'city' };
  }
  if (index.localities?.[normalized]) {
    return { ...index.localities[normalized], supported: true, source: 'locality' };
  }
  return { keys: {}, streets: {}, supported: false, source: 'unsupported' };
}

function canonicalStreet(name) {
  const raw = name.trim();
  if (!raw) return null;
  const query = normalize(raw);
  const data = currentLocalityData();
  const streetList = data.streets || {};
  if (selectedStreet && normalize(selectedStreet.label) === query) return selectedStreet;

  const options = Object.entries(streetList).filter(([key, label]) => {
    return key.split('|')[1] === query || normalize(label) === query;
  });

  const typeMatch = raw.toLowerCase().match(/^(вул(?:иця)?\.?|пров(?:улок|\.)?|просп(?:ект)?\.?|пр-т\.?|прв\.?|б-р\.?|бульвар|узвіз)\s+/i);
  if (typeMatch && options.length) {
    const prefix = typeMatch[1];
    const kind = prefix.startsWith('пров') || prefix.startsWith('прв') ? 'провулок'
      : prefix.startsWith('б-р') || prefix.startsWith('буль') ? 'бульвар'
      : prefix.startsWith('просп') || prefix.startsWith('пр-т') ? 'проспект'
      : prefix.startsWith('узв') ? 'узвіз' : 'вулиця';
    const hit = options.find(([key]) => key.split('|')[0] === kind);
    if (hit) return { key: hit[0], label: hit[1] };
  }

  if (options.length === 1) return { key: options[0][0], label: options[0][1] };

  const fuzzy = Object.entries(streetList).filter(([key, label]) => {
    const normalizedLabel = normalize(label);
    return normalizedLabel.startsWith(query) || query.startsWith(key.split('|')[1]);
  });
  if (fuzzy.length === 1) return { key: fuzzy[0][0], label: fuzzy[0][1] };

  return null;
}

function matchAddress(street, number) {
  const localityData = currentLocalityData();
  if (!localityData.supported) return { queues: [], foundStreet: false, unsupported: true };
  if (!Object.keys(index.keys || {}).length && !Object.keys(index.localities || {}).length) return { queues: [], foundStreet: false, noIndex: true };
  const found = canonicalStreet(street);
  if (!found) return { queues: [], foundStreet: false };
  const houseKey = normalizeHouse(number);
  const matches = localityData.keys?.[`${found.key}|${houseKey}`] || [];
  return { queues: matches, foundStreet: true, street: found.label };
}

function buildOfficialLookupPayload() {
  const payload = {
    settlement: currentSettlement().trim(),
    street: $('street').value.trim(),
    house: $('house').value.trim()
  };
  const text = [payload.settlement, payload.street, payload.house].filter(Boolean).join(', ');
  return { payload, text };
}

function buildOfficialLookupUrl() {
  const { payload } = buildOfficialLookupPayload();
  const url = new URL(OFFSITE);
  // Best-effort forwarding. If the official site ignores these parameters,
  // the clipboard fallback still helps the user paste the address quickly.
  url.searchParams.set('mode', 'address');
  url.searchParams.set('settlement', payload.settlement);
  url.searchParams.set('street', payload.street);
  url.searchParams.set('house', payload.house);
  return url.toString();
}

async function openOfficialLookup() {
  const { text } = buildOfficialLookupPayload();
  const url = buildOfficialLookupUrl();
  try {
    if (navigator.clipboard?.writeText && text) {
      await navigator.clipboard.writeText(text);
      flash('Відкрили сайт обленерго й скопіювали адресу в буфер.');
    } else {
      flash('Відкрили сайт обленерго.');
    }
  } catch {
    flash('Відкрили сайт обленерго. Якщо потрібно, скопіюйте адресу вручну.');
  }
  window.open(url, '_blank', 'noopener');
}

function checkLookup() {
  const street = $('street').value.trim();
  const house = $('house').value.trim();
  const message = $('lookupResult');
  const manual = $('manualGroup');
  const hint = $('officialHint');
  matchedQ = null;

  let text = 'Вкажіть адресу, щоб знайти підчергу.';
  let className = 'lookup-result info';
  let showManual = false;

  if (!currentSettlement()) {
    text = 'Вкажіть населений пункт.';
  } else if (!street || !house) {
    text = 'Введіть вулицю та номер будинку.';
  } else {
    const data = matchAddress(street, house);
    if (data.queues.length === 1) {
      matchedQ = data.queues[0];
      text = `✓ Знайдено за офіційним переліком: підчерга ${matchedQ}.`;
      className = 'lookup-result found';
    } else if (data.queues.length > 1) {
      text = `Для цієї адреси є кілька варіантів: ${data.queues.join(', ')}. Уточніть підчергу вручну або перевірте на сайті обленерго.`;
      className = 'lookup-result warn';
      showManual = true;
    } else if (data.unsupported) {
      text = 'Для цього населеного пункту підтвердженої локальної бази поки немає. Можете перевірити адресу на сайті Черкасиобленерго та вибрати підчергу вручну.';
      className = 'lookup-result warn';
      showManual = true;
    } else if (data.noIndex) {
      text = 'Локальна адресна база ще не завантажилась або недоступна. Можете скористатися офіційним сайтом і потім зберегти підчергу вручну.';
      className = 'lookup-result warn';
      showManual = true;
    } else if (!data.foundStreet) {
      text = 'Точного збігу вулиці поки не знайдено. Спробуйте підказки нижче або перевірте адресу на офіційному сайті.';
      className = 'lookup-result warn';
      showManual = true;
    } else {
      text = 'Вулицю знайдено, але точного збігу за номером будинку немає. Перевірте адресу на сайті Черкасиобленерго або виберіть підчергу вручну.';
      className = 'lookup-result warn';
      showManual = true;
    }
  }

  message.className = className;
  message.textContent = text;
  manual.hidden = !showManual;
  hint.textContent = `Спробуємо передати: ${[currentSettlement(), street, house].filter(Boolean).join(', ')}. Якщо офіційний сайт не підставить поля сам, просто вставте адресу з буфера обміну.`;
  $('saveAddress').disabled = !(currentSettlement() && street && house && (matchedQ || ALL_Q.includes($('manualQueue').value)));
}

function renderSuggestions() {
  const field = $('street');
  const term = normalize(field.value);
  const root = $('streetSuggest');
  root.replaceChildren();
  if (term.length < 2) {
    root.hidden = true;
    return;
  }
  const data = currentLocalityData();
  const streetList = data.streets || {};
  const results = Object.entries(streetList).filter(([key, label]) => {
    const streetKey = key.split('|')[1] || '';
    return streetKey.includes(term) || normalize(label).includes(term);
  }).slice(0, 9);

  root.hidden = results.length === 0;
  for (const [key, label] of results) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = () => {
      field.value = label;
      selectedStreet = { key, label };
      root.hidden = true;
      checkLookup();
      $('house').focus();
    };
    root.appendChild(button);
  }
}

function openEditor(id = null) {
  editing = id;
  const item = addresses.find(x => x.id === id);
  $('dialogTitle').textContent = item ? 'Змінити адресу' : 'Додати адресу';
  $('saveAddress').textContent = item ? 'Зберегти зміни' : 'Додати адресу';
  $('settlement').value = item?.settlement && [...$('settlement').options].some(o => o.value === item.settlement)
    ? item.settlement
    : item?.settlement ? 'Інше' : 'Черкаси';
  $('settlementCustom').hidden = $('settlement').value !== 'Інше';
  $('settlementCustom').value = item?.settlement && $('settlement').value === 'Інше' ? item.settlement : '';
  $('street').value = item?.street || '';
  $('house').value = item?.house || '';
  $('manualQueue').value = item?.queue || '';
  $('streetSuggest').hidden = true;
  matchedQ = null;
  selectedStreet = null;
  checkLookup();
  $('editDialog').showModal();
}

function saveEditor(event) {
  event.preventDefault();
  const street = $('street').value.trim();
  const house = $('house').value.trim();
  const queue = matchedQ || $('manualQueue').value;
  const settlement = currentSettlement();
  if (!street || !house || !settlement || !ALL_Q.includes(queue)) {
    flash('Укажіть адресу та підчергу.');
    return;
  }
  const item = {
    id: editing || makeId(),
    street,
    house,
    settlement,
    queue,
    method: matchedQ ? 'automatic' : 'manual'
  };
  if (editing) {
    const i = addresses.findIndex(x => x.id === editing);
    if (i !== -1) addresses[i] = item;
  } else {
    addresses.push(item);
  }
  stash();
  $('editDialog').close();
  renderHome();
  if (activeId === item.id) renderDetail();
  else if (!editing) openDetail(item.id);
  flash(matchedQ ? 'Підчергу визначено автоматично.' : 'Адресу збережено.');
}

function validateData(obj) {
  if (!obj || !Array.isArray(obj.days)) throw new Error('Bad schedules');
  return {
    days: obj.days.filter(x => /^20\d\d-\d\d-\d\d$/.test(x.date) && x.verified === true),
    lastChecked: obj.lastChecked || null
  };
}

async function refreshData(manual = false) {
  const t = Date.now();
  try {
    const [scheduleResponse, addressResponse] = await Promise.all([
      fetch('./data/schedules.json?v=' + t, { cache: 'no-store' }),
      fetch('./data/addresses.json?v=' + t, { cache: 'no-store' })
    ]);
    if (!scheduleResponse.ok) throw new Error('schedules HTTP ' + scheduleResponse.status);
    schedules = validateData(await scheduleResponse.json());
    if (addressResponse.ok) {
      const loaded = await addressResponse.json();
      if (loaded.keys || loaded.localities) {
        index = {
          keys: loaded.keys || {},
          streets: loaded.streets || {},
          localities: loaded.localities || {}
        };
      }
    }
    renderHome();
    if (activeId) renderDetail();
    if (manual) flash('Графіки перевірено.');
  } catch (error) {
    console.warn('Failed to refresh, keeping cached data', error);
    renderHome();
    if (activeId) renderDetail();
    if (manual) flash('Не вдалося оновити; показано останні дані.');
  }
}

$('back').onclick = () => back();
$('addAddress').onclick = () => openEditor();
$('closeDialog').onclick = () => $('editDialog').close();
$('settlement').addEventListener('change', () => {
  $('settlementCustom').hidden = $('settlement').value !== 'Інше';
  selectedStreet = null;
  renderSuggestions();
  checkLookup();
});
$('settlementCustom').addEventListener('input', checkLookup);
$('street').addEventListener('input', () => {
  selectedStreet = null;
  renderSuggestions();
  checkLookup();
});
$('house').addEventListener('input', checkLookup);
$('manualQueue').addEventListener('change', checkLookup);
$('editForm').addEventListener('submit', saveEditor);
$('detailInfo').onclick = () => flash('Це прогноз за графіком, а не перевірка фактичної наявності електроенергії.');
$('editCurrent').onclick = () => openEditor(activeId);
$('refresh').onclick = () => refreshData(true);
$('removeCurrent').onclick = () => {
  if (!confirm('Видалити цю адресу з пристрою?')) return;
  addresses = addresses.filter(x => x.id !== activeId);
  stash();
  back();
  flash('Адресу видалено.');
};
$('openOfficialLookup').onclick = openOfficialLookup;
window.addEventListener('popstate', () => back(true));

$('manualQueue').replaceChildren(new Option('Оберіть підчергу', ''), ...ALL_Q.map(q => new Option('Підчерга ' + q, q)));
renderHome();
refreshData();
setInterval(() => {
  refreshData();
  if (activeId) renderDetail();
}, 5 * 60 * 1000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(console.warn);
}
