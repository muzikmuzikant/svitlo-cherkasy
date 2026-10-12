# Міграція автооновлення графіків на Railway

## Робоча схема
1. Railway Cron svitlo-schedules-cron за розкладом */5 * * * * (UTC) запускає Python 3.12.
2. Скрипт scripts/railway_schedule_cron.py отримує останній опублікований графік і дані перевірки з Railway. На першому запуску можливе завантаження перевіреного файлу з репозиторію.
3. Викликає той самий офіційний імпортер: python scripts/update_data.py --schedules-only.
4. Пара графік + висновки перевірки публікується через захищений POST /api/internal/schedules. Токен SCHEDULE_INGEST_SECRET зберігається тільки в Railway Variables.
5. Push-сервіс валідує всі перевірені дні та 12 підчерг, відхиляє застарілі файли і атомарно пише один знімок на існуючий постійний том /data.
6. PWA отримує графік через GET /api/data/schedules.json на Railway, а Push-сервіс використовує той самий знімок. Локальний кеш і GitHub Pages залишаються запасним джерелом.

## Налаштування
- Сервіс push: svitlo-cherkasy, GitHub root /push-server, volume /data.
- Cron: окремий сервіс, Dockerfile.schedule-cron, Python 3.12, GitHub root /, cronSchedule */5 * * * *.
- Змінна SCHEDULE_INGEST_SECRET однакова на Cron і на Push-сервері. НІКОЛИ не публікувати її в GitHub.
- SCHEDULE_PUBLISH_URL на Cron: https://svitlo-cherkasy-production.up.railway.app
- GitHub Actions update.yml: тільки після успішної публікації і перевірки Railway вимкнути schedule. workflow_dispatch зберегти для аварійного резерву.
- Окремі імпортери адрес і аварійних оголошень залишаються в GitHub Actions.

## Перевірка
- GET https://svitlo-cherkasy-production.up.railway.app/api/data/status має повертати ready:true, lastChecked і verifiedDays.
- GET /api/data/schedules.json повертає schemaVersion 3 і перевірений розклад.
- У логах Railway Cron має бути повідомлення Published checked= з актуальним timestamp.
- Після зупинки старого GitHub cron перевірити, що Railway cron продовжує оновлювати час перевірки.
- Не надсилати Push для тесту міграції.

## Безпечний відкат
1. Зупинити/вимкнути Railway Cron.
2. Повернути schedule в .github/workflows/update.yml та викликати workflow_dispatch.
3. PWA використовує збережений перевірений графік Railway, а під час збоїв резервний JSON GitHub Pages.
4. НЕ видаляти Railway volume /data, Push-підписки або секрети.

Railway Cron працює за UTC, мінімальний інтервал 5 хвилин. Новий запуск пропускається, якщо попередній ще виконується. У разі збоїв імпортера останній перевірений графік на сервері не змінюється.
