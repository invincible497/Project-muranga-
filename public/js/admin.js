/* ─── ADMIN DASHBOARD LOGIC ───────────────────────────────────────────── */

let constants = {};
let analyticsData = null;
let charts = {};
let adminCurrentPage = 1;

// Chart.js global defaults
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Plus Jakarta Sans', 'Inter', sans-serif";

// ─── INIT ──────────────────────────────────────────────────────────────────────
(async () => {
  const user = await requireAdmin();
  if (!user) return;

  document.getElementById('sidebarName').textContent = user.name;
  document.getElementById('sidebarAvatar').textContent = user.name[0].toUpperCase();

  constants = await api.get('/api/constants');
  populateFilters();

  initMobileSidebar();
  if (window.innerWidth <= 768) document.getElementById('sidebarToggle').style.display = 'flex';

  await loadOverview();
  loadNotifs();

  // Notification bell
  document.getElementById('notifBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('notifDropdown');
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) { markNotifsRead(); setTimeout(loadNotifs, 100); }
  });
  document.addEventListener('click', () => document.getElementById('notifDropdown').classList.remove('open'));
})();

// ─── SECTION NAVIGATOR ────────────────────────────────────────────────────────
function showSection(name) {
  ['overview', 'requests', 'analytics', 'citizens'].forEach(s => {
    document.getElementById(`section-${s}`)?.classList.toggle('hidden', s !== name);
    document.getElementById(`nav-${s}`)?.classList.toggle('active', s === name);
  });

  const titles = {
    overview: ['Admin Overview', 'Murang\'a County Service Request Management'],
    requests: ['All Requests', 'Review and manage citizen service requests'],
    analytics: ['Analytics', 'Insights and performance metrics'],
    citizens: ['Citizens', 'Registered citizen accounts'],
  };
  const [title, sub] = titles[name] || ['Admin Overview', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = sub;

  if (name === 'requests') loadAdminRequests();
  if (name === 'analytics') loadAnalytics();
  if (name === 'citizens') loadCitizens();
}

// ─── POPULATE FILTERS ─────────────────────────────────────────────────────────
function populateFilters() {
  const catSel = document.getElementById('adminCategoryFilter');
  constants.categories.forEach(c => catSel.appendChild(new Option(c, c)));

  const scSel = document.getElementById('adminSubCountyFilter');
  constants.sub_counties.forEach(sc => scSel.appendChild(new Option(sc, sc)));
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const data = await api.get('/api/admin/analytics');
    analyticsData = data;

    const t = data.totals;
    document.getElementById('stat-total').textContent = t.total;
    document.getElementById('stat-pending').textContent = t.pending;
    document.getElementById('stat-progress').textContent = t.in_progress;
    document.getElementById('stat-resolved').textContent = t.resolved;
    document.getElementById('stat-rejected').textContent = t.rejected;

    if (t.pending > 0) {
      const b = document.getElementById('pendingBadge');
      b.textContent = t.pending; b.style.display = 'flex';
    }

    renderStatusChart(data);
    renderSubCountyChart(data);
    renderRecentActivity(data.recentActivity);
  } catch (err) {
    console.error(err);
    toast.show('Failed to load analytics', 'error');
  }
}

