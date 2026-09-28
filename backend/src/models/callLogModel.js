const { query } = require('../config/database');

const CallLogModel = {
  async create({ userId, callerJid, callerName, callerPhone, callType = 'audio', status = 'MISSED', autoReplySent = null }) {
    const text = `
      INSERT INTO call_logs (user_id, caller_jid, caller_name, caller_phone, call_type, status, auto_reply_sent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, user_id, caller_jid, caller_name, caller_phone, call_type, status, auto_reply_sent, created_at
    `;
    const values = [userId, callerJid, callerName, callerPhone, callType, status, autoReplySent];
    const { rows } = await query(text, values);
    return rows[0];
  },

  async getAllByUser(userId, limit = 50) {
    const text = `
      SELECT id, user_id, caller_jid, caller_name, caller_phone, call_type, status, auto_reply_sent, created_at
      FROM call_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const { rows } = await query(text, [userId, limit]);
    return rows;
  },

  async deleteAllByUser(userId) {
    const text = `DELETE FROM call_logs WHERE user_id = $1`;
    const { rowCount } = await query(text, [userId]);
    return rowCount;
  }
};

module.exports = CallLogModel;
