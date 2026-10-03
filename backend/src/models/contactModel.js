const { query } = require('../config/database');

function isPlaceholderName(name, phone, isGroup = false) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === 'Kontak' || trimmed === 'Saya' || trimmed === 'Anggota Grup' || trimmed === 'WhatsApp User' || trimmed === 'null' || trimmed === 'undefined') return true;
  if (isGroup && (trimmed === 'Grup WhatsApp' || trimmed === 'Grup' || trimmed === 'Group')) return true;
  const digitsOnlyName = trimmed.replace(/[^0-9]/g, '');
  const digitsOnlyPhone = phone ? String(phone).replace(/[^0-9]/g, '') : '';
  if (digitsOnlyPhone && digitsOnlyName === digitsOnlyPhone) return true;
  if (digitsOnlyName.length >= 8 && (trimmed.startsWith('+') || /^[0-9+\s\-()]+$/.test(trimmed))) return true;
  return false;
}

function isValidContactName(name, phone, isGroup = false) {
  return !isPlaceholderName(name, phone, isGroup);
}

const ContactModel = {
  async create(userId, { name, phone, jid = null, savedName = null, pushName = null, avatarUrl = null, isGroup = false, about = '' }) {
    const isGrp = isGroup || (jid && jid.endsWith('@g.us')) || (phone && String(phone).endsWith('@g.us'));
    const cleanPhone = isGrp ? (phone || jid) : (phone ? String(phone).replace(/[^0-9]/g, '') : '');
    const cleanJid = jid || (isGrp ? cleanPhone : `${cleanPhone}@s.whatsapp.net`);

    const validSaved = isValidContactName(savedName, cleanPhone, isGrp) ? savedName.trim() : null;
    const validPush = isValidContactName(pushName, cleanPhone, isGrp) ? pushName.trim() : null;
    const validIncoming = isValidContactName(name, cleanPhone, isGrp) ? name.trim() : null;

    const displayName = validSaved || validPush || validIncoming || (isGrp ? 'Grup WhatsApp' : `+${cleanPhone}`);

    const text = `
      INSERT INTO contacts (user_id, name, saved_name, push_name, phone, jid, avatar_url, is_group, about)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const { rows } = await query(text, [userId, displayName, validSaved, validPush, cleanPhone, cleanJid, avatarUrl, isGrp, about]);
    return rows[0];
  },

  async upsertGroup(userId, { jid, name, avatarUrl = null, desc = '' }) {
    const text = `
      INSERT INTO contacts (user_id, name, saved_name, phone, jid, avatar_url, is_group, about, updated_at)
      VALUES ($1, $2, $2, $3, $3, $4, true, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, phone)
      DO UPDATE SET
        name = CASE WHEN EXCLUDED.name IS NOT NULL AND EXCLUDED.name != '' AND EXCLUDED.name != EXCLUDED.phone THEN EXCLUDED.name ELSE contacts.name END,
        saved_name = CASE WHEN EXCLUDED.name IS NOT NULL AND EXCLUDED.name != '' AND EXCLUDED.name != EXCLUDED.phone THEN EXCLUDED.name ELSE contacts.saved_name END,
        jid = EXCLUDED.jid,
        avatar_url = COALESCE(EXCLUDED.avatar_url, contacts.avatar_url),
        is_group = true,
        about = COALESCE(EXCLUDED.about, contacts.about),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const { rows } = await query(text, [userId, name || 'Grup WhatsApp', jid, avatarUrl, desc]);
    return rows[0];
  },

  async upsertContact(userId, { jid, phone = null, savedName = null, pushName = null, avatarUrl = null, isGroup = false, about = '' }) {
    const isGrp = isGroup || (jid && jid.endsWith('@g.us')) || (phone && String(phone).endsWith('@g.us'));
    const cleanPhone = isGrp ? (phone || jid) : (phone ? String(phone).replace(/[^0-9]/g, '') : (jid ? String(jid).replace(/[^0-9]/g, '') : ''));
    const cleanJid = jid || (isGrp ? cleanPhone : `${cleanPhone}@s.whatsapp.net`);

    if (cleanJid.includes('@newsletter') || cleanJid.includes('status@broadcast') || cleanJid === '0@s.whatsapp.net') {
      return null;
    }

    const validSaved = isValidContactName(savedName, cleanPhone, isGrp) ? savedName.trim() : null;
    const validPush = isValidContactName(pushName, cleanPhone, isGrp) ? pushName.trim() : null;

    const existing = await this.findByJid(userId, cleanJid);
    if (existing) {
      let updates = [];
      let vals = [existing.id];
      let pIdx = 2;

      let currentSaved = existing.saved_name;
      if (validSaved && validSaved !== existing.saved_name) {
        updates.push(`saved_name = $${pIdx++}`);
        vals.push(validSaved);
        currentSaved = validSaved;
      }

      let currentPush = existing.push_name;
      if (validPush && validPush !== existing.push_name) {
        updates.push(`push_name = $${pIdx++}`);
        vals.push(validPush);
        currentPush = validPush;
      }

      let desiredName = null;
      if (isValidContactName(currentSaved, cleanPhone, isGrp)) {
        desiredName = currentSaved;
      } else if (isValidContactName(currentPush, cleanPhone, isGrp)) {
        desiredName = currentPush;
      } else if (isValidContactName(existing.name, cleanPhone, isGrp)) {
        desiredName = existing.name;
      } else {
        desiredName = isGrp ? 'Grup WhatsApp' : `+${cleanPhone}`;
      }

      if (desiredName && desiredName !== existing.name) {
        updates.push(`name = $${pIdx++}`);
        vals.push(desiredName);
      }

      if (avatarUrl && existing.avatar_url !== avatarUrl) {
        updates.push(`avatar_url = $${pIdx++}`);
        vals.push(avatarUrl);
      }

      if (!existing.jid && cleanJid) {
        updates.push(`jid = $${pIdx++}`);
        vals.push(cleanJid);
      }

      if (about && existing.about !== about) {
        updates.push(`about = $${pIdx++}`);
        vals.push(about);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        const updateSql = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const res = await query(updateSql, vals);
        return res.rows[0];
      }
      return existing;
    }

    const finalDisplayName = validSaved || validPush || (isGrp ? 'Grup WhatsApp' : `+${cleanPhone}`);
    const insertText = `
      INSERT INTO contacts (user_id, name, saved_name, push_name, phone, jid, avatar_url, is_group, about)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const { rows } = await query(insertText, [
      userId,
      finalDisplayName,
      validSaved,
      validPush,
      cleanPhone,
      cleanJid,
      avatarUrl,
      isGrp,
      about
    ]);
    return rows[0];
  },

  async upsertChat(userId, { jid, name = null, phone = null, savedName = null, pushName = null, avatarUrl = null, isGroup = false, unreadCount = 0, lastMessageText = null, lastMessageTime = null, isPinned = undefined, pinnedAt = null, isArchived = undefined }) {
    const isGrp = isGroup || (jid && jid.endsWith('@g.us')) || (phone && String(phone).endsWith('@g.us'));
    const cleanPhone = isGrp ? (phone || jid) : (phone ? String(phone).replace(/[^0-9]/g, '') : (jid ? String(jid).replace(/[^0-9]/g, '') : ''));
    const cleanJid = jid || (isGrp ? cleanPhone : `${cleanPhone}@s.whatsapp.net`);

    if (cleanJid.includes('@newsletter') || cleanJid.includes('status@broadcast') || cleanJid === '0@s.whatsapp.net') {
      return null;
    }

    const existing = await this.findOrCreate(userId, {
      name,
      savedName,
      pushName,
      phone: cleanPhone,
      jid: cleanJid,
      avatarUrl,
      isGroup: isGrp
    });

    if (!existing) return null;

    let updates = [];
    let vals = [existing.id];
    let pIdx = 2;

    const validSaved = isValidContactName(savedName, cleanPhone, isGrp) ? savedName.trim() : null;
    const validPush = isValidContactName(pushName, cleanPhone, isGrp) ? pushName.trim() : null;
    const validIncoming = isValidContactName(name, cleanPhone, isGrp) ? name.trim() : null;

    let currentSaved = existing.saved_name;
    if (validSaved && validSaved !== existing.saved_name) {
      updates.push(`saved_name = $${pIdx++}`);
      vals.push(validSaved);
      currentSaved = validSaved;
    }

    let currentPush = existing.push_name;
    if (validPush && validPush !== existing.push_name) {
      updates.push(`push_name = $${pIdx++}`);
      vals.push(validPush);
      currentPush = validPush;
    }

    if (validSaved && validSaved !== existing.name) {
      updates.push(`name = $${pIdx++}`);
      vals.push(validSaved);
    } else if (isPlaceholderName(existing.name, cleanPhone, isGrp)) {
      const upgradeName = validPush || validIncoming;
      if (upgradeName && upgradeName !== existing.name) {
        updates.push(`name = $${pIdx++}`);
        vals.push(upgradeName);
      }
    }

    if (avatarUrl && existing.avatar_url !== avatarUrl) {
      updates.push(`avatar_url = $${pIdx++}`);
      vals.push(avatarUrl);
    }
    if (typeof unreadCount === 'number' && unreadCount > 0) {
      updates.push(`unread_count = $${pIdx++}`);
      vals.push(unreadCount);
    }
    if (lastMessageText) {
      updates.push(`last_message_text = $${pIdx++}`);
      vals.push(lastMessageText);
    }
    if (lastMessageTime) {
      updates.push(`last_message_time = $${pIdx++}`);
      vals.push(lastMessageTime);
    }
    if (typeof isPinned === 'boolean') {
      updates.push(`is_pinned = $${pIdx++}`);
      vals.push(isPinned);
      if (isPinned) {
        updates.push(`pinned_at = $${pIdx++}`);
        vals.push(pinnedAt || new Date());
      } else {
        updates.push(`pinned_at = NULL`);
      }
    }
    if (typeof isArchived === 'boolean') {
      updates.push(`is_archived = $${pIdx++}`);
      vals.push(isArchived);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      const updateSql = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
      const res = await query(updateSql, vals);
      return res.rows[0];
    }

    return existing;
  },

  async findOrCreate(userId, { name = null, phone = null, jid = null, savedName = null, pushName = null, avatarUrl = null, isGroup = false }) {
    const isGrp = isGroup || (jid && jid.endsWith('@g.us')) || (phone && typeof phone === 'string' && phone.endsWith('@g.us'));
    const cleanPhone = isGrp ? (phone || jid) : (phone ? String(phone).replace(/[^0-9]/g, '') : '');
    const cleanJid = jid || (isGrp ? cleanPhone : `${cleanPhone}@s.whatsapp.net`);

    if (cleanJid.includes('@newsletter') || cleanJid.includes('status@broadcast') || cleanJid === '0@s.whatsapp.net') {
      return null;
    }

    const findText = `
      SELECT *
      FROM contacts
      WHERE user_id = $1 AND (jid = $2 OR phone = $3 OR phone = $2 OR (length($3) >= 8 AND (jid LIKE $4 OR phone LIKE $4)))
      LIMIT 1
    `;
    const findResult = await query(findText, [userId, cleanJid, cleanPhone, `%${cleanPhone}%`]);

    const validSaved = isValidContactName(savedName, cleanPhone, isGrp) ? savedName.trim() : null;
    const validPush = isValidContactName(pushName, cleanPhone, isGrp) ? pushName.trim() : null;
    const validIncoming = isValidContactName(name, cleanPhone, isGrp) ? name.trim() : null;

    if (findResult.rows.length > 0) {
      const existing = findResult.rows[0];
      let updates = [];
      let vals = [existing.id];
      let pIdx = 2;

      let currentSaved = existing.saved_name;
      if (validSaved && validSaved !== existing.saved_name) {
        updates.push(`saved_name = $${pIdx++}`);
        vals.push(validSaved);
        currentSaved = validSaved;
      }

      let currentPush = existing.push_name;
      if (validPush && validPush !== existing.push_name) {
        updates.push(`push_name = $${pIdx++}`);
        vals.push(validPush);
        currentPush = validPush;
      }

      const existingIsPlaceholder = isPlaceholderName(existing.name, cleanPhone, isGrp);
      if (existingIsPlaceholder) {
        let desiredName = validSaved || validPush || validIncoming || null;
        if (desiredName && desiredName !== existing.name) {
          updates.push(`name = $${pIdx++}`);
          vals.push(desiredName);
        }
      }

      if (!existing.jid && cleanJid) {
        updates.push(`jid = $${pIdx++}`);
        vals.push(cleanJid);
      }
      if (isGrp && !existing.is_group) {
        updates.push(`is_group = true`);
      }
      if (avatarUrl && existing.avatar_url !== avatarUrl) {
        updates.push(`avatar_url = $${pIdx++}`);
        vals.push(avatarUrl);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        const updateSql = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const updated = await query(updateSql, vals);
        return updated.rows[0];
      }
      return existing;
    }

    const displayName = validSaved || validPush || validIncoming || (isGrp ? 'Grup WhatsApp' : `+${cleanPhone}`);

    const insertText = `
      INSERT INTO contacts (user_id, name, saved_name, push_name, phone, jid, avatar_url, is_group)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const insertValues = [userId, displayName, validSaved, validPush, cleanPhone, cleanJid, avatarUrl, isGrp];
    const insertResult = await query(insertText, insertValues);
    return insertResult.rows[0];
  },

  async updateAvatar(userId, jid, avatarUrl) {
    if (!avatarUrl) return null;
    const isGrp = jid.endsWith('@g.us');
    const cleanPhone = isGrp ? jid : jid.replace(/[^0-9]/g, '');
    const sql = `
      UPDATE contacts
      SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND (jid = $3 OR phone = $4 OR phone = $3 OR (length($4) >= 8 AND (jid LIKE $5 OR phone LIKE $5)))
      RETURNING *
    `;
    const res = await query(sql, [avatarUrl, userId, jid, cleanPhone, `%${cleanPhone}%`]);
    return res.rows[0] || null;
  },

  async updatePushName(userId, jid, pushName) {
    if (!pushName || typeof pushName !== 'string') return null;
    const isGrp = jid.endsWith('@g.us');
    const cleanPhone = isGrp ? jid : jid.replace(/[^0-9]/g, '');
    const cleanPush = pushName.trim();
    if (!isValidContactName(cleanPush, cleanPhone, isGrp)) return null;

    const contact = await this.findByJid(userId, jid);
    if (!contact) return null;

    let updates = [];
    let vals = [contact.id];
    let pIdx = 2;

    if (cleanPush !== contact.push_name) {
      updates.push(`push_name = $${pIdx++}`);
      vals.push(cleanPush);
    }

    const hasSavedName = isValidContactName(contact.saved_name, cleanPhone, isGrp);
    if (!hasSavedName && (isPlaceholderName(contact.name, cleanPhone, isGrp) || contact.name === contact.push_name)) {
      if (cleanPush !== contact.name) {
        updates.push(`name = $${pIdx++}`);
        vals.push(cleanPush);
      }
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      const updateSql = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
      const res = await query(updateSql, vals);
      return res.rows[0] || null;
    }
    return contact;
  },

  async updateNameIfPlaceholder(userId, jid, newName) {
    return await this.updatePushName(userId, jid, newName);
  },

  async getContactsWithoutAvatar(userId, limit = 50) {
    const sql = `
      SELECT id, jid, phone, name, is_group
      FROM contacts
      WHERE user_id = $1 
        AND avatar_url IS NULL
        AND jid NOT LIKE '%@lid' 
        AND phone NOT LIKE '%@lid'
      ORDER BY last_message_time DESC NULLS LAST, updated_at DESC
      LIMIT $2
    `;
    const { rows } = await query(sql, [userId, limit]);
    return rows;
  },

  async updateLastMessage(userId, jid, { text, timestamp = new Date(), incrementUnread = false }) {
    const unreadSql = incrementUnread ? 'COALESCE(unread_count, 0) + 1' : 'unread_count';
    const isGrp = jid.endsWith('@g.us');
    const cleanPhone = isGrp ? jid : jid.replace(/[^0-9]/g, '');

    const updateText = `
      UPDATE contacts
      SET
        last_message_text = $1,
        last_message_time = $2,
        unread_count = ${unreadSql},
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $3 AND (jid = $4 OR phone = $5 OR phone = $4 OR (length($5) >= 8 AND (jid LIKE $6 OR phone LIKE $6)))
      RETURNING *
    `;
    const { rows } = await query(updateText, [text, timestamp, userId, jid, cleanPhone, `%${cleanPhone}%`]);
    return rows[0] || null;
  },

  async syncContactNamesFromHistory(userId) {
    const syncSql = `
      UPDATE contacts c
      SET 
        push_name = sub.sender_name,
        name = CASE 
          WHEN (c.saved_name IS NULL OR c.saved_name = '' OR c.saved_name = c.phone OR c.saved_name = '+' || c.phone) 
          THEN sub.sender_name 
          ELSE c.name 
        END,
        updated_at = CURRENT_TIMESTAMP
      FROM (
        SELECT DISTINCT ON (user_id, COALESCE(remote_jid, phone))
          user_id,
          COALESCE(remote_jid, phone) AS chat_jid,
          phone AS msg_phone,
          sender_name
        FROM messages
        WHERE user_id = $1 
          AND from_me = false 
          AND sender_name IS NOT NULL 
          AND sender_name != '' 
          AND sender_name NOT LIKE '+%' 
          AND sender_name != 'Kontak' 
          AND sender_name != 'Saya' 
          AND sender_name != 'Anggota Grup'
          AND sender_name != 'WhatsApp User'
          AND sender_name != 'null'
          AND sender_name != 'undefined'
        ORDER BY user_id, COALESCE(remote_jid, phone), COALESCE(sent_at, created_at) DESC
      ) sub
      WHERE c.user_id = sub.user_id 
        AND (
          c.jid = sub.chat_jid 
          OR c.phone = sub.chat_jid 
          OR c.phone = sub.msg_phone
          OR c.phone = REPLACE(REPLACE(sub.chat_jid, '@s.whatsapp.net', ''), '@g.us', '')
        )
        AND (c.saved_name IS NULL OR c.saved_name = '' OR c.saved_name = c.phone OR c.saved_name = '+' || c.phone)
        AND (c.name != sub.sender_name OR c.push_name IS NULL OR c.push_name != sub.sender_name)
    `;
    await query(syncSql, [userId]);

    const normalizeSql = `
      UPDATE contacts
      SET name = '+' || phone, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
        AND is_group = false
        AND (saved_name IS NULL OR saved_name = '')
        AND (push_name IS NULL OR push_name = '')
        AND (
          name = '.' OR name = '-' OR name = ',' OR name = '..' OR name = '...'
          OR name = 'Kontak' OR name = 'Saya' OR name = 'Anggota Grup' 
          OR name = 'WhatsApp User' OR name = 'null' OR name = 'undefined'
          OR name = phone
        );
    `;
    await query(normalizeSql, [userId]);
  },

  async syncLastMessagesFromHistory(userId) {
    const syncSql = `
      UPDATE contacts c
      SET 
        last_message_text = sub.content,
        last_message_time = sub.sent_at
      FROM (
        SELECT DISTINCT ON (m.user_id, COALESCE(m.remote_jid, m.phone))
          m.user_id,
          COALESCE(m.remote_jid, m.phone) AS chat_jid,
          m.phone AS msg_phone,
          CASE 
            WHEN m.from_me = true THEN '✓ ' || COALESCE(
              NULLIF(m.content, ''),
              CASE 
                WHEN m.media_type = 'image' THEN '📷 Foto'
                WHEN m.media_type = 'video' THEN '🎥 Video'
                WHEN m.media_type = 'voice' OR m.media_type = 'audio' THEN '🎤 Pesan Suara'
                WHEN m.media_type = 'document' THEN '📄 Dokumen'
                WHEN m.media_type = 'view_once' THEN '👁️ Pesan Sekali Lihat'
                ELSE 'Media'
              END
            )
            WHEN (m.remote_jid LIKE '%@g.us' OR m.phone LIKE '%@g.us') THEN 
              COALESCE(
                (SELECT COALESCE(cnt.saved_name, cnt.name) FROM contacts cnt WHERE cnt.user_id = m.user_id AND (cnt.phone = m.phone OR cnt.jid = m.phone || '@s.whatsapp.net') AND cnt.is_group = false LIMIT 1),
                CASE WHEN m.sender_name IS NOT NULL AND m.sender_name != '' AND m.sender_name != 'Kontak' AND m.sender_name != 'Anggota Grup' AND m.sender_name NOT LIKE '+%' THEN m.sender_name ELSE NULL END,
                'Anggota Grup'
              ) || ': ' || COALESCE(
                NULLIF(m.content, ''),
                CASE 
                  WHEN m.media_type = 'image' THEN '📷 Foto'
                  WHEN m.media_type = 'video' THEN '🎥 Video'
                  WHEN m.media_type = 'voice' OR m.media_type = 'audio' THEN '🎤 Pesan Suara'
                  WHEN m.media_type = 'document' THEN '📄 Dokumen'
                  WHEN m.media_type = 'view_once' THEN '👁️ Pesan Sekali Lihat'
                  ELSE 'Media'
                END
              )
            ELSE COALESCE(
              NULLIF(m.content, ''),
              CASE 
                WHEN m.media_type = 'image' THEN '📷 Foto'
                WHEN m.media_type = 'video' THEN '🎥 Video'
                WHEN m.media_type = 'voice' OR m.media_type = 'audio' THEN '🎤 Pesan Suara'
                WHEN m.media_type = 'document' THEN '📄 Dokumen'
                WHEN m.media_type = 'view_once' THEN '👁️ Pesan Sekali Lihat'
                ELSE 'Media'
              END
            )
          END AS content,
          COALESCE(m.sent_at, m.created_at) AS sent_at
        FROM messages m
        WHERE m.user_id = $1 
          AND (
            (m.content IS NOT NULL AND m.content != '')
            OR m.media_type IS NOT NULL
            OR m.media_url IS NOT NULL
          )
        ORDER BY m.user_id, COALESCE(m.remote_jid, m.phone), COALESCE(m.sent_at, m.created_at) DESC
      ) sub
      WHERE c.user_id = sub.user_id 
        AND (
          c.jid = sub.chat_jid 
          OR c.phone = sub.chat_jid 
          OR c.phone = sub.msg_phone
          OR c.phone = REPLACE(REPLACE(sub.chat_jid, '@s.whatsapp.net', ''), '@g.us', '')
        )
    `;
    await query(syncSql, [userId]);
  },

  async syncContactsFromMessages(userId) {
    const insertFromMsgsSql = `
      INSERT INTO contacts (user_id, name, phone, jid, is_group, created_at, updated_at)
      SELECT DISTINCT ON (m.user_id, clean_sub.clean_phone)
        m.user_id,
        COALESCE(
          NULLIF(m.sender_name, ''),
          '+' || clean_sub.clean_phone
        ) AS name,
        clean_sub.clean_phone AS phone,
        clean_sub.clean_phone || '@s.whatsapp.net' AS jid,
        false AS is_group,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM messages m
      CROSS JOIN LATERAL (
        SELECT 
          REGEXP_REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(m.remote_jid, m.phone), '@s.whatsapp.net', ''), '@lid', ''), '@g.us', ''), '[^0-9]', '', 'g') AS clean_phone
      ) clean_sub
      WHERE m.user_id = $1
        AND COALESCE(m.remote_jid, '') NOT LIKE '%@g.us'
        AND COALESCE(m.phone, '') NOT LIKE '%@g.us'
        AND COALESCE(m.remote_jid, '') NOT LIKE '%@newsletter'
        AND COALESCE(m.remote_jid, '') NOT LIKE '%status%'
        AND clean_sub.clean_phone != ''
        AND LENGTH(clean_sub.clean_phone) >= 8
        AND LENGTH(clean_sub.clean_phone) <= 16
      ON CONFLICT (user_id, phone) DO UPDATE SET
        jid = COALESCE(contacts.jid, EXCLUDED.jid),
        updated_at = CURRENT_TIMESTAMP
    `;
    await query(insertFromMsgsSql, [userId]).catch(() => {});
    await this.syncContactNamesFromHistory(userId).catch(() => {});
    await this.syncLastMessagesFromHistory(userId).catch(() => {});
  },

  async resetUnread(userId, jid) {
    const isGrp = jid.endsWith('@g.us');
    const cleanPhone = isGrp ? jid : jid.replace(/[^0-9]/g, '');
    const sql = `
      UPDATE contacts
      SET unread_count = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND (jid = $2 OR phone = $3 OR phone = $2)
      RETURNING *
    `;
    const res = await query(sql, [userId, jid, cleanPhone]);
    return res.rows[0] || null;
  },

  async getChatsList(userId, { search = '', filter = 'all' } = {}) {
    await this.syncContactNamesFromHistory(userId).catch(() => {});
    await this.syncLastMessagesFromHistory(userId);

    let whereConditions = [
      'c.user_id = $1',
      `(c.jid NOT LIKE '%@lid' AND c.phone NOT LIKE '%@lid')`
    ];
    let params = [userId];
    let pIdx = 2;

    if (search) {
      whereConditions.push(`(c.name ILIKE $${pIdx} OR c.saved_name ILIKE $${pIdx} OR c.push_name ILIKE $${pIdx} OR c.phone ILIKE $${pIdx} OR c.last_message_text ILIKE $${pIdx})`);
      params.push(`%${search}%`);
      pIdx++;
    } else if (filter !== 'archived') {
      whereConditions.push(`(
        (c.last_message_time IS NOT NULL AND c.last_message_time >= CURRENT_TIMESTAMP - INTERVAL '7 days')
        OR COALESCE(c.unread_count, 0) > 0
        OR COALESCE(c.is_pinned, false) = true
      )`);
    }

    if (filter === 'unread') {
      whereConditions.push(`COALESCE(c.unread_count, 0) > 0`);
      whereConditions.push(`COALESCE(c.is_archived, false) = false`);
    } else if (filter === 'groups') {
      whereConditions.push(`c.is_group = true`);
      whereConditions.push(`COALESCE(c.is_archived, false) = false`);
    } else if (filter === 'ai') {
      whereConditions.push(`ai.auto_reply_enabled = true`);
      whereConditions.push(`COALESCE(c.is_archived, false) = false`);
    } else if (filter === 'archived') {
      whereConditions.push(`COALESCE(c.is_archived, false) = true`);
    } else {
      whereConditions.push(`COALESCE(c.is_archived, false) = false`);
    }

    const whereClause = whereConditions.join(' AND ');

    const sql = `
      SELECT 
        c.id, c.user_id, c.name, c.saved_name, c.push_name, c.phone, c.jid, c.avatar_url, c.is_group, c.about,
        c.unread_count,
        COALESCE(
          NULLIF(c.last_message_text, ''),
          (
            SELECT 
              CASE 
                WHEN m.from_me = true THEN '✓ ' || COALESCE(
                  NULLIF(m.content, ''),
                  CASE 
                    WHEN m.media_type = 'image' THEN '📷 Foto'
                    WHEN m.media_type = 'video' THEN '🎥 Video'
                    WHEN m.media_type = 'voice' OR m.media_type = 'audio' THEN '🎤 Pesan Suara'
                    WHEN m.media_type = 'document' THEN '📄 Dokumen'
                    WHEN m.media_type = 'view_once' THEN '👁️ Pesan Sekali Lihat'
                    ELSE 'Media'
                  END
                )
                ELSE COALESCE(
                  NULLIF(m.content, ''),
                  CASE 
                    WHEN m.media_type = 'image' THEN '📷 Foto'
                    WHEN m.media_type = 'video' THEN '🎥 Video'
                    WHEN m.media_type = 'voice' OR m.media_type = 'audio' THEN '🎤 Pesan Suara'
                    WHEN m.media_type = 'document' THEN '📄 Dokumen'
                    WHEN m.media_type = 'view_once' THEN '👁️ Pesan Sekali Lihat'
                    ELSE 'Media'
                  END
                )
              END
            FROM messages m
            WHERE m.user_id = c.user_id 
              AND (
                m.remote_jid = c.jid 
                OR m.phone = c.phone 
                OR (c.phone IS NOT NULL AND length(c.phone) >= 6 AND m.remote_jid LIKE '%' || c.phone || '%')
              )
            ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
            LIMIT 1
          )
        ) AS last_message_text,
        COALESCE(
          NULLIF(c.last_message_text, ''),
          (
            SELECT 
              CASE 
                WHEN m.from_me = true THEN '✓ ' || COALESCE(
                  NULLIF(m.content, ''),
                  CASE 
                    WHEN m.media_type = 'image' THEN '📷 Foto'
                    WHEN m.media_type = 'video' THEN '🎥 Video'
                    WHEN m.media_type = 'voice' OR m.media_type = 'audio' THEN '🎤 Pesan Suara'
                    WHEN m.media_type = 'document' THEN '📄 Dokumen'
                    WHEN m.media_type = 'view_once' THEN '👁️ Pesan Sekali Lihat'
                    ELSE 'Media'
                  END
                )
                ELSE COALESCE(
                  NULLIF(m.content, ''),
                  CASE 
                    WHEN m.media_type = 'image' THEN '📷 Foto'
                    WHEN m.media_type = 'video' THEN '🎥 Video'
                    WHEN m.media_type = 'voice' OR m.media_type = 'audio' THEN '🎤 Pesan Suara'
                    WHEN m.media_type = 'document' THEN '📄 Dokumen'
                    WHEN m.media_type = 'view_once' THEN '👁️ Pesan Sekali Lihat'
                    ELSE 'Media'
                  END
                )
              END
            FROM messages m
            WHERE m.user_id = c.user_id 
              AND (
                m.remote_jid = c.jid 
                OR m.phone = c.phone 
                OR (c.phone IS NOT NULL AND length(c.phone) >= 6 AND m.remote_jid LIKE '%' || c.phone || '%')
              )
            ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
            LIMIT 1
          )
        ) AS last_message,
        COALESCE(
          c.last_message_time,
          (
            SELECT COALESCE(m.sent_at, m.created_at)
            FROM messages m
            WHERE m.user_id = c.user_id 
              AND (
                m.remote_jid = c.jid 
                OR m.phone = c.phone 
                OR (c.phone IS NOT NULL AND length(c.phone) >= 6 AND m.remote_jid LIKE '%' || c.phone || '%')
              )
            ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
            LIMIT 1
          )
        ) AS last_message_time,
        c.created_at, c.updated_at,
        COALESCE(c.is_pinned, false) AS is_pinned, c.pinned_at,
        COALESCE(c.is_archived, false) AS is_archived,
        COALESCE(ai.auto_reply_enabled, false) AS auto_reply_enabled,
        COALESCE(ai.auto_reply_enabled, false) AS ai_auto_reply_enabled,
        COALESCE(ai.disable_after_one_reply, false) AS disable_after_one_reply,
        ai.custom_prompt, ai.tone, ai.notes
      FROM contacts c
      LEFT JOIN chat_ai_settings ai ON c.user_id = ai.user_id AND (
        c.jid = ai.jid 
        OR c.phone = ai.jid 
        OR (c.phone IS NOT NULL AND c.phone != '' AND ai.jid = (c.phone || '@s.whatsapp.net'))
        OR (ai.jid IS NOT NULL AND c.phone = split_part(split_part(ai.jid, ':', 1), '@', 1))
      )
      WHERE ${whereClause}
      ORDER BY 
        COALESCE(c.is_pinned, false) DESC,
        c.pinned_at DESC NULLS LAST,
        COALESCE(
          c.last_message_time,
          (
            SELECT COALESCE(m.sent_at, m.created_at)
            FROM messages m
            WHERE m.user_id = c.user_id 
              AND (
                m.remote_jid = c.jid 
                OR m.phone = c.phone 
                OR (c.phone IS NOT NULL AND length(c.phone) >= 6 AND m.remote_jid LIKE '%' || c.phone || '%')
              )
            ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
            LIMIT 1
          )
        ) DESC NULLS LAST,
        c.updated_at DESC
    `;

    const { rows } = await query(sql, params);
    return rows;
  },

  async togglePin(userId, jid, isPinned) {
    const isGrp = jid.endsWith('@g.us');
    const cleanPhone = isGrp ? jid : jid.replace(/[^0-9]/g, '');
    const sql = `
      UPDATE contacts
      SET is_pinned = $1,
          pinned_at = CASE WHEN $1 = true THEN CURRENT_TIMESTAMP ELSE NULL END,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND (jid = $3 OR phone = $4 OR phone = $3)
      RETURNING *
    `;
    const { rows } = await query(sql, [isPinned, userId, jid, cleanPhone]);
    return rows[0] || null;
  },

  async toggleArchive(userId, jid, isArchived) {
    const isGrp = jid.endsWith('@g.us');
    const cleanPhone = isGrp ? jid : jid.replace(/[^0-9]/g, '');
    const sql = `
      UPDATE contacts
      SET is_archived = $1,
          is_pinned = CASE WHEN $1 = true THEN false ELSE is_pinned END,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND (jid = $3 OR phone = $4 OR phone = $3)
      RETURNING *
    `;
    const { rows } = await query(sql, [isArchived, userId, jid, cleanPhone]);
    return rows[0] || null;
  },

  async findById(id, userId) {
    const text = `SELECT * FROM contacts WHERE id = $1 AND user_id = $2 LIMIT 1`;
    const { rows } = await query(text, [id, userId]);
    return rows[0] || null;
  },

  async findByJid(userId, jid) {
    const isGrp = jid.endsWith('@g.us');
    const cleanPhone = isGrp ? jid : jid.replace(/[^0-9]/g, '');
    const text = `
      SELECT *
      FROM contacts
      WHERE user_id = $1 AND (jid = $2 OR phone = $3 OR phone = $2 OR (length($3) >= 8 AND (jid LIKE $4 OR phone LIKE $4)))
      LIMIT 1
    `;
    const { rows } = await query(text, [userId, jid, cleanPhone, `%${cleanPhone}%`]);
    return rows[0] || null;
  },

  async findByPhone(userId, phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const text = `
      SELECT *
      FROM contacts
      WHERE user_id = $1 AND (phone = $2 OR phone = $3)
      LIMIT 1
    `;
    const { rows } = await query(text, [userId, phone, cleanPhone]);
    return rows[0] || null;
  },

  async update(id, userId, { name, phone, avatarUrl, about }) {
    let updateFields = [];
    let values = [id, userId];
    let paramIndex = 3;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      const isGrp = phone.endsWith('@g.us');
      const cleanPhone = isGrp ? phone : phone.replace(/[^0-9]/g, '');
      updateFields.push(`phone = $${paramIndex++}`);
      values.push(cleanPhone);
    }
    if (avatarUrl !== undefined) {
      updateFields.push(`avatar_url = $${paramIndex++}`);
      values.push(avatarUrl);
    }
    if (about !== undefined) {
      updateFields.push(`about = $${paramIndex++}`);
      values.push(about);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    const text = `
      UPDATE contacts
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    const { rows } = await query(text, values);
    return rows[0] || null;
  },

  async delete(id, userId) {
    const text = `
      DELETE FROM contacts
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;
    const { rows } = await query(text, [id, userId]);
    return rows[0] || null;
  },

  async getAllByUser(userId, { search = '', type = 'personal', limit = 100, offset = 0 } = {}) {
    await this.syncContactsFromMessages(userId).catch(() => {});

    let filterClause = "WHERE user_id = $1 AND jid NOT LIKE '%@lid' AND phone NOT LIKE '%@lid'";
    let params = [userId];
    let paramIndex = 2;

    if (type === 'personal') {
      filterClause += " AND COALESCE(is_group, false) = false AND jid NOT LIKE '%@g.us' AND phone NOT LIKE '%@g.us'";
    } else if (type === 'group') {
      filterClause += " AND (COALESCE(is_group, false) = true OR jid LIKE '%@g.us' OR phone LIKE '%@g.us')";
    }

    if (search) {
      filterClause += ` AND (name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const countText = `SELECT COUNT(*) AS total FROM contacts ${filterClause}`;
    const countResult = await query(countText, params);
    const total = parseInt(countResult.rows[0].total, 10);

    const listText = `
      SELECT *
      FROM contacts
      ${filterClause}
      ORDER BY updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const { rows } = await query(listText, params);
    return { rows, total };
  },

  async deleteAllByUser(userId) {
    const text = `DELETE FROM contacts WHERE user_id = $1`;
    const { rowCount } = await query(text, [userId]);
    return rowCount;
  }
};

module.exports = ContactModel;
