/* The browser is an install guide. Main app loads only in installed standalone mode. */
(() => {
  'use strict';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  // No device identifiers are collected. Count one event per tab and day.
  const referrerSource=(()=>{try{const x=new URLSearchParams(location.search).get('src');return ['telegram-echerkasy','telegram-cherkasy-golovne','telegram'].includes(x)?x:'direct'}catch{return 'direct'}})();
  async function reportUsage(event,value=''){
    try{
      const date=new Date().toISOString().slice(0,10),key='svitlo-aggregate-'+event+'-'+value+'-'+date;
      if(sessionStorage.getItem(key)==='yes')return;
      const response=await fetch('./push-config.json',{cache:'no-store'});
      if(!response.ok)return;
      const cfg=await response.json(),base=new URL(cfg.apiBase);
      if(base.protocol!=='https:')return;
      const result=await fetch(new URL('/api/telemetry',base),{method:'POST',cache:'no-store',keepalive:true,
        headers:{'content-type':'application/json'},body:JSON.stringify({event,source:referrerSource,value})});
      if(result.ok)sessionStorage.setItem(key,'yes');
    }catch{/* Telemetry must never block the application. */}
  }
  const userAgent=navigator.userAgent||'';
  const platform=/iPad/i.test(userAgent)?'iPad':/iPhone|iPod/i.test(userAgent)?'iPhone':/Android/i.test(userAgent)?'Android':/Windows/i.test(userAgent)?'Windows':/Macintosh/i.test(userAgent)?'macOS':/Linux/i.test(userAgent)?'Linux':'Інше';
  const version=document.querySelector?.('meta[name="svitlo-version"]')?.content||'';
  // Measurements are independent aggregate counters. No visitor identifier,
  // house, street, or connection to a particular support ticket is transmitted.
  reportUsage(standalone?'app_open':'landing');
  reportUsage('platform_sample',platform);
  if(/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version))reportUsage('version_sample',version);
  if(typeof window!=='undefined')window.SvitloTelemetry={sampleSelected(place){
    if(!place||!standalone)return;
    if(/^[1-6]\.[12]$/.test(String(place.queue||'')))reportUsage('queue_sample',place.queue);
    const town=String(place.settlement||'').trim().replace(/\s+/g,' ').slice(0,55);
    if(town)reportUsage('locality_sample',town);
  }};

  // Installed iPhone PWAs must update their own Service Worker, not only the browser installer.
  if (navigator.serviceWorker?.register) {
    const previousController=navigator.serviceWorker.controller;
    let restarted=false;
    if (standalone && previousController && navigator.serviceWorker.addEventListener) {
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if (!restarted && navigator.serviceWorker.controller!==previousController) {
          restarted=true;
          window.location.reload(); // Load compatible HTML and scripts together.
        }
      });
    }
    navigator.serviceWorker.register('./sw.js', {scope:'./',updateViaCache:'none'})
      .then(reg=>reg.update?.().catch(error=>console.warn('SW update:',error)))
      .catch(error=>console.warn('SW registration:',error));
  }
  if (standalone) {
    // A failed cached script must present a retry, not leave the splash stuck.
    const reportLaunchFailure = () => {
      const splash = document.getElementById('appBootScreen');
      const message = document.getElementById('appBootMessage');
      const retry = document.getElementById('appBootRetry');
      if (!splash || splash.hidden || splash.classList.contains('is-complete')) return;
      splash.classList.add('app-boot-failed');
      if (message) message.textContent = 'Не вдалося завантажити застосунок';
      if (retry) { retry.hidden = false; retry.onclick = () => location.reload(); }
    };
    const bootTimeout = setTimeout(reportLaunchFailure, 25000);
    const hour = document.createElement('script');
    hour.onerror = reportLaunchFailure;
    hour.src = './hour-paint.js';
    hour.onload = () => {
      const lookup = document.createElement('script');
      lookup.src = './address-lookup.js';
      lookup.onerror = reportLaunchFailure;
      lookup.onload = () => {
        const merger = document.createElement('script');
        merger.src = './data-merge.js';
        merger.onerror = reportLaunchFailure;
        merger.onload = () => {
          const inbox = document.createElement('script');
          inbox.src = './notification-center.js';
          inbox.onerror = reportLaunchFailure;
          inbox.onload = () => {
          const app = document.createElement('script');
          app.src = './app.js';
          app.onerror = reportLaunchFailure;
          app.onload = () => {
            if (typeof clearTimeout === 'function') clearTimeout(bootTimeout);
            // Inbox must never depend on the optional rich-copy file loading.
            // Cached iPhone PWAs can temporarily have a mismatched script bundle.
            let inboxStarted = false;
            const startInbox = () => {
              if (inboxStarted) return;
              inboxStarted = true;
              const inboxUi = document.createElement('script');
              inboxUi.src = './inbox-ui.js';
              const support=document.createElement('script');
              support.src='./support-inbox.js';
              inboxUi.onload=()=>document.body.append(support);
              inboxUi.onerror = () => {
                const panel = document.getElementById('inboxList');
                if (panel) panel.textContent = 'Не вдалося завантажити повідомлення. Перевірте інтернет і оновіть застосунок.';
                document.body.append(support);
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

  const campaign=document.getElementById('installCampaign');
  if(campaign&&referrerSource==='telegram-cherkasy-golovne')campaign.hidden=false;
  const action = document.getElementById('installAction');
  const instructions = document.getElementById('installInstructions');
  const platformLabel = document.getElementById('installPlatformLabel');
  const copyButton=document.getElementById('installCopyLink');
  copyButton?.addEventListener('click',async()=>{
   try{
    await navigator.clipboard.writeText(location.href);
    copyButton.textContent='✓ Посилання скопійовано. Відкрийте в браузері';
   }catch{
    copyButton.textContent='Скопіюйте адресу сайту зверху: svitlo-cherkasy.pp.ua';
   }
  });
  if (!action || !instructions || !platformLabel) return;
  const isAndroid=/Android/i.test(navigator.userAgent);
  const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  const samsung=/SamsungBrowser\//i.test(navigator.userAgent);
  const firefox=/Firefox\//i.test(navigator.userAgent);
  const edge=/EdgA\//i.test(navigator.userAgent);
  let deferredPrompt=null;

  function stepsHTML(){
    if(isAndroid){
      if(samsung)return `<strong>Встановлення на Android (Samsung Internet):</strong><ol>
       <li>Відкрийте меню браузера Samsung Internet.</li>
       <li>Оберіть додавання сторінки на <strong>головний екран</strong>.</li>
       <li>Відкрийте «Світло Черкаси» з нової іконки.</li>
      </ol><p class="install-note">Якщо потрібного пункту немає, відкрийте посилання у Chrome та натисніть «Встановити».</p>`;
      if(firefox||edge)return `<strong>Встановлення на Android:</strong><ol>
       <li>Відкрийте меню браузера.</li>
       <li>Знайдіть пункт <strong>Встановити</strong> або <strong>Додати на головний екран</strong>.</li>
       <li>Відкрийте застосунок через створену іконку.</li>
      </ol><p class="install-note">Якщо такого пункту немає, відкрийте сайт у Google Chrome.</p>`;
      return `<strong>Встановлення на Android (Google Chrome):</strong><ol>
       <li>Відкрийте сайт у <strong>Google Chrome</strong>.</li>
       <li>Натисніть меню <strong>⋮</strong> та оберіть <strong>Встановити застосунок</strong> або <strong>Додати на головний екран</strong>.</li>
       <li>Відкрийте «Світло Черкаси» через нову іконку.</li>
      </ol><p class="install-note">Якщо відкрили посилання в Telegram або іншому вбудованому браузері, спочатку оберіть «Відкрити в браузері».</p>`;
    }
    if(isIOS)return `<strong>Встановлення на iPhone та iPad:</strong><ol>
     <li>Відкрийте сайт у <strong>Safari</strong>.</li>
     <li>Натисніть <strong>Поділитися</strong> та оберіть <strong>На початковий екран</strong>.</li>
     <li>Натисніть «Додати» та відкрийте застосунок через його іконку.</li>
    </ol>`;
    return `<strong>Встановлення вебзастосунку:</strong><ol>
      <li>Відкрийте сайт у браузері з підтримкою вебзастосунків.</li>
      <li>Оберіть <strong>Встановити</strong> або <strong>Додати на головний екран</strong> у меню браузера.</li>
      <li>Запустіть «Світло Черкаси» через створену іконку.</li>
    </ol>`;
  }
  function showInstructions(scroll = false) {
    instructions.innerHTML = stepsHTML();
    instructions.hidden = false;
    if (scroll) instructions.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  platformLabel.textContent=isAndroid?(samsung?'Android · Samsung Internet':firefox?'Android · Firefox':edge?'Android · Edge':'Android · Chrome'):(isIOS?'iPhone / iPad · Safari':'Встановлення PWA');
  action.innerHTML='Як встановити застосунок <span aria-hidden="true">→</span>';

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    action.innerHTML = 'Встановити застосунок <span aria-hidden="true">→</span>';
  });
  action.addEventListener('click', async () => {
    reportUsage('install_guide');
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
