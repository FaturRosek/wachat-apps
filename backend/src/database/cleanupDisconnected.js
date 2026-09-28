const { query } = require('../config/database');
const fs = require('fs');
const path = require('path');

const SESSIONS_BASE_DIR = path.join(__dirname, '../../sessions');

async function cleanDisconnectedData() {
}

async function cleanExpiredMessages(retentionDays = 30) {
  try {
    const res = await query(
      `DELETE FROM messages 
       WHERE created_at < NOW() - ($1 || ' days')::INTERVAL`,
      [retentionDays]
    );
    if (res.rowCount > 0) {
      console.log(`[Auto Retention Cleanup] ${res.rowCount} pesan yang lebih dari ${retentionDays} hari berhasil dibersihkan.`);
    }
  } catch (err) {
    console.error('[Auto Retention Cleanup Error]:', err.message);
  }
}

module.exports = { 
  cleanDisconnectedData,
  cleanExpiredMessages
};
