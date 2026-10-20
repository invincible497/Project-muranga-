const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const IS_VERCEL = process.env.VERCEL === '1';
const DB_PATH = IS_VERCEL ? '/tmp/hudumadesk.db' : path.join(__dirname, 'hudumadesk.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ────────────────────────────────────────────────────────────────────

db.exec(`
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
`);

// ─── SEED DATA ──────────────────────────────────────────────────────────────────

function seedDatabase() {
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@muranga.go.ke');

  if (!adminExists) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (name, email, password, phone, role)
      VALUES (?, ?, ?, ?, ?)
    `).run('System Administrator', 'admin@muranga.go.ke', adminHash, '+254700000000', 'admin');

    // Seed a demo citizen
    const citizenHash = bcrypt.hashSync('citizen123', 10);
    const citizenResult = db.prepare(`
      INSERT INTO users (name, email, password, phone, id_number, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('John Mwangi', 'john@example.com', citizenHash, '+254712345678', '12345678', 'citizen');

    const citizenId = citizenResult.lastInsertRowid;
    const adminId = db.prepare('SELECT id FROM users WHERE role = ?').get('admin').id;

    // Seed sample requests
    const sampleRequests = [
      {
        ticket: 'MRG-2024-001', citizen: citizenId, category: 'Broken Streetlight',
        sub_county: 'Kiharu', ward: 'Gakonya', location: 'Along Murang\'a Town Road',
        desc: 'Three streetlights along the main road have been out for two weeks causing accidents at night.',
        status: 'Resolved', priority: 'High'
      },
      {
        ticket: 'MRG-2024-002', citizen: citizenId, category: 'Water Issue',
        sub_county: 'Kangema', ward: 'Rwathia', location: 'Rwathia Estate Block C',
        desc: 'No water supply for 5 days. Residents are suffering especially children and the elderly.',
        status: 'In Progress', priority: 'High'
      },
      {
        ticket: 'MRG-2024-003', citizen: citizenId, category: 'Garbage Collection',
        sub_county: 'Kigumo', ward: 'Kigumo', location: 'Kigumo Market Area',
        desc: 'Garbage has not been collected for 3 weeks. The market area stinks and flies are a health hazard.',
        status: 'Pending', priority: 'Normal'
      },
      {
        ticket: 'MRG-2024-004', citizen: citizenId, category: 'Road Damage',
        sub_county: 'Kandara', ward: 'Kandara', location: 'Kandara-Muruka Road KM 3',
        desc: 'Large potholes making road impassable especially for matatus. Several vehicles have been damaged.',
        status: 'Pending', priority: 'High'
      },
      {
        ticket: 'MRG-2024-005', citizen: citizenId, category: 'Sewer Blockage',
        sub_county: 'Mathioya', ward: 'Gitugi', location: 'Gitugi Trading Centre',
        desc: 'Sewer is overflowing into the street. Raw sewage is posing serious health risks to residents and traders.',
        status: 'In Progress', priority: 'Critical'
      },
    ];

    const insertRequest = db.prepare(`
      INSERT INTO requests (ticket_id, citizen_id, category, sub_county, ward, location, description, status, priority)
      VALUES (@ticket, @citizen, @category, @sub_county, @ward, @location, @desc, @status, @priority)
    `);

    const insertHistory = db.prepare(`
      INSERT INTO status_history (request_id, old_status, new_status, note, changed_by)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const r of sampleRequests) {
      const result = insertRequest.run(r);
      const reqId = result.lastInsertRowid;
      insertHistory.run(reqId, null, 'Pending', 'Request submitted by citizen', citizenId);

      if (r.status === 'In Progress') {
        insertHistory.run(reqId, 'Pending', 'In Progress', 'Request assigned to field team', adminId);
      } else if (r.status === 'Resolved') {
        insertHistory.run(reqId, 'Pending', 'In Progress', 'Request assigned to field team', adminId);
        insertHistory.run(reqId, 'In Progress', 'Resolved', 'Issue resolved and verified on-site', adminId);
      }
    }

    console.log('✅ Database seeded with demo data');
    console.log('   Admin: admin@muranga.go.ke / admin123');
    console.log('   Citizen demo: john@example.com / citizen123');
  }
}

seedDatabase();

module.exports = db;
