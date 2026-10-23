# Світло Черкаси | Технічний runbook для ШІ-розробника

**Мета:** від нуля відновити контекст, перевірити середовища, безпечно виправляти помилки, тестувати, готувати Beta й Production, діагностувати аварії. Звертайся до [AGENTS](../AGENTS.md) та [паспорта](AI_HANDOFF_MASTER.md).

## 0. Порядок довіри до інформації

1. Останній **прямий** запит власника.
2. **Поточна реальна конфігурація** активної гілки і розгорнутих інфраструктур, фактичні endpoint.
3. Контракти `DESIGN_RULES.md`, `SCHEDULE_DISPLAY_CONTRACT.md` (якщо немає новішої прямої вказівки).
4. Ця документація із датованими статусами.
5. Старі README і застарілі розмови.

**Важливо:** навіть зелений CI не доводить, що функція працює на реальному встановленому PWA з iOS Web Push. Не називай регресійний тест end-to-end перевіркою фізичного телефону.

## 1. Система з висоти

```text
АТ «Черкасиобленерго» (опубліковані графіки / офіційні матеріали)
       |
  scripts/update_data.py + conservative validation
       |
  data/*.json, source_review.json
       |                       GitHub Actions        Railway cron / publisher (перевірити, що активне)
       |                    |
       |                Railway /api/data/schedules.json
       |                    |             GitHub Pages / Cloudflare Beta    Node Web Push companion
       |                               |
  index.html + app.js + SW         Web Push -> iOS installed PWA
       |                               |
  UI + caches + IndexedDB ----------- Inbox
       |
  /api/feedback, /api/admin, SSE/WebSocket/polling (актуальний код)
       |
  Railway persistent /data (окремо Beta/Production)
```

Це концептуальна карта, а не гарантія єдиної діючої конфігурації. У коді лишилися шляхи старих версій; реальну пріоритетність отримання даних дивись у `app.js`, `site-mode.js`, `push-server/schedule-publication.js`, `push-server/server.js`.

## 2. Локальний запуск (ПК, за можливості)

Потрібні Git, Python 3.12+, Node.js 22 (Node 20+ допускає сервер), пакетний менеджер pip/npm. Папка репозиторію містить статичний web root і backend у `push-server/`.

```bash
git clone https://github.com/muzikmuzikant/svitlo-cherkasy.git
cd svitlo-cherkasy
git fetch --all --prune
git checkout staging
git pull --ff-only
git checkout -b fix/<short-descriptive-name>

python -m pip install -r requirements.txt pytest
python -m pytest -q tests
node --test tests/*.cjs tests/*.mjs
python scripts/build_pages.py
node --check app.js
node --check sw.js
node --check push-server/server.js
```

Ці команди не потребують справжніх приватних ключів для static/unit test. На Windows використовуй PowerShell, `py -m pip` або налаштуй системний `python`; Unix shell glob `tests/*.mjs` у PowerShell може вимагати інший синтаксис. У разі помилки розділяй dependency failure і справжню regressію.

**Локальний показ PWA:** `python -m http.server 8000` у корені й `http://localhost:8000` у браузері. Для повноцінного PWA/service worker краще будувати `_site` й відкривати локальний localhost, але реальний Push і встановлений iOS PWA вимагають HTTPS та повноцінного домену. Не розповсюджуй локальний тест як live.

**Сервер:** `cd push-server && npm install && npm start`; без потрібних змінних середовища `push-server/server.js` завершується з повідомленням про `VAPID_PUBLIC_KEY`, `PUSH_PRIVATE_KEY`, `PUSH_CONTACT`, `APP_ORIGIN`, `SCHEDULE_URL`. **Не додавай ці значення в GitHub.** Для unit-тестів використовуй існуючі mock/fake шаблони. Production-сервер не можна підміняти локальною фейковою базою підписників.

**Кореневий package.json історичний:** має іншу версію і `server.js`; реальний окремий Node ES-module backend у `push-server/package.json`. Не запускай кореневий `npm start` без розуміння, які саме компоненти він підніме.

## 3. Швидкі команди тестів

```bash
# Сумарні Python-тести:
python -m pytest -q tests

# Повний Node набір:
node --test tests/*.cjs tests/*.mjs

# Побудова саме production/static артефакту з поточної гілки:
python scripts/build_pages.py

# Вузькі тести перед найчастішими змінами:
node --test tests/test_beta_ui_regressions.mjs
node --test tests/test_address_lookup.cjs
node --test tests/test_service_worker_push_offline.mjs
node --test tests/test_push_delivery_health.mjs
node --test tests/test_transition_inbox.mjs
node --test tests/test_schedule_engine.mjs
node --test tests/test_inbox_recovery.mjs
node --test tests/test_ios_double_tap_v732.mjs
node --test tests/test_release_boundary.mjs
```

