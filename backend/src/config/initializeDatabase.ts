import pool from './database';

async function ensureColumn(table: string, column: string, definition: string) {
  const [rows] = await pool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
      LIMIT 1
    `,
    [table, column]
  );

  if ((rows as unknown[]).length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  }
}

export async function initializeDatabase() {
  const conn = await pool.getConnection();

  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS auth_accounts (
        \`id\` VARCHAR(36) PRIMARY KEY,
        \`email\` VARCHAR(255) NOT NULL UNIQUE,
        \`passwordHash\` VARCHAR(255) NOT NULL,
        \`displayName\` VARCHAR(100) NOT NULL,
        \`role\` VARCHAR(20) NOT NULL DEFAULT 'user',
        \`twoFactorSecret\` VARCHAR(64),
        \`twoFactorEnabled\` BOOLEAN DEFAULT 0,
        \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_auth_email\` (\`email\`)
      )
    `);
  } finally {
    conn.release();
  }

  await ensureColumn('auth_accounts', 'twoFactorSecret', '`twoFactorSecret` VARCHAR(64)');
  await ensureColumn('auth_accounts', 'twoFactorEnabled', '`twoFactorEnabled` BOOLEAN DEFAULT 0');
  await ensureColumn('auth_accounts', 'role', "`role` VARCHAR(20) NOT NULL DEFAULT 'user'");
}
