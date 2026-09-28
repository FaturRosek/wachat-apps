const { query } = require('../config/database');

const MessageModel = {
  async create({
    userId,
    contactId = null,
    phone,
    remoteJid = null,
    messageId = null,
    senderName = null,
    content,
    mediaType = 'text',
    mediaUrl = null,
    mediaCaption = null,
    quotedMessage = null,
    rawData = null,
    direction = 'OUTGOING',
    status = 'PENDING',
    fromMe = false,
    isStatus = false,
    sentAt = null,
  }) {
    const isGrp = (remoteJid && remoteJid.endsWith('@g.us')) || (phone && typeof phone === 'string' && phone.endsWith('@g.us'));
    const isLid = (remoteJid && remoteJid.endsWith('@lid')) || (phone && typeof phone === 'string' && phone.endsWith('@lid'));
    const cleanPhone = (isGrp || isLid) ? (phone || remoteJid) : (phone ? String(phone).replace(/[^0-9]/g, '') : (remoteJid ? String(remoteJid).replace(/[^0-9]/g, '') : ''));
    const cleanJid = remoteJid || (isGrp ? cleanPhone : (isLid ? cleanPhone : `${cleanPhone}@s.whatsapp.net`));

    if (messageId) {
      const existCheck = await query(
        'SELECT * FROM messages WHERE user_id = $1 AND message_id = $2 LIMIT 1',
        [userId, messageId]
      );
      if (existCheck.rows.length > 0) {
        const existing = existCheck.rows[0];
        if (!existing.media_url && mediaUrl) {
          const updateRes = await query(
            `UPDATE messages 
             SET media_url = $1, media_type = $2, content = $3, media_caption = $4, raw_data = COALESCE($5, raw_data)
             WHERE id = $6
             RETURNING *`,
            [mediaUrl, mediaType, content || existing.content, mediaCaption || existing.media_caption, rawData ? JSON.stringify(rawData) : null, existing.id]
          );
          return updateRes.rows[0] || existing;
        }
        return existing;
      }
    }

    const text = `
      INSERT INTO messages (
        user_id, contact_id, phone, remote_jid, message_id, sender_name,
        content, media_type, media_url, media_caption, quoted_message, raw_data,
        direction, status, from_me, is_status, sent_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (user_id, message_id) WHERE message_id IS NOT NULL
      DO UPDATE SET status = EXCLUDED.status
      RETURNING *
    `;
    const values = [
      userId,
      contactId,
      cleanPhone,
      cleanJid,
      messageId,
      senderName,
      content || '',
      mediaType,
      mediaUrl,
      mediaCaption,
      quotedMessage ? JSON.stringify(quotedMessage) : null,
      rawData ? JSON.stringify(rawData) : null,
      direction,
      status,
      fromMe,
      isStatus,
      sentAt,
    ];
    const { rows } = await query(text, values);
    return rows[0];
  },

  async updateStatus(id, status, sentAt = new Date()) {
    const text = `
      UPDATE messages
      SET status = $1, sent_at = $2
      WHERE id = $3
      RETURNING *
    `;
    const values = [status, sentAt, id];
    const { rows } = await query(text, values);
    return rows[0] || null;
  },

  async updateStatusByMessageId(userId, messageId, status) {
    const text = `
      UPDATE messages
      SET status = $1
      WHERE user_id = $2 AND message_id = $3
      RETURNING *
    `;
    const { rows } = await query(text, [status, userId, messageId]);
    return rows[0] || null;
  },

  async markAsRevoked(userId, messageId) {
    const text = `
      UPDATE messages
      SET status = 'REVOKED',
          raw_data = jsonb_set(
            jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{isDeletedForEveryone}', 'true'::jsonb),
            '{revokedAt}',
            to_jsonb(CURRENT_TIMESTAMP)
          )
      WHERE user_id = $1 AND (message_id = $2 OR id::text = $2)
      RETURNING *
    `;
    const { rows } = await query(text, [userId, messageId]);
    return rows[0] || null;
  },

  async updateContent(userId, messageId, newContent) {
    const text = `
      UPDATE messages
      SET content = $1,
          raw_data = jsonb_set(
            jsonb_set(COALESCE(raw_data, '{}'::jsonb), '{isEdited}', 'true'::jsonb),
            '{editedAt}',
            to_jsonb(CURRENT_TIMESTAMP)
          )
      WHERE user_id = $2 AND (message_id = $3 OR id::text = $3)
      RETURNING *
    `;
    const { rows } = await query(text, [newContent, userId, messageId]);
    return rows[0] || null;
  },

  async deleteByIdOrMessageId(userId, idOrMessageId) {
    const text = `
      DELETE FROM messages
      WHERE user_id = $1 AND (id::text = $2 OR message_id = $2)
      RETURNING *
    `;
    const { rows } = await query(text, [userId, idOrMessageId]);
    return rows[0] || null;
  },

  async getById(id, userId) {
    const text = `
      SELECT m.*, ct.name AS contact_name
      FROM messages m
      LEFT JOIN contacts ct ON m.contact_id = ct.id
      WHERE (m.id::text = $1 OR m.message_id = $1) AND m.user_id = $2
      LIMIT 1
    `;
    const { rows } = await query(text, [id, userId]);
    return rows[0] || null;
  },

  async getByChatJid(userId, jid, limit = 100, offset = 0) {
    const isGrp = jid.endsWith('@g.us');
    const isLid = jid.endsWith('@lid');
    const cleanPhone = (isGrp || isLid) ? jid : jid.replace(/[^0-9]/g, '');
    const standardJid = isGrp ? jid : (isLid ? jid : `${cleanPhone}@s.whatsapp.net`);

    const text = `
      SELECT * FROM (
        SELECT m.*, ct.name AS contact_name, ct.avatar_url AS contact_avatar
        FROM messages m
        LEFT JOIN contacts ct ON m.contact_id = ct.id
        WHERE m.user_id = $1 
          AND (
            m.remote_jid = $2 
            OR m.remote_jid = $3 
            OR m.phone = $4
          )
        ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
        LIMIT $5 OFFSET $6
      ) sub
      ORDER BY COALESCE(sub.sent_at, sub.created_at) ASC, sub.id ASC
    `;
    const { rows } = await query(text, [userId, jid, standardJid, cleanPhone, limit, offset]);
    return rows;
  },

  async getRecentChatContext(userId, jid, count = 10) {
    const isGrp = jid.endsWith('@g.us');
    const isLid = jid.endsWith('@lid');
    const cleanPhone = (isGrp || isLid) ? jid : jid.replace(/[^0-9]/g, '');
    const standardJid = isGrp ? jid : (isLid ? jid : `${cleanPhone}@s.whatsapp.net`);

    const text = `
      SELECT direction, sender_name, content, COALESCE(sent_at, created_at) AS created_at, from_me
      FROM messages
      WHERE user_id = $1 
        AND (
          remote_jid = $2 
          OR remote_jid = $3 
          OR phone = $4
        )
      ORDER BY COALESCE(sent_at, created_at) DESC
      LIMIT $5
    `;
    const { rows } = await query(text, [userId, jid, standardJid, cleanPhone, count]);
    return rows.reverse();
  },

  async getByContact(userId, contactId, limit = 50, offset = 0) {
    const text = `
      SELECT *
      FROM messages
      WHERE user_id = $1 AND contact_id = $2
      ORDER BY COALESCE(sent_at, created_at) ASC
      LIMIT $3 OFFSET $4
    `;
    const { rows } = await query(text, [userId, contactId, limit, offset]);
    return rows;
  },

  async getByPhone(userId, phone, limit = 50, offset = 0) {
    const isGrp = phone.endsWith('@g.us');
    const isLid = phone.endsWith('@lid');
    const cleanPhone = (isGrp || isLid) ? phone : phone.replace(/[^0-9]/g, '');
    const standardJid = isGrp ? phone : (isLid ? phone : `${cleanPhone}@s.whatsapp.net`);
    const text = `
      SELECT m.*, ct.name AS contact_name
      FROM messages m
      LEFT JOIN contacts ct ON m.contact_id = ct.id
      WHERE m.user_id = $1 AND (m.phone = $2 OR m.remote_jid = $3)
      ORDER BY COALESCE(sent_at, created_at) ASC
      LIMIT $4 OFFSET $5
    `;
    const { rows } = await query(text, [userId, cleanPhone, standardJid, limit, offset]);
    return rows;
  },

  async getAllByUser(userId, { limit = 50, offset = 0, status, direction, phone } = {}) {
    let filterClause = 'WHERE m.user_id = $1';
    const params = [userId];
    let paramIndex = 2;

    if (status) {
      filterClause += ` AND m.status = $${paramIndex++}`;
      params.push(status);
    }

    if (direction) {
      filterClause += ` AND m.direction = $${paramIndex++}`;
      params.push(direction);
    }

    if (phone) {
      const isGrp = phone.endsWith('@g.us');
      const isLid = phone.endsWith('@lid');
      const cleanPhone = (isGrp || isLid) ? phone : phone.replace(/[^0-9]/g, '');
      const standardJid = isGrp ? phone : (isLid ? phone : `${cleanPhone}@s.whatsapp.net`);
      filterClause += ` AND (m.phone = $${paramIndex} OR m.remote_jid = $${paramIndex} OR m.remote_jid = $${paramIndex + 1})`;
      params.push(cleanPhone, standardJid);
      paramIndex += 2;
    }

    const text = `
      SELECT m.*, ct.name AS contact_name
      FROM messages m
      LEFT JOIN contacts ct ON m.contact_id = ct.id
      ${filterClause}
      ORDER BY COALESCE(m.sent_at, m.created_at) DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const { rows } = await query(text, params);
    return rows;
  },

  async getViewOnceMedia(userId, { limit = 100, offset = 0, mediaType = null, search = null } = {}) {
    let filterClause = `
      WHERE m.user_id = $1 
        AND m.media_url IS NOT NULL 
        AND (
          (m.raw_data->>'isViewOnce')::boolean = true
          OR m.content LIKE '%(Sekali Lihat)%'
          OR m.media_caption LIKE '%Sekali Lihat%'
          OR m.media_type = 'view_once'
        )
    `;
    const params = [userId];
    let paramIndex = 2;

    if (mediaType && mediaType !== 'all') {
      filterClause += ` AND m.media_type = $${paramIndex++}`;
      params.push(mediaType);
    }

    if (search && search.trim()) {
      filterClause += ` AND (ct.name ILIKE $${paramIndex} OR m.sender_name ILIKE $${paramIndex} OR m.content ILIKE $${paramIndex} OR m.phone ILIKE $${paramIndex})`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const text = `
      SELECT m.*, ct.name AS contact_name, ct.avatar_url AS contact_avatar
      FROM messages m
      LEFT JOIN contacts ct ON m.contact_id = ct.id
      ${filterClause}
      ORDER BY COALESCE(m.sent_at, m.created_at) DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const { rows } = await query(text, params);
    return rows;
  },

  async deleteAllByUser(userId) {
    const text = `DELETE FROM messages WHERE user_id = $1`;
    const { rowCount } = await query(text, [userId]);
    return rowCount;
  }
};

module.exports = MessageModel;
