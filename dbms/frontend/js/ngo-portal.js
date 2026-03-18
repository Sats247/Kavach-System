/* ngo-portal.js — NGO assignments feed, status updates */

async function loadAssignments(filterStatus = '') {
  const container = document.getElementById('assignments-container');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--color-text-muted);padding:16px">Loading assignments...</p>';

  const url = filterStatus ? `/api/ngo/assignments?status=${encodeURIComponent(filterStatus)}` : '/api/ngo/assignments';
  const res = await apiFetch(url);
  if (!res.success) { showToast('Failed to load assignments','error'); return; }

  const items = res.data.items;
  if (!items.length) {
    container.innerHTML = '<div class="empty-state"><p>No assignments found.</p></div>';
    return;
  }

  container.innerHTML = items.map(a => {
    const tags = (a.help_tags || '').split(',').filter(Boolean).map(t => `<span class="tag-pill">${t.trim()}</span>`).join('');
    const statusClass = {
      'Pending':'status-pending','Acknowledged':'status-acknowledged',
      'In Progress':'status-in-progress','Completed':'status-completed'
    }[a.status] || '';
    return `
      <div class="assignment-card ${statusClass}" id="assignment-${a.id}">
        <div class="assignment-card-header">
          <div>
            <div class="assignment-prov">${a.provisional_id || 'N/A'}</div>
            <div class="assignment-force">${a.force || ''} — ${a.entry_point || ''}</div>
          </div>
          ${statusBadge(a.status)}
        </div>
        <div class="assignment-name">${a.name}</div>
        <div class="assignment-nat">${a.nationality} ${a.gender ? '· '+a.gender : ''} ${a.dob ? '· DOB: '+a.dob : ''}</div>
        ${a.medical_needs && a.medical_needs !== 'None' ? `<div class="alert-banner warning" style="margin-top:8px;padding:8px 12px"><div class="alert-body-text">Medical: ${a.medical_needs}</div></div>` : ''}
        <div class="assignment-message">"${a.message || 'No message provided.'}"</div>
        <div class="assignment-meta">
          <span>Assigned Camp: <strong>${a.assigned_camp || '—'}</strong></span>
          <span>Received: ${formatDateTime(a.created_at)}</span>
          ${a.acknowledged_at ? `<span>Acknowledged: ${formatDateTime(a.acknowledged_at)}</span>` : ''}
        </div>
        ${tags ? `<div class="assignment-tags">${tags}</div>` : ''}
        <div class="assignment-actions">
          ${a.status === 'Pending' ? `<button class="btn btn-primary btn-sm" onclick="updateStatus('${a.id}','Acknowledged')">Acknowledge</button>` : ''}
          ${a.status === 'Acknowledged' ? `<button class="btn btn-secondary btn-sm" onclick="updateStatus('${a.id}','In Progress')">Mark In Progress</button>` : ''}
          ${a.status === 'In Progress' ? `<button class="btn btn-success btn-sm" onclick="updateStatus('${a.id}','Completed')">Mark Complete</button>` : ''}
          ${a.status === 'Completed' ? `<span class="text-success fw-600" style="font-size:12px">✓ Case Complete</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function updateStatus(assignmentId, newStatus) {
  const res = await apiFetch(`/api/ngo/assignments/${assignmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
  if (res.success) {
    showToast(`Status updated to ${newStatus}`, 'success');
    loadAssignments(document.getElementById('filter-status')?.value || '');
  } else {
    showToast('Update failed: ' + res.message, 'error');
  }
}

async function loadCounts() {
  const res = await apiFetch('/api/ngo/assignments/counts');
  if (!res.success) return;
  const counts = {};
  res.data.forEach(r => { counts[r.status] = r.count; });
  const el = id => document.getElementById(id);
  if (el('count-pending'))     el('count-pending').textContent     = counts['Pending'] ?? 0;
  if (el('count-acknowledged'))el('count-acknowledged').textContent = counts['Acknowledged'] ?? 0;
  if (el('count-in-progress')) el('count-in-progress').textContent  = counts['In Progress'] ?? 0;
  if (el('count-completed'))   el('count-completed').textContent    = counts['Completed'] ?? 0;
}

document.addEventListener('DOMContentLoaded', () => {
  loadAssignments();
  loadCounts();

  document.getElementById('filter-status')?.addEventListener('change', function() {
    loadAssignments(this.value);
  });

  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    loadAssignments(document.getElementById('filter-status')?.value || '');
    loadCounts();
    showToast('Refreshed', 'info');
  });
});
