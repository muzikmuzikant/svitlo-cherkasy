/* Static Github Pages gateway: normal browser sees install help, standalone PWA runs app. */
(() => {
  'use strict';
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) {
    // Keep module load order: hour paint must be ready before the main app starts.
    const hour = document.createElement('script');
    hour.src = './hour-paint.js';
    hour.onload = () => { const lookup = document.createElement('script'); lookup.src = './address-lookup.js'; lookup.onload = () => { const app = document.createElement('script'); app.src = './app.js'; app.onload = () => { const updater = document.createElement('script'); updater.src = './version-check.js'; document.body.append(updater); }; document.body.append(app); }; document.body.append(lookup); };
    document.body.append(hour);
    return;
  }
  const action = document.getElementById('installAction');
  const instructions = document.getElementById('installInstructions');
  const platform = document.getElementById('installPlatformLabel');
  const isiOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  let deferredPrompt = null;
  function showInstructions() {
    instructions.hidden = false;
    if (isiOS) {
      instructions.innerHTML = '<strong>Встановлення на iPhone / iPad:</strong><ol><li>Відкрийте цей сайт у <strong>Safari</strong>.</li><li>Натисніть <strong>Поділитися</strong> (квадрат зі стрілкою).</li><li>Оберіть <strong>На початковий екран</strong> → <strong>Додати</strong>.</li><li>Запустіть застосунок з нової іконки.</li></ol>';
    } else if (isAndroid) {
      instructions.innerHTML = '<strong>Встановлення на Android:</strong><ol><li>Відкрийте сайт у <strong>Google Chrome</strong>.</li><li>Натисніть меню <strong>⋮</strong>.</li><li>Оберіть <strong>Встановити застосунок</strong> або <strong>Додати на головний екран</strong>.</li><li>Запустіть із іконки.</li></ol>';
    } else {
      instructions.innerHTML = '<strong>Встановлення:</strong> відкрийте сайт у Safari на iPhone або у Chrome на Android, потім додайте його на головний екран. На комп’ютері в Chrome/Edge можна скористатися меню «Встановити застосунок». Запускайте зі встановленої іконки.';
    }
  }
  platform.textContent = isiOS ? 'iPhone / iPad · Safari' : isAndroid ? 'Android · Google Chrome' : 'iOS, Android та комп’ютери';
  if (isiOS) action.textContent = 'Як встановити на iPhone ↗';
  else if (isAndroid) action.textContent = 'Встановити на Android ↗';
  else action.textContent = 'Інструкція встановлення ↗';
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    action.textContent = 'Встановити застосунок ↗';
  });
  action.addEventListener('click', async () => {
    if (deferredPrompt) {
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      await prompt.userChoice;
      return;
    }
    instructions.hidden = !instructions.hidden;
    if (!instructions.hidden) showInstructions();
  });
  window.addEventListener('appinstalled', () => {
    action.textContent = 'Встановлено ✓';
    action.disabled = true;
    instructions.hidden = false;
    instructions.textContent = 'Готово! Закрийте вкладку браузера й відкрийте «Світло Черкаси» з іконки на головному екрані.';
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(console.warn);
})();
