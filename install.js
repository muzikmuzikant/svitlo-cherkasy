/* The browser is an install guide. Main app loads only in installed standalone mode. */
(() => {
  'use strict';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // Installed iPhone PWAs must update their own Service Worker, not only the browser installer.
  if (navigator.serviceWorker?.register) {
    navigator.serviceWorker.register('./sw.js', {scope:'./',updateViaCache:'none'})
      .then(reg=>reg.update?.().catch(error=>console.warn('SW update:',error)))
      .catch(error=>console.warn('SW registration:',error));
  }
  if (standalone) {
    const hour = document.createElement('script');
    hour.src = './hour-paint.js';
    hour.onload = () => {
      const lookup = document.createElement('script');
      lookup.src = './address-lookup.js';
      lookup.onload = () => {
        const merger = document.createElement('script');
        merger.src = './data-merge.js';
        merger.onload = () => {
          const inbox = document.createElement('script');
          inbox.src = './notification-center.js';
          inbox.onload = () => {
          const app = document.createElement('script');
          app.src = './app.js';
          app.onload = () => {
            // Inbox must never depend on the optional rich-copy file loading.
            // Cached iPhone PWAs can temporarily have a mismatched script bundle.
            let inboxStarted = false;
            const startInbox = () => {
              if (inboxStarted) return;
              inboxStarted = true;
              const inboxUi = document.createElement('script');
              inboxUi.src = './inbox-ui.js';
              inboxUi.onerror = () => {
                const panel = document.getElementById('inboxList');
                if (panel) panel.textContent = 'Не вдалося завантажити повідомлення. Перевірте інтернет і оновіть застосунок.';
              };
              document.body.append(inboxUi);
            };
            const textScript = document.createElement('script');
            textScript.src = './notification-text.js';
            textScript.onload = startInbox;
            textScript.onerror = () => {
              console.warn('Notification descriptions unavailable; starting Inbox with fallback.');
              startInbox();
            };
            document.body.append(textScript);
            // Offline or stalled script requests must not leave Inbox loading forever.
            setTimeout(startInbox, 4000);
            const updater = document.createElement('script');
            updater.src = './version-check.js';
            document.body.append(updater);
          };
          document.body.append(app);
          };
          document.body.append(inbox);
        };
        document.body.append(merger);
      };
      document.body.append(lookup);
    };
    document.body.append(hour);
    return;
  }

  const action = document.getElementById('installAction');
  const instructions = document.getElementById('installInstructions');
  const platformLabel = document.getElementById('installPlatformLabel');
  if (!action || !instructions || !platformLabel) return;
  const isiOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  let deferredPrompt = null;

  function stepsHTML() {
    if (isiOS) return `<strong>На iPhone / iPad:</strong><ol>
      <li>Відкрийте сайт у <strong>Safari</strong>.</li>
      <li>Натисніть кнопку <strong>Поділитися</strong> (квадрат зі стрілкою).</li>
      <li>Оберіть <strong>На початковий екран</strong> → <strong>Додати</strong>.</li>
      <li>Відкрийте «Світло Черкаси» із нової іконки.</li>
    </ol><p class="install-note">Якщо ви в Telegram, Instagram чи іншому застосунку, спершу відкрийте сторінку в Safari. Потрібна захищена адреса HTTPS.</p>`;
    if (isAndroid) return `<strong>На Android:</strong><ol>
      <li>Відкрийте сайт у <strong>Google Chrome</strong>.</li>
      <li>Натисніть меню <strong>⋮</strong> у браузері.</li>
      <li>Виберіть <strong>Встановити застосунок</strong> або <strong>Додати на головний екран</strong>.</li>
      <li>Запустіть його через іконку на телефоні.</li>
    </ol><p class="install-note">Якщо Chrome пропонує встановлення автоматично, використайте основну кнопку вище.</p>`;
    return `<strong>Як установити:</strong><ol>
      <li>На iPhone відкрийте цей сайт через Safari → Поділитися → На початковий екран.</li>
      <li>На Android відкрийте сайт через Chrome → ⋮ → Встановити застосунок.</li>
      <li>На комп’ютері у Chrome або Edge скористайтеся пунктом «Встановити застосунок» у меню браузера.</li>
    </ol>`;
  }
  function showInstructions(scroll = false) {
    instructions.innerHTML = stepsHTML();
    instructions.hidden = false;
    if (scroll) instructions.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  platformLabel.textContent = isiOS ? 'iPhone / iPad · Safari' : isAndroid ? 'Android · Chrome' : 'iPhone, Android або комп’ютер';
  action.innerHTML = isiOS ? 'Показати кроки для iPhone <span aria-hidden="true">→</span>' :
    isAndroid ? 'Як встановити на Android <span aria-hidden="true">→</span>' :
      'Як встановити застосунок <span aria-hidden="true">→</span>';
  // Apple Safari cannot open a native install dialog; showing clear steps is more useful.
  if (isiOS) showInstructions();

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    action.innerHTML = 'Встановити застосунок <span aria-hidden="true">→</span>';
  });
  action.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch (error) {
        console.warn('Install prompt unavailable:', error);
        showInstructions(true);
      }
      return;
    }
    showInstructions(true);
  });
  window.addEventListener('appinstalled', () => {
    action.textContent = 'Застосунок установлено ✓';
    action.disabled = true;
    instructions.hidden = false;
    instructions.textContent = 'Готово! Тепер відкрийте «Світло Черкаси» з іконки на головному екрані.';
  });

})();
