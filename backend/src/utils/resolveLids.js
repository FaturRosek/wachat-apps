const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');

async function resolveAllLids() {
  const userId = '6c9ca78c-1005-4ad1-a719-7c5f64b7434c';
  const sessionDir = path.join(__dirname, '../../sessions/6c9ca78c-1005-4ad1-a719-7c5f64b7434c_default');

  if (fs.existsSync(sessionDir)) {
    const files = fs.readdirSync(sessionDir).filter(f => f.startsWith('lid-mapping-') && f.endsWith('_reverse.json'));
    for (const f of files) {
      const lidId = f.replace('lid-mapping-', '').replace('_reverse.json', '');
      const lidJid = `${lidId}@lid`;
      try {
        const phone = JSON.parse(fs.readFileSync(path.join(sessionDir, f), 'utf8'));
        if (phone) {
          const targetJid = `${phone}@s.whatsapp.net`;
          await query(`
            UPDATE messages 
            SET remote_jid = $1, phone = $2 
            WHERE user_id = $3 AND (remote_jid = $4 OR phone = $5 OR phone = $4)
          `, [targetJid, phone, userId, lidJid, lidId]);
        }
      } catch (e) {}
    }
  }

  await query(`
    DELETE FROM contacts 
    WHERE user_id = $1 AND (jid LIKE '%@lid' OR phone LIKE '%@lid')
  `, [userId]);

  await query(`
    UPDATE contacts 
    SET name = 'Ftr' 
    WHERE user_id = $1 AND (phone = '628813125679' OR jid = '628813125679@s.whatsapp.net')
  `, [userId]);

  await query(`
    UPDATE contacts 
    SET name = 'Tes' 
    WHERE user_id = $1 AND jid = '120363411096753641@g.us'
  `, [userId]);

  await query(`
    UPDATE contacts 
    SET name = 'M0$3NG T34M 🫡' 
    WHERE user_id = $1 AND jid = '6285855652733-1614578429@g.us'
  `, [userId]);

  console.log('LID resolution & contact names update complete.');
  process.exit(0);
}

resolveAllLids().catch(console.error);
