const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'ironpulse.db');
const schemaPath = path.join(__dirname, 'schema.sql');

// Initialize better-sqlite3 connection
const db = new Database(dbPath, {
  verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Enforce foreign key constraints and WAL performance mode
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Auto-initialize schema if tables do not exist
function initSchema() {
  try {
    const tableCheck = db.prepare("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name='users'").get();
    if (tableCheck.count === 0) {
      console.log('🔄 Initializing database schema from schema.sql...');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      db.exec(schemaSql);
      console.log('✅ Database schema initialized successfully.');
    }
  } catch (err) {
    console.error('❌ Failed to initialize database schema:', err);
    throw err;
  }
}

initSchema();

module.exports = db;
