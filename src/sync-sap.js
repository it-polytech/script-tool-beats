require('dotenv').config();

const { syncSapBatNowFromMySql } = require('./services/beatsService');
const { closeSapPool } = require('./db/sap');
const { closeAppPool } = require('./db/mySql');

async function main() {
  console.log('Avvio sincronizzazione SAP da cumulato MySQL');

  await syncSapBatNowFromMySql();

  console.log(JSON.stringify({
    ok: true,
    mode: 'sync-sap'
  }, null, 2));
}

main()
  .catch(error => {
    console.error('Errore:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSapPool();
    await closeAppPool();
  });