Перелік не вичерпний; дивись нові тести. Особливо важливо не запускати smoke на зовнішніх endpoint в середовищі без інтернету й потім робити висновок «API зламане»: спочатку перевір доступність мережі.

`node --test smoke/live_release.mjs` та `node --test smoke/beta_preflight.mjs` є **read-only** контрактними перевірками актуальних публічних API. Тести містять конкретні домени; якщо вони змінилися, перевір новий deployment перед зміною тесту. Заборонено замінювати read-only smoke на таємні модифікації адміністратора або тестові масові Push.

## 4. Безпечна гілкова стратегія

### Код нових функцій

1. `git fetch`, знайди актуальні `main` та `staging`; порівняй `release.json`, `push-config.json`, `manifest.webmanifest`, `CNAME`.
2. Створи **окрему** гілку від останньої `staging` (напр. `fix/staging-feedback-realtime-YYYYMMDD`).
3. Реалізуй зміну + тест і відкрий PR **у `staging`**. Якщо асистент має права і явно отримав право на beta-deploy, дотримуйся поточного workflow. Ніколи не вважай, що створення PR саме по собі вже задеплоїло код.
4. Перевір Beta API і сайт. Підтверди, що URL дійсно завантажив код відповідного commit (збірка, fingerprint, `release.json`, DevTools/SW).
5. Підготуй докладний результат для власника з лінком на PR і відомими обмеженнями.

### Випуск у Production

1. Потрібна **окрема пряма команда власника** на реліз.
2. Створи нову `release/*` гілку **від поточного `main`**, а не сліпе злиття усієї `staging`.
3. Перенеси потрібні перевірені commits/patches вибірково, стеж за конфліктами.
4. Залиш `main`-версії живих `data/*`, `CNAME`, `push-config.json`, `manifest.webmanifest` та Google verification; потрібні зміни в цих файлах потребують окремого розуміння.
5. Встанови `release.json` в наступну узгоджену версію з простим користувацьким текстом (без dev-термінології). Перевір PWA cache fingerprint.
6. Прожени повний CI, read-only Smoke та ручний сценарій для iPhone за чеклистом; переконайся, що реклама не увімкнена.
7. Запропонуй PR на `main`. Merge лише після остаточного схвалення.
8. **Після merge:** перевір `.github/workflows/pages.yml`, фактичний Production URL і Railway deploy, графік, підчергу, Push-API, адмін-CORS, feedback, consent і версію; за потреби безпечний rollback. Не обіцяй, що деплой миттєвий.

### Чому не просто `git merge staging`

На staging інші API, PWA manifest identity, VAPID public key і можливо реклама/незавершені функції, тоді як живі Production дані оновлюються незалежно. Повний merge здатен зламати встановлені іконки та підписки, переприв'язати користувачів до Beta API й розмістити неготову рекламу.

## 5. Що перевіряти на GitHub без доступу до ПК

Відкрий `https://github.com/muzikmuzikant/svitlo-cherkasy`. Перемикай гілки меню вгорі над файлами; перевір `release.json`; `Pull requests` → відкриті PR → `Files changed`, `Checks`, `base/head`; `Actions` → потрібний workflow → конкретний Run → Jobs → логи; `Settings → Pages` при дозволі доступу.

Для ШІ з інтеграцією GitHub користуйся GitHub connector для читання, створення гілок, файлів, PR та перегляду CI. **Не повідомляй власнику «я не можу завантажити» лише через те, що ти не спробував штатний інструмент.**

## 6. GitHub Pages і Service Worker

На `main` `.github/workflows/pages.yml` після push запускає `python scripts/build_pages.py`, завантажує `_site` і публікує GitHub Pages. Збірка використовує **білий список** публічних файлів, автоматично підставляє версію з `release.json`, створює SW fingerprint на основі файлів. Звичайний доданий `.md` **не стає публічним сайтом**, поки його явно не включити у збірку.

`scripts/build_pages.py` виключає секрети і код backend; для production додає `CNAME` та Google verification file; для Beta не повинен підсунути production custom domain. Не змінюй build include list без причин. На iOS встановлені PWA мають власний controlled SW/cache; `install.js` намагається `register('./sw.js', {updateViaCache:'none'})` і reload при зміні controller, але цю поведінку треба тестувати з версіями та кешем.

**Коли сайт «не оновився»:**
- спочатку перевір, чи commit дійшов до потрібної гілки;
- перевір CI/Pages/Cloudflare deployment і його commit;
- відкрий `release.json` на сайті з cache-busting query, перевір статус/headers;
- перевір SW controller, cache names, версію побудованого `sw.js`, install flow;
- переконайся, що користувач відкрив Beta, а не Production і навпаки;
- не радь «видалити PWA» першим кроком: можна втратити локальні адреси, підписки й кеш. Спочатку безпечне перевірене оновлення.

