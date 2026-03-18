/* dashboard.js — Map init, KPI polling, chart rendering */

let _kpiPollInterval = null;

async function loadKPIs() {
  const res = await apiFetch('/api/dashboard/kpis');
  if (!res.success) return;
  const d = res.data;
  const el = id => document.getElementById(id);
  if (el('kpi-volume'))    el('kpi-volume').textContent    = d.volume?.toLocaleString() ?? '—';
  if (el('kpi-flags'))     el('kpi-flags').textContent     = d.flags?.toLocaleString() ?? '—';
  if (el('kpi-aid'))       el('kpi-aid').textContent       = d.pending_aid?.toLocaleString() ?? '—';
  if (el('kpi-incidents')) el('kpi-incidents').textContent = d.incidents?.toLocaleString() ?? '—';
}

async function loadCharts() {
  const [typesRes, epRes] = await Promise.all([
    apiFetch('/api/dashboard/entity-types'),
    apiFetch('/api/dashboard/top-entry-points')
  ]);

  // ── Donut chart: Entity types ──────────────────────────────
  const donutCtx = document.getElementById('chart-types')?.getContext('2d');
  if (donutCtx && typesRes.success) {
    const labels  = typesRes.data.map(r => r.type);
    const values  = typesRes.data.map(r => r.count);
    const colors  = ['#0057B8','#D97706','#1A7F4B'];
    new Chart(donutCtx, {
      type: 'doughnut',
      data: { labels, datasets:[{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { font: { family:'Inter',size:11 }, boxWidth:10 }}}
      }
    });
  }

  // ── Bar chart: Top entry points ────────────────────────────
  const barCtx = document.getElementById('chart-entry-points')?.getContext('2d');
  if (barCtx && epRes.success) {
    const labs = epRes.data.map(r => r.entry_point.split(',')[0]);
    const vals = epRes.data.map(r => r.count);
    new Chart(barCtx, {
      type: 'bar',
      data: { labels: labs, datasets:[{ data: vals, backgroundColor: '#0057B8', borderRadius: 4 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { color:'#F0F0F0' }}, y: { grid: { display: false }, ticks:{ font:{ size:10 }}}}
      }
    });
  }

  // ── Line chart: Security flags (simulated 7-day trend) ─────
  const lineCtx = document.getElementById('chart-trend')?.getContext('2d');
  if (lineCtx) {
    const days   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const values = [12,18,14,21,17,24,19];
    new Chart(lineCtx, {
      type: 'line',
      data: {
        labels: days,
        datasets:[{
          data: values, borderColor: '#DC2626', backgroundColor: 'rgba(220,38,38,0.07)',
          fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#DC2626'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display:false }}, y: { grid: { color:'#F0F0F0' }}}
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  loadKPIs();
  _kpiPollInterval = setInterval(loadKPIs, 30000);
  loadCharts();
  const mapEl = document.getElementById('main-map');
  if (mapEl && typeof initMainMap === 'function') {
    initMainMap('main-map');
  }
});
