// server/engine/index.js
const RummyEngineClass = require('./rummy_engine'); // the class file you created (CommonJS)
const { v4: uuidv4 } = require('uuid');

class TableManager {
  constructor() {
    this.tables = new Map(); // tableId -> Table instance (RummyEngine wrapper)
  }

  createTable({ hostUserId, hostDisplayName, gameMode = 'default', targetPoints = 200, disqualify_score = 200 }) {
    const tableId = uuidv4();
    const table = new RummyEngineClass({
      table_id: tableId,
      host_user_id: hostUserId,
      host_display_name: hostDisplayName,
      game_mode: gameMode,
      target_points: targetPoints,
      disqualify_score
    });
    this.tables.set(tableId, table);
    return table;
  }

  getTable(tableId) {
    return this.tables.get(tableId) || null;
  }

  deleteTable(tableId) {
    return this.tables.delete(tableId);
  }

  listTables() {
    return Array.from(this.tables.values());
  }
}

module.exports = new TableManager();
