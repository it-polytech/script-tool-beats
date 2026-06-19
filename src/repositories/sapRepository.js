const { sql, getSapPool } = require('../db/sap');

async function getToolItemsForBeats() {
  const pool = await getSapPool();

  const result = await pool.request().query(`
    SELECT
        CAST(T.U_POL_TOOL AS nvarchar(100)) AS tool_code,
        CAST(RI.U_POL_ITEM AS nvarchar(100)) AS printed_item,
        TRY_CONVERT(decimal(19,6), NULLIF(RI.U_POL_ITEM_MOLT, '')) AS item_molt,
        TRY_CONVERT(decimal(19,6), NULLIF(RI.U_POL_ITEM_CAV, '')) AS item_cav,
        TRY_CONVERT(decimal(19,6), NULLIF(RI.U_POL_ITEM_MOLT, ''))
        * TRY_CONVERT(decimal(19,6), NULLIF(RI.U_POL_ITEM_CAV, '')) AS divisor
    FROM [@POL_TOOL_HEADER] T
    INNER JOIN [@POL_TOOL_ROW_ITEM] RI
        ON RI.DocEntry = T.DocEntry
    WHERE T.U_POL_TOOL IS NOT NULL
      AND ISNULL(TRY_CONVERT(decimal(19,6), NULLIF(RI.U_POL_ITEM_MOLT, '')), 0)
        * ISNULL(TRY_CONVERT(decimal(19,6), NULLIF(RI.U_POL_ITEM_CAV, '')), 0) <> 0
  `);

  return result.recordset;
}

async function getAllBomLinks() {
  const pool = await getSapPool();

  const result = await pool.request().query(`
    SELECT
        CAST(Father AS nvarchar(100)) AS father_item,
        CAST(Code AS nvarchar(100)) AS child_item,
        ISNULL(TRY_CONVERT(decimal(19,6), Quantity), 0) AS quantity
    FROM ITT1
    WHERE Father IS NOT NULL
      AND Code IS NOT NULL
  `);

  return result.recordset;
}

async function getInvoiceQtyForBeats(startDate, endDate) {
  const pool = await getSapPool();

  const request = pool.request();
  request.input('StartDate', sql.Date, startDate);
  request.input('EndDate', sql.Date, endDate);

  const result = await request.query(`
    WITH normal_sales AS (
        SELECT
            CAST(PCH1.ItemCode AS nvarchar(100)) AS item_code,
            SUM(TRY_CONVERT(decimal(19,6), PCH1.Quantity)) AS normal_qty
        FROM OPCH
        INNER JOIN PCH1
            ON PCH1.DocEntry = OPCH.DocEntry
        WHERE OPCH.CANCELED = 'N'
          AND OPCH.DocDate >= @StartDate
          AND OPCH.DocDate <= @EndDate
        GROUP BY
            PCH1.ItemCode
    ),

    fee_sales AS (
        SELECT
            x.item_code,
            SUM(x.qty) AS fee_qty
        FROM (
            SELECT
                CAST(INV1.U_POL_REAL_ITEM AS nvarchar(100)) AS item_code,
                SUM(TRY_CONVERT(decimal(19,6), INV1.Quantity)) AS qty
            FROM OINV
            INNER JOIN INV1
                ON INV1.DocEntry = OINV.DocEntry
            WHERE OINV.CANCELED = 'N'
              AND INV1.ItemCode = 'SERV50'
              AND OINV.DocDate >= @StartDate
              AND OINV.DocDate <= @EndDate
              AND NULLIF(INV1.U_POL_REAL_ITEM, '') IS NOT NULL
            GROUP BY
                INV1.U_POL_REAL_ITEM

            UNION ALL

            SELECT
                CAST(INV1.U_POL_FEES_ART AS nvarchar(100)) AS item_code,
                SUM(TRY_CONVERT(decimal(19,6), INV1.Quantity)) AS qty
            FROM OINV
            INNER JOIN INV1
                ON INV1.DocEntry = OINV.DocEntry
            WHERE OINV.CANCELED = 'N'
              AND INV1.ItemCode = 'SERV50'
              AND OINV.DocDate >= @StartDate
              AND OINV.DocDate <= @EndDate
              AND NULLIF(INV1.U_POL_FEES_ART, '') IS NOT NULL
            GROUP BY
                INV1.U_POL_FEES_ART
        ) x
        GROUP BY
            x.item_code
    )

    SELECT
        COALESCE(ns.item_code, fs.item_code) AS item_code,
        ISNULL(ns.normal_qty, 0) AS normal_qty,
        ISNULL(fs.fee_qty, 0) AS fee_qty,
        ISNULL(ns.normal_qty, 0) + ISNULL(fs.fee_qty, 0) AS total_qty
    FROM normal_sales ns
    FULL OUTER JOIN fee_sales fs
        ON fs.item_code = ns.item_code
    WHERE ISNULL(ns.normal_qty, 0) <> 0
       OR ISNULL(fs.fee_qty, 0) <> 0
  `);

  return result.recordset;
}

async function getToolState(toolCode) {
  const pool = await getSapPool();

  const result = await pool.request()
    .input('ToolCode', sql.NVarChar, toolCode)
    .query(`
      SELECT TOP 1
          CAST(U_POL_TOOL AS nvarchar(100)) AS tool_code,
          U_POL_BAT_NOW,
          U_POL_BAT_COUNTER,
          U_POL_BAT_COUNTER_DATE
      FROM [@POL_TOOL_HEADER]
      WHERE CAST(U_POL_TOOL AS nvarchar(100)) = @ToolCode
    `);

  return result.recordset[0] || null;
}

async function updateToolBatNow(toolCode, batNow) {
  const pool = await getSapPool();
  const batNowValue = String(Math.ceil(Number(batNow || 0)));

  await pool.request()
    .input('ToolCode', sql.NVarChar, toolCode)
    .input('BatNow', sql.NVarChar, batNowValue)
    .query(`
      UPDATE [@POL_TOOL_HEADER]
      SET U_POL_BAT_NOW = @BatNow
      WHERE CAST(U_POL_TOOL AS nvarchar(100)) = @ToolCode
    `);
}

module.exports = {
  getToolItemsForBeats,
  getAllBomLinks,
  getInvoiceQtyForBeats,
  getToolState,
  updateToolBatNow
};
