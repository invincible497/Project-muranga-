/* ─── CITIZEN DASHBOARD LOGIC ─────────────────────────────────────────── */

let currentPage = 1;
let allMyRequests = [];
let constants = {};
let currentUser = null;

// ─── INIT ──────────────────────────────────────────────────────────────────────
(async () => {
  currentUser = await requireAuth(false);
  if (!currentUser) return;

  // Populate user info
  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('welcomeName').textContent = currentUser.name.split(' ')[0];
  document.getElementById('sidebarAvatar').textContent = currentUser.name[0].toUpperCase();

  // Load constants
  constants = await api.get('/api/constants');
  populateSelects();

  // Init sidebar + mobile
  initMobileSidebar();
  if (window.innerWidth <= 768) document.getElementById('sidebarToggle').style.display = 'flex';

  // Load overview data
  await loadOverview();
  loadNotifs();

  // Check URL hash for direct navigation
  const hash = window.location.hash.replace('#', '');
  if (hash && ['overview', 'submit', 'requests'].includes(hash)) showSection(hash);

  // Notification bell toggle
  document.getElementById('notifBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('notifDropdown');
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) { markNotifsRead(); setTimeout(loadNotifs, 100); }
  });
  document.addEventListener('click', () => document.getElementById('notifDropdown').classList.remove('open'));
})();

// ─── SECTIONS ─────────────────────────────────────────────────────────────────
function showSection(name) {
  ['overview', 'submit', 'requests'].forEach(s => {
    document.getElementById(`section-${s}`).classList.toggle('hidden', s !== name);
    document.getElementById(`nav-${s}`)?.classList.toggle('active', s === name);
  });

  const titles = {
    overview: ['Overview', `Welcome back, ${currentUser?.name.split(' ')[0] || 'Citizen'}`],
    submit: ['Submit Request', 'Report an issue in your community'],
    requests: ['My Requests', 'Track and manage your submitted requests']
  };
  const [title, sub] = titles[name] || ['Overview', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = sub;

  if (name === 'requests') loadMyRequests();
  window.location.hash = name;
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const data = await api.get('/api/requests/my?limit=50');
    allMyRequests = data.requests;

    const pending = allMyRequests.filter(r => r.status === 'Pending').length;
    const inProgress = allMyRequests.filter(r => r.status === 'In Progress').length;
    const resolved = allMyRequests.filter(r => r.status === 'Resolved').length;

    document.getElementById('stat-total').textContent = data.total;
    document.getElementById('stat-pending').textContent = pending;
    document.getElementById('stat-progress').textContent = inProgress;
    document.getElementById('stat-resolved').textContent = resolved;

    // Pending badge in sidebar
    if (pending > 0) {
      const badge = document.getElementById('pendingCount');
      badge.textContent = pending;
      badge.style.display = 'flex';
    }

    // Recent requests
    renderRecentRequests(allMyRequests.slice(0, 5));

    // Category quick grid
    renderCategoryGrid();
  } catch (err) {
    console.error(err);
    toast.show('Failed to load dashboard data', 'error');
  }
}

function renderRecentRequests(requests) {
  const el = document.getElementById('recentRequestsList');
  if (!requests.length) {
    el.innerHTML = `<div class="empty-state" style="padding:2rem">
      <div class="empty-state-icon">📋</div>
      <h3>No Requests Yet</h3>
      <p>Submit your first service request to get started</p>
      <button class="btn btn-primary btn-sm mt-2" onclick="showSection('submit')">Submit Request</button>
    </div>`;
    return;
  }
  el.innerHTML = requests.map(r => `
    <div class="request-card mb-1" onclick="viewRequest(${r.id})" style="margin-bottom:0.75rem">
      <div class="request-card-header">
        <div>
          <span class="request-ticket">${r.ticket_id}</span>
          <div class="request-category" style="margin-top:0.2rem">${categoryIcon(r.category)} ${r.category}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
          ${statusBadge(r.status)}
          ${priorityBadge(r.priority)}
        </div>
      </div>
      <div class="request-desc">${r.description}</div>
      <div class="request-meta">
        <span>📍 ${r.sub_county}</span>
        <span>🕒 ${timeAgo(r.created_at)}</span>
      </div>
    </div>
  `).join('');
}

