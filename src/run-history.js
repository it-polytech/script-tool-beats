require('dotenv').config();

const { runHistory } = require('./services/beatsService');
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

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const write = hasFlag('write');
  const overwrite = hasFlag('overwrite');
  const mysqlOnly = hasFlag('mysql-only');

  const from = getArg('from', '2012-01-01');
  const to = getArg('to', null);

  console.log('Avvio storico battute');
  console.log('Modalità:', write ? 'SCRITTURA' : 'SIMULAZIONE');
  console.log('Da:', from);
  console.log('A:', to || 'mese precedente');
  console.log('Overwrite:', overwrite ? 'SI' : 'NO');
  console.log('Solo MySQL:', mysqlOnly ? 'SI' : 'NO');

  const result = await runHistory({
    db: write,
    from,
    to,
    overwrite,
    mysqlOnly
  });

  console.log(JSON.stringify(result, null, 2));
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
