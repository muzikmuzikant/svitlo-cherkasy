/* Release discovery for installed PWA. No reinstallation and no changes to user storage or Push keys. */
(() => {
  'use strict';
  const current = document.querySelector('meta[name="svitlo-version"]')?.content || '0.0.0';
  const storageKey = 'svitlo-last-app-release';
  const dismissedKey = 'svitlo-dismissed-release';
  const banner = document.getElementById('appUpdateBanner');
  const title = document.getElementById('appUpdateTitle');
  const description = document.getElementById('appUpdateText');
  const notes = document.getElementById('appUpdateNotes');
  const apply = document.getElementById('appUpdateAction');
  const dismiss = document.getElementById('appUpdateDismiss');
  const manual = document.getElementById('checkAppUpdate');
  const versionText = document.getElementById('appVersion');
  // Never display developer notes in a public release announcement.
  const devWording = /адмін(?:ка|панел|істратор)|сервер|бекенд|backend|GitHub|Railway|WebSocket|Socket|service worker|cron\b|\bAPI\b|база даних|\bdev\b/i;
  const publicText = (value, fallback, limit) => {
    const text = typeof value === 'string' ? value.trim().slice(0, limit) : '';
    return text && !devWording.test(text) ? text : fallback;
  };
  let installedUpgrade = false;
  if (!banner || !apply || !dismiss) return;
  if (versionText) versionText.textContent = `v${current}`;

  function parts(value) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
    return match ? match.slice(1).map(Number) : null;
  }
  function newer(candidate, installed) {
    const a = parts(candidate), b = parts(installed);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }
  function message(text) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(message.timeout);
    message.timeout = setTimeout(() => { toast.hidden = true; }, 4400);
  }
  function readSession(key) {
    try { return sessionStorage.getItem(key); } catch { return null; }
  }
  function writeSession(key, value) {
    try { sessionStorage.setItem(key, value); } catch { /* blocked session storage */ }
  }

  // The installed app's preferences live under different, stable keys in app.js.
  try {
    const previous = localStorage.getItem(storageKey);
    installedUpgrade = Boolean(previous && newer(current, previous));
    if (installedUpgrade) {
      // Show release confirmation once, never on every launch.
      window.addEventListener('load', () => message(`«Світло Черкаси» оновлено до v${current}`), {once:true});
      if (document.readyState === 'complete') message(`«Світло Черкаси» оновлено до v${current}`);
    }
    localStorage.setItem(storageKey, current);
  } catch { /* Apps work normally even with storage blocked. */ }

  function showRelease(data, preview = false, installed = false) {
    const name = publicText(data.title, 'Що нового', 90);
    title.textContent = preview ? 'Тест · ' + name : installed ? 'Оновлено до ' + data.version : 'Версія ' + data.version + ' · ' + name;
    description.textContent = publicText(data.description, 'Покращення роботи застосунку та виправлення помилок.', 260);
    notes?.replaceChildren();
    if (notes) for (const line of (Array.isArray(data.notes) ? data.notes : []).slice(0, 7)) {
      const safe = publicText(line, '', 150);
      if (!safe) continue;
      const entry = document.createElement('li');
      entry.textContent = safe;
      notes.append(entry);
    }
    banner.dataset.preview = String(preview);
    banner.dataset.installed = String(installed);
    apply.textContent = preview ? 'Закрити тестовий перегляд' : installed ? 'Зрозуміло' : 'Оновити застосунок ↗';
    apply.disabled = false;
    banner.hidden = false;
  }
  if (document.body.dataset.deploymentChannel === 'beta') {
    const showPreview = data => {
      if (!data || typeof data.version !== 'string') return;
      release = null;
      showRelease(data, true);
    };
    window.SvitloUpdatePreview = showPreview;
    try {
      const channel = new BroadcastChannel('svitlo-content-v1');
      channel.addEventListener('message', event => {
        if (event.data?.type === 'SVITLO_PREVIEW_UPDATE_BANNER') showPreview(event.data.release);
      });
      window.addEventListener('pagehide', () => channel.close(), {once: true});
    } catch {}
  }
  let release = null;
  let checking = null;
  async function checkRelease(manualCheck = false) {
    if (!navigator.onLine) {
      if (manualCheck) message('Немає інтернету. Оновлення перевіримо після підключення.');
      return;
    }
    if (checking) return checking;
    checking = (async () => {
      try {
        const url = new URL('./release.json', document.baseURI);
        url.searchParams.set('check', String(Date.now()));
        const response = await fetch(url, {cache:'no-store'});
        if (!response.ok) throw new Error('release manifest unavailable');
        const data = await response.json();
        if (!data || typeof data.version !== 'string') throw new Error('invalid release manifest');
        if (newer(data.version, current)) {
          release = data;
          showRelease(data);
          banner.hidden = readSession(dismissedKey) === data.version;
          if (manualCheck && banner.hidden) {
            banner.hidden = false;
            writeSession(dismissedKey, '');
          }
        } else {
          release = null;
          if (installedUpgrade && data.version === current && !manualCheck) {
            showRelease(data, false, true);
            installedUpgrade = false;
          } else if (banner.dataset.preview !== 'true') banner.hidden = true;
          if (manualCheck) message(`У вас уже остання версія: ${current}`);
        }
      } catch (error) {
        console.warn('Application update check failed:', error);
        if (manualCheck) message('Не вдалося перевірити оновлення. Спробуйте пізніше.');
      } finally {
        checking = null;
      }
    })();
    return checking;
  }

  dismiss.addEventListener('click', () => {
    if (release?.version) writeSession(dismissedKey, release.version);
    banner.hidden = true;
  });
  apply.addEventListener('click', async () => {
    if (banner.dataset.preview === 'true' || banner.dataset.installed === 'true') { banner.hidden = true; return; }
    if (!release || !navigator.onLine) return message('Для оновлення потрібен інтернет.');
    apply.disabled = true;
    apply.textContent = 'Оновлюємо…';
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration('./');
        if (registration) {
          await registration.update();
          if (registration.waiting) registration.waiting.postMessage({type:'SKIP_WAITING'});
        }
      }
      // A reload downloads current HTML/CSS/JS using the network-first worker.
      // Existing localStorage, saved address and Push subscription are preserved.
      window.location.reload();
    } catch (error) {
      console.warn('Application update could not start:', error);
      message('Оновлення не вдалося. Перевірте з’єднання й спробуйте ще раз.');
      apply.disabled = false;
      apply.textContent = 'Оновити застосунок ↗';
    }
  });
  manual?.addEventListener('click', () => checkRelease(true));
  checkRelease();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRelease(); });
  window.addEventListener('online', () => checkRelease());
  window.setInterval(() => { if (!document.hidden) checkRelease(); }, 15 * 60 * 1000);
})();
