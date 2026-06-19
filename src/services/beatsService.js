const dayjs = require('dayjs');

const {
  getToolItemsForBeats,
  getAllBomLinks,
  getInvoiceQtyForBeats,
  updateToolBatNow
} = require('../repositories/sapRepository');

const {
  getToolBeatsByDate,
  insertToolBeatsMonth,
  deleteToolBeatsByDate,
  getTotalBeatsByTool
} = require('../repositories/mySqlRepository');

const {
  buildFathersByChild,
  resolveBomFathers
} = require('./bomService');

const EXTRA_BEATS = Number(process.env.EXTRA_BEATS || 1.5);

function buildQtyByItem(invoiceRows) {
  const qtyByItem = new Map();

  for (const row of invoiceRows) {
    const itemCode = String(row.item_code || '').trim();

    if (!itemCode) {
      continue;
    }

    qtyByItem.set(itemCode, {
      normal_qty: Number(row.normal_qty || 0),
      fee_qty: Number(row.fee_qty || 0),
      total_qty: Number(row.total_qty || 0)
    });
  }

  return qtyByItem;
}

async function calculateToolBeatsForPeriod(startDate, endDate) {
  const [toolItems, bomLinks, invoiceRows] = await Promise.all([
    getToolItemsForBeats(),
    getAllBomLinks(),
    getInvoiceQtyForBeats(startDate, endDate)
  ]);

  const fathersByChild = buildFathersByChild(bomLinks);
  const qtyByItem = buildQtyByItem(invoiceRows);

  const beatsByTool = new Map();

  for (const item of toolItems) {
    const toolCode = String(item.tool_code || '').trim();
    const printedItem = String(item.printed_item || '').trim();
    const divisor = Number(item.divisor || 0);

    if (!toolCode || !printedItem || divisor <= 0) {
      continue;
    }

    const fathers = resolveBomFathers({
      itemCode: printedItem,
      fathersByChild
    });

    if (fathers.length === 0) {
      continue;
    }

    for (const father of fathers) {
      const fatherItem = String(father.father_item || '').trim();
      const bomQty = Number(father.bom_qty || 0);

      if (!fatherItem || bomQty === 0) {
        continue;
      }

      if (!qtyByItem.has(fatherItem)) {
        continue;
      }

      const qty = qtyByItem.get(fatherItem);

      const calculatedNormalQty = qty.normal_qty * bomQty;
      const calculatedFeeQty = qty.fee_qty * bomQty;
      const calculatedTotalQty = qty.total_qty * bomQty;

      if (calculatedTotalQty === 0) {
        continue;
      }

      const beatsRaw = calculatedTotalQty / divisor;

      if (!beatsByTool.has(toolCode)) {
        beatsByTool.set(toolCode, {
          tool_code: toolCode,
          normal_qty: 0,
          fee_qty: 0,
          total_qty: 0,
          beats_raw: 0
        });
      }

      const current = beatsByTool.get(toolCode);

      current.normal_qty += calculatedNormalQty;
      current.fee_qty += calculatedFeeQty;
      current.total_qty += calculatedTotalQty;
      current.beats_raw += beatsRaw;
    }
  }

  const result = [];

  for (const row of beatsByTool.values()) {
    if (row.beats_raw <= 0) {
      continue;
    }

    result.push({
      ...row,
      beats: Math.ceil(row.beats_raw * (1 + EXTRA_BEATS / 100))
    });
  }

  result.sort((a, b) => a.tool_code.localeCompare(b.tool_code));

  return result;
}

function getPreviousMonthPeriod(date = null) {
  const inputDate = date ? dayjs(date) : dayjs();

  const startDate = inputDate
    .startOf('month')
    .subtract(1, 'month')
    .startOf('month')
    .format('YYYY-MM-DD');

  const endDate = dayjs(startDate)
    .endOf('month')
    .format('YYYY-MM-DD');

  return {
    startDate,
    endDate
  };
}

async function runMonth({ db = false, overwrite = false, date = null, mysqlOnly = false }) {
  const { startDate, endDate } = getPreviousMonthPeriod(date);

  const alreadyDone = await getToolBeatsByDate(startDate);

  if (alreadyDone.length > 0 && db && !overwrite) {
    return {
      ok: false,
      message: `Analisi già eseguita per il mese ${startDate}. Usa overwrite=true per sovrascrivere.`,
      period: { startDate, endDate },
      rows: []
    };
  }

  if (alreadyDone.length > 0 && db && overwrite) {
    await deleteToolBeatsByDate(startDate);
  }

  const rows = await calculateToolBeatsForPeriod(startDate, endDate);

  if (db) {
    await persistMonthlyRows(startDate, rows);

    if (!mysqlOnly) {
      await syncSapBatNowFromMySql();
    }
  }

  return {
    ok: true,
    mode: db ? 'write' : 'simulate',
    period: { startDate, endDate },
    rows
  };
}

async function runHistory({ db = false, from = '2012-01-01', to = null, overwrite = false, mysqlOnly = false }) {
  let month = dayjs(from).startOf('month');

  const lastMonth = to
    ? dayjs(to).startOf('month')
    : dayjs().startOf('month').subtract(1, 'month');

  const summary = [];

  while (month.isBefore(lastMonth) || month.isSame(lastMonth, 'month')) {
    const startDate = month.startOf('month').format('YYYY-MM-DD');
    const endDate = month.endOf('month').format('YYYY-MM-DD');

    const alreadyDone = await getToolBeatsByDate(startDate);

    if (alreadyDone.length > 0 && db && !overwrite) {
      summary.push({
        month: startDate,
        skipped: true,
        reason: 'already_done'
      });

      month = month.add(1, 'month');
      continue;
    }

    if (alreadyDone.length > 0 && db && overwrite) {
      await deleteToolBeatsByDate(startDate);
    }

    const rows = await calculateToolBeatsForPeriod(startDate, endDate);

    if (db) {
      await persistMonthlyRows(startDate, rows);
    }

    summary.push({
      month: startDate,
      skipped: false,
      rows: rows.length
    });

    month = month.add(1, 'month');
  }

  if (db && !mysqlOnly) {
    await syncSapBatNowFromMySql();
  }

  return summary;
}

async function persistMonthlyRows(startDate, rows) {
  for (const row of rows) {
    const beats = Number(row.beats || 0);

    if (beats <= 0) {
      continue;
    }

    await insertToolBeatsMonth({
      tool_id: row.tool_code,
      beats,
      date: startDate
    });
  }
}

async function syncSapBatNowFromMySql() {
  const totals = await getTotalBeatsByTool();

  for (const row of totals) {
    const toolCode = String(row.tool_id || '').trim();
    const totalBeats = Math.ceil(Number(row.total_beats || 0));

    if (!toolCode || totalBeats <= 0) {
      continue;
    }

    await updateToolBatNow(toolCode, totalBeats);
  }
}

module.exports = {
  calculateToolBeatsForPeriod,
  runMonth,
  runHistory,
  syncSapBatNowFromMySql
};