function renderStatusChart(data) {
  const ctx = document.getElementById('statusChart');
  if (!ctx) return;
  if (charts.status) charts.status.destroy();

  const labels = data.statusCounts.map(s => s.status);
  const counts = data.statusCounts.map(s => s.count);
  const colors = {
    'Pending': '#f59e0b', 'In Progress': '#3b82f6',
    'Resolved': '#10b981', 'Rejected': '#ef4444'
  };

  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: labels.map(l => colors[l] || '#64748b'),
        borderWidth: 3,
        borderColor: '#111827',
        hoverBorderColor: '#1e2d3d',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { padding: 16, usePointStyle: true } },
        tooltip: { callbacks: {
          label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${Math.round(ctx.parsed/counts.reduce((a,b)=>a+b,0)*100)}%)`
        }}
      },
      cutout: '65%',
    }
  });
}

function renderSubCountyChart(data) {
  const ctx = document.getElementById('subCountyChart');
  if (!ctx) return;
  if (charts.subCounty) charts.subCounty.destroy();

  const sorted = [...data.subCountyCounts].sort((a, b) => b.total - a.total);
  charts.subCounty = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(s => s.sub_county),
      datasets: [
        { label: 'Pending', data: sorted.map(s => s.pending), backgroundColor: 'rgba(245,158,11,0.7)', borderRadius: 4 },
        { label: 'In Progress', data: sorted.map(s => s.in_progress), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 4 },
        { label: 'Resolved', data: sorted.map(s => s.resolved), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { padding: 12, usePointStyle: true } } },
      scales: {
        x: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { font: { size: 11 } } },
        y: { stacked: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { precision: 0 } }
      }
    }
  });
}

function renderRecentActivity(activity) {
  const el = document.getElementById('recentActivityList');
  if (!activity.length) {
    el.innerHTML = '<div class="empty-state" style="padding:2rem"><div>No recent activity</div></div>';
    return;
  }
  el.innerHTML = `<div class="table-wrap" style="border:none">
    <table>
      <thead><tr><th>Ticket</th><th>Change</th><th>By</th><th>When</th></tr></thead>
      <tbody>
        ${activity.map(a => `
          <tr>
            <td class="ticket-cell">${a.ticket_id}</td>
            <td>
              ${a.old_status ? `<span style="color:var(--text-faint)">${a.old_status}</span> → ` : ''}
              ${statusBadge(a.new_status)}
            </td>
            <td style="font-size:0.82rem">${a.changed_by_name || 'System'}</td>
            <td style="font-size:0.82rem;color:var(--text-faint)">${timeAgo(a.changed_at)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
}

// ─── ADMIN REQUESTS TABLE ─────────────────────────────────────────────────────
async function loadAdminRequests(page = 1) {
  adminCurrentPage = page;
  const status = document.getElementById('adminStatusFilter').value;
  const category = document.getElementById('adminCategoryFilter').value;
  const sub_county = document.getElementById('adminSubCountyFilter').value;
  const priority = document.getElementById('adminPriorityFilter').value;
  const search = document.getElementById('adminSearch').value.trim();

  let url = `/api/admin/requests?page=${page}&limit=15`;
  if (status) url += `&status=${encodeURIComponent(status)}`;
  if (category) url += `&category=${encodeURIComponent(category)}`;
  if (sub_county) url += `&sub_county=${encodeURIComponent(sub_county)}`;
  if (priority) url += `&priority=${encodeURIComponent(priority)}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;

  try {
    const data = await api.get(url);
    renderAdminTable(data.requests);
    document.getElementById('adminReqCount').textContent =
      `${data.total} request${data.total !== 1 ? 's' : ''}`;
    renderPagination(
      document.getElementById('adminPagination'),
      data.page, data.totalPages,
      (p) => loadAdminRequests(p)
    );
  } catch {
    toast.show('Failed to load requests', 'error');
  }
}

function filterAdminRequests() {
  loadAdminRequests(1);
}

function renderAdminTable(requests) {
  const tbody = document.getElementById('adminRequestsTable');
  if (!requests.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:var(--text-faint)">No requests found</td></tr>`;
    return;
  }
  tbody.innerHTML = requests.map(r => `
    <tr>
      <td class="ticket-cell">${r.ticket_id}</td>
      <td>
        <div style="font-weight:600;font-size:0.85rem">${r.citizen_name}</div>
        <div style="font-size:0.75rem;color:var(--text-faint)">${r.citizen_email}</div>
      </td>
      <td><span>${categoryIcon(r.category)}</span> <span style="font-size:0.85rem">${r.category}</span></td>
      <td style="font-size:0.85rem">${r.sub_county}</td>
      <td>${priorityBadge(r.priority)}</td>
      <td>${statusBadge(r.status)}</td>
      <td style="font-size:0.8rem;color:var(--text-faint)">${timeAgo(r.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="openAdminModal(${r.id})">View / Update</button>
      </td>
    </tr>
  `).join('');
}

// ─── ADMIN REQUEST MODAL ───────────────────────────────────────────────────────
async function openAdminModal(id) {
  try {
    const { request, history } = await api.get(`/api/requests/${id}`);
    document.getElementById('currentRequestId').value = id;
    document.getElementById('adminModalTicket').textContent = request.ticket_id;
    document.getElementById('adminModalCategory').textContent = categoryIcon(request.category) + ' ' + request.category;
    document.getElementById('newStatus').value = request.status;
    document.getElementById('statusNote').value = '';

    document.getElementById('adminModalContent').innerHTML = `
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1.25rem">
        ${statusBadge(request.status)}
        ${priorityBadge(request.priority)}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:1.25rem">
        <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius)">
          <div style="font-size:0.72rem;color:var(--text-faint)">Citizen</div>
          <div style="font-weight:600;font-size:0.88rem">${request.citizen_name}</div>
          <div style="font-size:0.75rem;color:var(--text-faint)">${request.citizen_email}</div>
        </div>
        <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius)">
          <div style="font-size:0.72rem;color:var(--text-faint)">Sub-County</div>
          <div style="font-weight:600;font-size:0.88rem">${request.sub_county}${request.ward ? ' · ' + request.ward : ''}</div>
        </div>
        <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius)">
          <div style="font-size:0.72rem;color:var(--text-faint)">Submitted</div>
          <div style="font-weight:600;font-size:0.82rem">${fmtDate(request.created_at)}</div>
        </div>
      </div>

      <div style="background:var(--surface);padding:0.75rem;border-radius:var(--radius);margin-bottom:1.25rem">
        <div style="font-size:0.72rem;color:var(--text-faint);margin-bottom:0.3rem">Location</div>
        <div style="font-weight:600;font-size:0.88rem">📌 ${request.location}</div>
      </div>

      <div style="margin-bottom:1.25rem">
        <div style="font-size:0.78rem;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">Description</div>
        <div style="font-size:0.88rem;line-height:1.7;color:var(--text-muted)">${request.description}</div>
      </div>

      ${request.image_path ? `
        <div style="margin-bottom:1.25rem">
          <div style="font-size:0.78rem;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">📷 Photo Evidence</div>
          <img src="${request.image_path}" style="max-height:220px;width:100%;object-fit:cover;border-radius:var(--radius);border:1px solid var(--border);cursor:pointer" onclick="window.open('${request.image_path}','_blank')" alt="Request photo">
        </div>
      ` : ''}

      <div>
        <div style="font-size:0.78rem;font-weight:700;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.75rem">📜 Status History</div>
        <div class="timeline">
          ${history.map((h, i) => `
            <div class="timeline-item ${i === history.length - 1 ? 'current' : ''}">
              <div class="timeline-time">${fmtDate(h.changed_at)}</div>
              <div class="timeline-status">${statusBadge(h.new_status)} ${h.changed_by_name ? '· ' + h.changed_by_name : ''}</div>
              ${h.note ? `<div class="timeline-note">💬 ${h.note}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('adminRequestModal').classList.add('active');
  } catch (err) {
    toast.show('Failed to load request', 'error');
  }
}

async function updateStatus() {
  const id = document.getElementById('currentRequestId').value;
  const status = document.getElementById('newStatus').value;
  const note = document.getElementById('statusNote').value.trim();
  const btn = document.getElementById('updateStatusBtn');

  btn.disabled = true;
  btn.textContent = '⏳ Saving…';

  try {
    await api.patch(`/api/admin/requests/${id}/status`, { status, note });
    toast.show(`Status updated to "${status}" ✅`, 'success');
    closeAdminModal();
    loadAdminRequests(adminCurrentPage);
    loadOverview(); // refresh stats
  } catch (err) {
    toast.show(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

function closeAdminModal() {
  document.getElementById('adminRequestModal').classList.remove('active');
}

document.getElementById('adminRequestModal').addEventListener('click', function(e) {
  if (e.target === this) closeAdminModal();
});

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  try {
    const data = analyticsData || await api.get('/api/admin/analytics');
    analyticsData = data;

    const t = data.totals;
    const open = t.pending + t.in_progress;
    const rate = t.total > 0 ? Math.round((t.resolved / t.total) * 100) : 0;

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.querySelector('.stat-value').textContent = val;
    };
    setVal('analyticsStatTotal', t.total);
    setVal('analyticsStatOpen', open);
    setVal('analyticsStatResolved', t.resolved);
    setVal('analyticsStatRate', rate + '%');

    renderMonthlyChart(data.monthly);
    renderCategoryChart(data.categoryCounts);
    renderSubCountyTable(data.subCountyCounts);
  } catch {
    toast.show('Failed to load analytics', 'error');
  }
}

function renderMonthlyChart(monthly) {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;
  if (charts.monthly) charts.monthly.destroy();

  charts.monthly = new Chart(ctx, {
    type: 'line',
    data: {
      labels: monthly.map(m => {
        const [y, mo] = m.month.split('-');
        return new Date(y, mo - 1).toLocaleString('en-KE', { month: 'short', year: '2-digit' });
      }),
      datasets: [{
        label: 'Requests Submitted',
        data: monthly.map(m => m.count),
        borderColor: '#0f766e',
        backgroundColor: 'rgba(15,118,110,0.15)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#14b8a6',
        pointRadius: 5,
        pointHoverRadius: 7,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { precision: 0 } }
      }
    }
  });
}

function renderCategoryChart(cats) {
  const ctx = document.getElementById('categoryChart');
  if (!ctx) return;
  if (charts.category) charts.category.destroy();

  const palette = ['#0f766e','#14b8a6','#f59e0b','#3b82f6','#ef4444','#8b5cf6','#ec4899','#10b981','#f97316'];
  charts.category = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: cats.map(c => c.category),
      datasets: [{
        label: 'Requests',
        data: cats.map(c => c.count),
        backgroundColor: cats.map((_, i) => palette[i % palette.length] + 'cc'),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { precision: 0 } },
        y: { grid: { color: 'none' }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function renderSubCountyTable(data) {
  const tbody = document.getElementById('subCountyTable');
  tbody.innerHTML = data.map(s => {
    const rate = s.total > 0 ? Math.round(s.resolved / s.total * 100) : 0;
    const rateColor = rate >= 70 ? 'var(--success)' : rate >= 40 ? 'var(--warning)' : 'var(--danger)';
    return `
      <tr>
        <td style="font-weight:600">${s.sub_county}</td>
        <td>${s.total}</td>
        <td><span style="color:var(--warning)">${s.pending}</span></td>
        <td><span style="color:var(--info)">${s.in_progress}</span></td>
        <td><span style="color:var(--success)">${s.resolved}</span></td>
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <div class="progress-bar" style="width:80px;flex-shrink:0">
              <div class="progress-fill" style="width:${rate}%;background:${rateColor}"></div>
            </div>
            <span style="color:${rateColor};font-weight:600;font-size:0.85rem">${rate}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// ─── CITIZENS ─────────────────────────────────────────────────────────────────
async function loadCitizens() {
  try {
    const data = await api.get('/api/admin/citizens');
    const tbody = document.getElementById('citizensTable');
    if (!data.citizens.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:3rem;color:var(--text-faint)">No citizens registered yet</td></tr>';
      return;
    }
    tbody.innerHTML = data.citizens.map(c => `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.75rem">
            <div class="avatar" style="width:32px;height:32px;font-size:0.8rem">${c.name[0].toUpperCase()}</div>
            <span style="font-weight:600">${c.name}</span>
          </div>
        </td>
        <td style="font-size:0.85rem;color:var(--text-muted)">${c.email}</td>
        <td style="font-size:0.85rem">${c.phone || '—'}</td>
        <td style="font-weight:600">${c.total_requests}</td>
        <td><span style="color:var(--success);font-weight:600">${c.resolved || 0}</span></td>
        <td style="font-size:0.8rem;color:var(--text-faint)">${timeAgo(c.created_at)}</td>
      </tr>
    `).join('');
  } catch {
    toast.show('Failed to load citizens', 'error');
  }
}

// ─── EXPORT CSV ───────────────────────────────────────────────────────────────
async function exportCSV() {
  try {
    toast.show('Preparing CSV export…', 'info', 2000);
    window.open('/api/admin/export', '_blank');
  } catch {
    toast.show('Export failed', 'error');
  }
}

// Notification loader
function loadNotifs() {
  loadNotifications(
    document.getElementById('notifDot'),
    document.getElementById('notifDropdown')
  );
}
