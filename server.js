require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { initDb, getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── ENSURE UPLOAD DIR ──────────────────────────────────────────────────────────
const IS_VERCEL = process.env.VERCEL === '1';
const uploadsDir = IS_VERCEL ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── MULTER CONFIG ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
               allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error('Only images are allowed'));
  }
});

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// In-memory session store (works on both local and Vercel)
app.use(session({
  store: new MemoryStore({ checkPeriod: 86400000 }),
  secret: process.env.SESSION_SECRET || 'hudumadesk_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));

// DB accessor helper used by all route handlers
function db() { return getDb(); }

// ─── CONSTANTS ──────────────────────────────────────────────────────────────────
const SUB_COUNTIES = [
  'Kiharu', 'Kigumo', 'Kandara', 'Mathioya', 'Gatanga', 'Maragwa', 'Kangema'
];

const CATEGORIES = [
  'Broken Streetlight', 'Water Issue', 'Garbage Collection',
  'Road Damage', 'Sewer Blockage', 'Public Health',
  'Environment', 'Public Safety', 'Other'
];

const STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected'];

// Generate ticket ID
function generateTicketId() {
  const year = new Date().getFullYear();
  const count = db().prepare('SELECT COUNT(*) as cnt FROM requests').get().cnt + 1;
  return `MRG-${year}-${String(count).padStart(4, '0')}`;
}

// ─── AUTH MIDDLEWARE ────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ─── PAGE ROUTES ────────────────────────────────────────────────────────────────
const viewsDir = path.join(__dirname, 'views');

app.get('/', (req, res) => res.sendFile(path.join(viewsDir, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(viewsDir, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(viewsDir, 'register.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(viewsDir, 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(viewsDir, 'admin.html')));
app.get('/track', (req, res) => res.sendFile(path.join(viewsDir, 'track.html')));

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────────

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone, id_number } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = db().prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = db().prepare(`
      INSERT INTO users (name, email, password, phone, id_number)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, email.toLowerCase(), hash, phone || null, id_number || null);

    req.session.userId = result.lastInsertRowid;
    req.session.name = name;
    req.session.role = 'citizen';

    res.json({ success: true, message: 'Account created successfully', role: 'citizen' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = db().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    req.session.userId = user.id;
    req.session.name = user.name;
    req.session.role = user.role;

    res.json({ success: true, role: user.role, name: user.name });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// Session check
app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  const user = db().prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?')
    .get(req.session.userId);
  res.json({ authenticated: true, user });
});

// ─── CONSTANTS API ──────────────────────────────────────────────────────────────
app.get('/api/constants', (req, res) => {
  res.json({ sub_counties: SUB_COUNTIES, categories: CATEGORIES, statuses: STATUSES });
});

// ─── REQUEST ROUTES (CITIZEN) ───────────────────────────────────────────────────

// Submit a new request
app.post('/api/requests', requireAuth, upload.single('image'), (req, res) => {
  try {
    const { category, sub_county, ward, location, description, priority } = req.body;

    if (!category || !sub_county || !location || !description) {
      return res.status(400).json({ error: 'Category, sub-county, location and description are required' });
    }

    const ticketId = generateTicketId();
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    const result = db().prepare(`
      INSERT INTO requests (ticket_id, citizen_id, category, sub_county, ward, location, description, image_path, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ticketId, req.session.userId, category, sub_county, ward || null, location, description, imagePath, priority || 'Normal');

    // Log initial status
    db().prepare(`
      INSERT INTO status_history (request_id, new_status, note, changed_by)
      VALUES (?, ?, ?, ?)
    `).run(result.lastInsertRowid, 'Pending', 'Request submitted', req.session.userId);

    // Create notification for admins
    const admins = db().prepare("SELECT id FROM users WHERE role = 'admin'").all();
    const insertNotif = db().prepare(`
      INSERT INTO notifications (user_id, request_id, message)
      VALUES (?, ?, ?)
    `);
    for (const admin of admins) {
      insertNotif.run(admin.id, result.lastInsertRowid,
        `New ${category} request submitted: ${ticketId}`);
    }

    res.json({ success: true, ticketId, requestId: result.lastInsertRowid });
  } catch (err) {
    console.error('Submit request error:', err);
    res.status(500).json({ error: 'Failed to submit request. Please try again.' });
  }
});

// Get citizen's own requests
app.get('/api/requests/my', requireAuth, (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM requests WHERE citizen_id = ?';
  const params = [req.session.userId];

  if (status) { query += ' AND status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const requests = db().prepare(query).all(...params);
  const total = db().prepare(`SELECT COUNT(*) as cnt FROM requests WHERE citizen_id = ?${status ? ' AND status = ?' : ''}`)
    .get(...(status ? [req.session.userId, status] : [req.session.userId])).cnt;

  res.json({ requests, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
});

// Get single request (citizen must own it, or admin)
app.get('/api/requests/:id', requireAuth, (req, res) => {
  const request = db().prepare('SELECT r.*, u.name as citizen_name, u.email as citizen_email FROM requests r JOIN users u ON r.citizen_id = u.id WHERE r.id = ?')
    .get(req.params.id);

  if (!request) return res.status(404).json({ error: 'Request not found' });
  if (req.session.role !== 'admin' && request.citizen_id !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const history = db().prepare(`
    SELECT sh.*, u.name as changed_by_name FROM status_history sh
    LEFT JOIN users u ON sh.changed_by = u.id
    WHERE sh.request_id = ? ORDER BY sh.changed_at ASC
  `).all(req.params.id);

  res.json({ request, history });
});

// Public ticket tracking (no auth needed)
app.get('/api/track/:ticketId', (req, res) => {
  const request = db().prepare(`
    SELECT id, ticket_id, category, sub_county, ward, location, status, priority, created_at, updated_at
    FROM requests WHERE ticket_id = ?
  `).get(req.params.ticketId.toUpperCase());

  if (!request) return res.status(404).json({ error: 'Ticket not found' });

  const history = db().prepare(`
    SELECT sh.new_status, sh.note, sh.changed_at FROM status_history sh
    WHERE sh.request_id = ? ORDER BY sh.changed_at ASC
  `).all(request.id);

  res.json({ request, history });
});

// ─── ADMIN ROUTES ───────────────────────────────────────────────────────────────

// Get all requests
app.get('/api/admin/requests', requireAdmin, (req, res) => {
  const { status, category, sub_county, priority, search, page = 1, limit = 15 } = req.query;
  const offset = (page - 1) * limit;

  let where = [];
  const params = [];

  if (status) { where.push('r.status = ?'); params.push(status); }
  if (category) { where.push('r.category = ?'); params.push(category); }
  if (sub_county) { where.push('r.sub_county = ?'); params.push(sub_county); }
  if (priority) { where.push('r.priority = ?'); params.push(priority); }
  if (search) {
    where.push('(r.ticket_id LIKE ? OR u.name LIKE ? OR r.location LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const query = `
    SELECT r.*, u.name as citizen_name, u.email as citizen_email, u.phone as citizen_phone
    FROM requests r JOIN users u ON r.citizen_id = u.id
    ${whereStr} ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `;

  const requests = db().prepare(query).all(...params, parseInt(limit), parseInt(offset));
  const total = db().prepare(`SELECT COUNT(*) as cnt FROM requests r JOIN users u ON r.citizen_id = u.id ${whereStr}`)
    .get(...params).cnt;

  res.json({ requests, total, page: parseInt(page), totalPages: Math.ceil(total / limit) });
});

// Update request status
app.patch('/api/admin/requests/:id/status', requireAdmin, (req, res) => {
  const { status, note } = req.body;
  if (!status || !STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const request = db().prepare('SELECT * FROM requests WHERE id = ?').get(req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  db().prepare('UPDATE requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, req.params.id);

  db().prepare(`
    INSERT INTO status_history (request_id, old_status, new_status, note, changed_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, request.status, status, note || null, req.session.userId);

  // Notify citizen
  db().prepare(`INSERT INTO notifications (user_id, request_id, message) VALUES (?, ?, ?)`)
    .run(request.citizen_id, request.id,
      `Your request ${request.ticket_id} status updated to: ${status}`);

  res.json({ success: true });
});

// Analytics
app.get('/api/admin/analytics', requireAdmin, (req, res) => {
  const statusCounts = db().prepare(`
    SELECT status, COUNT(*) as count FROM requests GROUP BY status
  `).all();

  const categoryCounts = db().prepare(`
    SELECT category, COUNT(*) as count FROM requests GROUP BY category ORDER BY count DESC
  `).all();

  const subCountyCounts = db().prepare(`
    SELECT sub_county, COUNT(*) as total,
      SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress
    FROM requests GROUP BY sub_county ORDER BY total DESC
  `).all();

  const monthly = db().prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count
    FROM requests WHERE created_at >= date('now', '-6 months')
    GROUP BY month ORDER BY month
  `).all();

  const totals = db().prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress,
      SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) as rejected
    FROM requests
  `).get();

  const recentActivity = db().prepare(`
    SELECT sh.*, r.ticket_id, u.name as changed_by_name
    FROM status_history sh
    JOIN requests r ON sh.request_id = r.id
    LEFT JOIN users u ON sh.changed_by = u.id
    ORDER BY sh.changed_at DESC LIMIT 10
  `).all();

  res.json({ statusCounts, categoryCounts, subCountyCounts, monthly, totals, recentActivity });
});

// Get all citizens
app.get('/api/admin/citizens', requireAdmin, (req, res) => {
  const citizens = db().prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.created_at,
      COUNT(r.id) as total_requests,
      SUM(CASE WHEN r.status = 'Resolved' THEN 1 ELSE 0 END) as resolved
    FROM users u
    LEFT JOIN requests r ON u.id = r.citizen_id
    WHERE u.role = 'citizen'
    GROUP BY u.id ORDER BY u.created_at DESC
  `).all();
  res.json({ citizens });
});

// Export CSV
app.get('/api/admin/export', requireAdmin, (req, res) => {
  const requests = db().prepare(`
    SELECT r.ticket_id, u.name as citizen, u.email, u.phone,
      r.category, r.sub_county, r.ward, r.location, r.description,
      r.priority, r.status, r.created_at, r.updated_at
    FROM requests r JOIN users u ON r.citizen_id = u.id
    ORDER BY r.created_at DESC
  `).all();

  const headers = ['Ticket ID','Citizen','Email','Phone','Category','Sub-County','Ward',
    'Location','Description','Priority','Status','Submitted','Last Updated'];
  const rows = requests.map(r => [
    r.ticket_id, r.citizen, r.email, r.phone || '',
    r.category, r.sub_county, r.ward || '', r.location,
    `"${r.description.replace(/"/g, '""')}"`,
    r.priority, r.status, r.created_at, r.updated_at
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="hudumadesk-requests-${Date.now()}.csv"`);
  res.send(csv);
});

// Notifications
app.get('/api/notifications', requireAuth, (req, res) => {
  const notifs = db().prepare(`
    SELECT n.*, r.ticket_id FROM notifications n
    LEFT JOIN requests r ON n.request_id = r.id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 20
  `).all(req.session.userId);

  const unread = db().prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(req.session.userId).cnt;

  res.json({ notifications: notifs, unread });
});

app.patch('/api/notifications/read', requireAuth, (req, res) => {
  db().prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.session.userId);
  res.json({ success: true });
});

// ─── BOOTSTRAP ───────────────────────────────────────────────────────────────────
// Initialize DB, then start (local) or export (Vercel)
initDb().then(() => {
  if (!process.env.VERCEL) {
    app.listen(PORT, () => {
      console.log(`\n🏛️  HudumaDesk is running at http://localhost:${PORT}`);
      console.log(`   Admin login: admin@muranga.go.ke / admin123`);
      console.log(`   Demo citizen: john@example.com / citizen123\n`);
    });
  }
}).catch(err => {
  console.error('Failed to initialise database:', err);
  process.exit(1);
});

// Export for Vercel serverless
module.exports = app;