## 7. Railway: як перевірити безпечний статус

**Production API:** `https://svitlo-cherkasy-production.up.railway.app`.
**Beta API:** `https://svitlo-beta-api-staging.up.railway.app`.

Приклад **лише читання**:

```bash
curl -i https://svitlo-cherkasy-production.up.railway.app/health
curl -i https://svitlo-cherkasy-production.up.railway.app/api/data/status
curl -i https://svitlo-cherkasy-production.up.railway.app/api/data/schedules.json

curl -i https://svitlo-beta-api-staging.up.railway.app/health
curl -i https://svitlo-beta-api-staging.up.railway.app/api/data/status
```

Ці endpoint можуть змінитися. `health.ok` лише доводить відповідь сервера, **не** гарантоване отримання актуальних публікацій. Порівняй `lastChecked`, `verifiedDays`, `schemaVersion`, `source`, `reviewPending`, потрібні дні, часовий пояс. Не друкуй повні логи з приватними токенами у чат.

**Дані:** `/data` на Railway persistent volume має містити підписки, admin/feedback/analytics/ads/state/schedules залежно від модуля. Не видаляти volume, не скидати subscribers, не міняти VAPID-ключі без migration plan. Beta і Production мають окремі volumes, навіть якщо інфраструктура налаштована одним власником.

