const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const IS_VERCEL = process.env.VERCEL === '1';
const DB_PATH = IS_VERCEL ? '/tmp/hudumadesk.db' : path.join(__dirname, 'hudumadesk.db');

// We export a proxy that mimics the better-sqlite3 synchronous API
// sql.js is synchronous too, so the API surface is compatible.

let SQL;
let _db;

function getDb() {
  if (_db) return _db;
  throw new Error('Database not initialised yet – call initDb() first');
}

async function initDb() {
  if (_db) return _db;

  SQL = await initSqlJs({
    // Tell sql.js exactly where to find the WASM file.
    // On Vercel the module directory is preserved, so resolve relative to sql.js/dist.
    locateFile: file => require('path').join(require.resolve('sql.js'), '..', '..', 'dist', file)
  });

  // Load from disk if exists, otherwise fresh DB
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(fileBuffer);
  } else {
    _db = new SQL.Database();
  }

  // Persist helper – call after every write so data survives across requests
  _db._persist = function () {
    try {
      const data = _db.export();
      const buf = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buf);
    } catch (e) {
      // /tmp may not be writable in all serverless contexts; ignore gracefully
      console.warn('DB persist warning:', e.message);
    }
  };

  // Wrap sql.js to behave like better-sqlite3
  _db.pragma = function (str) { _db.run(`PRAGMA ${str}`); };

  // better-sqlite3 style: db.prepare(sql).run(...params)  /  .get(...params)  /  .all(...params)
  _db.prepare = function (sql) {
    return {
      run: function (...args) {
        const params = flatten(args);
        _db.run(sql, params);
        _db._persist();
        // Return lastInsertRowid equivalent
        const idRes = _db.exec('SELECT last_insert_rowid() as id');
        const lastInsertRowid = idRes.length ? idRes[0].values[0][0] : null;
        return { lastInsertRowid, changes: 1 };
      },
      get: function (...args) {
        const params = flatten(args);
        const result = _db.exec(sql, params);
        if (!result.length || !result[0].values.length) return undefined;
        return rowToObject(result[0].columns, result[0].values[0]);
      },
      all: function (...args) {
        const params = flatten(args);
        const result = _db.exec(sql, params);
        if (!result.length) return [];
        return result[0].values.map(v => rowToObject(result[0].columns, v));
      }
    };
  };

  // db.exec for DDL
  const origExec = _db.exec.bind(_db);
  _db.execDDL = function (sql) {
    origExec(sql);
    _db._persist();
  };

  // Schema
  _db.execDDL(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      phone       TEXT,
      id_number   TEXT,
      role        TEXT NOT NULL DEFAULT 'citizen',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id   TEXT UNIQUE NOT NULL,
      citizen_id  INTEGER NOT NULL,
      category    TEXT NOT NULL,
      sub_county  TEXT NOT NULL,
      ward        TEXT,
      location    TEXT NOT NULL,
      description TEXT NOT NULL,
      image_path  TEXT,
      priority    TEXT DEFAULT 'Normal',
      status      TEXT NOT NULL DEFAULT 'Pending',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (citizen_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS status_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id  INTEGER NOT NULL,
      old_status  TEXT,
      new_status  TEXT NOT NULL,
      note        TEXT,
      changed_by  INTEGER,
      changed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES requests(id),
      FOREIGN KEY (changed_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      request_id  INTEGER,
      message     TEXT NOT NULL,
      is_read     INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid   TEXT PRIMARY KEY,
      sess  TEXT NOT NULL,
      expired DATETIME NOT NULL
    );
  `);

  seedDatabase();
  return _db;
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function rowToObject(columns, values) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = values[i]; });
  return obj;
}

function flatten(args) {
  // Handle both positional spread and array/object params
  if (args.length === 1 && (Array.isArray(args[0]) || (args[0] !== null && typeof args[0] === 'object'))) {
    const v = args[0];
    if (Array.isArray(v)) return v;
    // Named params – sql.js accepts {$key: val}; convert plain {key:val} 
    const named = {};
    for (const k of Object.keys(v)) named[`@${k}`] = v[k];
    return named;
  }
  return args;
}

// ─── SEED ─────────────────────────────────────────────────────────────────────

function seedDatabase() {
  const adminExists = _db.prepare('SELECT id FROM users WHERE email = ?').get('admin@muranga.go.ke');
  if (adminExists) return;

  const adminHash = bcrypt.hashSync('admin123', 10);
  _db.prepare(`INSERT INTO users (name, email, password, phone, role) VALUES (?, ?, ?, ?, ?)`)
    .run('System Administrator', 'admin@muranga.go.ke', adminHash, '+254700000000', 'admin');

  const citizenHash = bcrypt.hashSync('citizen123', 10);
  const citizenResult = _db.prepare(`INSERT INTO users (name, email, password, phone, id_number, role) VALUES (?, ?, ?, ?, ?, ?)`)
    .run('John Mwangi', 'john@example.com', citizenHash, '+254712345678', '12345678', 'citizen');

  const citizenId = citizenResult.lastInsertRowid;
  const adminId = _db.prepare('SELECT id FROM users WHERE role = ?').get('admin').id;

  const sampleRequests = [
    { ticket: 'MRG-2024-001', citizen: citizenId, category: 'Broken Streetlight', sub_county: 'Kiharu', ward: 'Gakonya', location: "Along Murang'a Town Road", desc: 'Three streetlights along the main road have been out for two weeks causing accidents at night.', status: 'Resolved', priority: 'High' },
    { ticket: 'MRG-2024-002', citizen: citizenId, category: 'Water Issue', sub_county: 'Kangema', ward: 'Rwathia', location: 'Rwathia Estate Block C', desc: 'No water supply for 5 days. Residents are suffering especially children and the elderly.', status: 'In Progress', priority: 'High' },
    { ticket: 'MRG-2024-003', citizen: citizenId, category: 'Garbage Collection', sub_county: 'Kigumo', ward: 'Kigumo', location: 'Kigumo Market Area', desc: 'Garbage has not been collected for 3 weeks. The market area stinks and flies are a health hazard.', status: 'Pending', priority: 'Normal' },
    { ticket: 'MRG-2024-004', citizen: citizenId, category: 'Road Damage', sub_county: 'Kandara', ward: 'Kandara', location: 'Kandara-Muruka Road KM 3', desc: 'Large potholes making road impassable especially for matatus. Several vehicles have been damaged.', status: 'Pending', priority: 'High' },
    { ticket: 'MRG-2024-005', citizen: citizenId, category: 'Sewer Blockage', sub_county: 'Mathioya', ward: 'Gitugi', location: 'Gitugi Trading Centre', desc: 'Sewer is overflowing into the street. Raw sewage is posing serious health risks to residents and traders.', status: 'In Progress', priority: 'Critical' },
  ];

  for (const r of sampleRequests) {
    const res = _db.prepare(`INSERT INTO requests (ticket_id, citizen_id, category, sub_county, ward, location, description, status, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(r.ticket, r.citizen, r.category, r.sub_county, r.ward, r.location, r.desc, r.status, r.priority);
    const reqId = res.lastInsertRowid;
    _db.prepare(`INSERT INTO status_history (request_id, old_status, new_status, note, changed_by) VALUES (?, ?, ?, ?, ?)`).run(reqId, null, 'Pending', 'Request submitted by citizen', citizenId);
    if (r.status === 'In Progress') {
      _db.prepare(`INSERT INTO status_history (request_id, old_status, new_status, note, changed_by) VALUES (?, ?, ?, ?, ?)`).run(reqId, 'Pending', 'In Progress', 'Request assigned to field team', adminId);
    } else if (r.status === 'Resolved') {
      _db.prepare(`INSERT INTO status_history (request_id, old_status, new_status, note, changed_by) VALUES (?, ?, ?, ?, ?)`).run(reqId, 'Pending', 'In Progress', 'Request assigned to field team', adminId);
      _db.prepare(`INSERT INTO status_history (request_id, old_status, new_status, note, changed_by) VALUES (?, ?, ?, ?, ?)`).run(reqId, 'In Progress', 'Resolved', 'Issue resolved and verified on-site', adminId);
    }
  }

  console.log('✅ Database seeded with demo data');
  console.log('   Admin: admin@muranga.go.ke / admin123');
  console.log('   Citizen demo: john@example.com / citizen123');
}

module.exports = { initDb, getDb };
