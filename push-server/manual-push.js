/** Authenticated manual Web Push actions. No admin credentials or subscription URLs are exposed. */
const ALL_QUEUES = new Set(Array.from({ length: 6 }, (_, i) => [`${i + 1}.1`, `${i + 1}.2`]).flat());

export function cleanMessage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Невірне повідомлення');
  const title = String(input.title || '').trim();
  const body = String(input.body || '').trim();
  if (!title || title.length > 85) throw Error('Заголовок: від 1 до 85 символів');
  if (!body || body.length > 280) throw Error('Текст: від 1 до 280 символів');
  if (/[\x00-\x1f\x7f]/.test(title) || /[\x00-\x08\x0b-\x1f\x7f]/.test(body)) throw Error('Неприпустимі символи в повідомленні');
  const queue = input.queue == null || input.queue === '' ? 'all' : String(input.queue);
  if (queue !== 'all' && !ALL_QUEUES.has(queue)) throw Error('Невідома підчерга');
  return { title, body, queue };
}

export function selectRecipients(subscribers, { queue = 'all', target = 'all', endpoint = '' } = {}) {
  const list = Object.values(subscribers);
  if (target === 'mine') {
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || endpoint.length > 2048) throw Error('Не знайдено Push-підписку цього пристрою');
    return list.filter(r => r.subscription?.endpoint === endpoint);
  }
  if (target !== 'all') throw Error('Невідомий одержувач');
  return list.filter(r => queue === 'all' || r.queue === queue);
}

export function createManualPush({ subscribers, webpush, appUrl, hash, save }) {
  const history = new Map();
  const requireCooldown = (action, max, windowMs) => {
    const now = Date.now();
    const recent = (history.get(action) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      const e = Error('Зачекайте трохи перед наступною розсилкою');
      e.statusCode = 429;
      throw e;
    }
    recent.push(now);
    history.set(action, recent);
  };
  const stats = () => ({ ok: true, subscribers: Object.keys(subscribers).length });

  async function deliver(recipients, msg) {
    if (!recipients.length) {
      const e = Error('Немає підписаних пристроїв для цього вибору');
      e.statusCode = 404;
      throw e;
    }
    if (recipients.length > 1500) {
      const e = Error('Надто багато отримувачів. Зверніться до адміністратора сервера.');
      e.statusCode = 413;
      throw e;
    }
    let delivered = 0, failed = 0, expired = 0;
    for (let i = 0; i < recipients.length; i += 8) {
      await Promise.all(recipients.slice(i, i + 8).map(async record => {
        try {
          await webpush.sendNotification(record.subscription, JSON.stringify({
            title: msg.title, body: msg.body, url: appUrl,
            tag: 'svitlo-admin-' + Date.now().toString(36)
          }), { TTL: 3600, urgency: 'normal' });
          delivered++;
        } catch (e) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            delete subscribers[hash(record.subscription.endpoint)];
            expired++;
          } else {
            failed++;
            console.warn('Admin Push delivery failed:', e?.statusCode || e?.message);
          }
        }
      }));
    }
    save();
    return { ok: delivered > 0, attempted: recipients.length, accepted: delivered, failed, expired };
  }

  return {
    stats,
    async test(payload) {
      if (!payload || typeof payload !== 'object') throw Error('Невірний запит');
      const target = payload.target === 'all' ? 'all' : 'mine';
      if (target === 'all' && payload.confirmAll !== true) throw Error('Потрібне підтвердження розсилки всім');
      const recipients = selectRecipients(subscribers, { target, endpoint: payload.endpoint });
      if (!recipients.length) return { ok: false, attempted: 0, accepted: 0, failed: 0, expired: 0, error: 'Цей пристрій не підписаний на Push. Якщо це PWA на iPhone, відкрийте адмінпанель із встановленого застосунку або виберіть тест для всіх.' };
      requireCooldown('test', 5, 10 * 60_000);
      return deliver(recipients, {
        title: 'Світло Черкаси · Тест Push',
        body: 'Тестове повідомлення від адміністратора. Якщо ви його бачите, Push працює!'
      });
    },
    async broadcast(payload) {
      const msg = cleanMessage(payload);
      if (payload.confirmSend !== true) throw Error('Потрібне підтвердження розсилки');
      const recipients = selectRecipients(subscribers, { queue: msg.queue });
      if (!recipients.length) return { ok: false, attempted: 0, accepted: 0, failed: 0, expired: 0, error: 'Немає підписаних пристроїв для вибраної підчерги.' };
      requireCooldown('broadcast', 6, 60 * 60_000);
      return deliver(recipients, msg);
    }
  };
}
