/* sea-marshall.js — Vessel table, flag logic, intercept order flow */

let _vessels = [];
let _intercepted = false;

// ── Manual IMO Lookup ─────────────────────────────────────────
async function lookupByIMO() {
  const input = document.getElementById('imo-lookup-input');
  const imo = input?.value.trim().replace(/\s+/g, '');
  if (!imo) { showToast('Enter an IMO number to search', 'error'); return; }

  // Search in already-loaded vessels first
  let vessel = _vessels.find(v => v.imo === imo);

  if (!vessel) {
    // Try fetching live from server
    const res = await apiFetch(`/api/sea-marshall/vessel/${encodeURIComponent(imo)}`);
    if (res.success && res.data) {
      vessel = res.data;
      // Add to local cache if not already there
      if (!_vessels.find(v => v.imo === imo)) _vessels.push(vessel);
    } else {
      showToast(`IMO ${imo} not found in vessel register. It may be an unregistered vessel.`, 'warning');
      return;
    }
  }

  inspectVessel(vessel.imo);
  showToast(`Vessel profile loaded: ${vessel.vessel_name}`, 'info');
}


async function loadVessels() {
  const res = await apiFetch('/api/sea-marshall/vessels');
  if (!res.success) { showToast('Failed to load vessel data','error'); return; }
  _vessels = res.data;
  renderVesselTable(_vessels);
  updateKPIs(_vessels);
  checkShadowRunner(_vessels);
}

function updateKPIs(vessels) {
  const total    = vessels.length;
  const flagged  = vessels.filter(v => v.is_flagged).length;
  const inspected= vessels.filter(v => v.status === 'INTERCEPTED').length;
  const cleared  = vessels.filter(v => !v.is_flagged && v.status !== 'INTERCEPTED').length;
  const el = id => document.getElementById(id);
  if (el('kpi-total'))     el('kpi-total').textContent     = total;
  if (el('kpi-cleared'))   el('kpi-cleared').textContent   = cleared;
  if (el('kpi-inspected')) el('kpi-inspected').textContent = inspected;
  if (el('kpi-alerts'))    el('kpi-alerts').textContent    = flagged;
}

function renderVesselTable(vessels) {
  const tbody = document.getElementById('vessel-tbody');
  if (!tbody) return;
  tbody.innerHTML = vessels.map(v => `
    <tr class="${v.is_flagged ? 'row-flagged':''}" id="row-${v.imo}">
      <td><span class="font-mono">${v.is_flagged ? '<span class="flag-pulse"></span> ':''}</span>${v.imo}</td>
      <td><strong>${v.vessel_name}</strong></td>
      <td>${v.vessel_type}</td>
      <td>${v.flag_state.split('(')[0].trim()}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${v.cargo}">${v.cargo}</td>
      <td class="font-mono">${v.gross_tonnage?.toLocaleString()}</td>
      <td>${v.destination_port?.split(',')[0]}</td>
      <td class="font-mono">${v.eta}</td>
      <td>${v.captain}</td>
      <td class="font-mono">${v.crew_count}</td>
      <td>${statusBadge(v.status)}</td>
      <td>
        <div class="table-actions">
          <button class="btn btn-secondary btn-sm" onclick="inspectVessel('${v.imo}')">Inspect</button>
          ${v.is_flagged ? `<button class="btn btn-danger btn-sm" onclick="showIncidentModal('${v.imo}')">Report</button>`:''}
        </div>
      </td>
    </tr>
  `).join('');
}

function checkShadowRunner(vessels) {
  const shadow = vessels.find(v => v.imo === '9123450');
  if (!shadow) return;
  if (shadow.status === 'INTERCEPTED') {
    _intercepted = true;
    updateBannerIntercepted();
  }
}

