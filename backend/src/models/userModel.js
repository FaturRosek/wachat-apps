const { query } = require('../config/database');

const UserModel = {
  async create({ name, email, password }) {
    const text = `
      INSERT INTO users (name, email, password)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, created_at, updated_at
    `;
    const values = [name, email.toLowerCase().trim(), password];
    const { rows } = await query(text, values);
    return rows[0];
  },

  async findByEmail(email) {
    const text = `SELECT * FROM users WHERE email = $1 LIMIT 1`;
    const { rows } = await query(text, [email.toLowerCase().trim()]);
    return rows[0] || null;
  },

  async findById(id) {
    const text = `
      SELECT id, name, email, created_at, updated_at 
      FROM users 
      WHERE id = $1 
      LIMIT 1
    `;
    const { rows } = await query(text, [id]);
    return rows[0] || null;
  },

  async update(id, { name, email }) {
    const text = `
      UPDATE users
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, name, email, created_at, updated_at
    `;
    const values = [name, email ? email.toLowerCase().trim() : null, id];
    const { rows } = await query(text, values);
    return rows[0] || null;
  },

  async getFirstUser() {
    const text = `SELECT * FROM users ORDER BY created_at ASC LIMIT 1`;
    const { rows } = await query(text);
    return rows[0] || null;
  }
};

module.exports = UserModel;
