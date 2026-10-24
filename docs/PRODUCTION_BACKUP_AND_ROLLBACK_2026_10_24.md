# 7.9.12: Production backup and rollback card
Дата: 24.10.2026. Тільки підготовка. Цей документ не дозволяє деплой.

## Production snapshot (READ ONLY, перевірено під час підготовки)

- GitHub: `muzikmuzikant/svitlo-cherkasy`; live `main` на час запису: `b8610927d1ab55b9960a9f770a1c95b44d2ab179`; Production UI до релізу `7.9.11`.
- Railway project: `exciting-delight` (`47d8f817-0c42-4308-a193-d0b9f54cb37d`).
- Railway environment: `production` (`2e7ec7db-5158-4613-8fff-91d55bc1436b`).
- Live API service: `svitlo-cherkasy` (`b6c91c32-01b1-4d7a-b291-5ae301a3bd5c`).
- До релізу API build: deployment `b2392b65-b763-4c61-80a7-33b2dfcbd8c3`, SHA `0c3ea3fd0018c4576bc5920feb9a5b04cba976f0`.
- Live schedule worker: `svitlo-schedules-cron` (`c01eb078-dcee-428d-a12a-2fc9ba14c6c8`).
- До релізу worker build: deployment `caaf1ac8-5c7d-48d5-98c9-8f4d5d0db7b0`, SHA `8a3678cbe59fa74eead1f489af2caed48a52ee6b`.
- **Незмінний том:** `svitlo-cherkasy-volume` (`67434b57-8999-46d1-ac26-21d52b257363`), змонтований у API як **`/data`**, 500 МБ, без staged змін.
- Beta має **інший** Railway project/environment, VAPID, сховище і PWA identity.
- Обидва Production сервіси мали ONLINE/SUCCESS, без Railway 5xx у вибраному годинному вікні (2 394 API requests); перевірити повторно перед релізом.

## Бекап з підтвердженням користувача (ОБОВ'ЯЗКОВО)

Мій підключений Railway connector **не надає дії створення або перегляду volume snapshots**, отже в цій розмові неможливо безпечно підтвердити створення резервної копії через API. Не плутати **наявність volume** з **наявністю backup**.

Власник у Railway має:
1. Відкрити Production project → service **svitlo-cherkasy** → вкладка **Backups** (НЕ Beta).
2. Виконати **Create backup** для прикріпленого тому `svitlo-cherkasy-volume`, дочекатися появи snapshot і перевірити його дату. За бажанням включити Daily backups. Документація: https://docs.railway.com/volumes/backups
3. Підтвердити, що snapshot створено. Нічого не відновлювати на цьому етапі.

Важливо: витрати на backups можуть бути додатковими; у Railway обсяг manual backup обмежений 50% загального розміру тому. Самі snapshot-и можуть бути відновлені тільки в тому самому project/environment. **Не натискати Restore під час нормального релізу.**

## Контрольоване оновлення після явного дозволу

1. Оновити `main` HEAD (автоматичні графіки можуть додавати коміти щохвилини). Злити PR #77 **лише після перевірки**, що SHA main є предком кандидата і живі `data/schedules.json`, `data/source_review.json`, `data/emergency.json` не відрізняються. У CI є відповідний fail-closed gate.
2. Перевірити 360/360 Code/Data і всі браузерні та channel CI саме для останнього релізного SHA.
3. Через Railway без змін volume і секретів розгорнути Production API з **узгодженого release SHA**; перевірити доступність GET `/api/data/status`, POST/PUT адмінки, реальну підписку, відсутність 5xx. Якщо потрібно, окремо оновити worker із того самого SHA. Не перезаписувати VAPID та `DATA_FILE`.
4. Звернути увагу: **Railway source branch зараз не закріплений у Production API/worker** і попередні live deployments датовані 16.10.2026. Звичайний Merge у GitHub **не гарантує**, що Railway сам підхопить новий код! Перевірити новий deployment SHA для API, окремо worker.
5. Cron має watch pattern включно з `data/schedules.json`. Якщо підключити джерело до рухомої `main` без фіксації SHA, кожне автоматичне оновлення графіка може викликати зайвий redeploy worker. Для випуску бажано pin до погодженого commit SHA, а не увімкнути нескінченні автоматичні деплої від змін графіків.
6. Після успішного Railway розгортання перевірити на публічному PWA файл `release.json`: `7.9.12`, `channel=production`; CNAME та PWA manifest identity незмінні.
7. В адмінці «Реклама» перевірити `commercialLocked=false`; старі оголошення лишаються вимкненими. Покази вмикає тільки власник.
8. Якщо попередньо вмикався `limited`, вимкнути після підтвердження роботи. Full maintenance не вмикати лише через деплой.

## У випадку проблем

- Зупинити поширення нової версії. Перевірити status/health і відповідність SHA.
- Для **коду** відкотити API на `b2392b65-b763-4c61-80a7-33b2dfcbd8c3` і/або worker на `caaf1ac8-5c7d-48d5-98c9-8f4d5d0db7b0` через Railway Rollback; перевірити сумісність з даними, які встигли змінитися.
- **Не відновлювати старий snapshot volume автоматично**: це видалить/відкотить свіжі Push-підписки, звернення, статистику й сповіщення, які з'явилися після бекапу. Відновлення volume лише після оцінки втрат і окремого рішення.
- За критично недостовірних графіків обмежити відображення та показати перевірене джерело, а не стверджувати «Світло весь день» без актуальних даних.

## Ручні блокери

- [ ] Власник підтвердив існуючий Production **volume backup** у вкладці Railway.
- [ ] На фізичному iPhone у встановленому PWA перевірено Push при закритому додатку (OFF і ON, без дублювання).
- [ ] Власник **окремо** дозволив Production release.
