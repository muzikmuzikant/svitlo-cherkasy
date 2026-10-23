# Підсумок першого етапу передачі проєкту 23.10.2026

Це підтверджені результати роботи. Гілка `main` **не змінювалася**. Цей документ є історичним знімком: наступний розробник мусить повторно перевірити поточний стан.

## Завершено
- ✅ Повний AI-handoff додано до `staging` через [PR #66](https://github.com/muzikmuzikant/svitlo-cherkasy/pull/66), squash commit `cbc16fc6bb7e14011c49eb7f34739210107097e8`.
- ✅ У `staging` тепер є `AGENTS.md`, `docs/AI_CONTINUITY_INDEX.md`, `docs/AI_HANDOFF_MASTER.md`, `docs/AI_OPERATIONS_RUNBOOK.md`, `docs/AI_PRODUCT_AND_UX.md`, `docs/AI_BACKLOG_AND_RELEASE.md`, `docs/AI_STATUS_2026-10-23.md`, `docs/OWNER_GUIDE.md`, `docs/PLUS_EXPIRY_PLAN_2026-10-25.md`.
- ✅ Створено дві резервні **Git-гілки**:
  - [main: знімок](https://github.com/muzikmuzikant/svitlo-cherkasy/tree/backup/main-20261023-plus-expiry), commit `dbb9b094d927bd192328eeb9a1b89e40e1bff2a4`;
  - [staging: знімок](https://github.com/muzikmuzikant/svitlo-cherkasy/tree/backup/staging-20261023-plus-expiry), commit `defb7297e0c29de8ad3b3cde0e66fd68ca2539fd`.
- ✅ Причину CI offline-browser failure підтверджено за job logs: runner Ubuntu 26.04 несумісний з Playwright 1.56 Chromium. [PR #67](https://github.com/muzikmuzikant/svitlo-cherkasy/pull/67) закріпив Ubuntu 24.04, доповнив тригери PR, зміни влиті лише в `staging` комітом `84626300069a264d5aa3a17bbf7aac31eff124a8`.
- ✅ Після цих змін **browser regression suite succeeded**: [PR test 39900602387](https://github.com/muzikmuzikant/svitlo-cherkasy/actions/runs/39900602387), [staging run 39901391084](https://github.com/muzikmuzikant/svitlo-cherkasy/actions/runs/39901391084). Також останній `Check private Beta branch` на той час пройшов успішно, [39901391115](https://github.com/muzikmuzikant/svitlo-cherkasy/actions/runs/39901391115).
- ✅ На 23.10 `main/release.json` має 7.9.11, `staging/release.json` 7.9.12. Порівняння `main...staging` дивергентне. Прямий merge категорично заборонено.

## Невиконане, критичне для доступності
- ⬜ **Офсайт ZIP:** власнику потрібно зберегти локально GitHub архіви `main` та `staging`. Git-гілки не захищають від втрати доступу до GitHub. Для власника на iPhone: відкрий посилання на snapshot, Code → Download ZIP (Safari), потім «Файли» → iCloud Drive. Альтернативний GitHub URL архіву: `https://github.com/muzikmuzikant/svitlo-cherkasy/archive/refs/heads/backup/main-20261023-plus-expiry.zip` і відповідний `backup/staging-20261023-plus-expiry.zip`.
- ⬜ **Railway:** доступ до Railway у цій сесії не надано. НЕ перевірені стан live API, дедуплікація після restart, час Cron, план/білінг, збереження об'єму даних, резервне копіювання Railway volume та секретів. **НЕ публікувати секрети в GitHub, чаті чи ZIP коду.**
- ⬜ **Push real iOS:** немає достовірного вимірювання серверних send/accepted та появи на закритому PWA. Попередні користувацькі повідомлення про нерегулярну доставку все ще відкриті.
- ⬜ **Точність графіків / адрес:** попередні звернення щодо підчерг і дат потребують незалежного звіряння з офіційними публікаціями, а не лише зелених CI тестів.
- ⬜ **Ручний iPhone QA:** Safari PWA, офлайн холодний запуск, синхронізація чату підтримки, сповіщення, теми, swipe-sheets і відсутність zoom.

## Потенційний ризик джерел
- У файлі `main/data/schedules.json` на останній перевірці записано `lastChecked: 2026-10-23T04:50:51+03:00`. Не видавати це за **поточний** Railway snapshot: головне джерело передають іншим каналом. Консервативна серверна перевірка `usableSchedule` використовує свіжість 55 хвилин; тому за відсутності свіжого Railway publisher + резервного джерела **автоматичні нагадування можуть припинитися, щоб уникнути недостовірних прогнозів**. Це ризик, а не встановлена причина користувацької скарги. Потрібні Railway логи й точна дата епізоду.

## Контракт для наступного ШІ
1. Розробка тільки через тестову гілку, від актуального `staging`, і тести до PR. Важливі зміни даних потрібні з джерелом істини.
2. НЕ змінювати `main`, Railway production, VAPID, volume, CNAME та реальні Push-підписки без явного схвалення власника.
3. Звітувати по схемі: фактична причина → код/commit → unit/CI → iPhone/realtime, відділяючи неперевірене.
4. Розпочинати з `AGENTS.md` та послідовності у `docs/AI_CONTINUITY_INDEX.md`.

**Мета:** після завершення ChatGPT Plus проєкт зберігає документацію, протестований CI та точки відновлення коду. Це не підтвердження повної готовності до нового production-релізу.