function renderCategoryGrid() {
  const cats = ['Broken Streetlight','Water Issue','Garbage Collection','Road Damage','Sewer Blockage','Public Health'];
  document.getElementById('catGrid').innerHTML = cats.map(c => `
    <button class="btn btn-ghost btn-sm" onclick="prefillCategory('${c}')" style="justify-content:flex-start;font-size:0.8rem;gap:0.3rem">
      ${categoryIcon(c)} ${c.split(' ')[0]}
    </button>
  `).join('');
}

function prefillCategory(cat) {
  document.getElementById('category').value = cat;
  showSection('submit');
  setTimeout(() => document.getElementById('category').focus(), 100);
}

// ─── SELECTS ──────────────────────────────────────────────────────────────────
function populateSelects() {
  const catSel = document.getElementById('category');
  constants.categories.forEach(c => {
    catSel.appendChild(new Option(categoryIcon(c) + ' ' + c, c));
  });

  const scSel = document.getElementById('sub_county');
  constants.sub_counties.forEach(sc => {
    scSel.appendChild(new Option(sc, sc));
  });
}

// ─── SUBMIT REQUEST ───────────────────────────────────────────────────────────
const descArea = document.getElementById('description');
descArea.addEventListener('input', () => {
  const len = descArea.value.length;
  document.getElementById('charCount').textContent = len;
  if (len > 1000) descArea.value = descArea.value.slice(0, 1000);
});

// File upload drag-drop
const dropZone = document.getElementById('fileDropZone');
const fileInput = document.getElementById('imageFile');
const imgPreview = document.getElementById('imgPreview');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary-light)'; dropZone.style.background = 'var(--primary-glow)'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; dropZone.style.background = ''; });
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.borderColor = ''; dropZone.style.background = '';
  if (e.dataTransfer.files[0]) handleFileSelect(e.dataTransfer.files[0]);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

function handleFileSelect(file) {
  if (!file.type.startsWith('image/')) { toast.show('Only image files are allowed', 'error'); return; }
  if (file.size > 5 * 1024 * 1024) { toast.show('Image must be under 5MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    imgPreview.src = e.target.result;
    imgPreview.classList.remove('hidden');
    dropZone.querySelector('div:nth-child(2)').textContent = file.name;
  };
  reader.readAsDataURL(file);
}

document.getElementById('requestForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('submitError');
  const btn = document.getElementById('submitRequestBtn');
  errEl.classList.add('hidden');

  const category = document.getElementById('category').value;
  const sub_county = document.getElementById('sub_county').value;
  const location = document.getElementById('location').value.trim();
  const description = document.getElementById('description').value.trim();

  if (!category || !sub_county || !location || !description) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  document.getElementById('submitBtnText').textContent = '⏳ Submitting…';

  try {
    const formData = new FormData();
    formData.append('category', category);
    formData.append('sub_county', sub_county);
    formData.append('ward', document.getElementById('ward').value.trim());
    formData.append('location', location);
    formData.append('description', description);
    formData.append('priority', document.getElementById('priority').value);
    if (fileInput.files[0]) formData.append('image', fileInput.files[0]);

    const data = await api.post('/api/requests', formData, true);

    // Show success modal
    document.getElementById('successTicketId').textContent = data.ticketId;
    document.getElementById('successModal').classList.add('active');

    resetForm();
    await loadOverview();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    document.getElementById('submitBtnText').textContent = '🚀 Submit Request';
  }
});

function resetForm() {
  document.getElementById('requestForm').reset();
  imgPreview.classList.add('hidden');
  imgPreview.src = '';
  dropZone.querySelector('div:nth-child(2)').textContent = 'Drop image here or click to browse';
  document.getElementById('charCount').textContent = '0';
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('active');
  showSection('requests');
}

// ─── MY REQUESTS ──────────────────────────────────────────────────────────────
async function loadMyRequests(page = 1) {
  currentPage = page;
  const statusFilter = document.getElementById('statusFilter').value;

  let url = `/api/requests/my?page=${page}&limit=10`;
  if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

  try {
    const data = await api.get(url);
    renderRequestsList(data.requests);
    document.getElementById('requestCount').textContent =
      `${data.total} request${data.total !== 1 ? 's' : ''}`;
    renderPagination(
      document.getElementById('requestsPagination'),
      data.page, data.totalPages,
      (p) => loadMyRequests(p)
    );
  } catch {
    toast.show('Failed to load requests', 'error');
  }
}

