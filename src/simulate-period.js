require('dotenv').config();

const { calculateToolBeatsForPeriod } = require('./services/beatsService');
const { closeSapPool } = require('./db/sap');
const { closeAppPool } = require('./db/mySql');

function getArg(name, defaultValue = null) {
  const prefix = `--${name}=`;
  const arg = process.argv.find(value => value.startsWith(prefix));

  if (!arg) {
    return defaultValue;
  }

  return arg.slice(prefix.length);
}

async function main() {
  const startDate = getArg('start');
  const endDate = getArg('end');

  if (!startDate || !endDate) {
    throw new Error('Parametri obbligatori: --start=YYYY-MM-DD --end=YYYY-MM-DD');
  }

  const rows = await calculateToolBeatsForPeriod(startDate, endDate);

  console.log(JSON.stringify({
    ok: true,
    startDate,
    endDate,
    rows
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