/* ─── SHARED UTILITIES ─────────────────────────────────────────────── */

// Toast notification system
window.toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    this.init();
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
    this.container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(40px)';
      el.style.transition = 'all 0.3s ease';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
};

// API helper
window.api = {
  async request(method, url, data = null, isFormData = false) {
    const opts = {
      method,
      credentials: 'include',
      headers: isFormData ? {} : { 'Content-Type': 'application/json' }
    };
    if (data) opts.body = isFormData ? data : JSON.stringify(data);
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  },
  get: (url) => window.api.request('GET', url),
  post: (url, data, isFormData) => window.api.request('POST', url, data, isFormData),
  patch: (url, data) => window.api.request('PATCH', url, data),
  delete: (url) => window.api.request('DELETE', url),
};

// Format date
window.fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

// Status badge HTML
window.statusBadge = (status) => {
  const cls = {
    'Pending': 'badge-pending',
    'In Progress': 'badge-in-progress',
    'Resolved': 'badge-resolved',
    'Rejected': 'badge-rejected'
  }[status] || 'badge-pending';
  return `<span class="badge ${cls}">${status}</span>`;
};

// Priority badge HTML
window.priorityBadge = (p) => `<span class="priority-badge priority-${p}">${p}</span>`;

// Debounce
window.debounce = (fn, ms = 300) => {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
};

// Auth guard — redirect to login if not authenticated
window.requireAuth = async (redirectIfAdmin = false) => {
  try {
    const data = await api.get('/api/auth/me');
    if (!data.authenticated) {
      window.location.href = '/login';
      return null;
    }
    if (redirectIfAdmin && data.user.role === 'admin') {
      window.location.href = '/admin';
      return null;
    }
    return data.user;
  } catch {
    window.location.href = '/login';
    return null;
  }
};

window.requireAdmin = async () => {
  try {
    const data = await api.get('/api/auth/me');
    if (!data.authenticated || data.user.role !== 'admin') {
      window.location.href = '/login';
      return null;
    }
    return data.user;
  } catch {
    window.location.href = '/login';
    return null;
  }
};

// Logout handler
window.handleLogout = async () => {
  await api.post('/api/auth/logout');
  window.location.href = '/';
};

// Category icons
window.categoryIcon = (cat) => ({
  'Broken Streetlight': '💡',
  'Water Issue': '💧',
  'Garbage Collection': '🗑️',
  'Road Damage': '🛣️',
  'Sewer Blockage': '🚧',
  'Public Health': '🏥',
  'Environment': '🌿',
  'Public Safety': '🚨',
  'Other': '📋'
}[cat] || '📋');

// Relative time
window.timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 7) return fmtDate(dateStr);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
};

// Pagination helper
window.renderPagination = (container, currentPage, totalPages, onPageChange) => {
  container.innerHTML = '';
  if (totalPages <= 1) return;

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '‹';
  prev.disabled = currentPage === 1;
  prev.onclick = () => onPageChange(currentPage - 1);
  container.appendChild(prev);

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      const btn = document.createElement('button');
      btn.className = `page-btn${i === currentPage ? ' active' : ''}`;
      btn.textContent = i;
      btn.onclick = () => onPageChange(i);
      container.appendChild(btn);
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      const span = document.createElement('span');
      span.textContent = '…';
      span.style.cssText = 'padding:0 4px;color:var(--text-faint)';
      container.appendChild(span);
    }
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '›';
  next.disabled = currentPage === totalPages;
  next.onclick = () => onPageChange(currentPage + 1);
  container.appendChild(next);
};

// Mobile sidebar toggle
window.initMobileSidebar = () => {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;
  const toggle = document.getElementById('sidebarToggle');
  if (toggle) toggle.onclick = () => sidebar.classList.toggle('open');
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
        !sidebar.contains(e.target) && e.target !== toggle) {
      sidebar.classList.remove('open');
    }
  });
};

// Notification loader
window.loadNotifications = async (countEl, dropdownEl) => {
  try {
    const data = await api.get('/api/notifications');
    if (countEl) {
      if (data.unread > 0) {
        countEl.textContent = data.unread > 9 ? '9+' : data.unread;
        countEl.style.display = 'flex';
      } else {
        countEl.style.display = 'none';
      }
    }
    if (dropdownEl) {
      const list = dropdownEl.querySelector('.notif-list');
      if (!list) return;
      if (data.notifications.length === 0) {
        list.innerHTML = '<div class="notif-item" style="color:var(--text-faint);text-align:center;padding:2rem">No notifications</div>';
        return;
      }
      list.innerHTML = data.notifications.slice(0, 8).map(n => `
        <div class="notif-item ${n.is_read ? '' : 'unread'}">
          <div>${n.message}</div>
          <div class="notif-time">${timeAgo(n.created_at)}</div>
        </div>
      `).join('');
    }
  } catch {}
};

// Mark notifications as read
window.markNotifsRead = async () => {
  try { await api.patch('/api/notifications/read'); } catch {}
};

// Init back-to-top
window.initBackToTop = () => {
  const btn = document.querySelector('.back-to-top');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 300);
  });
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
};
