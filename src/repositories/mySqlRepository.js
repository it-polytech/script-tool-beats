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

module.exports = {
  getToolBeatsByDate,
  insertToolBeatsMonth,
  deleteToolBeatsByDate
};