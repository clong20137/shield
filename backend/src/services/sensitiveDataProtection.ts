import { RowDataPacket } from 'mysql2';
import pool from '../config/database';
import { createPhoneBlindIndex, decryptFieldValue, encryptFieldValue, isEncryptedFieldValue, isFieldEncryptionConfigured } from '../utils/fieldEncryption';

interface SensitiveUserRow extends RowDataPacket {
  id: string;
  personalPhoneNumber: string | null;
  personalPhoneNumberHash: string | null;
  residentialAddress: string | null;
  mailingAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  emergencyContactPhoneHash: string | null;
}

function needsEncryption(value: string | null): boolean {
  return Boolean(value && !isEncryptedFieldValue(value));
}

export async function protectExistingSensitiveUserData(): Promise<number> {
  if (!isFieldEncryptionConfigured()) {
    return 0;
  }

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query<SensitiveUserRow[]>(
      `SELECT
        \`id\`,
        \`personalPhoneNumber\`,
        \`personalPhoneNumberHash\`,
        \`residentialAddress\`,
        \`mailingAddress\`,
        \`emergencyContactName\`,
        \`emergencyContactRelationship\`,
        \`emergencyContactPhone\`,
        \`emergencyContactPhoneHash\`
      FROM users
      WHERE
        COALESCE(\`personalPhoneNumber\`, '') <> ''
        OR COALESCE(\`residentialAddress\`, '') <> ''
        OR COALESCE(\`mailingAddress\`, '') <> ''
        OR COALESCE(\`emergencyContactName\`, '') <> ''
        OR COALESCE(\`emergencyContactRelationship\`, '') <> ''
        OR COALESCE(\`emergencyContactPhone\`, '') <> ''`
    );

    let updatedCount = 0;
    for (const row of rows) {
      const plainPersonalPhone = decryptFieldValue(row.personalPhoneNumber);
      const plainEmergencyPhone = decryptFieldValue(row.emergencyContactPhone);
      const updateNeeded = [
        row.personalPhoneNumber,
        row.residentialAddress,
        row.mailingAddress,
        row.emergencyContactName,
        row.emergencyContactRelationship,
        row.emergencyContactPhone,
      ].some(needsEncryption) ||
        (plainPersonalPhone && !row.personalPhoneNumberHash) ||
        (plainEmergencyPhone && !row.emergencyContactPhoneHash);

      if (!updateNeeded) {
        continue;
      }

      await conn.query(
        `UPDATE users SET
          \`personalPhoneNumber\` = ?,
          \`personalPhoneNumberHash\` = ?,
          \`residentialAddress\` = ?,
          \`mailingAddress\` = ?,
          \`emergencyContactName\` = ?,
          \`emergencyContactRelationship\` = ?,
          \`emergencyContactPhone\` = ?,
          \`emergencyContactPhoneHash\` = ?,
          \`updatedAt\` = \`updatedAt\`
        WHERE \`id\` = ?`,
        [
          encryptFieldValue(plainPersonalPhone),
          createPhoneBlindIndex(plainPersonalPhone),
          encryptFieldValue(decryptFieldValue(row.residentialAddress)),
          encryptFieldValue(decryptFieldValue(row.mailingAddress)),
          encryptFieldValue(decryptFieldValue(row.emergencyContactName)),
          encryptFieldValue(decryptFieldValue(row.emergencyContactRelationship)),
          encryptFieldValue(plainEmergencyPhone),
          createPhoneBlindIndex(plainEmergencyPhone),
          row.id,
        ],
      );
      updatedCount += 1;
    }

    return updatedCount;
  } finally {
    conn.release();
  }
}