function inspectVessel(imo) {
  const vessel = _vessels.find(v => v.imo === imo);
  if (!vessel) return;
  const isFlagged = vessel.is_flagged;
  const isCleared = !isFlagged && vessel.status !== 'INTERCEPTED';

  const flagBtn = isCleared ? `
    <div style="margin-top:16px;border-top:1px solid var(--color-border);padding-top:14px">
      <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">Officer Action</div>
      <button class="btn btn-danger btn-sm" onclick="flagVessel('${vessel.imo}')" style="width:100%">
        ⚑ Flag This Vessel as Suspicious
      </button>
    </div>` : '';

  const drawerHTML = `
    <div class="data-grid" style="margin-bottom:16px">
      <div class="data-field"><span class="data-label">IMO</span><span class="data-value mono">${vessel.imo} ${isFlagged ? '<span class="imo-verify-warn">⚠ NOT IN REGISTRY</span>' : '<span class="imo-verify-ok">✓ Verified</span>'}</span></div>
      <div class="data-field"><span class="data-label">Flag State</span><span class="data-value">${vessel.flag_state}</span></div>
      <div class="data-field"><span class="data-label">Vessel Type</span><span class="data-value">${vessel.vessel_type}</span></div>
      <div class="data-field"><span class="data-label">Gross Tonnage</span><span class="data-value mono">${vessel.gross_tonnage?.toLocaleString()} GT</span></div>
      <div class="data-field"><span class="data-label">Captain</span><span class="data-value">${vessel.captain}</span></div>
      <div class="data-field"><span class="data-label">Crew Count</span><span class="data-value">${vessel.crew_count}</span></div>
      <div class="data-field"><span class="data-label">Last Port</span><span class="data-value">${vessel.last_port}</span></div>
      <div class="data-field"><span class="data-label">Destination</span><span class="data-value">${vessel.destination_port}</span></div>
      <div class="data-field"><span class="data-label">ETA</span><span class="data-value mono">${vessel.eta}</span></div>
      <div class="data-field col-span-2"><span class="data-label">Declared Cargo</span><span class="data-value">${vessel.cargo}</span></div>
    </div>
    ${isFlagged && vessel.flag_reason ? `<blockquote class="vessel-flag-reason"><strong>INTERPOL / RAW INTELLIGENCE ALERT</strong><br><br>${vessel.flag_reason}</blockquote>` : ''}
    <div style="margin-top:12px">${statusBadge(vessel.status)}</div>
    ${flagBtn}
  `;
  openDrawer(drawerHTML, `${vessel.vessel_name} — IMO ${vessel.imo}`);
}

// ── Flag a cleared/verified vessel ────────────────────────────
async function flagVessel(imo) {
  const vessel = _vessels.find(v => v.imo === imo);
  openModal({
    title: '⚑ Flag Vessel as Suspicious',
    body: `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="alert-banner warning" style="margin-bottom:0">
          <div class="alert-body-text">This will mark <strong>${vessel?.vessel_name || imo}</strong> as suspicious and add it to the security watch list. A report will be forwarded to Intel Command.</div>
        </div>
        <div class="form-group">
          <label class="form-label required">Reason for Flagging</label>
          <select id="flag-reason-type">
            <option value="Undeclared Cargo Suspected">Undeclared Cargo Suspected</option>
            <option value="AIS Anomaly">AIS Signal Anomaly / Transponder Off</option>
            <option value="Unusual Route">Unusual / Suspicious Route</option>
            <option value="Intelligence Tip">Intelligence Tip-off</option>
            <option value="Document Discrepancy">Document Discrepancy</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label required">Details</label>
          <textarea id="flag-details" rows="3" placeholder="Describe the suspicious activity in detail..."></textarea>
        </div>
      </div>`,
    footer: `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
             <button class="btn btn-danger" onclick="submitVesselFlag('${imo}')">⚑ Confirm Flag</button>`
  });
}

async function submitVesselFlag(imo) {
  const reason = document.getElementById('flag-reason-type')?.value;
  const details = document.getElementById('flag-details')?.value.trim();
  if (!details) { showToast('Please provide flagging details', 'error'); return; }

  const res = await apiFetch('/api/sea-marshall/flag-vessel', {
    method: 'POST',
    body: JSON.stringify({ imo, flag_reason: `${reason}: ${details}`, flagged_by: getSession().user_id || 'Marshal' })
  });

  if (res.success) {
    closeModal();
    closeDrawer();
    showToast(`Vessel IMO ${imo} flagged successfully. Intel Command notified.`, 'success');
    await loadVessels(); // refresh table
  } else {
    showToast('Failed to flag vessel: ' + res.message, 'error');
  }
}

async function issueInterceptOrder() {
  if (_intercepted) return;
  const confirmed = await confirmDialog({
    title: 'Confirm Coastal Guard Intercept Order',
    message: `<strong>Vessel:</strong> MV Shadow Runner<br><strong>IMO:</strong> 9123450<br><br>This action will notify the Indian Coastal Guard and lock the vessel from receiving berth clearance. This action cannot be undone.`,
    confirmText: 'Confirm — Issue Order'
  });
  if (!confirmed) return;
  const res = await apiFetch('/api/sea-marshall/lock-vessel', { method:'POST', body: JSON.stringify({ imo:'9123450' }) });
  if (res.success) {
    _intercepted = true;
    updateBannerIntercepted();
    showToast('Intercept order for IMO 9123450 successfully issued.','success');
    loadVessels();
  } else {
    showToast('Failed to issue intercept order: ' + res.message, 'error');
  }
}

