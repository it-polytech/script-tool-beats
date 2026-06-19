const mysql = require('mysql2/promise');
require('dotenv').config();

const appPool = mysql.createPool({
  host: process.env.APP_DB_HOST,
  user: process.env.APP_DB_USER,
  password: process.env.APP_DB_PASSWORD,
  database: process.env.APP_DB_DATABASE,
  port: Number(process.env.APP_DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10
});

async function closeAppPool() {
  await appPool.end();
}

module.exports = {
  appPool,
  closeAppPool
};