const sql = require('mssql');
require('dotenv').config();

const sapConfig = {
  user: process.env.SAP_DB_USER,
  password: process.env.SAP_DB_PASSWORD,
  server: process.env.SAP_DB_SERVER,
  database: process.env.SAP_DB_DATABASE,
  port: Number(process.env.SAP_DB_PORT || 1433),
  options: {
    encrypt: process.env.SAP_DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.SAP_DB_TRUST_CERT === 'true'
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  requestTimeout: 300000
};

let pool;

async function getSapPool() {
  if (!pool) {
    pool = await sql.connect(sapConfig);
  }

  return pool;
}

async function closeSapPool() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

module.exports = {
  sql,
  getSapPool,
  closeSapPool
};