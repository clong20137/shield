import pool from './database';

export async function initializeDatabase() {
  const conn = await pool.getConnection();

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS auth_accounts (
        \`id\` VARCHAR(36) PRIMARY KEY,
        \`email\` VARCHAR(255) NOT NULL UNIQUE,
        \`passwordHash\` VARCHAR(255) NOT NULL,
        \`displayName\` VARCHAR(100) NOT NULL,
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_auth_email\` (\`email\`)
      )
    `);
  } finally {
    conn.release();
  }
}