function updateBannerIntercepted() {
  const banner = document.getElementById('maritime-alert-banner');
  if (!banner) return;
  banner.classList.add('intercepted');
  banner.querySelector('.maritime-alert-title').textContent = '✓ INTERCEPT ORDER ISSUED — Indian Coastal Guard Notified';
  banner.querySelector('.maritime-alert-meta').textContent = 'IMO 9123450 — MV Shadow Runner has been locked from berth clearance. Coast Guard boarding party dispatched.';
  const interceptBtn = document.getElementById('btn-intercept');
  if (interceptBtn) { interceptBtn.disabled = true; interceptBtn.textContent = 'Order Issued ✓'; }
}

function showIncidentModal(imo) {
  const vessel = _vessels.find(v => v.imo === imo);
  openModal({
    title: 'File Incident Report — Maritime Security',
    body: `
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="form-row-2">
          <div class="form-group"><label class="form-label">IMO (pre-filled)</label><input type="text" value="${imo}" readonly></div>
          <div class="form-group"><label class="form-label">Vessel Name</label><input type="text" value="${vessel?.vessel_name || ''}" readonly></div>
        </div>
        <div class="form-group"><label class="form-label required">Incident Type</label>
          <select id="inc-type"><option value="Arms Suspected">Arms Suspected</option><option value="Narcotics Suspected">Narcotics Suspected</option><option value="Document Fraud">Document Fraud</option><option value="Unauthorized Entry">Unauthorized Entry</option><option value="Other">Other</option></select>
        </div>
        <div class="form-group"><label class="form-label">Severity</label><input type="text" value="${vessel?.is_flagged ? 'Critical' : 'High'}" readonly></div>
        <div class="form-group"><label class="form-label required">Description</label><textarea id="inc-desc" rows="4" placeholder="Describe the incident in detail..."></textarea></div>
      </div>`,
    footer: `<button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
             <button class="btn btn-danger" onclick="submitIncident('${imo}')">File Report →</button>`
  });
}

async function submitIncident(imo) {
  const vessel = _vessels.find(v => v.imo === imo);
  const payload = {
    imo, incident_type: document.getElementById('inc-type').value,
    severity: vessel?.is_flagged ? 'Critical' : 'High',
    description: document.getElementById('inc-desc').value,
    location: 'Maritime — Indian EEZ',
    reporting_marshal: `Marshal-${getSession().user_id || 'Sea'}`
  };
  if (!payload.description) { showToast('Description is required','error'); return; }
  const res = await apiFetch('/api/sea-marshall/file-incident', { method:'POST', body: JSON.stringify(payload) });
  if (res.success) {
    closeModal();
    showToast(`Incident ${res.data.incident_id} filed successfully.`, 'success');
  } else {
    showToast('Failed to file incident: ' + res.message, 'error');
  }
}

function loadSeaCharts() {
  // Vessel type bar chart
  const typeCtx = document.getElementById('chart-vessel-types')?.getContext('2d');
  if (typeCtx && _vessels.length) {
    const typeCounts = {};
    _vessels.forEach(v => { typeCounts[v.vessel_type] = (typeCounts[v.vessel_type]||0)+1; });
    new Chart(typeCtx, {
      type:'bar',
      data:{ labels:Object.keys(typeCounts), datasets:[{data:Object.values(typeCounts),backgroundColor:'#0057B8',borderRadius:4}] },
      options:{ indexAxis:'y', plugins:{ legend:{display:false} }, scales:{ x:{grid:{color:'#F0F0F0'}}, y:{grid:{display:false}, ticks:{font:{size:10}}} }, responsive:true, maintainAspectRatio:false }
    });
  }
  // Flag state pie chart
  const flagCtx = document.getElementById('chart-flags')?.getContext('2d');
  if (flagCtx && _vessels.length) {
    const flagCounts = {};
    _vessels.forEach(v => { const f = v.flag_state.split('(')[0].trim(); flagCounts[f]=(flagCounts[f]||0)+1; });
    const colors = ['#0057B8','#002147','#1A7F4B','#D97706','#DC2626','#0284C7','#8B5CF6','#6B7280'];
    new Chart(flagCtx, {
      type:'pie',
      data:{ labels:Object.keys(flagCounts), datasets:[{data:Object.values(flagCounts),backgroundColor:colors,borderWidth:2,borderColor:'#fff'}] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{size:10}, boxWidth:10 } } } }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadVessels();
  loadSeaCharts();
  document.getElementById('btn-intercept')?.addEventListener('click', issueInterceptOrder);
  document.getElementById('btn-incident-banner')?.addEventListener('click', () => showIncidentModal('9123450'));
});
