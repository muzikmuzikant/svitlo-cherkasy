/* The browser is an install guide. Main app loads only in installed standalone mode. */
(() => {
  'use strict';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) {
    const hour = document.createElement('script');
    hour.src = './hour-paint.js';
    hour.onload = () => {
      const lookup = document.createElement('script');
      lookup.src = './address-lookup.js';
      lookup.onload = () => {
        const app = document.createElement('script');
        app.src = './app.js';
        app.onload = () => {
          const updater = document.createElement('script');
          updater.src = './version-check.js';
          document.body.append(updater);
        };
        document.body.append(app);
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(console.warn);
})();
