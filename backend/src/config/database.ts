import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shield',
  port: parseInt(process.env.DB_PORT || '3306'),
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '25', 10),
  queueLimit: parseInt(process.env.DB_QUEUE_LIMIT || '200', 10),
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

export default pool;
