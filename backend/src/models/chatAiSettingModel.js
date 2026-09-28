const { query } = require('../config/database');

const ChatAiSettingModel = {
  async getByJid(userId, jid) {
    if (!jid) return null;
    const cleanDigits = String(jid).replace(/[^0-9]/g, '');
    const standardJid = jid.includes('@') ? jid : `${cleanDigits}@s.whatsapp.net`;

    const text = `
      SELECT id, user_id, jid, auto_reply_enabled, reply_mode, static_reply_text, custom_prompt, tone, notes, COALESCE(disable_after_one_reply, false) AS disable_after_one_reply, created_at, updated_at
      FROM chat_ai_settings
      WHERE user_id = $1 AND (
        jid = $2
        OR jid = $3
        OR jid = $4
        OR (length($4) >= 8 AND jid LIKE $5)
      )
      ORDER BY auto_reply_enabled DESC, updated_at DESC
      LIMIT 1
    `;
    const { rows } = await query(text, [userId, jid, standardJid, cleanDigits, `%${cleanDigits}%`]);
    return rows[0] || null;
  },

  async getAllByUser(userId) {
    const text = `
      SELECT id, user_id, jid, auto_reply_enabled, reply_mode, static_reply_text, custom_prompt, tone, notes, COALESCE(disable_after_one_reply, false) AS disable_after_one_reply, created_at, updated_at
      FROM chat_ai_settings
      WHERE user_id = $1
    `;
    const { rows } = await query(text, [userId]);
    return rows;
  },

  async upsert(userId, jid, { autoReplyEnabled, replyMode = 'ai', staticReplyText = null, customPrompt = '', tone = 'friendly', notes = '', disableAfterOneReply = false }) {
    const text = `
      INSERT INTO chat_ai_settings (user_id, jid, auto_reply_enabled, reply_mode, static_reply_text, custom_prompt, tone, notes, disable_after_one_reply, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, jid)
      DO UPDATE SET
        auto_reply_enabled = EXCLUDED.auto_reply_enabled,
        reply_mode = EXCLUDED.reply_mode,
        static_reply_text = EXCLUDED.static_reply_text,
        custom_prompt = EXCLUDED.custom_prompt,
        tone = EXCLUDED.tone,
        notes = EXCLUDED.notes,
        disable_after_one_reply = EXCLUDED.disable_after_one_reply,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, jid, auto_reply_enabled, reply_mode, static_reply_text, custom_prompt, tone, notes, disable_after_one_reply, created_at, updated_at
    `;
    const values = [userId, jid, autoReplyEnabled, replyMode, staticReplyText, customPrompt, tone, notes, !!disableAfterOneReply];
    const { rows } = await query(text, values);
    return rows[0];
  },

  async toggleAutoReply(userId, jid, enabled) {
    const text = `
      INSERT INTO chat_ai_settings (user_id, jid, auto_reply_enabled, updated_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, jid)
      DO UPDATE SET
        auto_reply_enabled = EXCLUDED.auto_reply_enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, user_id, jid, auto_reply_enabled, reply_mode, static_reply_text, custom_prompt, tone, notes, COALESCE(disable_after_one_reply, false) AS disable_after_one_reply, created_at, updated_at
    `;
    const { rows } = await query(text, [userId, jid, enabled]);
    return rows[0];
  },

  async deleteAllByUser(userId) {
    const text = `DELETE FROM chat_ai_settings WHERE user_id = $1`;
    const { rowCount } = await query(text, [userId]);
    return rowCount;
  }
};

module.exports = ChatAiSettingModel;