**Змінні:** `VAPID_PUBLIC_KEY`, `PUSH_PRIVATE_KEY`, `PUSH_CONTACT`, `APP_ORIGIN`, `SCHEDULE_URL`, `DATA_FILE`, `ADMIN_PASSWORD`, за потреби `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, `SCHEDULE_INGEST_SECRET`, можливі security/beta knobs. Значення не читати без потреби; ніколи не вставляти у PR, issue, README або відповідь. Якщо нове значення потрібне від власника, поясни, як додати його без передачі текстом.

## 8. Графіки: діагностика від початку до кінця

Коли користувач каже «сайт не відображає сьогоднішні відключення»:
1. Визнач дату **за Києвом**; особливо перевір межі опівночі та наступного дня.
2. Переглянь офіційну публікацію і `data/schedules.json` для актуальної гілки.
3. Перевір importer `scripts/update_data.py`, лог останнього cron або Actions, `source_review.json`, конфлікти дат, редакції та захищену публікацію.
4. Перевір Railway `/api/data/status` і `/api/data/schedules.json`, чи збігаються з офіційним джерелом і чи не застаріли.
5. Зрозумій, який fetch пріоритет використовує `app.js`; чи не перемагає статичний JSON над свіжим API, чи не застряг SW/HTTP cache, чи failover не показує невірну дату.
6. Перевір підчергу користувача й `hour-paint.js` / графічне представлення.
7. Регресійні тести на дату/повноту/правило 24 зелених годин, 19:30, next week.
8. Не змінюй плановий графік вручну за здогадом і не проводь масову Push-розсилку як пробу.

**Ключове розходження історії:** Railway Cron у `RAILWAY_SCHEDULES.md` кожні 5 хв, GitHub Actions `update.yml` на `main` також має cron, а окрема гілка реалізовувала minute worker. Лише actual deployed settings визначають, що активне. У разі подвійних worker можуть бути гонки, дублікати ревізій або невідповідність Push. Не підключай другий publisher, не перевіривши перший.

## 9. Адреси: відтворення і корінь

Мінімальна матриця: `Черкаси → Івана Кожедуба`, `Слобода/Червона Слобода → Філатова`, реальні села Черкаського району, старі та нові назви, тип «вулиця»/«провулок», список будинків і вулиця без будинків.

Порівняй по порядку:
- дані офіційного електромережевого PDF; чи не відкинуто `ВСП Черкаські ЕМ`;
- загальний довідник вулиць (GIS/OSM якщо є у **даній гілці**), гарантія правильного села і джерела;
- `scripts/update_data.py` (regex, нормалізація, alias, відновлення, архів);
- `data/addresses.json` і root `addresses.json`, чи потрібний реально використаний;
- `address-lookup.js` (`suggest`, `resolve`, `streetQueues`, exact house, archived);
- `data-merge.js`, `app.js` fetch + local cache;
- `sw.js` stale cache, розгортання і перевірку на справжньому iPhone.

Окремо перевір, чи не зникнуть відновлені вулиці **після наступного nightly/import cron**. Правильне виправлення має бути і в parser/merge, і в тесті. Додавання двох назв до static array не вирішує більшість проблему.

## 10. Push: диспетчер, фонові події, дедуплікація

Схема: опублікована перевірена подія → `push-server/schedule-engine.js` / `notification-copy.js` → фільтрація відповідної підчерги → серверне dedupe id → Web Push provider → `sw.js` push event → OS notification / app Inbox.

Для збоїв:
1. Це саме **Push** чи лише запис у вхідних? Перевір installed PWA, дозвіл, subscription у сервері, `push-config.json` правильного origin.
2. У серверній діагностиці `/health` шукай `lastPushCheck`, `pushCheckError`, час останнього виконання; не вважай `ok:true` достатнім.
3. Перевір строк актуальності snapshot, `freshSchedule`, `dueTransitionAcrossDays`, часові межі й 30/15 хв offset.
4. Перевір стабільний dedupe ключ, перезапуск сервера, повторне надходження тієї ж ревізії і 2 device subscriptions.
5. Перевір `sw.js` notificationclick і direct link, `notification-center.js` / IndexedDB duplicate.
6. Якщо повідомлення прийшло двічі, не маскуй друге локально лише в UI; перевір, де створено дві події і чи однаковий ідентифікатор.

**Небезпечне:** тест «на всіх підписаних» без окремого дозволу, зміна VAPID, видалення subscribers або sent ledger, підстановка Beta key в Production, друк endpoint-підписок у логи.

## 11. Звернення та оголошення: realtime

Сервер є основним джерелом істини, клієнт має cached optimistic/IndexedDB/localStorage стани. При видаленні/знятті публікації потрібне **явне** server revision / tombstone / власний ресурс status, інакше нове опитування або старий кеш воскресить дані.

Список перевірок:
- через адмінку створити тестовий запис у **Beta**, не Production;
- відкрити клієнта в іншій вкладці/пристрої, перевірити появу;
- редагувати, закріпити, зняти й видалити, перевірити зникнення без reload;
- зірвати SSE/WebSocket, переконатися у backoff/reconnect/polling fallback;
- розгорнути detail, відкрити меню дій, закрити, перевірити enter/exit;
- змоделювати старий кеш, refresh і відновлення з offline;
- на зверненні перевірити обробку 404/410 і видалення локальної картки без витоку приватного token.

Не створюй справжніх звернень користувачам у live для тесту.

## 12. Технічні роботи та екстрені події

Технічні роботи: окремий зрозумілий екран, перемикання функцій, діагностика доступна адміну, вимкнення публікації не ламає PWA install. Emergency: правдиві й датовані повідомлення оператора; не вирішуй, що будинок знеструмлений через загальну новину; публікація й завершення мають працювати з відповідною подією. У разі екстрених відключень плановий графік може бути нерелевантний і це треба пояснити користувачеві.

## 13. Юридична й персональна безпека

Не вигадувати «офіційну співпрацю» з АТ «Черкасиобленерго», поки немає підтвердження. Не змінювати тексти політики/умов без правдивого аналізу фактичного збору даних. Правові норми й договори провайдерів можуть змінюватися: перевір перед юридично значущими твердженнями. Документи `docs/LEGAL_RELEASE_REVIEW.md`, `docs/RELEASE_ACCEPTANCE_v798.md` мають незакриті/історичні перевірки, **не автоматично виконані**.

Не публікуй API secrets, admin password, VAPID private key, email/зміст звернень, індивідуальні push endpoints, installation identifiers. Не зберігай sensitive content у issue/PR title і commit message. Мінімізуй аналітику, дотримуйся opt-in і строків зберігання.

## 14. Відкат без знищення даних

При production-регресії першочергово **припини додаткові зміни**, зафіксуй поточний commit і snapshot, повідом власника. Відкочуй **код / деплой** окремо від stateful `/data`, не повертаючи помилково старі `data/schedules.json` поверх нових офіційних. Історичні rollback branches є у GitHub, але перед їх застосуванням порівняй з поточним `main`; **ніколи** бездумно force-push чи reset live.

Якщо проблема лише нової функції, відключи через узгоджений feature flag, якщо механізм перевірено. Релізити відкат у `main` лише за дозволом власника; для гострого інциденту повідом, які ризики залишаються до його рішення.

## 15. Порядок звітності

Структура хорошої відповіді власнику після роботи:
- **Що було:** коренева причина та прояв.
- **Що змінив:** конкретні модулі / поведінка.
- **Де зараз:** branch, commit, PR, Beta URL чи production.
- **Перевірка:** точні автоматичні тести, GitHub Checks, браузер / iPhone, якщо фактично перевірено.
- **Що не підтверджено:** відкриті ризики/залежності без красивих обіцянок.
- **Що треба натиснути власнику:** тільки якщо необхідно, максимально просто.

Якщо процес асистента не має доступу до GitHub/Railway, не вигадуй комітів. Покажи готовий patch, файли й чесно назви обмеження інструментів. Якщо має доступ, не перекладай усе на користувача.
