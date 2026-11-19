// handlers/my_chat_member.js — бота добавили в группу или удалили из неё.
import { api, db } from 'sdk';

export default async function (u) {
  const chat = u.chat;
  if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return;
  const status = u.new_chat_member?.status;
  if (['member', 'administrator'].includes(status)) {
    await db.run(
      `INSERT INTO groups (chat_id, title, username, created_at) VALUES (:c, :t, :u, (SELECT now FROM v_now))
       ON CONFLICT (chat_id) DO UPDATE SET title = excluded.title, is_active = 1`,
      { ':c': chat.id, ':t': chat.title ?? null, ':u': chat.username ?? null });
    await api.sendMessage({
      chat_id: chat.id, parse_mode: 'HTML',
      text: '🚢 <b>Аукцион машин</b> теперь в этой группе!\n\nНапиши /play — откроется комната группы. Ставки — кнопками под сообщением, кто поставил последним, тот забирает контейнер с машиной.',
    }).catch(() => {});
  } else if (['left', 'kicked'].includes(status)) {
    await db.run('UPDATE groups SET is_active = 0 WHERE chat_id = :c', { ':c': chat.id });
    await db.run(`UPDATE rooms SET stop_requested = 1 WHERE scope = 'group' AND scope_id = :c AND status = 'open'`, { ':c': chat.id });
    await db.run('UPDATE room_msgs SET active = 0 WHERE chat_id = :c', { ':c': chat.id });
  }
}
