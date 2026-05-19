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

async function ensureIndex(table: string, indexName: string, definition: string) {
  const [rows] = await pool.query(
    `
      SELECT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?
      LIMIT 1
    `,
    [table, indexName]
  );

  if ((rows as unknown[]).length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (${definition})`);
  }
}

async function dropNonPrimaryUniqueIndexes(table: string) {
  const [rows] = await pool.query(
    `
      SELECT DISTINCT INDEX_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND NON_UNIQUE = 0
        AND INDEX_NAME <> 'PRIMARY'
    `,
    [table]
  );

  for (const row of rows as Array<{ INDEX_NAME: string }>) {
    await pool.query(`ALTER TABLE \`${table}\` DROP INDEX \`${row.INDEX_NAME}\``);
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
      \`role\` VARCHAR(100) NOT NULL DEFAULT 'user',
      \`receivesMessages\` BOOLEAN DEFAULT 1,
      \`hasCompletedOnboarding\` BOOLEAN DEFAULT 0,
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
  await ensureColumn('users', 'role', "`role` VARCHAR(100) NOT NULL DEFAULT 'user'");
  await pool.query("ALTER TABLE `users` MODIFY COLUMN `role` VARCHAR(100) NOT NULL DEFAULT 'user'");
  await ensureColumn('users', 'receivesMessages', '`receivesMessages` BOOLEAN DEFAULT 1');
  await ensureColumn('users', 'hasCompletedOnboarding', '`hasCompletedOnboarding` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'twoFactorSecret', '`twoFactorSecret` VARCHAR(64)');
  await ensureColumn('users', 'twoFactorEnabled', '`twoFactorEnabled` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'peopleSoftId', '`peopleSoftId` VARCHAR(50)');
  await ensureColumn('users', 'radioNumber', '`radioNumber` VARCHAR(50)');
  await ensureColumn('users', 'personalPhoneNumber', '`personalPhoneNumber` VARCHAR(50)');
  await ensureColumn('users', 'departmentPhoneNumber', '`departmentPhoneNumber` VARCHAR(50)');
  await ensureColumn('users', 'maritalStatus', '`maritalStatus` VARCHAR(50)');
  await ensureColumn('users', 'residentialAddress', '`residentialAddress` TEXT');
  await ensureColumn('users', 'mailingAddress', '`mailingAddress` TEXT');
  await ensureIndex('users', 'idx_users_email', '`email`');
  await ensureIndex('users', 'idx_users_rank', '`rank`');
  await ensureIndex('users', 'idx_users_name', '`lastName`, `firstName`');

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
        u.receivesMessages = COALESCE(u.receivesMessages, 1),
        u.twoFactorSecret = COALESCE(u.twoFactorSecret, a.twoFactorSecret),
        u.twoFactorEnabled = CASE
          WHEN u.twoFactorEnabled = 1 THEN 1
          ELSE COALESCE(a.twoFactorEnabled, 0)
        END
    `);

    await pool.query(`
      INSERT INTO users (
        \`id\`, \`firstName\`, \`lastName\`, \`email\`, \`displayName\`, \`passwordHash\`, \`role\`,
        \`receivesMessages\`, \`twoFactorSecret\`, \`twoFactorEnabled\`, \`isActive\`, \`employmentType\`, \`status\`,
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
        1,
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
    CREATE TABLE IF NOT EXISTS user_sessions (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`userId\` VARCHAR(36) NOT NULL,
      \`tokenHash\` VARCHAR(128) NOT NULL UNIQUE,
      \`expiresAt\` TIMESTAMP NOT NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`revokedAt\` TIMESTAMP NULL,
      INDEX \`idx_user_sessions_user\` (\`userId\`),
      INDEX \`idx_user_sessions_token\` (\`tokenHash\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS roles (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`name\` VARCHAR(100) NOT NULL UNIQUE,
      \`permissions\` TEXT,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    INSERT IGNORE INTO roles (\`id\`, \`name\`, \`permissions\`)
    VALUES
      ('role-administrator', 'administrator', '["users:view","users:create","users:edit","devices:manage","calendar:manage","reports:trooper-dailies","reports:cpar","audit:view","roles:manage","messages:send","dashboard:manage","bugs:manage"]'),
      ('role-user', 'user', '["users:view","calendar:manage","messages:send"]')
  `);

  await pool.query(`
    UPDATE roles
    SET \`permissions\` = '["users:view","users:create","users:edit","devices:manage","calendar:manage","reports:trooper-dailies","reports:cpar","audit:view","roles:manage","messages:send","dashboard:manage","bugs:manage"]'
    WHERE \`name\` = 'administrator'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`actorId\` VARCHAR(36),
      \`actorName\` VARCHAR(150),
      \`action\` VARCHAR(100) NOT NULL,
      \`entityType\` VARCHAR(100) NOT NULL,
      \`entityId\` VARCHAR(100),
      \`details\` TEXT,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_audit_actor\` (\`actorId\`),
      INDEX \`idx_audit_entity\` (\`entityType\`, \`entityId\`),
      INDEX \`idx_audit_created\` (\`createdAt\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_posts (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`title\` VARCHAR(200) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`category\` VARCHAR(50) NOT NULL DEFAULT 'Update',
      \`allowComments\` BOOLEAN DEFAULT 1,
      \`authorId\` VARCHAR(36),
      \`authorName\` VARCHAR(150),
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_dashboard_posts_created\` (\`createdAt\`),
      INDEX \`idx_dashboard_posts_category\` (\`category\`)
    )
  `);

  await ensureColumn('dashboard_posts', 'allowComments', '`allowComments` BOOLEAN DEFAULT 1');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_post_reactions (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`postId\` VARCHAR(36) NOT NULL,
      \`userId\` VARCHAR(36) NOT NULL,
      \`reaction\` VARCHAR(30) NOT NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`uniq_dashboard_post_reaction\` (\`postId\`, \`userId\`),
      INDEX \`idx_dashboard_post_reactions_post\` (\`postId\`),
      INDEX \`idx_dashboard_post_reactions_user\` (\`userId\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_post_comments (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`postId\` VARCHAR(36) NOT NULL,
      \`authorId\` VARCHAR(36) NOT NULL,
      \`authorName\` VARCHAR(150),
      \`body\` TEXT NOT NULL,
      \`isFlagged\` BOOLEAN DEFAULT 0,
      \`flaggedBy\` VARCHAR(36),
      \`flaggedAt\` DATETIME,
      \`flagReason\` TEXT,
      \`isPinned\` BOOLEAN DEFAULT 0,
      \`pinnedBy\` VARCHAR(36),
      \`pinnedAt\` DATETIME,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_dashboard_post_comments_post\` (\`postId\`),
      INDEX \`idx_dashboard_post_comments_created\` (\`createdAt\`)
    )
  `);

  await ensureColumn('dashboard_post_comments', 'isFlagged', '`isFlagged` BOOLEAN DEFAULT 0');
  await ensureColumn('dashboard_post_comments', 'flaggedBy', '`flaggedBy` VARCHAR(36)');
  await ensureColumn('dashboard_post_comments', 'flaggedAt', '`flaggedAt` DATETIME');
  await ensureColumn('dashboard_post_comments', 'flagReason', '`flagReason` TEXT');
  await ensureColumn('dashboard_post_comments', 'isPinned', '`isPinned` BOOLEAN DEFAULT 0');
  await ensureColumn('dashboard_post_comments', 'pinnedBy', '`pinnedBy` VARCHAR(36)');
  await ensureColumn('dashboard_post_comments', 'pinnedAt', '`pinnedAt` DATETIME');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_messages (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`senderAccountId\` VARCHAR(36) NOT NULL,
      \`recipientUserId\` VARCHAR(36) NOT NULL,
      \`subject\` VARCHAR(200) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`isRead\` BOOLEAN DEFAULT 0,
      \`isArchived\` BOOLEAN DEFAULT 0,
      \`senderDeleted\` BOOLEAN DEFAULT 0,
      \`recipientDeleted\` BOOLEAN DEFAULT 0,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_messages_sender\` (\`senderAccountId\`),
      INDEX \`idx_messages_recipient\` (\`recipientUserId\`)
    )
  `);

  await ensureColumn('user_messages', 'isArchived', '`isArchived` BOOLEAN DEFAULT 0');
  await ensureColumn('user_messages', 'senderDeleted', '`senderDeleted` BOOLEAN DEFAULT 0');
  await ensureColumn('user_messages', 'recipientDeleted', '`recipientDeleted` BOOLEAN DEFAULT 0');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_entries (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`ownerAccountId\` VARCHAR(36),
      \`category\` VARCHAR(100) NOT NULL DEFAULT 'General Information',
      \`entryDate\` DATE NOT NULL,
      \`dutyHours\` DECIMAL(6,2) NOT NULL,
      \`districtWorked\` VARCHAR(100) NOT NULL,
      \`specialStatus\` VARCHAR(50) NOT NULL DEFAULT 'None',
      \`color\` VARCHAR(20) NOT NULL DEFAULT '#9C865C',
      \`details\` JSON,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_calendar_owner\` (\`ownerAccountId\`),
      INDEX \`idx_calendar_entry_date\` (\`entryDate\`)
    )
  `);
  await ensureColumn('calendar_entries', 'ownerAccountId', '`ownerAccountId` VARCHAR(36)');
  await ensureColumn('calendar_entries', 'details', '`details` JSON');
  await dropNonPrimaryUniqueIndexes('calendar_entries');
  await ensureIndex('calendar_entries', 'idx_calendar_category_date', '`category`, `entryDate`');
  await ensureIndex('calendar_entries', 'idx_calendar_district_date', '`districtWorked`, `entryDate`');
  await ensureIndex('calendar_entries', 'idx_calendar_owner_date', '`ownerAccountId`, `entryDate`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS calendar_shortcuts (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`ownerAccountId\` VARCHAR(36) NOT NULL,
      \`name\` VARCHAR(120) NOT NULL,
      \`dutyHours\` DECIMAL(6,2) NOT NULL DEFAULT 0,
      \`districtWorked\` VARCHAR(100) NOT NULL,
      \`specialStatus\` VARCHAR(50) NOT NULL DEFAULT 'None',
      \`color\` VARCHAR(20) NOT NULL DEFAULT '#9C865C',
      \`details\` JSON,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_calendar_shortcuts_owner\` (\`ownerAccountId\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bug_reports (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`reporterId\` VARCHAR(36),
      \`reporterName\` VARCHAR(150),
      \`reporterEmail\` VARCHAR(255),
      \`title\` VARCHAR(200) NOT NULL,
      \`description\` TEXT NOT NULL,
      \`location\` VARCHAR(200),
      \`priority\` VARCHAR(30) NOT NULL DEFAULT 'Normal',
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'New',
      \`adminNotes\` TEXT,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_bug_reports_status\` (\`status\`),
      INDEX \`idx_bug_reports_created\` (\`createdAt\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`userId\` VARCHAR(36) NOT NULL,
      \`type\` VARCHAR(50) NOT NULL,
      \`title\` VARCHAR(200) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`entityType\` VARCHAR(100),
      \`entityId\` VARCHAR(100),
      \`isRead\` BOOLEAN DEFAULT 0,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_user_notifications_user\` (\`userId\`),
      INDEX \`idx_user_notifications_read\` (\`isRead\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      \`settingKey\` VARCHAR(100) PRIMARY KEY,
      \`settingValue\` TEXT,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    INSERT IGNORE INTO system_settings (\`settingKey\`, \`settingValue\`)
    VALUES ('mileageMilestone', '1000')
  `);

  await pool.query(`
    INSERT IGNORE INTO system_settings (\`settingKey\`, \`settingValue\`)
    VALUES
      ('registrationMode', 'public'),
      ('appBaseUrl', 'http://localhost:3000'),
      ('maintenanceMode', 'false'),
      ('loginWarningEnabled', 'true'),
      ('loginWarningMessage', 'This is a Indiana State Police computer application system that is for Official use only. This system is subject to monitoring. Therefore, no expectation of privacy is to be assumed. Individuals found performing unauthorized activities may be subject to disciplinary action including criminal prosecution.')
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_invites (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`email\` VARCHAR(255) NOT NULL,
      \`tokenHash\` VARCHAR(128) NOT NULL UNIQUE,
      \`invitedBy\` VARCHAR(36),
      \`invitedByName\` VARCHAR(150),
      \`acceptedAt\` TIMESTAMP NULL,
      \`expiresAt\` TIMESTAMP NOT NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_auth_invites_email\` (\`email\`),
      INDEX \`idx_auth_invites_token\` (\`tokenHash\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_password_resets (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`userId\` VARCHAR(36) NOT NULL,
      \`email\` VARCHAR(255) NOT NULL,
      \`tokenHash\` VARCHAR(128) NOT NULL UNIQUE,
      \`usedAt\` TIMESTAMP NULL,
      \`expiresAt\` TIMESTAMP NOT NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_password_resets_user\` (\`userId\`),
      INDEX \`idx_password_resets_token\` (\`tokenHash\`),
      INDEX \`idx_password_resets_email\` (\`email\`)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_launch_slots (
      \`accountId\` VARCHAR(36) PRIMARY KEY,
      \`slots\` JSON,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS performance_evaluations (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`employeeAccountId\` VARCHAR(36) NOT NULL,
      \`employeeName\` VARCHAR(150) NOT NULL,
      \`employeeEmail\` VARCHAR(255) NOT NULL,
      \`supervisorAccountId\` VARCHAR(36) NOT NULL,
      \`supervisorName\` VARCHAR(150) NOT NULL,
      \`evaluationPeriod\` VARCHAR(150) NOT NULL,
      \`positionTitle\` VARCHAR(150),
      \`district\` VARCHAR(150),
      \`ratings\` JSON,
      \`strengths\` TEXT,
      \`improvements\` TEXT,
      \`goals\` TEXT,
      \`supervisorComments\` TEXT,
      \`employeeComments\` TEXT,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'Sent',
      \`supervisorSignature\` VARCHAR(150),
      \`supervisorSignedAt\` TIMESTAMP NULL,
      \`employeeSignature\` VARCHAR(150),
      \`employeeSignedAt\` TIMESTAMP NULL,
      \`sentAt\` TIMESTAMP NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_performance_employee\` (\`employeeAccountId\`),
      INDEX \`idx_performance_supervisor\` (\`supervisorAccountId\`),
      INDEX \`idx_performance_status\` (\`status\`)
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
      \`phoneNumber\` VARCHAR(50),
      \`imei\` VARCHAR(100),
      \`simNumber\` VARCHAR(100),
      \`radioId\` VARCHAR(100),
      \`hostname\` VARCHAR(150),
      \`routerId\` VARCHAR(150),
      \`warrantyExpiration\` DATE,
      \`replacementDueDate\` DATE,
      \`maintenanceDueDate\` DATE,
      \`lastServiceDate\` DATE,
      \`purchaseDate\` DATE,
      \`condition\` VARCHAR(50) NOT NULL DEFAULT 'Good',
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_devices_type\` (\`type\`),
      INDEX \`idx_devices_status\` (\`status\`)
    )
  `);

  await ensureColumn('devices', 'phoneNumber', '`phoneNumber` VARCHAR(50)');
  await ensureColumn('devices', 'imei', '`imei` VARCHAR(100)');
  await ensureColumn('devices', 'simNumber', '`simNumber` VARCHAR(100)');
  await ensureColumn('devices', 'radioId', '`radioId` VARCHAR(100)');
  await ensureColumn('devices', 'hostname', '`hostname` VARCHAR(150)');
  await ensureColumn('devices', 'routerId', '`routerId` VARCHAR(150)');
  await ensureColumn('devices', 'warrantyExpiration', '`warrantyExpiration` DATE');
  await ensureColumn('devices', 'replacementDueDate', '`replacementDueDate` DATE');
  await ensureColumn('devices', 'maintenanceDueDate', '`maintenanceDueDate` DATE');
  await ensureColumn('devices', 'lastServiceDate', '`lastServiceDate` DATE');
  await ensureColumn('devices', 'purchaseDate', '`purchaseDate` DATE');
  await ensureColumn('devices', 'condition', "`condition` VARCHAR(50) NOT NULL DEFAULT 'Good'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_events (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`deviceId\` VARCHAR(36) NOT NULL,
      \`action\` VARCHAR(100) NOT NULL,
      \`actorId\` VARCHAR(36),
      \`actorName\` VARCHAR(150),
      \`assignedTo\` VARCHAR(150),
      \`status\` VARCHAR(50),
      \`notes\` TEXT,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_device_events_device\` (\`deviceId\`),
      INDEX \`idx_device_events_created\` (\`createdAt\`)
    )
  `);
}