function filterRequests() {
  loadMyRequests(1);
}

function renderRequestsList(requests) {
  const el = document.getElementById('requestsList');
  if (!requests.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📭</div>
      <h3>No Requests Found</h3>
      <p>Try changing filters or submit a new request</p>
      <button class="btn btn-primary btn-sm mt-2" onclick="showSection('submit')">Submit Request</button>
    </div>`;
    return;
  }
  el.innerHTML = requests.map(r => `
    <div class="request-card" onclick="viewRequest(${r.id})" style="margin-bottom:0.75rem">
      <div class="request-card-header">
        <div>
          <span class="request-ticket">${r.ticket_id}</span>
          <div class="request-category" style="margin-top:0.2rem">${categoryIcon(r.category)} ${r.category}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
          ${statusBadge(r.status)}
          ${priorityBadge(r.priority)}
        </div>
      </div>
      <div class="request-desc">${r.description}</div>
      <div class="request-meta">
        <span>📍 ${r.sub_county}${r.ward ? ' · ' + r.ward : ''}</span>
        <span>📌 ${r.location}</span>
        <span>🕒 ${timeAgo(r.created_at)}</span>
        ${r.image_path ? '<span>📷 Photo attached</span>' : ''}
      </div>
    </div>
  `).join('');
}

// ─── VIEW REQUEST MODAL ────────────────────────────────────────────────────────
async function viewRequest(id) {
  try {
    const { request, history } = await api.get(`/api/requests/${id}`);
    document.getElementById('modalTicket').textContent = request.ticket_id;
    document.getElementById('modalCategory').textContent = categoryIcon(request.category) + ' ' + request.category;

    document.getElementById('modalContent').innerHTML = `
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.5rem">
        ${statusBadge(request.status)}
        ${priorityBadge(request.priority)}
      </div>

      <div class="grid-2" style="margin-bottom:1.25rem;gap:0.75rem">
        <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius)">
          <div style="font-size:0.75rem;color:var(--text-faint);margin-bottom:0.3rem">Sub-County</div>
          <div style="font-weight:600">📍 ${request.sub_county}${request.ward ? ' — ' + request.ward : ''}</div>
        </div>
        <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius)">
          <div style="font-size:0.75rem;color:var(--text-faint);margin-bottom:0.3rem">Submitted</div>
          <div style="font-weight:600">🕒 ${fmtDate(request.created_at)}</div>
        </div>
        <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius);grid-column:span 2">
          <div style="font-size:0.75rem;color:var(--text-faint);margin-bottom:0.3rem">Location</div>
          <div style="font-weight:600">📌 ${request.location}</div>
        </div>
      </div>

      <div style="margin-bottom:1.25rem">
        <div style="font-size:0.8rem;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">Description</div>
        <div style="font-size:0.9rem;line-height:1.7;color:var(--text-muted)">${request.description}</div>
      </div>

      ${request.image_path ? `
        <div style="margin-bottom:1.25rem">
          <div style="font-size:0.8rem;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">📷 Attached Photo</div>
          <img src="${request.image_path}" alt="Request photo" class="img-preview" style="max-height:250px;cursor:pointer" onclick="window.open('${request.image_path}','_blank')">
        </div>
      ` : ''}

      <div>
        <div style="font-size:0.8rem;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:1rem">📜 Status Timeline</div>
        <div class="timeline">
          ${history.map((h, i) => `
            <div class="timeline-item ${i === history.length - 1 ? 'current' : ''}">
              <div class="timeline-time">${fmtDate(h.changed_at)}</div>
              <div class="timeline-status">${statusBadge(h.new_status)} ${h.changed_by_name ? '· by ' + h.changed_by_name : ''}</div>
              ${h.note ? `<div class="timeline-note">💬 ${h.note}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('requestModal').classList.add('active');
  } catch (err) {
    toast.show('Failed to load request details', 'error');
  }
}

function closeModal() {
  document.getElementById('requestModal').classList.remove('active');
}

// Close modal on overlay click
document.getElementById('requestModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('successModal').addEventListener('click', function(e) {
  if (e.target === this) closeSuccessModal();
});

// Notification loader
function loadNotifs() {
  loadNotifications(
    document.getElementById('notifDot'),
    document.getElementById('notifDropdown')
  );
}
