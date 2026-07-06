import pool from './database';

// Startup migrations are intentionally idempotent so deployed installs can upgrade in place without a separate migration runner.
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
  // The users table now owns both personnel profile data and login account fields; older auth_accounts data is folded in below.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`firstName\` VARCHAR(100) NOT NULL,
      \`lastName\` VARCHAR(100) NOT NULL,
      \`email\` VARCHAR(255),
      \`profilePictureUrl\` TEXT,
      \`lastSeenAt\` DATETIME,
      \`displayName\` VARCHAR(100),
      \`passwordHash\` VARCHAR(255),
      \`role\` VARCHAR(100) NOT NULL DEFAULT 'user',
      \`mustChangePassword\` BOOLEAN DEFAULT 0,
      \`ssoProvider\` VARCHAR(50),
      \`microsoftUserId\` VARCHAR(100),
      \`lastSsoLoginAt\` DATETIME,
      \`receivesMessages\` BOOLEAN DEFAULT 1,
      \`presenceHidden\` BOOLEAN DEFAULT 0,
      \`isMemorial\` BOOLEAN DEFAULT 0,
      \`endOfWatchDate\` DATE,
      \`memorialSummary\` TEXT,
      \`serviceYears\` VARCHAR(80),
      \`memorialExternalUrl\` VARCHAR(500),
      \`defaultDutyHours\` DECIMAL(5,2) NOT NULL DEFAULT 8.00,
      \`isHidden\` BOOLEAN DEFAULT 0,
      \`hasCompletedOnboarding\` BOOLEAN DEFAULT 0,
      \`twoFactorSecret\` VARCHAR(64),
      \`twoFactorEnabled\` BOOLEAN DEFAULT 0,
      \`twoFactorRecoveryCodes\` TEXT,
      \`peNumber\` VARCHAR(50) UNIQUE,
      \`peopleSoftId\` VARCHAR(50),
      \`carNumber\` VARCHAR(50),
      \`badgeNumber\` VARCHAR(50) UNIQUE,
      \`radioNumber\` VARCHAR(50),
      \`personalPhoneNumber\` TEXT,
      \`personalPhoneNumberHash\` VARCHAR(64),
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
      \`emergencyContactName\` VARCHAR(150),
      \`emergencyContactRelationship\` VARCHAR(100),
      \`emergencyContactPhone\` TEXT,
      \`emergencyContactPhoneHash\` VARCHAR(64),
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
  await ensureColumn('users', 'lastSeenAt', '`lastSeenAt` DATETIME');
  await ensureColumn('users', 'displayName', '`displayName` VARCHAR(100)');
  await ensureColumn('users', 'passwordHash', '`passwordHash` VARCHAR(255)');
  await ensureColumn('users', 'role', "`role` VARCHAR(100) NOT NULL DEFAULT 'user'");
  await pool.query("ALTER TABLE `users` MODIFY COLUMN `role` VARCHAR(100) NOT NULL DEFAULT 'user'");
  await ensureColumn('users', 'mustChangePassword', '`mustChangePassword` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'ssoProvider', '`ssoProvider` VARCHAR(50)');
  await ensureColumn('users', 'microsoftUserId', '`microsoftUserId` VARCHAR(100)');
  await ensureColumn('users', 'lastSsoLoginAt', '`lastSsoLoginAt` DATETIME');
  await ensureColumn('users', 'receivesMessages', '`receivesMessages` BOOLEAN DEFAULT 1');
  await ensureColumn('users', 'presenceHidden', '`presenceHidden` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'isMemorial', '`isMemorial` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'endOfWatchDate', '`endOfWatchDate` DATE');
  await ensureColumn('users', 'memorialSummary', '`memorialSummary` TEXT');
  await ensureColumn('users', 'serviceYears', '`serviceYears` VARCHAR(80)');
  await ensureColumn('users', 'memorialExternalUrl', '`memorialExternalUrl` VARCHAR(500)');
  await ensureColumn('users', 'calendarHidden', '`calendarHidden` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'appScale', "`appScale` VARCHAR(20) NOT NULL DEFAULT 'comfortable'");
  await ensureColumn('users', 'defaultDutyHours', '`defaultDutyHours` DECIMAL(5,2) NOT NULL DEFAULT 8.00');
  await ensureColumn('users', 'isHidden', '`isHidden` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'hasCompletedOnboarding', '`hasCompletedOnboarding` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'trooperDailyHiddenSections', '`trooperDailyHiddenSections` TEXT');
  await ensureColumn('users', 'twoFactorSecret', '`twoFactorSecret` VARCHAR(64)');
  await ensureColumn('users', 'twoFactorEnabled', '`twoFactorEnabled` BOOLEAN DEFAULT 0');
  await ensureColumn('users', 'twoFactorRecoveryCodes', '`twoFactorRecoveryCodes` TEXT');
  await ensureColumn('users', 'peopleSoftId', '`peopleSoftId` VARCHAR(50)');
  await ensureColumn('users', 'radioNumber', '`radioNumber` VARCHAR(50)');
  await ensureColumn('users', 'personalPhoneNumber', '`personalPhoneNumber` TEXT');
  await pool.query('ALTER TABLE `users` MODIFY COLUMN `personalPhoneNumber` TEXT');
  await ensureColumn('users', 'personalPhoneNumberHash', '`personalPhoneNumberHash` VARCHAR(64)');
  await ensureColumn('users', 'departmentPhoneNumber', '`departmentPhoneNumber` VARCHAR(50)');
  await ensureColumn('users', 'maritalStatus', '`maritalStatus` VARCHAR(50)');
  await ensureColumn('users', 'residentialAddress', '`residentialAddress` TEXT');
  await ensureColumn('users', 'mailingAddress', '`mailingAddress` TEXT');
  await ensureColumn('users', 'emergencyContactName', '`emergencyContactName` VARCHAR(150)');
  await ensureColumn('users', 'emergencyContactRelationship', '`emergencyContactRelationship` VARCHAR(100)');
  await ensureColumn('users', 'emergencyContactPhone', '`emergencyContactPhone` TEXT');
  await pool.query('ALTER TABLE `users` MODIFY COLUMN `emergencyContactPhone` TEXT');
  await ensureColumn('users', 'emergencyContactPhoneHash', '`emergencyContactPhoneHash` VARCHAR(64)');
  await ensureIndex('users', 'idx_users_email', '`email`');
  await ensureIndex('users', 'idx_users_microsoft_id', '`microsoftUserId`');
  await ensureIndex('users', 'idx_users_hidden', '`isHidden`, `lastName`, `firstName`');
  await ensureIndex('users', 'idx_users_rank', '`rank`');
  await ensureIndex('users', 'idx_users_name', '`lastName`, `firstName`');
  await ensureIndex('users', 'idx_users_active_district', '`isActive`, `district`');
  await ensureIndex('users', 'idx_users_memorial_watch', '`isMemorial`, `endOfWatchDate`, `lastName`, `firstName`');
  await ensureIndex('users', 'idx_users_hidden_filters_name', '`isHidden`, `district`, `rank`, `isActive`, `lastName`, `firstName`');
  await ensureIndex('users', 'idx_users_people_soft', '`peopleSoftId`');
  await ensureIndex('users', 'idx_users_radio', '`radioNumber`');
  await ensureIndex('users', 'idx_users_public_safety', '`publicSafetyId`');
  await ensureIndex('users', 'idx_users_personal_phone_hash', '`personalPhoneNumberHash`');
  await ensureIndex('users', 'idx_users_emergency_phone_hash', '`emergencyContactPhoneHash`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS memorial_profiles (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`linkedUserId\` VARCHAR(36),
      \`firstName\` VARCHAR(100) NOT NULL,
      \`lastName\` VARCHAR(100) NOT NULL,
      \`rank\` VARCHAR(100),
      \`district\` VARCHAR(100),
      \`appointedDate\` DATE,
      \`deceasedDate\` DATE,
      \`photoUrl\` TEXT,
      \`serviceYears\` VARCHAR(80),
      \`memorialSummary\` TEXT,
      \`memorialExternalUrl\` VARCHAR(500),
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`idx_memorial_profiles_linked_user\` (\`linkedUserId\`),
      INDEX \`idx_memorial_profiles_deceased\` (\`deceasedDate\`, \`lastName\`, \`firstName\`),
      INDEX \`idx_memorial_profiles_name\` (\`lastName\`, \`firstName\`)
    )
  `);

  await ensureColumn('memorial_profiles', 'linkedUserId', '`linkedUserId` VARCHAR(36)');
  await ensureColumn('memorial_profiles', 'firstName', '`firstName` VARCHAR(100) NOT NULL');
  await ensureColumn('memorial_profiles', 'lastName', '`lastName` VARCHAR(100) NOT NULL');
  await ensureColumn('memorial_profiles', 'rank', '`rank` VARCHAR(100)');
  await ensureColumn('memorial_profiles', 'district', '`district` VARCHAR(100)');
  await ensureColumn('memorial_profiles', 'appointedDate', '`appointedDate` DATE');
  await ensureColumn('memorial_profiles', 'deceasedDate', '`deceasedDate` DATE');
  await ensureColumn('memorial_profiles', 'photoUrl', '`photoUrl` TEXT');
  await ensureColumn('memorial_profiles', 'serviceYears', '`serviceYears` VARCHAR(80)');
  await ensureColumn('memorial_profiles', 'memorialSummary', '`memorialSummary` TEXT');
  await ensureColumn('memorial_profiles', 'memorialExternalUrl', '`memorialExternalUrl` VARCHAR(500)');
  await ensureIndex('memorial_profiles', 'idx_memorial_profiles_deceased', '`deceasedDate`, `lastName`, `firstName`');
  await ensureIndex('memorial_profiles', 'idx_memorial_profiles_name', '`lastName`, `firstName`');

  await pool.query(`
    INSERT IGNORE INTO memorial_profiles (
      \`id\`, \`linkedUserId\`, \`firstName\`, \`lastName\`, \`rank\`, \`district\`, \`deceasedDate\`,
      \`photoUrl\`, \`serviceYears\`, \`memorialSummary\`, \`memorialExternalUrl\`, \`createdAt\`, \`updatedAt\`
    )
    SELECT
      CONCAT('mem-user-', u.\`id\`),
      u.\`id\`,
      COALESCE(NULLIF(u.\`firstName\`, ''), 'Unknown'),
      COALESCE(NULLIF(u.\`lastName\`, ''), 'Trooper'),
      u.\`rank\`,
      u.\`district\`,
      u.\`endOfWatchDate\`,
      u.\`profilePictureUrl\`,
      u.\`serviceYears\`,
      u.\`memorialSummary\`,
      u.\`memorialExternalUrl\`,
      u.\`createdAt\`,
      u.\`updatedAt\`
    FROM users u
    WHERE COALESCE(u.\`isMemorial\`, 0) = 1
  `);

  if (await tableExists('auth_accounts')) {
    // Legacy installs created credentials in auth_accounts. Merge them into users once, then drop the old table.
    await ensureColumn('auth_accounts', 'twoFactorSecret', '`twoFactorSecret` VARCHAR(64)');
    await ensureColumn('auth_accounts', 'twoFactorEnabled', '`twoFactorEnabled` BOOLEAN DEFAULT 0');
    await ensureColumn('auth_accounts', 'twoFactorRecoveryCodes', '`twoFactorRecoveryCodes` TEXT');
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
        END,
        u.twoFactorRecoveryCodes = COALESCE(u.twoFactorRecoveryCodes, a.twoFactorRecoveryCodes)
    `);

    await pool.query(`
      INSERT INTO users (
        \`id\`, \`firstName\`, \`lastName\`, \`email\`, \`displayName\`, \`passwordHash\`, \`role\`,
        \`receivesMessages\`, \`twoFactorSecret\`, \`twoFactorEnabled\`, \`twoFactorRecoveryCodes\`, \`isActive\`, \`employmentType\`, \`status\`,
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
        a.\`twoFactorRecoveryCodes\`,
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

  // Seed roles are kept current on startup so new permission flags become available after an update.
  await pool.query(`
    INSERT IGNORE INTO roles (\`id\`, \`name\`, \`permissions\`)
    VALUES
      ('role-administrator', 'administrator', '["users:view","users:create","users:edit","users:view-hidden","users:profile-picture","account:profile-picture","presence:incognito","presence:view-incognito","media:view","media:upload","media:edit","media:delete","devices:manage","calendar:manage","calendar:view-profiles","fleet:bookings:manage","fleet:vehicles:manage","fleet:inventory:manage","reports:trooper-dailies","reports:cpar","audit:view","roles:manage","messages:receive","messages:send","desktop:start-with-windows","desktop:minimize-to-tray","alerts:send","dashboard:manage","dashboard:create","dashboard:edit","dashboard:delete","district-feed:post","bugs:manage","admin:access","admin:general","admin:permissions","admin:achievements","admin:create-user","admin:media","admin:alerts","admin:bugs","admin:audit","admin:errors"]'),
      ('role-user', 'user', '["users:view","account:profile-picture","calendar:manage","messages:receive","messages:send","desktop:start-with-windows","desktop:minimize-to-tray"]')
  `);

  await pool.query(`
    UPDATE roles
    SET \`permissions\` = '["users:view","users:create","users:edit","users:view-hidden","users:profile-picture","account:profile-picture","presence:incognito","presence:view-incognito","media:view","media:upload","media:edit","media:delete","devices:manage","calendar:manage","calendar:view-profiles","fleet:bookings:manage","fleet:vehicles:manage","fleet:inventory:manage","reports:trooper-dailies","reports:cpar","audit:view","roles:manage","messages:receive","messages:send","desktop:start-with-windows","desktop:minimize-to-tray","alerts:send","dashboard:manage","dashboard:create","dashboard:edit","dashboard:delete","district-feed:post","bugs:manage","admin:access","admin:general","admin:permissions","admin:achievements","admin:create-user","admin:media","admin:alerts","admin:bugs","admin:audit","admin:errors"]'
    WHERE \`name\` = 'administrator'
  `);

  await pool.query(`
    UPDATE roles
    SET \`permissions\` = CONCAT(LEFT(\`permissions\`, CHAR_LENGTH(\`permissions\`) - 1), ',"account:profile-picture"]')
    WHERE \`name\` = 'user'
      AND \`permissions\` LIKE '[%'
      AND \`permissions\` NOT LIKE '%"account:profile-picture"%'
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
      \`ipAddress\` VARCHAR(45),
      \`userAgent\` VARCHAR(255),
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_audit_actor\` (\`actorId\`),
      INDEX \`idx_audit_action\` (\`action\`),
      INDEX \`idx_audit_entity\` (\`entityType\`, \`entityId\`),
      INDEX \`idx_audit_created\` (\`createdAt\`)
    )
  `);
  await ensureColumn('audit_logs', 'ipAddress', '`ipAddress` VARCHAR(45)');
  await ensureColumn('audit_logs', 'userAgent', '`userAgent` VARCHAR(255)');
  await ensureIndex('audit_logs', 'idx_audit_action', '`action`');
  await ensureIndex('audit_logs', 'idx_audit_actor_created', '`actorId`, `createdAt`');
  await ensureIndex('audit_logs', 'idx_audit_created_id', '`createdAt`, `id`');
  await ensureIndex('audit_logs', 'idx_audit_action_created', '`action`, `createdAt`');
  await ensureIndex('audit_logs', 'idx_audit_entity_created', '`entityType`, `createdAt`');
  await ensureIndex('audit_logs', 'idx_audit_ip_created', '`ipAddress`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`level\` VARCHAR(30) NOT NULL DEFAULT 'error',
      \`message\` TEXT NOT NULL,
      \`stack\` TEXT,
      \`route\` VARCHAR(255),
      \`method\` VARCHAR(20),
      \`userId\` VARCHAR(36),
      \`ipAddress\` VARCHAR(45),
      \`userAgent\` VARCHAR(255),
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_error_logs_level\` (\`level\`),
      INDEX \`idx_error_logs_created\` (\`createdAt\`),
      INDEX \`idx_error_logs_route\` (\`route\`)
    )
  `);
  await ensureIndex('error_logs', 'idx_error_logs_level_created', '`level`, `createdAt`');
  await ensureIndex('error_logs', 'idx_error_logs_route_created', '`route`, `createdAt`');
  await ensureIndex('error_logs', 'idx_error_logs_user_created', '`userId`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS dashboard_posts (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`title\` VARCHAR(200) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`category\` VARCHAR(50) NOT NULL DEFAULT 'Update',
      \`imageUrl\` VARCHAR(500),
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
  await ensureColumn('dashboard_posts', 'imageUrl', '`imageUrl` VARCHAR(500)');
  await ensureIndex('dashboard_posts', 'idx_dashboard_posts_created_id', '`createdAt`, `id`');

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
      \`parentCommentId\` VARCHAR(36),
      \`body\` TEXT NOT NULL,
      \`isFlagged\` BOOLEAN DEFAULT 0,
      \`flaggedBy\` VARCHAR(36),
      \`flaggedAt\` DATETIME,
      \`flagReason\` TEXT,
      \`isPinned\` BOOLEAN DEFAULT 0,
      \`pinnedBy\` VARCHAR(36),
      \`pinnedAt\` DATETIME,
      \`isAdminHighlighted\` BOOLEAN DEFAULT 0,
      \`adminHighlightedBy\` VARCHAR(36),
      \`adminHighlightedAt\` DATETIME,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_dashboard_post_comments_post\` (\`postId\`),
      INDEX \`idx_dashboard_post_comments_parent\` (\`parentCommentId\`),
      INDEX \`idx_dashboard_post_comments_created\` (\`createdAt\`)
    )
  `);

  await ensureColumn('dashboard_post_comments', 'parentCommentId', '`parentCommentId` VARCHAR(36)');
  await ensureColumn('dashboard_post_comments', 'isFlagged', '`isFlagged` BOOLEAN DEFAULT 0');
  await ensureColumn('dashboard_post_comments', 'flaggedBy', '`flaggedBy` VARCHAR(36)');
  await ensureColumn('dashboard_post_comments', 'flaggedAt', '`flaggedAt` DATETIME');
  await ensureColumn('dashboard_post_comments', 'flagReason', '`flagReason` TEXT');
  await ensureColumn('dashboard_post_comments', 'isPinned', '`isPinned` BOOLEAN DEFAULT 0');
  await ensureColumn('dashboard_post_comments', 'pinnedBy', '`pinnedBy` VARCHAR(36)');
  await ensureColumn('dashboard_post_comments', 'pinnedAt', '`pinnedAt` DATETIME');
  await ensureColumn('dashboard_post_comments', 'isAdminHighlighted', '`isAdminHighlighted` BOOLEAN DEFAULT 0');
  await ensureColumn('dashboard_post_comments', 'adminHighlightedBy', '`adminHighlightedBy` VARCHAR(36)');
  await ensureColumn('dashboard_post_comments', 'adminHighlightedAt', '`adminHighlightedAt` DATETIME');
  await ensureIndex('dashboard_post_comments', 'idx_dashboard_comments_post_pinned_created', '`postId`, `isPinned`, `pinnedAt`, `createdAt`');
  await ensureIndex('dashboard_post_comments', 'idx_dashboard_comments_post_parent_created', '`postId`, `parentCommentId`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS district_feed_posts (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`district\` VARCHAR(100) NOT NULL,
      \`category\` VARCHAR(40) NOT NULL DEFAULT 'Announcement',
      \`title\` VARCHAR(140) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`authorId\` VARCHAR(36) NOT NULL,
      \`authorName\` VARCHAR(150) NOT NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_district_feed_district_created\` (\`district\`, \`createdAt\`),
      INDEX \`idx_district_feed_category_created\` (\`category\`, \`createdAt\`)
    )
  `);
  await ensureIndex('district_feed_posts', 'idx_district_feed_district_category_created', '`district`, `category`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_messages (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`senderAccountId\` VARCHAR(36) NOT NULL,
      \`recipientUserId\` VARCHAR(36) NOT NULL,
      \`subject\` VARCHAR(200) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`isRead\` BOOLEAN DEFAULT 0,
      \`isArchived\` BOOLEAN DEFAULT 0,
      \`isDeleted\` BOOLEAN DEFAULT 0,
      \`senderDeleted\` BOOLEAN DEFAULT 0,
      \`recipientDeleted\` BOOLEAN DEFAULT 0,
      \`deletedAt\` TIMESTAMP NULL,
      \`deletedByAccountId\` VARCHAR(36),
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_messages_sender\` (\`senderAccountId\`),
      INDEX \`idx_messages_recipient\` (\`recipientUserId\`)
    )
  `);

  await ensureColumn('user_messages', 'isArchived', '`isArchived` BOOLEAN DEFAULT 0');
  await ensureColumn('user_messages', 'isDeleted', '`isDeleted` BOOLEAN DEFAULT 0');
  await ensureColumn('user_messages', 'senderDeleted', '`senderDeleted` BOOLEAN DEFAULT 0');
  await ensureColumn('user_messages', 'recipientDeleted', '`recipientDeleted` BOOLEAN DEFAULT 0');
  await ensureColumn('user_messages', 'deletedAt', '`deletedAt` TIMESTAMP NULL');
  await ensureColumn('user_messages', 'deletedByAccountId', '`deletedByAccountId` VARCHAR(36)');
  await ensureColumn('user_messages', 'senderReaction', '`senderReaction` VARCHAR(30)');
  await ensureColumn('user_messages', 'recipientReaction', '`recipientReaction` VARCHAR(30)');
  await ensureColumn('user_messages', 'threadId', '`threadId` VARCHAR(36)');
  await ensureColumn('user_messages', 'threadType', "`threadType` VARCHAR(30) DEFAULT 'direct'");
  await ensureColumn('user_messages', 'threadTitle', '`threadTitle` VARCHAR(200)');
  await ensureColumn('user_messages', 'threadParticipantIds', '`threadParticipantIds` TEXT');
  await ensureColumn('user_messages', 'threadParticipantNames', '`threadParticipantNames` TEXT');
  await ensureColumn('user_messages', 'threadImageUrl', '`threadImageUrl` VARCHAR(500)');
  await ensureColumn('user_messages', 'groupMessageId', '`groupMessageId` VARCHAR(36)');
  await ensureIndex('user_messages', 'idx_messages_recipient_visible_created', '`recipientUserId`, `recipientDeleted`, `isArchived`, `createdAt`');
  await ensureIndex('user_messages', 'idx_messages_sender_visible_created', '`senderAccountId`, `senderDeleted`, `createdAt`');
  await ensureIndex('user_messages', 'idx_messages_recipient_read_created', '`recipientUserId`, `isRead`, `createdAt`');
  await ensureIndex('user_messages', 'idx_messages_unread_visible', '`recipientUserId`, `recipientDeleted`, `isArchived`, `isRead`');
  await ensureIndex('user_messages', 'idx_messages_thread_created', '`senderAccountId`, `recipientUserId`, `createdAt`');
  await ensureIndex('user_messages', 'idx_messages_group_thread_created', '`threadId`, `createdAt`');
  await ensureIndex('user_messages', 'idx_messages_inbox_cursor', '`recipientUserId`, `recipientDeleted`, `isArchived`, `createdAt`, `id`');
  await ensureIndex('user_messages', 'idx_messages_sent_cursor', '`senderAccountId`, `senderDeleted`, `createdAt`, `id`');
  await ensureIndex('user_messages', 'idx_messages_direct_out_cursor', '`senderAccountId`, `recipientUserId`, `senderDeleted`, `createdAt`, `id`');
  await ensureIndex('user_messages', 'idx_messages_direct_in_cursor', '`recipientUserId`, `senderAccountId`, `recipientDeleted`, `isArchived`, `createdAt`, `id`');
  await ensureIndex('user_messages', 'idx_messages_group_participant_cursor', '`threadId`, `senderAccountId`, `recipientUserId`, `createdAt`, `id`');

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
      \`submissionStatus\` VARCHAR(30) NOT NULL DEFAULT 'Submitted',
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_calendar_owner\` (\`ownerAccountId\`),
      INDEX \`idx_calendar_entry_date\` (\`entryDate\`)
    )
  `);
  await ensureColumn('calendar_entries', 'ownerAccountId', '`ownerAccountId` VARCHAR(36)');
  await ensureColumn('calendar_entries', 'details', '`details` JSON');
  await ensureColumn('calendar_entries', 'reviewStatus', "`reviewStatus` VARCHAR(30) NOT NULL DEFAULT 'Pending'");
  await ensureColumn('calendar_entries', 'submissionStatus', "`submissionStatus` VARCHAR(30) NOT NULL DEFAULT 'Submitted'");
  await ensureColumn('calendar_entries', 'reviewNotes', '`reviewNotes` TEXT');
  await ensureColumn('calendar_entries', 'reviewedBy', '`reviewedBy` VARCHAR(36)');
  await ensureColumn('calendar_entries', 'reviewedByName', '`reviewedByName` VARCHAR(150)');
  await ensureColumn('calendar_entries', 'reviewedAt', '`reviewedAt` DATETIME');
  await dropNonPrimaryUniqueIndexes('calendar_entries');
  await ensureIndex('calendar_entries', 'idx_calendar_category_date', '`category`, `entryDate`');
  await ensureIndex('calendar_entries', 'idx_calendar_district_date', '`districtWorked`, `entryDate`');
  await ensureIndex('calendar_entries', 'idx_calendar_owner_date', '`ownerAccountId`, `entryDate`');
  await ensureIndex('calendar_entries', 'idx_calendar_owner_date_updated', '`ownerAccountId`, `entryDate`, `updatedAt`');
  await ensureIndex('calendar_entries', 'idx_calendar_owner_category_submission', '`ownerAccountId`, `category`, `submissionStatus`');
  await ensureIndex('calendar_entries', 'idx_calendar_review_status', '`reviewStatus`, `entryDate`');
  await ensureIndex('calendar_entries', 'idx_calendar_submission_status', '`submissionStatus`, `entryDate`');
  await ensureIndex('calendar_entries', 'idx_calendar_trooper_report', '`category`, `submissionStatus`, `districtWorked`, `entryDate`, `updatedAt`');

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
  await ensureIndex('user_notifications', 'idx_user_notifications_user_created', '`userId`, `createdAt`');
  await ensureIndex('user_notifications', 'idx_user_notifications_user_read_created', '`userId`, `isRead`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS urgent_alerts (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`title\` VARCHAR(160) NOT NULL,
      \`message\` TEXT NOT NULL,
      \`severity\` VARCHAR(30) NOT NULL DEFAULT 'Urgent',
      \`audienceType\` VARCHAR(30) NOT NULL DEFAULT 'everyone',
      \`audienceLabel\` VARCHAR(255),
      \`targetDistrict\` VARCHAR(100),
      \`targetUserIds\` JSON,
      \`requireAcknowledgement\` BOOLEAN DEFAULT 1,
      \`expiresAt\` DATETIME,
      \`createdBy\` VARCHAR(36),
      \`createdByName\` VARCHAR(150),
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_urgent_alerts_created\` (\`createdAt\`),
      INDEX \`idx_urgent_alerts_expires\` (\`expiresAt\`),
      INDEX \`idx_urgent_alerts_audience\` (\`audienceType\`)
    )
  `);
  await ensureIndex('urgent_alerts', 'idx_urgent_alerts_expires_created', '`expiresAt`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS urgent_alert_acknowledgements (
      \`alertId\` VARCHAR(36) NOT NULL,
      \`userId\` VARCHAR(36) NOT NULL,
      \`acknowledgedAt\` DATETIME,
      \`deliveredAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`alertId\`, \`userId\`),
      INDEX \`idx_urgent_alert_ack_user\` (\`userId\`, \`acknowledgedAt\`),
      INDEX \`idx_urgent_alert_ack_alert\` (\`alertId\`, \`acknowledgedAt\`)
    )
  `);
  await ensureIndex('urgent_alert_acknowledgements', 'idx_urgent_alert_ack_pending_user', '`userId`, `acknowledgedAt`, `alertId`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      \`settingKey\` VARCHAR(100) PRIMARY KEY,
      \`settingValue\` MEDIUMTEXT,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await pool.query('ALTER TABLE `system_settings` MODIFY COLUMN `settingValue` MEDIUMTEXT');

  await pool.query(`
    INSERT IGNORE INTO system_settings (\`settingKey\`, \`settingValue\`)
    VALUES ('mileageMilestone', '1000')
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mileage_achievements (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`title\` VARCHAR(120) NOT NULL,
      \`mileage\` DECIMAL(10,2) NOT NULL,
      \`achievementType\` VARCHAR(50) NOT NULL DEFAULT 'mileage',
      \`targetValue\` DECIMAL(10,2) NULL,
      \`targetLabel\` VARCHAR(80),
      \`description\` TEXT,
      \`icon\` VARCHAR(50) NOT NULL DEFAULT 'gauge',
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_mileage_achievements_mileage\` (\`mileage\`)
    )
  `);

  await pool.query(`
    INSERT IGNORE INTO mileage_achievements (\`id\`, \`title\`, \`mileage\`, \`icon\`)
    VALUES ('achievement-mileage-1000', '1,000 Mile Mark', 1000, 'gauge')
  `);
  await ensureColumn('mileage_achievements', 'achievementType', "`achievementType` VARCHAR(50) NOT NULL DEFAULT 'mileage'");
  await ensureColumn('mileage_achievements', 'targetValue', '`targetValue` DECIMAL(10,2) NULL');
  await ensureColumn('mileage_achievements', 'targetLabel', '`targetLabel` VARCHAR(80)');
  await ensureColumn('mileage_achievements', 'description', '`description` TEXT');
  await pool.query("UPDATE mileage_achievements SET `achievementType` = 'mileage', `targetValue` = `mileage`, `targetLabel` = 'miles' WHERE `achievementType` IS NULL OR `achievementType` = ''");

  await pool.query(`
    INSERT IGNORE INTO system_settings (\`settingKey\`, \`settingValue\`)
    VALUES
      ('registrationMode', 'public'),
      ('appBaseUrl', 'http://localhost:3000'),
      ('appName', 'Blueline'),
      ('siteName', 'Blueline Workspace'),
      ('brandLogoDataUrl', ''),
      ('primaryColor', '#1a365d'),
      ('secondaryColor', '#9C865C'),
      ('maintenanceMode', 'false'),
      ('sessionTimeoutMinutes', '0'),
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
    CREATE TABLE IF NOT EXISTS pinned_profiles (
      \`accountId\` VARCHAR(36) NOT NULL,
      \`profileUserId\` VARCHAR(36) NOT NULL,
      \`pinnedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`accountId\`, \`profileUserId\`),
      INDEX \`idx_pinned_profiles_account\` (\`accountId\`, \`pinnedAt\`),
      INDEX \`idx_pinned_profiles_user\` (\`profileUserId\`)
    )
  `);
  await ensureIndex('pinned_profiles', 'idx_pinned_profiles_account_recent', '`accountId`, `pinnedAt`, `profileUserId`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quick_notes (
      \`accountId\` VARCHAR(36) PRIMARY KEY,
      \`content\` TEXT,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`accountId\` VARCHAR(36) NOT NULL,
      \`title\` VARCHAR(90) NOT NULL,
      \`priority\` VARCHAR(20) NOT NULL DEFAULT 'Normal',
      \`notes\` TEXT,
      \`remindOn\` DATE NOT NULL,
      \`remindAt\` DATETIME NULL,
      \`recurrenceRule\` VARCHAR(20) NOT NULL DEFAULT 'none',
      \`notifiedAt\` TIMESTAMP NULL,
      \`completedAt\` TIMESTAMP NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_reminders_account\` (\`accountId\`),
      INDEX \`idx_reminders_due\` (\`remindOn\`, \`completedAt\`, \`notifiedAt\`),
      INDEX \`idx_reminders_completed\` (\`completedAt\`)
    )
  `);
  await ensureColumn('reminders', 'remindOn', '`remindOn` DATE NULL');
  await ensureColumn('reminders', 'remindAt', '`remindAt` DATETIME NULL');
  await ensureColumn('reminders', 'recurrenceRule', "`recurrenceRule` VARCHAR(20) NOT NULL DEFAULT 'none'");
  await ensureColumn('reminders', 'priority', "`priority` VARCHAR(20) NOT NULL DEFAULT 'Normal'");
  await ensureColumn('reminders', 'notes', '`notes` TEXT');
  await ensureColumn('reminders', 'notifiedAt', '`notifiedAt` TIMESTAMP NULL');
  await ensureColumn('reminders', 'sourceType', '`sourceType` VARCHAR(50) NULL');
  await ensureColumn('reminders', 'sourceId', '`sourceId` VARCHAR(80) NULL');
  await ensureColumn('reminders', 'reminderKind', '`reminderKind` VARCHAR(50) NULL');
  await ensureIndex('reminders', 'idx_reminders_account_open_created', '`accountId`, `completedAt`, `createdAt`');
  await ensureIndex('reminders', 'idx_reminders_due_notify', '`accountId`, `completedAt`, `notifiedAt`, `remindOn`, `createdAt`');
  await ensureIndex('reminders', 'idx_reminders_due_time_notify', '`accountId`, `completedAt`, `notifiedAt`, `remindAt`, `createdAt`');
  await ensureIndex('reminders', 'idx_reminders_source', '`accountId`, `sourceType`, `sourceId`, `reminderKind`');

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
  await ensureIndex('performance_evaluations', 'idx_performance_created', '`createdAt`');
  await ensureIndex('performance_evaluations', 'idx_performance_employee_created', '`employeeAccountId`, `createdAt`');
  await ensureIndex('performance_evaluations', 'idx_performance_supervisor_created', '`supervisorAccountId`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`type\` VARCHAR(50) NOT NULL,
      \`assetTag\` VARCHAR(100) NOT NULL UNIQUE,
      \`makeModel\` VARCHAR(150) NOT NULL,
      \`serialNumber\` VARCHAR(150),
      \`assignedTo\` VARCHAR(150),
      \`status\` VARCHAR(50) NOT NULL DEFAULT 'Available',
      \`carrier\` VARCHAR(50) NOT NULL DEFAULT 'Verizon',
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
  await ensureColumn('devices', 'carrier', "`carrier` VARCHAR(50) NOT NULL DEFAULT 'Verizon'");
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
  await ensureIndex('devices', 'idx_devices_updated_asset', '`updatedAt`, `assetTag`');
  await ensureIndex('devices', 'idx_devices_assigned_updated', '`assignedTo`, `updatedAt`, `assetTag`');
  await ensureIndex('devices', 'idx_devices_type_updated_asset', '`type`, `updatedAt`, `assetTag`');
  await ensureIndex('devices', 'idx_devices_status_updated_asset', '`status`, `updatedAt`, `assetTag`');
  await ensureIndex('devices', 'idx_devices_carrier_updated_asset', '`carrier`, `updatedAt`, `assetTag`');
  await ensureIndex('devices', 'idx_devices_model_updated_asset', '`makeModel`, `updatedAt`, `assetTag`');
  await ensureIndex('devices', 'idx_devices_type_status', '`type`, `status`');
  await ensureIndex('devices', 'idx_devices_carrier_type_model', '`carrier`, `type`, `makeModel`');
  await ensureIndex('devices', 'idx_devices_condition', '`condition`');
  await ensureIndex('devices', 'idx_devices_maintenance_asset', '`maintenanceDueDate`, `assetTag`');
  await ensureIndex('devices', 'idx_devices_replacement_asset', '`replacementDueDate`, `assetTag`');

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
  await ensureIndex('device_events', 'idx_device_events_device_created', '`deviceId`, `createdAt`');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS import_jobs (
      \`id\` VARCHAR(36) PRIMARY KEY,
      \`type\` VARCHAR(50) NOT NULL,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'queued',
      \`actorId\` VARCHAR(36),
      \`actorName\` VARCHAR(150),
      \`payloadJson\` LONGTEXT,
      \`resultJson\` MEDIUMTEXT,
      \`processedRows\` INT NOT NULL DEFAULT 0,
      \`totalRows\` INT NOT NULL DEFAULT 0,
      \`error\` TEXT,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      \`completedAt\` DATETIME,
      INDEX \`idx_import_jobs_type_status\` (\`type\`, \`status\`),
      INDEX \`idx_import_jobs_created\` (\`createdAt\`)
    )
  `);
}

