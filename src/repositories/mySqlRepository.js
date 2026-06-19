const { appPool } = require('../db/mySql');

async function getToolBeatsByDate(date) {
  const [rows] = await appPool.query(
    `SELECT * FROM tool_beats_month WHERE date = ?`,
    [date]
  );

  return rows;
}

async function insertToolBeatsMonth(data) {
  await appPool.query(
    `
    INSERT INTO tool_beats_month
        (tool_id, beats, date)
    VALUES
        (?, ?, ?)
    `,
    [data.tool_id, data.beats, data.date]
  );
}

async function deleteToolBeatsByDate(date) {
  await appPool.query(
    `DELETE FROM tool_beats_month WHERE date = ?`,
    [date]
  );
}

async function getTotalBeatsByTool() {
  const [rows] = await appPool.query(`
    SELECT
        tool_id,
        SUM(beats) AS total_beats
    FROM tool_beats_month
    GROUP BY tool_id
    HAVING SUM(beats) > 0
  `);

  return rows;
}

module.exports = {
  getToolBeatsByDate,
  insertToolBeatsMonth,
  deleteToolBeatsByDate,
  getTotalBeatsByTool
};
