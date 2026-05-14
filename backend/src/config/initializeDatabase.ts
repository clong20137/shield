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

async function tableExists(table: string): Promise<boolean> {
  const [rows] = await pool.query(
    `
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      LIMIT 1
    `,
    [table]
  );

  return (rows as unknown[]).length > 0;
}

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`firstName\` VARCHAR(100) NOT NULL,
      \`lastName\` VARCHAR(100) NOT NULL,
      \`email\` VARCHAR(255),
      \`profilePictureUrl\` TEXT,
      \`displayName\` VARCHAR(100),
      \`passwordHash\` VARCHAR(255),
      \`role\` VARCHAR(20) NOT NULL DEFAULT 'user',
      \`twoFactorSecret\` VARCHAR(64),
      \`twoFactorEnabled\` BOOLEAN DEFAULT 0,
      \`peNumber\` VARCHAR(50) UNIQUE,
      \`peopleSoftId\` VARCHAR(50),
      \`carNumber\` VARCHAR(50),
      \`badgeNumber\` VARCHAR(50) UNIQUE,
      \`radioNumber\` VARCHAR(50),
      \`personalPhoneNumber\` VARCHAR(50),
      \`departmentPhoneNumber\` VARCHAR(50),
      \`assignedTo\` VARCHAR(100),
      \`district\` VARCHAR(100),
      \`rank\` VARCHAR(100),
      \`isActive\` BOOLEAN DEFAULT 1,
      \`employmentType\` VARCHAR(100),
      \`typeDetails\` VARCHAR(255),
      \`status\` VARCHAR(100),
      \`supervisor\` VARCHAR(100),
      \`specialtyCertifications\` TEXT,
      \`publicSafetyId\` VARCHAR(50) UNIQUE,
      \`race\` VARCHAR(50),
      \`sex\` VARCHAR(10),
      \`maritalStatus\` VARCHAR(50),
      \`residentialAddress\` TEXT,
      \`mailingAddress\` TEXT,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_firstName\` (\`firstName\`),
      INDEX \`idx_lastName\` (\`lastName\`),
      INDEX \`idx_peNumber\` (\`peNumber\`),
      INDEX \`idx_badgeNumber\` (\`badgeNumber\`),
      INDEX \`idx_district\` (\`district\`),
      INDEX \`idx_employmentType\` (\`employmentType\`)
    )
  `);

  await ensureColumn('users', 'email', '`email` VARCHAR(255)');
  await ensureColumn('users', 'profilePictureUrl', '`profilePictureUrl` TEXT');
  await ensureColumn('users', 'displayName', '`displayName` VARCHAR(100)');
  await ensureColumn('users', 'passwordHash', '`passwordHash` VARCHAR(255)');
  await ensureColumn('users', 'role', "`role` VARCHAR(20) NOT NULL DEFAULT 'user'");
  await ensureColumn('users', 'twoFactorSecret', '`twoFactorSecret` VARCHAR(64)');
  await ensureColumn('users', 'twoFactorEnabled', '`twoFactorEnabled` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'peopleSoftId', '`peopleSoftId` VARCHAR(50)');
  await ensureColumn('users', 'radioNumber', '`radioNumber` VARCHAR(50)');
  await ensureColumn('users', 'personalPhoneNumber', '`personalPhoneNumber` VARCHAR(50)');
  await ensureColumn('users', 'departmentPhoneNumber', '`departmentPhoneNumber` VARCHAR(50)');
  await ensureColumn('users', 'maritalStatus', '`maritalStatus` VARCHAR(50)');
  await ensureColumn('users', 'residentialAddress', '`residentialAddress` TEXT');
  await ensureColumn('users', 'mailingAddress', '`mailingAddress` TEXT');

  if (await tableExists('auth_accounts')) {
    await ensureColumn('auth_accounts', 'twoFactorSecret', '`twoFactorSecret` VARCHAR(64)');
    await ensureColumn('auth_accounts', 'twoFactorEnabled', '`twoFactorEnabled` BOOLEAN DEFAULT 0');
    await ensureColumn('auth_accounts', 'role', "`role` VARCHAR(20) NOT NULL DEFAULT 'user'");

    await pool.query(`
      UPDATE users u
      INNER JOIN auth_accounts a ON LOWER(u.email) = LOWER(a.email)
      SET
        u.displayName = COALESCE(NULLIF(u.displayName, ''), a.displayName),
        u.passwordHash = COALESCE(u.passwordHash, a.passwordHash),
        u.role = COALESCE(NULLIF(u.role, ''), a.role, 'user'),
        u.twoFactorSecret = COALESCE(u.twoFactorSecret, a.twoFactorSecret),
        u.twoFactorEnabled = CASE
          WHEN u.twoFactorEnabled = 1 THEN 1
          ELSE COALESCE(a.twoFactorEnabled, 0)
        END
    `);

    await pool.query(`
      INSERT INTO users (
        \`id\`, \`firstName\`, \`lastName\`, \`email\`, \`displayName\`, \`passwordHash\`, \`role\`,
        \`twoFactorSecret\`, \`twoFactorEnabled\`, \`isActive\`, \`employmentType\`, \`status\`,
        \`createdAt\`, \`updatedAt\`
      )
      SELECT
        a.\`id\`,
        TRIM(SUBSTRING_INDEX(a.\`displayName\`, ' ', 1)),
        CASE
          WHEN TRIM(SUBSTRING_INDEX(a.\`displayName\`, ' ', -1)) = TRIM(SUBSTRING_INDEX(a.\`displayName\`, ' ', 1))
            THEN 'User'
          ELSE TRIM(SUBSTRING_INDEX(a.\`displayName\`, ' ', -1))
        END,
        LOWER(a.\`email\`),
        a.\`displayName\`,
        a.\`passwordHash\`,
        COALESCE(a.\`role\`, 'user'),
        a.\`twoFactorSecret\`,
        COALESCE(a.\`twoFactorEnabled\`, 0),
        1,
        'Other',
        'Active',
        a.\`createdAt\`,
        a.\`updatedAt\`
      FROM auth_accounts a
      WHERE NOT EXISTS (
        SELECT 1 FROM users u WHERE LOWER(u.\`email\`) = LOWER(a.\`email\`)
      )
    `);

    await pool.query('DROP TABLE auth_accounts');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_messages (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`senderAccountId\` VARCHAR(36) NOT NULL,
      \`recipientUserId\` VARCHAR(36) NOT NULL,
      \`subject\` VARCHAR(200) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`isRead\` BOOLEAN DEFAULT 0,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_messages_sender\` (\`senderAccountId\`),
      INDEX \`idx_messages_recipient\` (\`recipientUserId\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_entries (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`category\` VARCHAR(100) NOT NULL DEFAULT 'General Information',
      \`entryDate\` DATE NOT NULL,
      \`dutyHours\` DECIMAL(6,2) NOT NULL,
      \`districtWorked\` VARCHAR(100) NOT NULL,
      \`specialStatus\` VARCHAR(50) NOT NULL DEFAULT 'None',
      \`color\` VARCHAR(20) NOT NULL DEFAULT '#9C865C',
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_calendar_entry_date\` (\`entryDate\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`type\` VARCHAR(50) NOT NULL,
      \`assetTag\` VARCHAR(100) NOT NULL UNIQUE,
      \`makeModel\` VARCHAR(150) NOT NULL,
      \`serialNumber\` VARCHAR(150),
      \`assignedTo\` VARCHAR(150),
      \`status\` VARCHAR(50) NOT NULL DEFAULT 'Available',
      \`location\` VARCHAR(150),
      \`notes\` TEXT,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_devices_type\` (\`type\`),
      INDEX \`idx_devices_status\` (\`status\`)
    )
  `);
}
