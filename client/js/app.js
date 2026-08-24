/* ═══════════════════════════════════════════════════════
   ASSISTO V5.1.1 — app.js
   Cliente SPA conectado a API REST + JWT
═══════════════════════════════════════════════════════ */
'use strict';

const API = '/api';
let token = localStorage.getItem('et_token');
let currentUser = JSON.parse(localStorage.getItem('et_user') || 'null');

// ─── API HELPER ──────────────────────────────────────
// Esta funcion es el punto central de comunicacion con el servidor.
// Todos los get(), post(), put() y del() la usan internamente.
// Parametros:
//   method: 'GET', 'POST', 'PUT' o 'DELETE'
//   path:   ruta del endpoint, ej: '/usuarios' o '/dashboard'
//   body:   objeto JavaScript a enviar en el cuerpo (solo para POST y PUT)
// Retorna: el objeto JSON que devuelve el servidor
// Lanza Error si el servidor responde con un codigo de error
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  };
  if (body) opts.body = JSON.stringify(body);

  // Timeout de 10 segundos para evitar spinner infinito
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  opts.signal = controller.signal;

  try {
    const res = await fetch(API + path, opts);
    clearTimeout(timeout);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Token inválido — limpiar sesión y recargar
      localStorage.removeItem('et_token');
      localStorage.removeItem('et_user');
      window.location.reload();
      throw new Error('Sesión expirada. Vuelve a iniciar sesión.');
    }
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    return data;
  } catch(e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('El servidor no responde (timeout). Verifica que esté corriendo.');
    throw e;
  }
}

const get  = (p)    => api('GET', p);
const post = (p, b) => api('POST', p, b);
const put  = (p, b) => api('PUT', p, b);
const del  = (p)    => api('DELETE', p);

// ─── UTILIDADES ──────────────────────────────────────
function rolLabel(r) { return { superadmin:'Super Admin', director:'Director', docente:'Docente' }[r] || r; }
function rolBadge(r) {
  const cls = { superadmin:'badge-navy', director:'badge-accent', docente:'badge-info' };
  return `<span class="badge ${cls[r]||'badge-navy'}">${rolLabel(r)}</span>`;
}
function estadoBadge(e) {
  const map = { activo:'badge-success', inactivo:'badge-danger', baja:'badge-warning' };
  const lbl = { activo:'Activo', inactivo:'Inactivo', baja:'Baja' };
  return `<span class="badge ${map[e]||'badge-navy'}">${lbl[e]||e}</span>`;
}
function showToast(msg, type='success') {
  const icons = { success:'fa-check-circle', error:'fa-exclamation-circle', warning:'fa-exclamation-triangle' };
  const t = document.getElementById('toast');
  t.innerHTML = `<i class="fas ${icons[type]||'fa-info-circle'}"></i> ${msg}`;
  t.className = `toast show ${type}`;
  setTimeout(() => t.className = 'toast', 3200);
}
function emptyRow(cols, msg='Sin registros') {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:2.5rem;color:var(--text-light)"><i class="fas fa-inbox" style="font-size:1.8rem;display:block;margin-bottom:.6rem;opacity:.35"></i>${msg}</td></tr>`;
}
function loadingRow(cols) {
  return `<tr><td colspan="${cols}" style="text-align:center;padding:2rem;color:var(--text-sub)"><span class="spinner"></span>Cargando...</td></tr>`;
}

// ─── NAV POR ROL ─────────────────────────────────────
const NAV = {
  superadmin: [
    { s:'Principal' },
    { id:'dashboard',  icon:'fa-chart-pie',          label:'Dashboard',         view:'view-dashboard' },
    { s:'Administración' },
    { id:'usuarios',   icon:'fa-users-cog',           label:'Usuarios',          view:'view-usuarios' },
    { id:'profesores', icon:'fa-chalkboard-teacher',  label:'Profesores',        view:'view-profesores' },
    { id:'alumnos',    icon:'fa-user-graduate',       label:'Alumnos',           view:'view-alumnos' },
    { id:'grupos',     icon:'fa-layer-group',         label:'Grupos y Materias', view:'view-grupos' },
    { s:'Académico' },
    { id:'asistencia', icon:'fa-list-check',          label:'Pase de Lista',     view:'view-asistencia' },
    { id:'reportes',   icon:'fa-chart-bar',           label:'Reportes',          view:'view-reportes' },
  ],
  director: [
    { s:'Principal' },
    { id:'dashboard',  icon:'fa-chart-pie',           label:'Dashboard',         view:'view-dashboard' },
    { s:'Gestión Académica' },
    { id:'profesores', icon:'fa-chalkboard-teacher',  label:'Profesores',        view:'view-profesores' },
    { id:'alumnos',    icon:'fa-user-graduate',       label:'Alumnos',           view:'view-alumnos' },
    { id:'grupos',     icon:'fa-layer-group',         label:'Grupos y Materias', view:'view-grupos' },
    { s:'Académico' },
    { id:'asistencia', icon:'fa-list-check',          label:'Pase de Lista',     view:'view-asistencia' },
    { id:'reportes',      icon:'fa-chart-bar',           label:'Reportes',          view:'view-reportes' },
    { s:'Académico · Períodos' },
    { id:'cuatrimestres', icon:'fa-calendar-alt',         label:'Cuatrimestres',     view:'view-cuatrimestres' },
  ],
  docente: [
    { s:'Principal' },
    { id:'dashboard',  icon:'fa-chart-pie',           label:'Dashboard',         view:'view-dashboard' },
    { s:'Académico' },
    { id:'asistencia', icon:'fa-list-check',          label:'Pase de Lista',     view:'view-asistencia' },
    { id:'reportes',   icon:'fa-chart-bar',           label:'Reportes',          view:'view-reportes' },
  ],
};

// ─── LOGIN ───────────────────────────────────────────
function togglePassword() {
  const i = document.getElementById('login-pass');
  const e = document.getElementById('eye-icon');
  i.type = i.type === 'password' ? 'text' : 'password';
  e.className = i.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}
function fillCred(u, p) {
  document.getElementById('login-user').value = u;
  document.getElementById('login-pass').value = p;
}

async function handleLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errDiv   = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errDiv.classList.add('hidden');
  if (!username || !password) { errDiv.innerHTML='<i class="fas fa-exclamation-circle"></i> Ingresa usuario y contraseña'; errDiv.classList.remove('hidden'); return; }

  btn.innerHTML = '<span class="spinner"></span><span>Verificando...</span>';
  btn.disabled = true;

  try {
    const data = await post('/login', { username, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('et_token', token);
    localStorage.setItem('et_user', JSON.stringify(currentUser));
    bootApp();
  } catch(e) {
    errDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${e.message}`;
    errDiv.classList.remove('hidden');
  } finally {
    btn.innerHTML = '<span id="btn-login-text">Iniciar Sesión</span><i class="fas fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

async function handleLogout() {
  try { await post('/logout'); } catch {}
  token = null; currentUser = null;
  localStorage.removeItem('et_token');
  localStorage.removeItem('et_user');
  document.getElementById('screen-login').classList.add('active');
  document.getElementById('screen-app').classList.remove('active');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ─── BOOT ────────────────────────────────────────────
function bootApp() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-app').classList.add('active');

  const initials = currentUser.nombre.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
  document.getElementById('ub-avatar').textContent = initials;
  document.getElementById('ub-name').textContent   = currentUser.nombre;
  document.getElementById('ub-role').textContent   = rolLabel(currentUser.rol);
  document.getElementById('topbar-user').textContent = currentUser.nombre;
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('es-MX',{day:'numeric',month:'short',year:'numeric'});

  buildNav();
  navigateTo('dashboard');
}

function buildNav() {
  const items = NAV[currentUser.rol] || [];
  const nav   = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  items.forEach(item => {
    if (item.s) {
      const el = document.createElement('div');
      el.className='nav-label'; el.textContent=item.s;
      nav.appendChild(el);
    } else {
      const el = document.createElement('div');
      el.className='nav-item'; el.id='nav-'+item.id; el.dataset.view=item.view;
      el.innerHTML=`<i class="fas ${item.icon} nav-icon"></i><span class="nav-text">${item.label}</span>`;
      el.onclick=()=>navigateTo(item.id);
      nav.appendChild(el);
    }
  });
}

function navigateTo(id) {
  document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const navEl = document.getElementById('nav-'+id);
  if (navEl) {
    navEl.classList.add('active');
    const view = document.getElementById(navEl.dataset.view);
    if (view) view.classList.add('active');
    document.getElementById('breadcrumb').textContent = navEl.querySelector('.nav-text')?.textContent||id;
  }
  const renders = { dashboard:renderDashboard, usuarios:renderUsuarios, profesores:renderProfesores, alumnos:renderAlumnos, grupos:renderGrupos, asistencia:renderAsistencia, reportes:renderReportes, cuatrimestres:renderCuatrimestres, campus:renderCampus };
  if (renders[id]) renders[id]();
  if (window.innerWidth < 700) document.getElementById('sidebar').classList.remove('mobile-open');
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  window.innerWidth < 700 ? sb.classList.toggle('mobile-open') : sb.classList.toggle('collapsed');
}

// ─── DASHBOARD ───────────────────────────────────────
// ─── DASHBOARD ───────────────────────────────────────
// Carga y renderiza el panel principal del sistema.
// Pide los datos al endpoint /api/dashboard y los distribuye
// en los distintos bloques visuales de la vista:
//   - stats-grid:         tarjetas con numeros de alumnos, materias, grupos, etc.
//   - recent-activity:    lista de las ultimas acciones registradas
//   - weekly-chart:       barras de asistencia Lunes a Sabado de la semana actual
//   - chart-tendencia:    linea de tendencia de los ultimos 30 dias
//   - chart-donut:        distribucion de presentes, tardanzas, ausentes, justificadas
//   - dash-extra-section: comparativo semana actual vs anterior, ranking y top faltas
async function renderDashboard() {
  document.getElementById('dash-fecha').textContent = new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  document.getElementById('stats-grid').innerHTML = `<div class="stat-card" style="grid-column:span 4"><span class="spinner"></span> Cargando...</div>`;

  // Verificar si hay profesores sin cuenta de usuario (visible solo para admin y director)
  // Si los hay, muestra un aviso amarillo arriba del dashboard con los nombres
  if (currentUser.rol !== 'docente') {
    try {
      const sinCuenta = await get('/profesores/sin-usuario').catch(()=>[]);
      const alertaEl = document.getElementById('dash-alerta-profs');
      if (sinCuenta.length && alertaEl) {
        alertaEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:.8rem;padding:.7rem 1rem;background:rgba(240,165,0,.1);border-radius:8px;border-left:4px solid var(--warning);margin-bottom:1rem">
            <i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i>
            <div style="flex:1;font-size:.84rem">
              <strong>${sinCuenta.length} profesor${sinCuenta.length>1?'es':''} sin acceso al sistema:</strong>
              ${sinCuenta.map(p=>`<span class="badge badge-navy" style="margin-left:.3rem">${p.nombre}</span>`).join('')}
            </div>
            ${currentUser.rol==='superadmin'?`<button class="btn-ghost" onclick="navigateTo('profesores')" style="height:28px;font-size:.78rem;flex-shrink:0"><i class="fas fa-user-plus"></i> Dar acceso</button>`:''}
          </div>`;
        alertaEl.style.display='block';
      } else if (alertaEl) { alertaEl.style.display='none'; }
    } catch {}
  }

  try {
    const d = await get('/dashboard');
    const { stats, actividad, semana } = d;

    // ── Tarjetas de estadísticas (interactivas por rol) ──
    if (stats.esDocente) {
      // Dashboard del docente
      document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card stat-clickable" onclick="navigateTo('asistencia')" title="Ir a Pase de Lista">
          <div class="stat-icon navy"><i class="fas fa-list-check"></i></div>
          <div><div class="stat-val">${stats.asistHoy}</div><div class="stat-label">Asistencias Hoy</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
        <div class="stat-card stat-clickable" onclick="navigateTo('asistencia')" title="Ir a Pase de Lista">
          <div class="stat-icon gold"><i class="fas fa-book"></i></div>
          <div><div class="stat-val">${stats.materias}</div><div class="stat-label">Mis Materias</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
        <div class="stat-card stat-clickable" onclick="navigateTo('reportes')" title="Ver Reportes">
          <div class="stat-icon green"><i class="fas fa-user-graduate"></i></div>
          <div><div class="stat-val">${stats.alumnos}</div><div class="stat-label">Mis Alumnos</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
        <div class="stat-card stat-clickable" onclick="navigateTo('reportes')" title="Ver Reportes">
          <div class="stat-icon red"><i class="fas fa-chart-line"></i></div>
          <div><div class="stat-val">${stats.pctSemana}%</div><div class="stat-label">Asistencia Semanal</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>`;
    } else {
      // Dashboard del admin/director
      document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card stat-clickable" onclick="navigateTo('alumnos')" title="Ver Alumnos">
          <div class="stat-icon navy"><i class="fas fa-user-graduate"></i></div>
          <div><div class="stat-val">${stats.alumnos}</div><div class="stat-label">Alumnos Activos</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
        <div class="stat-card stat-clickable" onclick="navigateTo('profesores')" title="Ver Profesores">
          <div class="stat-icon gold"><i class="fas fa-chalkboard-teacher"></i></div>
          <div><div class="stat-val">${stats.profesores}</div><div class="stat-label">Profesores</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
        <div class="stat-card stat-clickable" onclick="navigateTo('grupos')" title="Ver Materias">
          <div class="stat-icon green"><i class="fas fa-book"></i></div>
          <div><div class="stat-val">${stats.materias}</div><div class="stat-label">Materias</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>
        <div class="stat-card stat-clickable" onclick="navigateTo('grupos')" title="Ver Grupos">
          <div class="stat-icon red"><i class="fas fa-users"></i></div>
          <div><div class="stat-val">${stats.grupos}</div><div class="stat-label">Grupos</div></div>
          <div class="stat-arrow"><i class="fas fa-chevron-right"></i></div>
        </div>`;
    }

    // ── Actividad reciente ──
    const colors = { info:'#3b82f6', success:'#1db87a', warning:'#f0a500', error:'#e84545' };
    document.getElementById('recent-activity').innerHTML = actividad.length
      ? actividad.map(a=>`
          <div class="activity-item">
            <div class="activity-dot" style="background:${colors[a.tipo]||'#8fa0bb'}"></div>
            <div>
              <div class="activity-text"><strong>${a.accion}</strong>${a.detalle ? ': '+a.detalle : ''}</div>
              <div class="activity-time">${a.fecha?.split(' ')[1]||''} · ${a.usuario||'Sistema'}</div>
            </div>
          </div>`).join('')
      : '<div class="empty-state"><i class="fas fa-clock"></i><p>Sin actividad reciente</p></div>';

    // ── Gráfica semanal interactiva ──
    const maxPct = Math.max(...semana.map(d=>d.pct), 1);
    document.getElementById('weekly-chart').innerHTML = `
      <div class="week-bar-wrap">
        ${semana.map(d=>{
          const esFut = d.esFuturo;
          const color = esFut ? '#dde4f0' : d.pct>=80?'#1db87a':d.pct>=60?'#f0a500':'#e84545';
          const txtColor = esFut ? '#c0ccdd' : color;
          const tooltip = esFut
            ? `${d.fecha}: sin clases aún`
            : `${d.fecha}: ${d.pct}% · P:${d.P||0} T:${d.T||0} A:${d.A||0} J:${d.J||0}`;
          const dayStyle = d.esHoy ? 'font-weight:800;color:var(--unitec-blue)' : '';
          return `<div class="week-bar-item ${d.esHoy?'bar-hoy':''}" onclick="${esFut?'':"navigateTo('reportes')"}" title="${tooltip}" style="cursor:${esFut?'default':'pointer'}">
            <div class="week-bar-bg">
              <div class="week-bar-fill" style="height:${esFut?3:Math.max(4,d.pct)}%;background:${color};transition:height .4s ease;opacity:${esFut?.4:1}"></div>
            </div>
            <div class="week-bar-day" style="${dayStyle}">${d.dia}</div>
            <div class="week-bar-pct" style="color:${txtColor};font-weight:700">${esFut?'—':d.pct+'%'}</div>
          </div>`;
        }).join('')}
      </div>
      <p style="font-size:.72rem;color:var(--text-light);text-align:center;margin-top:.5rem">
        <span style="color:#1db87a">■</span> ≥80% &nbsp;
        <span style="color:#f0a500">■</span> 60–79% &nbsp;
        <span style="color:#e84545">■</span> &lt;60% &nbsp;
        <span style="color:#dde4f0">■</span> Pendiente
      </p>`;


    // ── Gráfica de línea: tendencia ──────────────────
    renderChartTendencia(semana);
    // ── Gráfica de dona: distribución ────────────────
    renderChartDonut(d.asistHoy || [], semana);

  } catch(e) {
    document.getElementById('stats-grid').innerHTML = `<div class="stat-card" style="grid-column:span 4;color:var(--danger)"><i class="fas fa-exclamation-circle"></i> Error: ${e.message}</div>`;
    console.error('Dashboard:', e);
  }
}

// ── Gráfica de línea — tendencia semanal ─────────────
let _chartTendencia = null;
function renderChartTendencia(semana) {
  const canvas = document.getElementById('chart-tendencia');
  if (!canvas || !window.Chart) return;
  if (_chartTendencia) { _chartTendencia.destroy(); _chartTendencia = null; }

  _chartTendencia = new Chart(canvas, {
    type: 'line',
    data: {
      labels: semana.map(d => d.dia),
      datasets: [{
        label: 'Asistencia %',
        data: semana.map(d => d.pct),
        borderColor: '#1DB87A',
        backgroundColor: 'rgba(29,184,122,0.08)',
        borderWidth: 2.5,
        pointBackgroundColor: semana.map(d => d.pct>=80?'#1DB87A':d.pct>=60?'#F0A500':'#E84545'),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y}% asistencia`,
            title: ctx => `${ctx[0].label}: ${semana[ctx[0].dataIndex]?.fecha||''}`
          }
        }
      },
      scales: {
        x: {
          grid: { color:'rgba(15,31,61,0.07)' },
          ticks: { color:'#5A6A85', font:{size:11} }
        },
        y: {
          min: 0, max: 100,
          grid: { color:'rgba(15,31,61,0.07)' },
          ticks: { color:'#5A6A85', font:{size:11}, callback: v => v + '%' }
        }
      }
    }
  });
}

// ── Gráfica de dona — distribución de actividad ───────
let _chartDonut = null;
function renderChartDonut(asistHoy, semana) {
  const canvas = document.getElementById('chart-donut');
  if (!canvas || !window.Chart) return;
  if (_chartDonut) { _chartDonut.destroy(); _chartDonut = null; }

  // Acumular P/T/A/J desde los datos de asistencia reales
  let P = 0, T = 0, A = 0, J = 0;

  if (asistHoy && asistHoy.length) {
    // Hay registros de hoy
    asistHoy.forEach(r => {
      if (r.status === 'P') P = r.c;
      if (r.status === 'T') T = r.c;
      if (r.status === 'A') A = r.c;
      if (r.status === 'J') J = r.c;
    });
  } else if (semana && semana.length) {
    // Sin datos hoy → acumular de la semana
    semana.forEach(d => {
      const p = Math.round(d.total * d.pct / 100);
      P += p;
      A += Math.max(0, d.total - p);
    });
  }

  const total = P + T + A + J;
  const sinDatos = total === 0;
  const legend = document.getElementById('donut-legend');

  const items = [
    { label:'Presentes',    val:P, color:'#1db87a' },
    { label:'Tardanzas',    val:T, color:'#f0a500' },
    { label:'Ausentes',     val:A, color:'#e84545' },
    { label:'Justificadas', val:J, color:'#3b82f6' },
  ];

  if (legend) {
    if (sinDatos) {
      legend.innerHTML = '<p style="font-size:.8rem;color:var(--text-light);padding:.4rem 0">Sin registros de asistencia esta semana</p>';
    } else {
      legend.innerHTML = items.map(item => {
        const pct = Math.round(item.val / total * 100);
        return `<div class="donut-item">
          <span class="donut-dot" style="background:${item.color}"></span>
          <span class="donut-lbl">${item.label}</span>
          <span class="donut-val">${item.val}
            <span style="color:var(--text-light);font-size:.72rem;font-weight:400"> ${pct}%</span>
          </span>
        </div>`;
      }).join('');
    }
  }

  _chartDonut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: sinDatos ? ['Sin datos'] : items.map(i=>i.label),
      datasets: [{
        data:            sinDatos ? [1]               : items.map(i=>i.val),
        backgroundColor: sinDatos ? ['#dde4f0']       : items.map(i=>i.color),
        borderColor: '#ffffff',
        borderWidth: sinDatos ? 0 : 2.5,
        hoverOffset: sinDatos ? 0 : 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: item => !sinDatos,
          callbacks: {
            label: ctx => ` ${ctx.parsed} registros (${Math.round(ctx.parsed/total*100)}%)`
          }
        }
      }
    },
    plugins: [{
      id: 'centerText',
      beforeDraw(chart) {
        const { ctx, chartArea } = chart;
        if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#1a3a6e';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(sinDatos ? '—' : total, cx, cy - 8);
        ctx.font = '10px Arial';
        ctx.fillStyle = '#8fa0bb';
        ctx.fillText(sinDatos ? 'sin datos' : (asistHoy?.length ? 'hoy' : 'semana'), cx, cy + 10);
        ctx.restore();
      }
    }]
  });
}


// ─── USUARIOS ────────────────────────────────────────
async function renderUsuarios() {
  const tbody = document.getElementById('tbody-usuarios');
  tbody.innerHTML = loadingRow(7);
  try {
    const usuarios = await get('/usuarios');
    tbody.innerHTML = usuarios.map(u=>`<tr>
      <td><code style="font-size:.75rem;color:var(--text-sub)">#${u.id}</code></td>
      <td><strong>${u.nombre}</strong><br><small style="color:var(--text-sub)">${u.email||''}</small></td>
      <td><code>${u.username}</code></td>
      <td>${rolBadge(u.rol)}</td>
      <td style="font-size:.78rem">
        ${u.campus_nombre
          ? `<span class="badge badge-navy" style="font-size:.7rem">${u.campus_nombre}</span>`
          : `<span style="color:var(--text-light)">Global</span>`}
      </td>
      <td>${estadoBadge(u.estado)}</td>
      <td style="font-size:.78rem;color:var(--text-sub)">${u.ultimo_acceso?.split(' ')[0]||'—'}</td>
      <td>
        <button class="action-btn edit" onclick="editUsuario(${u.id})" title="Editar"><i class="fas fa-edit"></i></button>
        ${u.id!==currentUser.id?`<button class="action-btn del" onclick="deleteUsuario(${u.id})"><i class="fas fa-trash"></i></button>`:''}
      </td>
    </tr>`).join('') || emptyRow(8);
  } catch(e) { tbody.innerHTML = emptyRow(7,'Error: '+e.message); }
}

let _usuariosList = [];
async function editUsuario(id) {
  if (!_usuariosList.length) _usuariosList = await get('/usuarios');
  const u = _usuariosList.find(u=>u.id===id); if(!u) return;
  document.getElementById('u-id').value       = u.id;
  document.getElementById('u-nombre').value   = u.nombre;
  document.getElementById('u-username').value = u.username;
  document.getElementById('u-pass').value     = '';
  document.getElementById('u-email').value    = u.email||'';
  document.getElementById('u-estado').value   = u.estado;
  document.getElementById('u-rol').value      = u.rol;

  // Cargar campus y seleccionar el del usuario
  const campusSel = document.getElementById('u-campus');
  campusSel.dataset.loaded = ''; // forzar recarga
  await cargarCampusEnSelect('u-campus');
  campusSel.value = u.campus_id || '';

  // Mostrar/ocultar sección de permisos extra según rol
  mostrarPermisosExtra(u.rol, u.id);

  document.getElementById('tit-usuario').textContent = 'Editar Usuario — ' + u.nombre;
  openModal('modal-usuario');
}

async function mostrarPermisosExtra(rol, usuarioId) {
  const sec = document.getElementById('u-campus-permisos-section');
  const list = document.getElementById('u-campus-permisos-list');
  if (!sec || !list) return;

  if (rol !== 'director') { sec.style.display = 'none'; return; }
  sec.style.display = 'block';

  try {
    const [allCampus, permisos] = await Promise.all([
      get('/campus'),
      get(`/usuarios/${usuarioId||0}/permisos-campus`).catch(()=>[])
    ]);
    const permisosIds = new Set(permisos.map(p => p.campus_id));

    list.innerHTML = allCampus.map(c => `
      <label class="campus-perm-chip ${permisosIds.has(c.id)?'active':''}" title="${c.nombre}">
        <input type="checkbox" value="${c.id}" ${permisosIds.has(c.id)?'checked':''}
          onchange="togglePermisoCampus(this,${usuarioId||0})" style="display:none">
        <i class="fas fa-building"></i> ${c.clave}
      </label>`).join('');
  } catch { list.innerHTML = '<small style="color:var(--text-light)">Guarda el usuario primero para gestionar permisos.</small>'; }
}

async function togglePermisoCampus(checkbox, usuarioId) {
  if (!usuarioId) return;
  const campusId = checkbox.value;
  const chip = checkbox.closest('.campus-perm-chip');
  try {
    if (checkbox.checked) {
      await post(`/campus/${campusId}/permisos`, { usuario_id: parseInt(usuarioId) });
      chip?.classList.add('active');
      showToast(`Acceso concedido al campus`, 'success');
    } else {
      await del(`/campus/${campusId}/permisos/${usuarioId}`);
      chip?.classList.remove('active');
      showToast(`Acceso revocado del campus`, 'warning');
    }
  } catch(e) { showToast(e.message, 'error'); checkbox.checked = !checkbox.checked; }
}

async function cargarCampusEnSelect(selectId) {
  const sel = document.getElementById(selectId);
  if(!sel) return;
  if(sel.dataset.loaded === '1') return;
  try {
    const campus = await get('/campus');
    sel.innerHTML = '<option value="">— Sin campus (Super Admin) —</option>' +
      campus.map(c=>`<option value="${c.id}">${c.nombre} · ${c.clave}</option>`).join('');
    sel.dataset.loaded = '1';
  } catch(e) { console.warn('cargarCampus error:', e.message); }
}

async function guardarUsuario() {
  const id = document.getElementById('u-id').value;
  const body = {
    nombre:    document.getElementById('u-nombre').value,
    username:  document.getElementById('u-username').value,
    password:  document.getElementById('u-pass').value,
    rol:       document.getElementById('u-rol').value,
    email:     document.getElementById('u-email').value,
    estado:    document.getElementById('u-estado').value,
    campus_id: document.getElementById('u-campus')?.value || null,
  };
  try {
    id ? await put(`/usuarios/${id}`, body) : await post('/usuarios', body);
    showToast(id ? `✅ Usuario ${body.nombre} actualizado.` : `✅ Usuario creado.`);
    closeModal('modal-usuario');
    _usuariosList = []; // forzar recarga
    renderUsuarios();
  } catch(e) { showToast(e.message,'error'); }
}

async function deleteUsuario(id) {
  if(!confirm('¿Eliminar este usuario?')) return;
  try { await del(`/usuarios/${id}`); showToast('Usuario eliminado.','warning'); renderUsuarios(); }
  catch(e) { showToast(e.message,'error'); }
}

// ─── PROFESORES ──────────────────────────────────────
async function renderProfesores() {
  const tbody = document.getElementById('tbody-profesores');
  tbody.innerHTML = loadingRow(7);
  try {
    const profs = await get('/profesores');
    tbody.innerHTML = profs.map(p=>`<tr>
      <td><code style="font-size:.75rem;color:var(--text-sub)">#${p.id}</code></td>
      <td>
        <strong>${p.nombre}</strong><br>
        ${p.usuario_id
          ? `<span style="font-size:.72rem;color:#1db87a"><i class="fas fa-check-circle"></i> Acceso activo</span>`
          : `<span style="font-size:.72rem;color:var(--warning)"><i class="fas fa-exclamation-triangle"></i> Sin cuenta de usuario</span>`}
      </td>
      <td>${p.email||'—'}</td>
      <td>${p.especialidad||'—'}</td>
      <td>${p.materias_codigos ? p.materias_codigos.split(', ').map(c=>`<span class="badge badge-navy">${c}</span>`).join(' ') : '<span style="color:var(--text-light);font-size:.8rem">Sin asignar</span>'}</td>
      <td>${estadoBadge(p.estado)}</td>
      <td style="white-space:nowrap">
        ${/* Solo mostrar "Dar acceso" si:
             1. El profesor NO tiene usuario vinculado
             2. El usuario logueado es superadmin (puede crear cualquier cuenta)
             3. El usuario logueado es director (puede dar acceso a docentes de su campus)
             Un docente nunca vera este boton porque no tiene acceso al modulo de Profesores */
           !p.usuario_id && (currentUser.rol==='superadmin' || currentUser.rol==='director')
           ? `<button class="btn-ghost" onclick="crearCuentaProfesor(${p.id},'${p.nombre.replace(/'/g,"\'")}')" style="height:28px;font-size:.72rem;color:var(--unitec-blue);margin-right:.3rem" title="Crear usuario y contrasena para que el profesor pueda iniciar sesion"><i class="fas fa-user-plus"></i> Dar acceso</button>`
           : ''}
        <button class="action-btn edit" onclick="editProfesor(${p.id})"><i class="fas fa-edit"></i></button>
        <button class="action-btn del"  onclick="deleteProfesor(${p.id})"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('') || emptyRow(7);
  } catch(e) { tbody.innerHTML = emptyRow(7,'Error: '+e.message); }
}

let _profesoresList = [];
async function editProfesor(id) {
  if(!_profesoresList.length) _profesoresList = await get('/profesores');
  const p = _profesoresList.find(p=>p.id===id); if(!p) return;
  document.getElementById('p-id').value=p.id; document.getElementById('p-nombre').value=p.nombre;
  document.getElementById('p-email').value=p.email||''; document.getElementById('p-tel').value=p.telefono||'';
  document.getElementById('p-cedula').value=p.cedula||''; document.getElementById('p-especialidad').value=p.especialidad||'';
  document.getElementById('p-estado').value=p.estado;
  document.getElementById('tit-profesor').textContent='Editar Profesor';
  openModal('modal-profesor');
}
async function guardarProfesor() {
  const id = document.getElementById('p-id').value;
  const body = { nombre:document.getElementById('p-nombre').value, email:document.getElementById('p-email').value,
    telefono:document.getElementById('p-tel').value, cedula:document.getElementById('p-cedula').value,
    especialidad:document.getElementById('p-especialidad').value, estado:document.getElementById('p-estado').value };
  try {
    id ? await put(`/profesores/${id}`,body) : await post('/profesores',body);
    showToast('Profesor guardado.'); closeModal('modal-profesor'); _profesoresList=[];
    renderProfesores();
  } catch(e) { showToast(e.message,'error'); }
}
async function deleteProfesor(id) {
  if(!confirm('¿Eliminar este profesor?')) return;
  try { await del(`/profesores/${id}`); showToast('Profesor eliminado.','warning'); renderProfesores(); }
  catch(e) { showToast(e.message,'error'); }
}

// Crear cuenta de usuario para un profesor que aún no tiene acceso
async function crearCuentaProfesor(profId, nombre) {
  const username = prompt(`Crear acceso para: ${nombre}

Ingresa el nombre de usuario:`, nombre.toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,12));
  if (!username) return;
  const password = prompt(`Usuario: ${username}

Ingresa la contraseña (mínimo 6 caracteres):`);
  if (!password || password.length < 6) { showToast('Contraseña demasiado corta (mínimo 6 caracteres)','warning'); return; }

  try {
    const r = await post(`/profesores/${profId}/crear-cuenta`, { username, password });
    showToast(`✅ Cuenta creada: ${username} — El profesor ya puede iniciar sesión como docente.`, 'success');
    _profesoresList = [];
    renderProfesores();
  } catch(e) { showToast(e.message, 'error'); }
}

// ─── ALUMNOS ─────────────────────────────────────────
async function renderAlumnos(grupoId='') {
  const tbody = document.getElementById('tbody-alumnos');
  tbody.innerHTML = loadingRow(8);
  alumnosSeleccionados.clear();
  actualizarBulkBar();

  try {
    const grupos = await get('/grupos');
    const fg = document.getElementById('filter-grupo-alumnos');
    if (fg.options.length<=1) grupos.forEach(g=>{ const o=document.createElement('option'); o.value=g.id; o.textContent=g.nombre; fg.appendChild(o); });

    const url = grupoId ? `/alumnos?grupoId=${grupoId}` : '/alumnos';
    const alumnos = await get(url);

    const countEl = document.getElementById('alumnos-count');
    if (countEl) countEl.textContent = `${alumnos.length} alumno${alumnos.length!==1?'s':''}`;

    tbody.innerHTML = alumnos.map(a=>`<tr id="alumno-row-${a.id}">
      <td><input type="checkbox" class="row-check" data-id="${a.id}" onchange="toggleRowCheck(this)" /></td>
      <td><strong>${a.matricula}</strong></td>
      <td>${a.nombre}</td>
      <td>${a.grupo_nombre?`<span class="badge badge-navy">${a.grupo_nombre}</span>`:'<span style="color:var(--text-light);font-size:.8rem">Sin grupo</span>'}</td>
      <td>${a.email||'—'}</td>
      <td>${a.tutor||'—'}</td>
      <td>${estadoBadge(a.estado)}</td>
      <td>
        <button class="action-btn edit" onclick="editAlumno(${a.id})"><i class="fas fa-edit"></i></button>
        <button class="action-btn del"  onclick="deleteAlumno(${a.id})"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('') || emptyRow(8);

    // Select del modal
    const selGrupo = document.getElementById('a-grupo');
    selGrupo.innerHTML = grupos.map(g=>`<option value="${g.id}">${g.nombre}</option>`).join('');

    // Llenar selects de los modales bulk
    const selAG = document.getElementById('asignar-grupo-sel');
    const csvGrp = document.getElementById('csv-grupo');
    const optsGrupos = grupos.map(g=>`<option value="${g.id}">${g.nombre}</option>`).join('');
    if(selAG) selAG.innerHTML = optsGrupos;
    if(csvGrp) csvGrp.innerHTML = `<option value="">Sin grupo (asignar después)</option>` + optsGrupos;
  } catch(e) { tbody.innerHTML = emptyRow(8,'Error: '+e.message); }
}
function reloadAlumnos(grupoId) { renderAlumnos(grupoId); }

let _alumnosList = [];
async function editAlumno(id) {
  if(!_alumnosList.length) _alumnosList = await get('/alumnos');
  const a = _alumnosList.find(a=>a.id===id); if(!a) return;
  document.getElementById('a-id').value=a.id; document.getElementById('a-matricula').value=a.matricula;
  document.getElementById('a-nombre').value=a.nombre; document.getElementById('a-email').value=a.email||'';
  document.getElementById('a-tel').value=a.telefono||''; document.getElementById('a-tutor').value=a.tutor||'';
  document.getElementById('a-tel-tutor').value=a.tel_tutor||''; document.getElementById('a-estado').value=a.estado;
  const grupos = await get('/grupos');
  document.getElementById('a-grupo').innerHTML = grupos.map(g=>`<option value="${g.id}" ${g.id===a.grupo_id?'selected':''}>${g.nombre}</option>`).join('');
  document.getElementById('tit-alumno').textContent='Editar Alumno';
  openModal('modal-alumno');
}
async function guardarAlumno() {
  const id = document.getElementById('a-id').value;
  const body = { matricula:document.getElementById('a-matricula').value, nombre:document.getElementById('a-nombre').value,
    email:document.getElementById('a-email').value, telefono:document.getElementById('a-tel').value,
    grupo_id:document.getElementById('a-grupo').value, tutor:document.getElementById('a-tutor').value,
    tel_tutor:document.getElementById('a-tel-tutor').value, estado:document.getElementById('a-estado').value };
  try {
    id ? await put(`/alumnos/${id}`,body) : await post('/alumnos',body);
    showToast('Alumno guardado.'); closeModal('modal-alumno'); _alumnosList=[];
    renderAlumnos();
  } catch(e) { showToast(e.message,'error'); }
}
async function deleteAlumno(id) {
  if(!confirm('¿Eliminar este alumno?')) return;
  try { await del(`/alumnos/${id}`); showToast('Alumno eliminado.','warning'); renderAlumnos(); }
  catch(e) { showToast(e.message,'error'); }
}

// ─── GRUPOS Y MATERIAS ───────────────────────────────
async function renderGrupos() {
  const [grupos, materias, profesores] = await Promise.all([get('/grupos'),get('/materias'),get('/profesores')]);

  document.getElementById('list-grupos').innerHTML = grupos.map(g=>`
    <div class="list-item">
      <div class="li-left">
        <div class="li-code">${g.semestre}°</div>
        <div><div class="li-name">${g.nombre}</div><div class="li-sub">${g.turno} · ${g.carrera||''} · ${g.total_alumnos} alumnos</div></div>
      </div>
      <div>
        <button class="action-btn edit" onclick="editGrupo(${g.id})"><i class="fas fa-edit"></i></button>
        <button class="action-btn del"  onclick="deleteGrupo(${g.id})"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('') || '<div class="empty-state"><i class="fas fa-users"></i><p>Sin grupos</p></div>';

  document.getElementById('list-materias').innerHTML = materias.map(m=>`
    <div class="list-item">
      <div class="li-left">
        <div class="li-code">${m.codigo}</div>
        <div>
          <div class="li-name">${m.nombre}</div>
          <div class="li-sub">
            ${m.creditos} créditos · ${m.horas_semana}h/sem
            · <strong style="color:var(--unitec-blue)">${m.profesor_nombre||'<span style="color:var(--warning)">Sin docente</span> <button class="btn-ghost" onclick="editMateria('+m.id+')" style="height:20px;font-size:.68rem;padding:0 .4rem;margin-left:.3rem">Asignar</button>'}</strong>
            ${m.campus_nombre?`<span class="badge badge-navy" style="font-size:.68rem;margin-left:.3rem">${m.campus_nombre}</span>`:''}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap">
        <button class="btn-ghost" onclick="verMateriaProfesor(${m.id},'${m.codigo}','${(m.nombre||'').replace(/'/g,"\'")}')" style="height:30px;font-size:.75rem;padding:0 .6rem" title="Ver materias del profesor">
          <i class="fas fa-user-graduate"></i>
        </button>
        <button class="btn-ghost" onclick="abrirHorarios(${m.id},'${m.codigo}')" style="height:30px;font-size:.75rem;padding:0 .6rem" title="Configurar horarios">
          <i class="fas fa-clock"></i>
        </button>
        <button class="action-btn edit" onclick="editMateria(${m.id})"><i class="fas fa-edit"></i></button>
        <button class="action-btn del"  onclick="deleteMateria(${m.id})"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('') || '<div class="empty-state"><i class="fas fa-book"></i><p>Sin materias</p></div>';

  // Poblar selects en modales
  document.getElementById('m-profesor').innerHTML = profesores.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join('');
}

async function guardarGrupo() {
  const id = document.getElementById('g-id').value;
  const body = { nombre:document.getElementById('g-nombre').value, turno:document.getElementById('g-turno').value,
    carrera:document.getElementById('g-carrera').value, semestre:document.getElementById('g-semestre').value,
    capacidad:document.getElementById('g-capacidad').value };
  try {
    id ? await put(`/grupos/${id}`,body) : await post('/grupos',body);
    showToast('Grupo guardado.'); closeModal('modal-grupo'); renderGrupos();
  } catch(e) { showToast(e.message,'error'); }
}
async function editGrupo(id) {
  const grupos = await get('/grupos');
  const g = grupos.find(g=>g.id===id); if(!g) return;
  document.getElementById('g-id').value=g.id; document.getElementById('g-nombre').value=g.nombre;
  document.getElementById('g-turno').value=g.turno; document.getElementById('g-carrera').value=g.carrera||'';
  document.getElementById('g-semestre').value=g.semestre; document.getElementById('g-capacidad').value=g.capacidad;
  openModal('modal-grupo');
}
async function deleteGrupo(id) {
  if(!confirm('¿Desactivar este grupo?')) return;
  try { await del(`/grupos/${id}`); showToast('Grupo desactivado.','warning'); renderGrupos(); }
  catch(e) { showToast(e.message,'error'); }
}
async function guardarMateria() {
  const id = document.getElementById('m-id').value;
  const catalogo_id = document.getElementById('m-catalogo')?.value || null;
  const body = {
    catalogo_id: catalogo_id ? parseInt(catalogo_id) : null,
    codigo:      document.getElementById('m-codigo').value.toUpperCase(),
    nombre:      document.getElementById('m-nombre').value,
    creditos:    document.getElementById('m-creditos').value,
    horas_semana:document.getElementById('m-horas').value,
    profesor_id: document.getElementById('m-profesor').value || null,
  };
  if(!body.codigo||!body.nombre){ showToast('Código y nombre son requeridos','warning'); return; }
  try {
    id ? await put(`/materias/${id}`,body) : await post('/materias',body);
    showToast('Materia guardada ✅');
    closeModal('modal-materia');
    renderGrupos();
  } catch(e) { showToast(e.message,'error'); }
}
async function editMateria(id) {
  const [materias, profesores, catalogo] = await Promise.all([
    get('/materias'), get('/profesores'), get('/catalogo-materias').catch(()=>[])
  ]);
  const m = materias.find(m=>m.id===id); if(!m) return;
  document.getElementById('m-id').value         = m.id;
  document.getElementById('m-codigo').value     = m.codigo;
  document.getElementById('m-nombre').value     = m.nombre;
  document.getElementById('m-creditos').value   = m.creditos;
  document.getElementById('m-horas').value      = m.horas_semana;

  // Catálogo
  const catSel = document.getElementById('m-catalogo');
  if(catSel) {
    catSel.innerHTML = '<option value="">— Materia personalizada —</option>' +
      catalogo.map(c=>`<option value="${c.id}" ${c.id===m.catalogo_id?'selected':''}>${c.codigo} · ${c.nombre}</option>`).join('');
  }

  // Profesores con opción vacía
  document.getElementById('m-profesor').innerHTML =
    '<option value="">— Sin docente asignado —</option>' +
    profesores.map(p=>`<option value="${p.id}" ${p.id===m.profesor_id?'selected':''}>${p.nombre}</option>`).join('');

  document.getElementById('tit-materia').textContent = 'Editar Materia';
  openModal('modal-materia');
}
async function deleteMateria(id) {
  if(!confirm('¿Eliminar esta materia?')) return;
  try { await del(`/materias/${id}`); showToast('Materia eliminada.','warning'); renderGrupos(); }
  catch(e) { showToast(e.message,'error'); }
}

// Vista rápida: materias que tiene asignadas un profesor
async function verMateriaProfesor(materiaId, codigo, nombre) {
  // Buscar el profesor de esta materia
  const materias = await get('/materias');
  const m = materias.find(x=>x.id===materiaId);
  if(!m?.profesor_id){ showToast('Esta materia no tiene docente asignado','warning'); return; }

  // Obtener todas las materias del mismo profesor
  const todasMaterias = materias.filter(x=>x.profesor_id===m.profesor_id);
  const horarios = await get(`/materias/${materiaId}/horarios`).catch(()=>[]);
  const DIAS = ['','Lunes','Martes','Miércoles','Jueves','Viernes'];

  // Mostrar en modal temporal usando modal de cuatri-materias
  document.getElementById('tit-cuatri-mat').textContent = `Docente: ${m.profesor_nombre}`;
  document.getElementById('cuatri-mat-desc').innerHTML = `
    <div style="font-size:.82rem;color:var(--text-sub)">
      Materias asignadas a este docente en el sistema.
    </div>`;

  document.getElementById('cuatri-mat-checklist').innerHTML = `
    <div style="margin-bottom:.8rem">
      ${todasMaterias.map(mat=>`
        <div class="list-item" style="margin-bottom:.4rem;padding:.6rem .8rem">
          <div class="li-left">
            <div class="li-code" style="font-size:.72rem">${mat.codigo}</div>
            <div>
              <div class="li-name" style="font-size:.85rem">${mat.nombre}</div>
              <div class="li-sub">${mat.creditos} créditos · ${mat.horas_semana}h/sem
                ${mat.campus_nombre?`· ${mat.campus_nombre}`:''}</div>
            </div>
          </div>
          ${mat.id===materiaId?'<span class="badge badge-success" style="font-size:.68rem">Esta materia</span>':''}
        </div>`).join('')}
    </div>
    ${horarios.length ? `
      <div style="border-top:1px solid var(--border);padding-top:.6rem">
        <div class="field-label" style="margin-bottom:.4rem"><i class="fas fa-clock"></i> Horarios de ${codigo}</div>
        ${horarios.map(h=>`
          <div style="display:inline-flex;align-items:center;gap:.4rem;background:var(--bg);border-radius:6px;padding:.25rem .6rem;margin:.2rem;font-size:.78rem">
            <strong>${DIAS[h.dia_semana]}</strong>
            ${h.hora_ini}–${h.hora_fin}
            ${h.grupo_nombre?`· ${h.grupo_nombre}`:''}
            ${h.aula?`<span style="color:var(--text-light)">· ${h.aula}</span>`:''}
          </div>`).join('')}
      </div>` : ''}`;

  // Cambiar botón de guardar a cerrar
  const btnGuardar = document.querySelector('#modal-cuatri-materias .modal-footer .btn-primary');
  if(btnGuardar) {
    btnGuardar.textContent = 'Cerrar';
    btnGuardar.setAttribute('onclick',"closeModal('modal-cuatri-materias');document.querySelector('#modal-cuatri-materias .modal-footer .btn-primary').setAttribute('onclick','guardarMateriasCuatri()');document.querySelector('#modal-cuatri-materias .modal-footer .btn-primary').textContent='Asignar';");
  }
  openModal('modal-cuatri-materias');
}

// ─── ASISTENCIA ──────────────────────────────────────
async function renderAsistencia() {
  const fechaEl = document.getElementById('asistencia-fecha');
  if(fechaEl) fechaEl.textContent = new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  // Fecha local correcta (sin UTC)
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  const fechaInp = document.getElementById('input-fecha-asistencia');
  if(fechaInp) fechaInp.value = fechaHoy;

  document.getElementById('lista-container').style.display='none';

  // Si es docente → mostrar menú de tarjetas de sus materias
  if (currentUser.rol === 'docente') {
    await renderMenuMaterias();
    return;
  }

  // Admin/Director → selector completo
  const selectorCard = document.getElementById('selector-card-admin');
  if(selectorCard) selectorCard.style.display='';

  const [materias, grupos] = await Promise.all([get('/materias'),get('/grupos')]);
  const selMat  = document.getElementById('sel-materia');
  const selGrpo = document.getElementById('sel-grupo-asistencia');
  if(selMat)  selMat.innerHTML  = '<option value="">— Selecciona materia —</option>' + materias.map(m=>`<option value="${m.id}" data-codigo="${m.codigo}">${m.codigo} · ${m.nombre}</option>`).join('');
  if(selGrpo) selGrpo.innerHTML = '<option value="">— Selecciona grupo —</option>' + grupos.map(g=>`<option value="${g.id}">${g.nombre}</option>`).join('');
}

// Menú de materias para docente
async function renderMenuMaterias() {
  const selectorCard = document.getElementById('selector-card-admin');
  if(selectorCard) selectorCard.style.display='none';
  document.getElementById('lista-container').style.display='none';

  const container = document.getElementById('menu-materias-docente');
  if(!container) return;
  container.style.display='';
  container.innerHTML = `<div style="text-align:center;padding:2.5rem"><span class="spinner"></span> Cargando materias...</div>`;

  try {
    // Servidor devuelve { materias, cuatriActivo }
    let resp;
    try {
      resp = await get('/mis-materias');
    } catch(apiErr) {
      container.innerHTML = `
        <div class="empty-state" style="padding:2rem">
          <i class="fas fa-exclamation-circle" style="color:var(--danger);font-size:2rem"></i>
          <p style="font-weight:700;margin-top:.8rem">Error al conectar con el servidor</p>
          <p style="font-size:.82rem;color:var(--text-sub)">${apiErr.message}</p>
          <p style="font-size:.75rem;color:var(--text-light);margin-top:.5rem">
            Verifica que el servidor esté corriendo en localhost:3000 y que tu sesión sea válida.<br>
            Intenta cerrar sesión y volver a entrar.
          </p>
          <button class="btn-ghost" onclick="renderMenuMaterias()" style="margin-top:.8rem">
            <i class="fas fa-redo"></i> Reintentar
          </button>
        </div>`;
      return;
    }

    // Compatibilidad: el servidor puede devolver {materias, cuatriActivo} o array directo
    const materias   = Array.isArray(resp) ? resp : (resp.materias || []);
    const cuatriInfo = Array.isArray(resp) ? null : resp.cuatriActivo;
    console.log('[mis-materias]', { total: materias.length, cuatri: cuatriInfo?.nombre });

    if (!materias.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:3rem">
          <i class="fas fa-book-open" style="font-size:2.5rem;color:var(--warning);opacity:.6"></i>
          <p style="margin-top:.8rem;font-weight:700;color:var(--text-main)">No tienes materias asignadas</p>
          <p style="font-size:.82rem;color:var(--text-sub);max-width:320px;text-align:center;margin-top:.4rem">
            El director debe asignarte como docente en al menos una materia desde
            <strong>Grupos y Materias</strong> → editar materia → seleccionar tu nombre.
          </p>
          ${cuatriInfo
            ? `<div style="margin-top:.8rem;padding:.5rem 1rem;background:rgba(0,48,135,.07);border-radius:8px;font-size:.78rem;color:var(--unitec-blue)">
                <i class="fas fa-calendar-check"></i> Cuatrimestre activo: <strong>${cuatriInfo.nombre}</strong>
               </div>`
            : `<div style="margin-top:.8rem;padding:.5rem 1rem;background:rgba(240,165,0,.1);border-radius:8px;font-size:.78rem;color:var(--warning)">
                <i class="fas fa-exclamation-triangle"></i> No hay cuatrimestre activo en tu campus
               </div>`}
        </div>`;
      return;
    }

    // Encabezado cuatrimestre
    const header = cuatriInfo
      ? `<div style="display:flex;align-items:center;gap:.8rem;padding:.6rem 1rem;background:rgba(0,48,135,.06);border-radius:10px;margin-bottom:1rem;border-left:4px solid var(--unitec-blue)">
           <i class="fas fa-calendar-check" style="color:var(--unitec-blue)"></i>
           <div>
             <div style="font-size:.82rem;font-weight:700;color:var(--unitec-blue)">${cuatriInfo.nombre}</div>
             <div style="font-size:.72rem;color:var(--text-sub)">${materias.filter(m=>m.en_cuatrimestre_activo).length} de ${materias.length} materias en este período</div>
           </div>
         </div>`
      : `<div style="display:flex;align-items:center;gap:.8rem;padding:.6rem 1rem;background:rgba(240,165,0,.08);border-radius:10px;margin-bottom:1rem;border-left:4px solid var(--warning)">
           <i class="fas fa-exclamation-triangle" style="color:var(--warning)"></i>
           <span style="font-size:.82rem;color:var(--warning)">Sin cuatrimestre activo. Mostrando todas las materias.</span>
         </div>`;

    function parsearHorarios(str) {
      if(!str) return [];
      return str.split('|').filter(Boolean).map(h => {
        const partes = h.split(':');
        const dia = parseInt(partes[0]);
        const horas = partes[1] || '';
        const aula  = partes[2] || '';
        const [ini, fin] = horas.split('-');
        const DIAS = ['','Lun','Mar','Mié','Jue','Vie','Sáb'];
        return `${DIAS[dia]||''} ${ini||''}${fin?'–'+fin:''}${aula?' · '+aula:''}`.trim();
      }).filter(Boolean);
    }

    container.innerHTML = header + '<div class="materias-menu-grid">' +
      materias.map(m => {
        const fuera = m.en_cuatrimestre_activo === 0 && cuatriInfo;
        const hs = parsearHorarios(m.horarios_str);
        const nombreSafe = (m.nombre||'').replace(/'/g, "\'").replace(/"/g, '&quot;');
        const codigoSafe = (m.codigo||'').replace(/'/g, "\'");
        return `
          <div class="materia-card ${fuera?'mc-fuera-cuatri':''}"
               onclick="seleccionarMateriaDirecto(${m.id},'${codigoSafe}','${nombreSafe}')"
               style="cursor:pointer">
            ${cuatriInfo && m.en_cuatrimestre_activo === 1
              ? '<div class="mc-cuatri-badge"><i class="fas fa-check"></i> Este cuatrimestre</div>'
              : cuatriInfo
                ? '<div class="mc-cuatri-badge mc-cuatri-inactivo"><i class="fas fa-archive"></i> Otro período</div>'
                : ''}
            <div class="mc-codigo">${m.codigo}</div>
            <div class="mc-nombre">${m.nombre}</div>
            <div class="mc-info">
              <span><i class="fas fa-star"></i> ${m.creditos} créd.</span>
              <span><i class="fas fa-clock"></i> ${m.horas_semana} h/sem</span>
            </div>
            ${hs.length
              ? `<div class="mc-horarios">${hs.slice(0,2).map(h=>`<span class="mc-horario-chip">${h}</span>`).join('')}</div>`
              : '<div style="font-size:.7rem;color:var(--text-light);margin-top:.4rem"><i class="fas fa-info-circle"></i> Sin horario</div>'}
            <div class="mc-accion"><i class="fas fa-list-check"></i> Tomar asistencia ahora</div>
          </div>`;
      }).join('') + '</div>';

  } catch(e) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle" style="color:var(--danger)"></i><p>Error cargando materias: ${e.message}</p></div>`;
    console.error('renderMenuMaterias:', e);
  }
}

// Clic en tarjeta → carga alumnos directamente
async function seleccionarMateriaDirecto(materiaId, codigo, nombre) {
  // Ocultar menú de tarjetas
  const menuContainer = document.getElementById('menu-materias-docente');
  if(menuContainer) menuContainer.style.display = 'none';

  // Usar el div de loading-overlay en lugar de sobreescribir lista-container
  // Mostrar contenedor del overlay de loading
  let overlay = document.getElementById('pase-loading-overlay');
  if(!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pase-loading-overlay';
    overlay.style.cssText = 'text-align:center;padding:2.5rem;background:var(--surface);border-radius:var(--radius);border:1px solid var(--border)';
    document.getElementById('lista-container').parentNode.insertBefore(overlay, document.getElementById('lista-container'));
  }
  overlay.style.display = 'block';
  overlay.innerHTML = `<span class="spinner"></span> <span style="font-size:.9rem;color:var(--text-sub);margin-left:.5rem">Cargando alumnos de <strong>${codigo}</strong>...</span>`;

  // Ocultar lista-container (sin tocar su contenido)
  document.getElementById('lista-container').style.display = 'none';
  document.getElementById('selector-card-admin').style.display = 'none';

  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;

  try {
    const [grupos, horarios] = await Promise.all([
      get('/grupos'),
      get('/materias/' + materiaId + '/horarios').catch(()=>[])
    ]);

    // Grupos vinculados por horario, o todos si no hay horario configurado
    const gruposConHorario = [...new Set(horarios.map(h=>h.grupo_id).filter(Boolean))];
    const gruposFinal = gruposConHorario.length > 0
      ? grupos.filter(g => gruposConHorario.includes(g.id))
      : grupos;

    overlay.style.display = 'none';

    if (!gruposFinal.length) {
      overlay.style.display = 'block';
      overlay.innerHTML = `
        <div class="empty-state" style="padding:1rem">
          <i class="fas fa-users" style="color:var(--warning)"></i>
          <p style="font-weight:700">No hay grupos vinculados a ${codigo}</p>
          <p style="font-size:.8rem;color:var(--text-sub)">El director debe configurar horarios con grupos asignados.</p>
          <button class="btn-ghost" onclick="renderMenuMaterias()" style="margin-top:.8rem">
            <i class="fas fa-arrow-left"></i> Volver
          </button>
        </div>`;
      return;
    }

    // Un solo grupo → cargar de inmediato
    if (gruposFinal.length === 1) {
      await _cargarListaConGrupo(materiaId, gruposFinal[0].id, fecha);
      return;
    }

    // Varios grupos → selector de tarjetas (en el overlay, no en lista-container)
    overlay.style.display = 'block';
    overlay.innerHTML = `
      <div style="padding:.2rem 0">
        <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:1rem">
          <button class="btn-ghost" onclick="renderMenuMaterias()" style="height:34px">
            <i class="fas fa-arrow-left"></i> Volver
          </button>
          <div>
            <div style="font-size:.95rem;font-weight:700;color:var(--unitec-blue)">${codigo} · ${nombre}</div>
            <div style="font-size:.78rem;color:var(--text-sub)">Selecciona el grupo para tomar asistencia</div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.8rem">
          ${gruposFinal.map(g => `
            <div class="materia-card" style="cursor:pointer"
                 onclick="document.getElementById('pase-loading-overlay').style.display='none';_cargarListaConGrupo(${materiaId},${g.id},'${fecha}')">
              <div class="mc-codigo" style="font-size:.75rem">${g.nombre}</div>
              <div class="mc-info"><span><i class="fas fa-sun"></i> ${g.turno||'—'}</span></div>
              <div class="mc-accion"><i class="fas fa-list-check"></i> Seleccionar</div>
            </div>`).join('')}
        </div>
      </div>`;

  } catch(e) {
    overlay.style.display = 'block';
    overlay.innerHTML = `<div class="empty-state" style="padding:1rem">
      <i class="fas fa-exclamation-circle" style="color:var(--danger)"></i>
      <p>Error: ${e.message}</p>
      <button class="btn-ghost" onclick="renderMenuMaterias()" style="margin-top:.5rem">Volver</button>
    </div>`;
    console.error('seleccionarMateriaDirecto:', e);
  }
}

// Carga la lista con materia+grupo ya definidos — sin depender de selectores del admin
async function _cargarListaConGrupo(materiaId, grupoId, fecha) {
  const menuContainer = document.getElementById('menu-materias-docente');
  if(menuContainer) menuContainer.style.display='none';

  const selectorAdmin = document.getElementById('selector-card-admin');
  if(selectorAdmin) selectorAdmin.style.display='none';

  const listaContainer = document.getElementById('lista-container');
  listaContainer.style.display='block';

  // Mostrar spinner en el tbody mientras carga
  const tbodyEl = document.getElementById('tbody-asistencia');
  if(tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem"><span class="spinner"></span> Cargando alumnos...</td></tr>`;
  const listaInfoEl = document.getElementById('lista-info');
  if(listaInfoEl) listaInfoEl.innerHTML = 'Cargando...';

  const btnVolver = document.getElementById('btn-volver-menu');
  if(btnVolver) btnVolver.style.display='';

  try {
    const data = await get(`/asistencias/lista?materiaId=${materiaId}&grupoId=${grupoId}&fecha=${fecha}`);

    if (!data.alumnos.length) {
      if(tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:1.5rem">
        <i class="fas fa-user-graduate" style="color:var(--warning)"></i>
        <p style="font-weight:700">Sin alumnos activos en este grupo</p>
        <p style="font-size:.8rem;color:var(--text-sub)">Verifica que el grupo tenga alumnos inscritos y activos.</p>
      </div></td></tr>`;
      if(listaInfoEl) listaInfoEl.innerHTML = 'Sin alumnos';
      return;
    }

    // Obtener info de materia y grupo para el encabezado
    let matNombre = '', matCodigo = '', grpNombre = '';
    try {
      const [mats, grps] = await Promise.all([get('/materias'), get('/grupos')]);
      const mat = mats.find(m=>m.id==materiaId);
      const grp = grps.find(g=>g.id==grupoId);
      matCodigo = mat?.codigo || '';
      matNombre = mat?.nombre || '';
      grpNombre = grp?.nombre || '';
    } catch {}

    // Info bar
    document.getElementById('lista-info').innerHTML =
      `<strong>${matCodigo} · ${matNombre}</strong> &nbsp;·&nbsp; ${grpNombre} &nbsp;·&nbsp; ${fecha}`;

    // Horarios del día
    const horariosInfo = document.getElementById('horarios-info-lista');
    if (horariosInfo) {
      try {
        const hor = await get(`/materias/${materiaId}/horarios`);
        const horGrupo = hor.filter(h=>!h.grupo_id||h.grupo_id==grupoId);
        if(horGrupo.length) {
          const DIAS=['','Lun','Mar','Mié','Jue','Vie','Sáb'];
          const diaActual = new Date().getDay();
          horariosInfo.innerHTML = horGrupo.map(h=>{
            const esHoy = h.dia_semana === diaActual;
            return `<span class="badge ${esHoy?'badge-success':'badge-navy'}" style="${esHoy?'font-weight:700':''}">
              <i class="fas fa-clock"></i> ${DIAS[h.dia_semana]} ${h.hora_ini}–${h.hora_fin}${h.aula?' · '+h.aula:''}
              ${esHoy?'<i class="fas fa-dot-circle" style="margin-left:.3rem;font-size:.65rem"></i>':''}
            </span>`;
          }).join(' ');
          horariosInfo.style.display='flex';
        } else {
          horariosInfo.style.display='none';
        }
      } catch { horariosInfo.style.display='none'; }
    }

    // Tabla de alumnos
    const tbody = document.getElementById('tbody-asistencia');
    tbody.innerHTML = data.alumnos.map((a,i)=>{
      const reg = data.registros[a.id];
      const st  = reg?.status || 'P';
      return `<tr id="row-${a.id}">
        <td>${i+1}</td>
        <td><strong>${a.matricula}</strong></td>
        <td>${a.nombre}</td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="p-${a.id}" value="P" ${st==='P'?'checked':''}><label for="p-${a.id}" class="p">P</label></div></td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="t-${a.id}" value="T" ${st==='T'?'checked':''}><label for="t-${a.id}" class="t">T</label></div></td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="a-${a.id}" value="A" ${st==='A'?'checked':''}><label for="a-${a.id}" class="a">A</label></div></td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="j-${a.id}" value="J" ${st==='J'?'checked':''}><label for="j-${a.id}" class="j">J</label></div></td>
        <td><input type="text" class="nota-input" id="nota-${a.id}" value="${reg?.nota||''}" placeholder="Nota..." /></td>
      </tr>`;
    }).join('');

    // Guardar contexto en el container para poder exportar PDF y guardar
    listaContainer.dataset.materiaId = materiaId;
    listaContainer.dataset.grupoId   = grupoId;
    listaContainer.dataset.fecha     = fecha;
    listaContainer.dataset.alumnos   = JSON.stringify(data.alumnos.map(a=>a.id));

    // Sincronizar selectores ocultos por si guardarAsistencia los necesita
    const selMat = document.getElementById('sel-materia');
    const selGrp = document.getElementById('sel-grupo-asistencia');
    const selFec = document.getElementById('input-fecha-asistencia');
    if(selMat) selMat.value = materiaId;
    if(selGrp) selGrp.value = grupoId;
    if(selFec) selFec.value = fecha;

  } catch(e) {
    if(tbodyEl) tbodyEl.innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:1.5rem">
      <i class="fas fa-exclamation-circle" style="color:var(--danger)"></i>
      <p>Error: ${e.message}</p>
    </div></td></tr>`;
    if(listaInfoEl) listaInfoEl.innerHTML = 'Error al cargar';
    console.error('_cargarListaConGrupo:', e);
  }
}

// Alias para compatibilidad
function seleccionarMateria(materiaId, codigo, nombre) {
  return seleccionarMateriaDirecto(materiaId, codigo, nombre);
}

function volverMenuMaterias() {
  document.getElementById('lista-container').style.display='none';
  document.getElementById('selector-card-admin').style.display='none';
  const overlay = document.getElementById('pase-loading-overlay');
  if(overlay) overlay.style.display='none';
  const btnVolver = document.getElementById('btn-volver-menu');
  if(btnVolver) btnVolver.style.display='none';
  renderMenuMaterias();
}

async function buscarPorCodigo(val) {
  val = val.toUpperCase();
  if (val.length < 4) return;
  try {
    const m = await get(`/materias/codigo/${val}`);
    if (m?.id) {
      document.getElementById('sel-materia').value = m.id;
      showToast(`Materia encontrada: ${m.nombre}`,'success');
    }
  } catch {}
}

async function loadLista() {
  const materiaId = document.getElementById('sel-materia').value;
  const grupoId   = document.getElementById('sel-grupo-asistencia').value;
  const fecha     = document.getElementById('input-fecha-asistencia').value;
  if (!materiaId || !grupoId) { showToast('Selecciona materia y grupo.','warning'); return; }

  try {
    const data = await get(`/asistencias/lista?materiaId=${materiaId}&grupoId=${grupoId}&fecha=${fecha}`);
    if (!data.alumnos.length) { showToast('No hay alumnos activos en este grupo.','warning'); return; }

    const materias = await get('/materias');
    const grupos   = await get('/grupos');
    const mat = materias.find(m=>m.id==materiaId);
    const grp = grupos.find(g=>g.id==grupoId);

    document.getElementById('lista-info').innerHTML = `<strong>${mat?.codigo} · ${mat?.nombre}</strong> &nbsp;·&nbsp; ${grp?.nombre} &nbsp;·&nbsp; ${fecha}`;

    const tbody = document.getElementById('tbody-asistencia');
    tbody.innerHTML = data.alumnos.map((a,i)=>{
      const reg = data.registros[a.id];
      const st  = reg?.status || 'P';
      return `<tr id="row-${a.id}">
        <td>${i+1}</td>
        <td><strong>${a.matricula}</strong></td>
        <td>${a.nombre}</td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="p-${a.id}"  value="P" ${st==='P'?'checked':''}><label for="p-${a.id}"  class="p">P</label></div></td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="t-${a.id}"  value="T" ${st==='T'?'checked':''}><label for="t-${a.id}"  class="t">T</label></div></td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="a-${a.id}"  value="A" ${st==='A'?'checked':''}><label for="a-${a.id}"  class="a">A</label></div></td>
        <td><div class="asist-radio"><input type="radio" name="st-${a.id}" id="j-${a.id}"  value="J" ${st==='J'?'checked':''}><label for="j-${a.id}"  class="j">J</label></div></td>
        <td><input type="text" class="nota-input" id="nota-${a.id}" value="${reg?.nota||''}" placeholder="Nota..." /></td>
      </tr>`;
    }).join('');

    document.getElementById('lista-container').style.display='';
    document.getElementById('lista-container').dataset.materiaId = materiaId;
    document.getElementById('lista-container').dataset.grupoId   = grupoId;
    document.getElementById('lista-container').dataset.fecha     = fecha;
    document.getElementById('lista-container').dataset.alumnos   = JSON.stringify(data.alumnos.map(a=>a.id));
  } catch(e) { showToast('Error: '+e.message,'error'); }
}

function marcarTodos(status) {
  const ids = JSON.parse(document.getElementById('lista-container').dataset.alumnos||'[]');
  ids.forEach(id => {
    const r = document.getElementById(`${status.toLowerCase()}-${id}`);
    if(r) r.checked=true;
  });
}

async function guardarAsistencia() {
  const c   = document.getElementById('lista-container');
  const ids = JSON.parse(c.dataset.alumnos||'[]');
  const lista = ids.map(id=>{
    const radios = document.querySelectorAll(`input[name="st-${id}"]`);
    let status='P'; radios.forEach(r=>{ if(r.checked) status=r.value; });
    return { alumnoId:id, status, nota:document.getElementById(`nota-${id}`)?.value||'' };
  });
  try {
    const r = await post('/asistencias',{ materiaId:parseInt(c.dataset.materiaId), grupoId:parseInt(c.dataset.grupoId), fecha:c.dataset.fecha, lista });
    showToast(`✅ Asistencia guardada para ${r.guardados} alumnos.`,'success');
  } catch(e) { showToast(e.message,'error'); }
}


// ─── HELPER: Sección de firmas PDF ───────────────────
function dibujarFirmas(doc, docenteNombre, docenteCedula) {
  const pageH  = doc.internal.pageSize.getHeight();
  const pageW  = doc.internal.pageSize.getWidth();
  const margen = 14;
  const firmaY = pageH - 52;  // 52mm desde el pie

  // Línea separadora
  doc.setDrawColor(200,210,225);
  doc.setLineWidth(0.4);
  doc.line(margen, firmaY - 4, pageW - margen, firmaY - 4);

  // Tres columnas de firma
  const col = [margen, pageW/2 - 25, pageW - margen - 54];
  const anchoFirma = 54;

  const firmas = [
    { titulo: 'DOCENTE', nombre: docenteNombre, cargo: 'Docente', cedula: docenteCedula || 'N/A' },
    { titulo: 'DIRECTOR(A)', nombre: '___________________________', cargo: 'Director(a) Académico', cedula: '' },
    { titulo: 'SELLO INSTITUCIONAL', nombre: '', cargo: '', cedula: '', sello: true },
  ];

  firmas.forEach((f, i) => {
    const x = col[i];

    // Etiqueta título
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 31, 61);
    doc.text(f.titulo, x + anchoFirma/2, firmaY + 2, { align: 'center' });

    if (f.sello) {
      // Rectángulo para sello
      doc.setDrawColor(180, 196, 220);
      doc.setLineWidth(0.5);
      doc.setFillColor(248, 250, 255);
      doc.roundedRect(x, firmaY + 5, anchoFirma, 20, 2, 2, 'FD');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150, 160, 180);
      doc.text('Sello Oficial', x + anchoFirma/2, firmaY + 16, { align: 'center' });
    } else {
      // Línea de firma
      doc.setDrawColor(80, 100, 130);
      doc.setLineWidth(0.5);
      doc.line(x, firmaY + 18, x + anchoFirma, firmaY + 18);

      // Nombre
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 30, 50);
      const nombreCorto = f.nombre.length > 28 ? f.nombre.substring(0,26)+'.' : f.nombre;
      doc.text(nombreCorto, x + anchoFirma/2, firmaY + 22, { align: 'center' });

      // Cargo
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(90, 106, 133);
      doc.text(f.cargo, x + anchoFirma/2, firmaY + 27, { align: 'center' });

      // Cédula
      if (f.cedula) {
        doc.setFontSize(6);
        doc.setTextColor(140, 155, 175);
        doc.text(`Cédula: ${f.cedula}`, x + anchoFirma/2, firmaY + 32, { align: 'center' });
      }
    }
  });

  // Fecha de generación centrada
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(170, 180, 200);
  doc.text(
    `Documento generado el ${new Date().toLocaleString('es-MX')}`,
    pageW/2, pageH - 8, { align: 'center' }
  );
}

async function exportarListaPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const c   = document.getElementById('lista-container');
  const info = document.getElementById('lista-info').textContent;

  // ── Encabezado ──────────────────────────────────────
  doc.setFillColor(26,58,110);
  doc.rect(0,0,210,34,'F');
  doc.setTextColor(249,115,22);
  doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text('Assisto — Sistema de Asistencia', 14, 13);
  doc.setFontSize(8.5); doc.setTextColor(180,196,220);
  doc.text('Instituto Demo — Sistema Institucional de Control de Asistencia', 14, 22);
  doc.setFontSize(7.5); doc.setTextColor(150,170,200);
  doc.text('Ciclo Escolar ' + new Date().getFullYear() + '-' + (new Date().getFullYear()+1), 14, 30);

  // ── Info de la sesión ───────────────────────────────
  doc.setTextColor(20,30,50);
  doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text(info, 14, 44);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(90,106,133);
  doc.text(`Docente: ${currentUser.nombre}`, 14, 51);
  doc.text(`Fecha de registro: ${new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`, 14, 57);

  // ── Tabla de alumnos ────────────────────────────────
  const rows = [];
  const ids = JSON.parse(c.dataset.alumnos||'[]');
  ids.forEach((id,i)=>{
    const radios = document.querySelectorAll(`input[name="st-${id}"]`);
    let status='P'; radios.forEach(r=>{ if(r.checked) status=r.value; });
    const row = document.getElementById(`row-${id}`);
    const lbl = {P:'Presente',T:'Tardanza',A:'Ausente',J:'Justificada'};
    rows.push([
      i+1,
      row?.cells[1]?.textContent||'',
      row?.cells[2]?.textContent||'',
      lbl[status]||status,
      document.getElementById(`nota-${id}`)?.value||''
    ]);
  });

  doc.autoTable({
    startY: 62,
    head: [['#','Matrícula','Nombre del Alumno','Asistencia','Observaciones']],
    body: rows,
    styles: { fontSize:9, cellPadding:3.5 },
    headStyles: { fillColor:[26,58,110], textColor:[249,115,22], fontStyle:'bold', fontSize:8.5 },
    alternateRowStyles: { fillColor:[248,250,255] },
    columnStyles: { 0:{cellWidth:10,halign:'center'}, 1:{cellWidth:24}, 3:{cellWidth:26,halign:'center'} },
    margin: { bottom: 62 },
    didParseCell(data) {
      if (data.column.index===3 && data.section==='body') {
        const v = data.cell.raw;
        const clr = {Presente:[15,158,96],Ausente:[192,57,43],Tardanza:[176,122,0],Justificada:[29,78,216]};
        if(clr[v]) data.cell.styles.textColor=clr[v];
        data.cell.styles.fontStyle='bold';
      }
    }
  });

  // ── Resumen estadístico ─────────────────────────────
  const fy  = doc.lastAutoTable.finalY + 5;
  const pres = rows.filter(r=>r[3]==='Presente').length;
  const tard = rows.filter(r=>r[3]==='Tardanza').length;
  const aus  = rows.filter(r=>r[3]==='Ausente').length;
  const just = rows.filter(r=>r[3]==='Justificada').length;
  const tot  = rows.length;
  const pct  = tot ? Math.round(((pres+tard)/tot)*100) : 0;

  doc.setFillColor(244,246,251);
  doc.roundedRect(14, fy, 182, 14, 2, 2, 'F');
  doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(15,31,61);
  doc.text('Resumen:', 18, fy+5);
  doc.setFont('helvetica','normal'); doc.setTextColor(15,158,96);
  doc.text(`Presentes: ${pres}`, 50, fy+5);
  doc.setTextColor(176,122,0);
  doc.text(`Tardanzas: ${tard}`, 90, fy+5);
  doc.setTextColor(192,57,43);
  doc.text(`Ausentes: ${aus}`, 128, fy+5);
  doc.setTextColor(29,78,216);
  doc.text(`Justificadas: ${just}`, 162, fy+5);
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(15,31,61);
  doc.text(`Asistencia: ${pct}%`, 18, fy+11);

  // ── Firmas ──────────────────────────────────────────
  dibujarFirmas(doc, currentUser.nombre, currentUser.cedula || '');

  doc.save(`asistencia_${c.dataset.fecha}_${(info.split('·')[0]||'lista').trim()}.pdf`);
  showToast('📄 Lista exportada con firmas.','success');
}

// ─── REPORTES ────────────────────────────────────────
async function renderReportes() {
  const [materias,grupos] = await Promise.all([get('/materias'),get('/grupos')]);
  const repMat = document.getElementById('rep-materia');
  const repGrp = document.getElementById('rep-grupo');
  repMat.innerHTML = '<option value="">Todas las materias</option>'+materias.map(m=>`<option value="${m.id}">${m.codigo} · ${m.nombre}</option>`).join('');
  repGrp.innerHTML = '<option value="">Todos los grupos</option>'+grupos.map(g=>`<option value="${g.id}">${g.nombre}</option>`).join('');
  // Usar fecha local (evitar desfase UTC)
  const hoy = new Date();
  const h30 = new Date(hoy); h30.setDate(h30.getDate()-30);
  const fmtLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  document.getElementById('rep-fecha-fin').value = fmtLocal(hoy);
  document.getElementById('rep-fecha-ini').value = fmtLocal(h30);
}

async function generarReporte() {
  const params = new URLSearchParams({
    materiaId: document.getElementById('rep-materia').value,
    grupoId:   document.getElementById('rep-grupo').value,
    fechaIni:  document.getElementById('rep-fecha-ini').value,
    fechaFin:  document.getElementById('rep-fecha-fin').value,
  });
  const res = document.getElementById('reporte-resultado');
  res.innerHTML='<div class="card" style="padding:2rem;text-align:center"><span class="spinner"></span> Generando reporte...</div>';
  try {
    const data = await get('/asistencias/reporte?'+params.toString());
    if(!data.filas.length) { res.innerHTML='<div class="card" style="padding:2rem"><div class="empty-state"><i class="fas fa-chart-bar"></i><p>Sin datos para los filtros seleccionados.</p></div></div>'; return; }
    const t = data.totales;
    const pct = t.total ? Math.round(((t.presentes+t.tardanzas)/t.total)*100) : 0;

    res.innerHTML = `
      <div class="reporte-stats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.8rem;margin-bottom:1.2rem">
        <div class="rep-stat"><div class="rep-stat-val">${t.total}</div><div class="rep-stat-lbl">Total</div></div>
        <div class="rep-stat"><div class="rep-stat-val" style="color:#1db87a">${t.presentes}</div><div class="rep-stat-lbl">Presentes</div></div>
        <div class="rep-stat"><div class="rep-stat-val" style="color:#f0a500">${t.tardanzas}</div><div class="rep-stat-lbl">Tardanzas</div></div>
        <div class="rep-stat"><div class="rep-stat-val" style="color:#e84545">${t.ausencias}</div><div class="rep-stat-lbl">Ausencias</div></div>
        <div class="rep-stat"><div class="rep-stat-val" style="color:#3b82f6">${t.justificadas}</div><div class="rep-stat-lbl">Justificadas</div></div>
        <div class="rep-stat"><div class="rep-stat-val">${pct}%</div><div class="rep-stat-lbl">% Asistencia</div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3><i class="fas fa-table"></i> Detalle por Alumno</h3>
          <button class="btn-secondary" onclick="exportarReportePDF()"><i class="fas fa-file-pdf"></i> Exportar PDF</button>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-reporte">
            <thead><tr><th>Matrícula</th><th>Nombre</th><th>Pres.</th><th>Tard.</th><th>Aus.</th><th>Just.</th><th>% Asistencia</th></tr></thead>
            <tbody>${data.filas.map(f=>{
              const pctA=f.total?Math.round(((f.presentes+f.tardanzas)/f.total)*100):0;
              const color=pctA>=80?'#1db87a':pctA>=60?'#f0a500':'#e84545';
              return `<tr><td><strong>${f.matricula}</strong></td><td>${f.nombre}</td>
                <td style="color:#1db87a;font-weight:700">${f.presentes}</td>
                <td style="color:#f0a500;font-weight:700">${f.tardanzas}</td>
                <td style="color:#e84545;font-weight:700">${f.ausencias}</td>
                <td style="color:#3b82f6;font-weight:700">${f.justificadas}</td>
                <td><div style="display:flex;align-items:center;gap:.5rem"><div class="pct-bar"><div class="pct-fill" style="width:${pctA}%;background:${color}"></div></div><span style="font-weight:700;color:${color}">${pctA}%</span></div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
      </div>`;
  } catch(e) { res.innerHTML=`<div class="card" style="padding:2rem"><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Error: ${e.message}</p></div></div>`; }
}

async function exportarReportePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // ── Encabezado ──────────────────────────────────────
  doc.setFillColor(26,58,110);
  doc.rect(0,0,210,34,'F');
  doc.setTextColor(249,115,22);
  doc.setFontSize(15); doc.setFont('helvetica','bold');
  doc.text('Assisto — Reporte de Asistencia', 14, 13);
  doc.setFontSize(8.5); doc.setTextColor(180,196,220);
  doc.text('Instituto Demo — Sistema Institucional de Control de Asistencia', 14, 22);
  doc.setFontSize(7.5); doc.setTextColor(150,170,200);
  doc.text('Ciclo Escolar ' + new Date().getFullYear() + '-' + (new Date().getFullYear()+1), 14, 30);

  // ── Info del reporte ────────────────────────────────
  doc.setTextColor(90,106,133); doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  const matNombre = document.getElementById('rep-materia').options[document.getElementById('rep-materia').selectedIndex]?.text || 'Todas las materias';
  const grpNombre = document.getElementById('rep-grupo').options[document.getElementById('rep-grupo').selectedIndex]?.text || 'Todos los grupos';
  const fIni = document.getElementById('rep-fecha-ini').value;
  const fFin = document.getElementById('rep-fecha-fin').value;
  doc.text(`Materia: ${matNombre}   |   Grupo: ${grpNombre}`, 14, 42);
  doc.text(`Período: ${fIni} al ${fFin}   |   Elaboró: ${currentUser.nombre}`, 14, 48);

  // ── Tabla ───────────────────────────────────────────
  const rows = [];
  document.querySelectorAll('#tbl-reporte tbody tr').forEach(tr=>{
    const c = tr.querySelectorAll('td');
    rows.push([c[0].textContent, c[1].textContent, c[2].textContent, c[3].textContent,
               c[4].textContent, c[5].textContent, c[6].textContent.trim()]);
  });

  doc.autoTable({
    startY: 54,
    head: [['Matrícula','Nombre del Alumno','Pres.','Tard.','Aus.','Just.','% Asist.']],
    body: rows,
    styles: { fontSize:8.5, cellPadding:3 },
    headStyles: { fillColor:[26,58,110], textColor:[249,115,22], fontStyle:'bold' },
    alternateRowStyles: { fillColor:[248,250,255] },
    columnStyles: {
      0:{cellWidth:22}, 2:{halign:'center'}, 3:{halign:'center'},
      4:{halign:'center'}, 5:{halign:'center'}, 6:{halign:'center',cellWidth:22}
    },
    margin: { bottom: 62 },
    didParseCell(data) {
      if (data.column.index===6 && data.section==='body') {
        const v = parseFloat(data.cell.raw);
        if (!isNaN(v)) {
          data.cell.styles.textColor = v>=80?[15,158,96]:v>=60?[176,122,0]:[192,57,43];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  // ── Firmas ──────────────────────────────────────────
  dibujarFirmas(doc, currentUser.nombre, currentUser.cedula || '');

  const fecha = new Date().toLocaleDateString('es-MX').replace(/\//g,'-');
  doc.save(`reporte_asistencia_${fecha}.pdf`);
  showToast('📄 Reporte exportado con firmas.','success');
}

// ─── MODALS ──────────────────────────────────────────
function openModal(id, reset=false) {
  if (reset) {
    const modal = document.getElementById(id);
    if (modal) modal.querySelectorAll('input:not([type=hidden]):not([type=number]),select').forEach(el => { if(!['g-turno','u-rol','u-estado','p-estado','a-estado'].includes(el.id)) el.value=''; });
    modal?.querySelectorAll('input[type=hidden]').forEach(el=>el.value='');
    modal?.querySelectorAll('select[data-loaded]').forEach(el=>el.removeAttribute('data-loaded'));
  }
  if (id==='modal-usuario') {
    const campusSel = document.getElementById('u-campus');
    if(campusSel) campusSel.dataset.loaded = ''; // forzar recarga
    cargarCampusEnSelect('u-campus');
    if(reset) {
      document.getElementById('tit-usuario').textContent = 'Nuevo Usuario';
      const sec = document.getElementById('u-campus-permisos-section');
      if(sec) sec.style.display = 'none';
    }
    // Listener para mostrar permisos al cambiar rol
    const rolSel = document.getElementById('u-rol');
    if(rolSel && !rolSel.dataset.listenerAdded) {
      rolSel.addEventListener('change', () => {
        const uid = document.getElementById('u-id')?.value;
        mostrarPermisosExtra(rolSel.value, uid ? parseInt(uid) : null);
      });
      rolSel.dataset.listenerAdded = '1';
    }
  }
  if (id==='modal-campus') {
    cargarDirectoresEnSelect('camp-director');
    if(reset) document.getElementById('tit-campus').textContent='Nuevo Campus';
  }
  if (id==='modal-materia') {
    // Cargar catálogo y profesores al abrir
    Promise.all([
      get('/catalogo-materias').catch(()=>[]),
      get('/profesores').catch(()=>[])
    ]).then(([catalogo, profesores]) => {
      const catSel = document.getElementById('m-catalogo');
      if(catSel && catSel.options.length <= 1) {
        catSel.innerHTML = '<option value="">— Materia personalizada / nueva —</option>' +
          catalogo.map(c=>`<option value="${c.id}" data-codigo="${c.codigo}" data-nombre="${c.nombre}" data-creditos="${c.creditos}" data-horas="${c.horas_semana}">${c.codigo} · ${c.nombre}</option>`).join('');
      }
      const profSel = document.getElementById('m-profesor');
      if(profSel && profSel.options.length <= 1) {
        profSel.innerHTML = '<option value="">— Sin docente asignado —</option>' +
          profesores.map(p=>`<option value="${p.id}">${p.nombre}${p.campus_nombre?' ('+p.campus_nombre+')':''}</option>`).join('');
      }
    });
    if(reset) document.getElementById('tit-materia').textContent='Nueva Materia';
  }
  document.getElementById('modal-overlay').classList.add('open');
  document.querySelectorAll('.modal').forEach(m=>m.style.display='none');
  document.getElementById(id).style.display='block';
}
function closeModal(id) {
  document.getElementById(id).style.display='none';
  if(!document.querySelectorAll('.modal[style*="block"]').length)
    document.getElementById('modal-overlay').classList.remove('open');
}
function closeAllModals(e) {
  if(e.target.id==='modal-overlay'){
    document.querySelectorAll('.modal').forEach(m=>m.style.display='none');
    document.getElementById('modal-overlay').classList.remove('open');
  }
}

// ─── TABLA FILTER ────────────────────────────────────
function filterTable(tblId, q) {
  q=q.toLowerCase();
  document.querySelectorAll(`#${tblId} tbody tr`).forEach(r=>{ r.style.display=r.textContent.toLowerCase().includes(q)?'':'none'; });
}
function filterByAttr(tblId, col, val) {
  document.querySelectorAll(`#${tblId} tbody tr`).forEach(r=>{
    r.style.display=(!val||r.cells[col]?.textContent.includes(val))?'':'none';
  });
}

// ─── INIT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (token && currentUser) bootApp();
  document.getElementById('login-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') handleLogin(); });
  document.getElementById('login-user').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('login-pass').focus(); });
});

// ═══════════════════════════════════════════════════
//  SELECCIÓN MASIVA DE ALUMNOS
// ═══════════════════════════════════════════════════
let alumnosSeleccionados = new Set();

function toggleSelectAll(checked) {
  const checks = document.querySelectorAll('.row-check');
  checks.forEach(c => {
    c.checked = checked;
    const id = parseInt(c.dataset.id);
    checked ? alumnosSeleccionados.add(id) : alumnosSeleccionados.delete(id);
    c.closest('tr').classList.toggle('selected', checked);
  });
  actualizarBulkBar();
}

function toggleRowCheck(cb) {
  const id = parseInt(cb.dataset.id);
  cb.checked ? alumnosSeleccionados.add(id) : alumnosSeleccionados.delete(id);
  cb.closest('tr').classList.toggle('selected', cb.checked);
  actualizarBulkBar();
}

function actualizarBulkBar() {
  const n = alumnosSeleccionados.size;
  const bar = document.getElementById('bulk-bar');
  bar.style.display = n > 0 ? 'flex' : 'none';
  document.getElementById('bulk-count').textContent = `${n} alumno${n!==1?'s':''} seleccionado${n!==1?'s':''}`;
}

function deseleccionarTodos() {
  alumnosSeleccionados.clear();
  document.querySelectorAll('.row-check').forEach(c => { c.checked = false; c.closest('tr').classList.remove('selected'); });
  const ca = document.getElementById('check-all'); if(ca) ca.checked = false;
  actualizarBulkBar();
}

// ─── ASIGNAR GRUPO MASIVO ────────────────────────────
async function openAsignarGrupo() {
  if (!alumnosSeleccionados.size) { showToast('Selecciona al menos un alumno.','warning'); return; }
  const grupos = await get('/grupos');
  document.getElementById('asignar-grupo-desc').textContent = `Se asignarán ${alumnosSeleccionados.size} alumno(s) al grupo seleccionado.`;
  document.getElementById('asignar-grupo-sel').innerHTML = grupos.map(g=>`<option value="${g.id}">${g.nombre}</option>`).join('');
  openModal('modal-asignar-grupo');
}

async function confirmarAsignarGrupo() {
  const grupo_id = parseInt(document.getElementById('asignar-grupo-sel').value);
  try {
    const r = await post('/alumnos/asignar-grupo', { alumnoIds: [...alumnosSeleccionados], grupo_id });
    showToast(`✅ ${r.asignados} alumno(s) asignados al grupo.`);
    closeModal('modal-asignar-grupo');
    deseleccionarTodos();
    _alumnosList = [];
    renderAlumnos();
  } catch(e) { showToast(e.message,'error'); }
}

// ─── ASIGNAR MATERIAS MASIVO ─────────────────────────
async function openAsignarMaterias() {
  if (!alumnosSeleccionados.size) { showToast('Selecciona al menos un alumno.','warning'); return; }
  const materias = await get('/materias');
  document.getElementById('asignar-mat-desc').textContent = `Se asignarán las materias seleccionadas a ${alumnosSeleccionados.size} alumno(s).`;
  document.getElementById('materias-checklist').innerHTML = materias.map(m=>`
    <div class="mat-check-item" onclick="toggleMatCheck(this)">
      <input type="checkbox" id="mc-${m.id}" value="${m.id}" onclick="event.stopPropagation()">
      <label for="mc-${m.id}" onclick="event.stopPropagation()">
        <span class="mat-codigo">${m.codigo}</span> ${m.nombre}
      </label>
    </div>`).join('');
  openModal('modal-asignar-materias');
}

function toggleMatCheck(el) {
  const cb = el.querySelector('input');
  cb.checked = !cb.checked;
  el.classList.toggle('checked', cb.checked);
}

async function confirmarAsignarMaterias() {
  const materiaIds = [...document.querySelectorAll('#materias-checklist input:checked')].map(c=>parseInt(c.value));
  if (!materiaIds.length) { showToast('Selecciona al menos una materia.','warning'); return; }
  try {
    const r = await post('/alumnos/asignar-materia', { alumnoIds: [...alumnosSeleccionados], materiaIds });
    showToast(`✅ ${r.asignaciones} asignaciones realizadas.`);
    closeModal('modal-asignar-materias');
    deseleccionarTodos();
  } catch(e) { showToast(e.message,'error'); }
}

// ═══════════════════════════════════════════════════
//  IMPORTAR CSV
// ═══════════════════════════════════════════════════
let csvFilas = [];

async function abrirImportarCSV() {
  const grupos = await get('/grupos');
  document.getElementById('csv-grupo').innerHTML = `<option value="">Sin grupo (asignar después)</option>` +
    grupos.map(g=>`<option value="${g.id}">${g.nombre}</option>`).join('');
}

function leerCSV(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('csv-file-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    const lineas = text.split(/\r?\n/).filter(l => l.trim());
    if (lineas.length < 2) { showToast('El archivo no tiene datos.','error'); return; }

    // Detectar separador: coma o punto y coma
    const sep = lineas[0].includes(';') ? ';' : ',';
    const headers = lineas[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-z]/g,''));

    // Mapear columnas flexiblemente
    const colMap = {};
    headers.forEach((h, i) => {
      if (/matricula|mat|id/.test(h))   colMap.matricula = i;
      if (/nombre|name|alumno/.test(h)) colMap.nombre = i;
      if (/email|correo|mail/.test(h))  colMap.email = i;
      if (/tel|phone|fono/.test(h))     colMap.telefono = i;
      if (/tutor|padre|madre/.test(h))  colMap.tutor = i;
    });

    if (colMap.matricula === undefined || colMap.nombre === undefined) {
      showToast('No se encontraron columnas "matricula" y "nombre".','error'); return;
    }

    csvFilas = lineas.slice(1).map(linea => {
      const cols = linea.split(sep);
      return {
        matricula: cols[colMap.matricula]?.trim() || '',
        nombre:    cols[colMap.nombre]?.trim()    || '',
        email:     cols[colMap.email]?.trim()     || '',
        telefono:  cols[colMap.telefono]?.trim()  || '',
        tutor:     cols[colMap.tutor]?.trim()     || '',
      };
    }).filter(r => r.matricula && r.nombre);

    // Preview
    document.getElementById('csv-preview-count').textContent = `${csvFilas.length} alumnos detectados`;
    document.getElementById('csv-preview-tbody').innerHTML = csvFilas.slice(0,10).map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td><strong>${r.matricula}</strong></td>
        <td>${r.nombre}</td>
        <td>${r.email||'—'}</td>
        <td>${r.tutor||'—'}</td>
      </tr>`).join('') + (csvFilas.length > 10 ? `<tr><td colspan="5" style="text-align:center;color:var(--text-light);font-size:.78rem">... y ${csvFilas.length-10} más</td></tr>` : '');
    document.getElementById('csv-preview').style.display = '';
  };
  reader.readAsText(file, 'UTF-8');
}

function limpiarCSV() {
  csvFilas = [];
  document.getElementById('csv-file-input').value = '';
  document.getElementById('csv-file-name').textContent = '';
  document.getElementById('csv-preview').style.display = 'none';
}

async function importarCSV() {
  if (!csvFilas.length) { showToast('Carga un archivo CSV primero.','warning'); return; }
  const grupo_id = document.getElementById('csv-grupo').value || null;
  try {
    // El servidor espera 'alumnos' y 'grupoId' (con mayuscula I)
    // grupoId se convierte a entero solo si viene un valor, de lo contrario null
    const r = await post('/alumnos/importar-csv', {
      alumnos: csvFilas,
      grupoId: grupo_id ? parseInt(grupo_id) : null
    });
    // El servidor responde con { ok: true, importados: N }
    showToast(`Se importaron ${r.importados} alumnos correctamente.`);
    closeModal('modal-importar-csv');
    limpiarCSV();
    _alumnosList = [];
    renderAlumnos();
  } catch(e) { showToast(e.message,'error'); }
}

// Drag & drop en la zona de CSV
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const zone = document.getElementById('csv-drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) {
        const inp = document.getElementById('csv-file-input');
        const dt = new DataTransfer(); dt.items.add(file);
        inp.files = dt.files;
        leerCSV(inp);
      }
    });
  }, 500);
});

// ═══════════════════════════════════════════════════
//  CUATRIMESTRES
// ═══════════════════════════════════════════════════

// Variable global que guarda el ID del cuatrimestre que se esta editando en el modal
let _cuatriSelId = null;

// Abre el modal para asignar materias a un cuatrimestre especifico
// cuatriId: numero ID del cuatrimestre
// nombre: texto del nombre del cuatrimestre para mostrarlo en el titulo
// campusId: ID del campus al que pertenece, para filtrar las materias correctas
async function openAsignarMateriasCuatri(cuatriId, nombre, campusId) {
  // Guardar el ID para usarlo cuando el usuario confirme la asignacion
  _cuatriSelId = cuatriId;

  // Actualizar el titulo del modal con el nombre del cuatrimestre
  document.getElementById('tit-cuatri-mat').textContent = `Materias del cuatrimestre: ${nombre}`;
  document.getElementById('cuatri-mat-desc').textContent = 'Marca las materias que se impartiran en este periodo. Solo se muestran materias de este campus.';

  // Pedir al servidor las materias disponibles y las ya asignadas al cuatrimestre
  const [todasMaterias, asignadas] = await Promise.all([
    get('/materias'),
    get(`/cuatrimestres/${cuatriId}/materias`).catch(() => [])
  ]);

  // Filtrar solo las materias del campus correcto
  // Si no se recibe campusId, mostrar todas las que tenga el usuario
  const materiasCampus = campusId
    ? todasMaterias.filter(m => m.campus_id == campusId)
    : todasMaterias;

  // Crear un Set con los IDs de las materias ya asignadas para marcar los checkboxes
  const asignadasIds = new Set(asignadas.map(m => m.id));

  // Generar el listado de materias con checkboxes
  const checklist = document.getElementById('cuatri-mat-checklist');
  if (materiasCampus.length) {
    checklist.innerHTML = materiasCampus.map(m => `
      <div class="mat-check-item ${asignadasIds.has(m.id) ? 'checked' : ''}" onclick="toggleMatCheck(this)">
        <input type="checkbox" id="cmc-${m.id}" value="${m.id}"
               ${asignadasIds.has(m.id) ? 'checked' : ''}
               onclick="event.stopPropagation()">
        <label for="cmc-${m.id}" onclick="event.stopPropagation()">
          <span class="mat-codigo">${m.codigo}</span>
          ${m.nombre}
          ${m.profesor_nombre
            ? `<small style="color:var(--text-sub)"> · ${m.profesor_nombre}</small>`
            : '<small style="color:var(--warning)"> · Sin docente</small>'}
        </label>
      </div>`).join('');
  } else {
    // No hay materias para este campus
    checklist.innerHTML = '<p style="font-size:.85rem;color:var(--text-sub);padding:.5rem">No hay materias registradas para este campus. Agrega materias desde Grupos y Materias.</p>';
  }

  // Restaurar el boton del modal a su funcion normal de guardar
  const btn = document.querySelector('#modal-cuatri-materias .modal-footer .btn-primary');
  if (btn) {
    btn.textContent = 'Asignar materias';
    btn.setAttribute('onclick', 'guardarMateriasCuatri()');
  }

  openModal('modal-cuatri-materias');
}

// Guarda la seleccion de materias para el cuatrimestre activo en el modal
// Lee todos los checkboxes marcados y los envia al servidor
async function guardarMateriasCuatri() {
  // Verificar que haya un cuatrimestre seleccionado
  if (!_cuatriSelId) {
    showToast('No hay cuatrimestre seleccionado.', 'warning');
    return;
  }

  // Recolectar los IDs de las materias marcadas como checked
  const materiaIds = [...document.querySelectorAll('#cuatri-mat-checklist input:checked')]
    .map(c => parseInt(c.value));

  try {
    // Enviar al servidor el array de IDs para que los vincule al cuatrimestre
    const r = await post(`/cuatrimestres/${_cuatriSelId}/materias`, { materiaIds });
    showToast(`Se asignaron ${r.asignadas} materias al cuatrimestre.`, 'success');
    closeModal('modal-cuatri-materias');
    // Refrescar la lista de cuatrimestres para actualizar el contador de materias
    renderCuatrimestres();
  } catch(e) {
    showToast(e.message, 'error');
  }
}

async function renderCuatrimestres() {
  const container = document.getElementById('list-cuatrimestres');
  container.innerHTML = `<div style="text-align:center;padding:2rem"><span class="spinner"></span> Cargando...</div>`;

  try {
    const [cuatris, materias] = await Promise.all([get('/cuatrimestres'), get('/materias')]);

    if (!cuatris.length) {
      // Auto-crear los 3 cuatrimestres del 2026 si no existen
      const defaults = [
        { numero:1, anio:2026, nombre:'Cuatrimestre 1 — 2026', fecha_ini:'2026-01-12', fecha_fin:'2026-04-30' },
        { numero:2, anio:2026, nombre:'Cuatrimestre 2 — 2026', fecha_ini:'2026-05-04', fecha_fin:'2026-08-28' },
        { numero:3, anio:2026, nombre:'Cuatrimestre 3 — 2026', fecha_ini:'2026-09-01', fecha_fin:'2026-12-18' },
      ];
      for (const c of defaults) { await post('/cuatrimestres', c); }
      // Activar el 1er cuatrimestre
      const created = await get('/cuatrimestres');
      if (created.length) await put(`/cuatrimestres/${created[0].id}/activar`, {});
      return renderCuatrimestres();
    }

    // Poblar select de materias en modal
    const sel = document.getElementById('cuatri-mat-checklist');

    container.innerHTML = cuatris.map(c => {
      const isActivo = c.activo === 1;
      return `
        <div class="cuatri-card ${isActivo?'activo':''}">
          <div class="cuatri-badge-num">${c.numero}</div>
          <div class="cuatri-info">
            <div class="cuatri-nombre">
              ${c.nombre}
              ${isActivo ? `<span class="badge badge-success" style="margin-left:.5rem;font-size:.68rem">ACTIVO</span>` : ''}
            </div>
            <div class="cuatri-fechas">
              <i class="fas fa-calendar"></i> ${c.fecha_ini} → ${c.fecha_fin}
              &nbsp;·&nbsp; <i class="fas fa-book"></i> ${c.total_materias || 0} materias asignadas
            </div>
          </div>
          <div class="cuatri-actions">
            ${!isActivo ? `<button class="btn-secondary" onclick="activarCuatrimestre(${c.id})" style="height:34px;font-size:.8rem"><i class="fas fa-check"></i> Activar</button>` : ''}
            <button class="btn-ghost"
              onclick="openAsignarMateriasCuatri(${c.id},'${c.nombre.replace(/'/g,"\\'")}',${c.campus_id||'null'})"
              style="height:34px;font-size:.8rem"
              title="Seleccionar que materias se imparten en este cuatrimestre">
              <i class="fas fa-book-open"></i> Materias (${c.total_materias||0})
            </button>
          </div>
        </div>`;
    }).join('');

    // Fechas por defecto en el modal
    const anioActual = new Date().getFullYear();
    document.getElementById('cuat-anio').value = anioActual;
    setCuatriFechas();

  } catch(e) {
    container.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

function setCuatriFechas() {
  const num  = parseInt(document.getElementById('cuat-numero')?.value || 1);
  const anio = parseInt(document.getElementById('cuat-anio')?.value || 2026);
  const fechas = {
    1: { ini:`${anio}-01-12`, fin:`${anio}-04-30` },
    2: { ini:`${anio}-05-04`, fin:`${anio}-08-28` },
    3: { ini:`${anio}-09-01`, fin:`${anio}-12-18` },
  };
  const f = fechas[num] || fechas[1];
  const iniEl = document.getElementById('cuat-ini');
  const finEl = document.getElementById('cuat-fin');
  if(iniEl) iniEl.value = f.ini;
  if(finEl) finEl.value = f.fin;
}

// Auto-rellenar fechas cuando cambia el número o año
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const numEl  = document.getElementById('cuat-numero');
    const anioEl = document.getElementById('cuat-anio');
    if(numEl)  numEl.addEventListener('change', setCuatriFechas);
    if(anioEl) anioEl.addEventListener('input',  setCuatriFechas);
  }, 600);
});

async function guardarCuatrimestre() {
  const body = {
    numero:    parseInt(document.getElementById('cuat-numero').value),
    anio:      parseInt(document.getElementById('cuat-anio').value),
    nombre:    document.getElementById('cuat-nombre').value || null,
    fecha_ini: document.getElementById('cuat-ini').value,
    fecha_fin: document.getElementById('cuat-fin').value,
  };
  if (!body.fecha_ini || !body.fecha_fin) { showToast('Fechas requeridas.','warning'); return; }
  try {
    await post('/cuatrimestres', body);
    showToast('Cuatrimestre creado.','success');
    closeModal('modal-cuatrimestre');
    renderCuatrimestres();
  } catch(e) { showToast(e.message,'error'); }
}

async function renderCampus() {
  const grid = document.getElementById('grid-campus');
  grid.innerHTML = `<div style="padding:2rem;text-align:center"><span class="spinner"></span></div>`;
  try {
    const campus = await get('/campus');
    grid.innerHTML = campus.map(c => `
      <div class="campus-card ${c.activo?'':'campus-inactivo'}">
        <div class="campus-header">
          <div class="campus-clave">${c.clave}</div>
          <div style="display:flex;gap:.4rem;align-items:center">
            ${c.tiene_cuatri_activo ? '<span title="Tiene cuatrimestre activo" style="color:#1db87a;font-size:.8rem"><i class="fas fa-check-circle"></i></span>' : '<span title="Sin cuatrimestre activo" style="color:#f0a500;font-size:.8rem"><i class="fas fa-exclamation-circle"></i></span>'}
            <button class="action-btn edit" onclick="editCampus(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="action-btn" onclick="gestionarPermisosCampus(${c.id},'${c.nombre.replace(/'/g,"\'")}')" title="Gestionar accesos" style="background:rgba(0,48,135,.08);color:var(--unitec-blue)"><i class="fas fa-user-shield"></i></button>
          </div>
        </div>
        <div class="campus-nombre">${c.nombre}</div>
        <div class="campus-ubicacion"><i class="fas fa-map-marker-alt"></i> ${c.ciudad||'—'}${c.estado_rep?', '+c.estado_rep:''}</div>
        <div class="campus-director">
          <i class="fas fa-user-tie"></i>
          ${c.director_nombre ? `<span>${c.director_nombre}</span><small style="color:var(--text-light)">${c.director_email||''}</small>` : '<span style="color:var(--warning);font-size:.78rem">Sin director asignado</span>'}
        </div>
        <div class="campus-stats">
          <div class="campus-stat"><span>${c.total_alumnos||0}</span><small>Alumnos</small></div>
          <div class="campus-stat"><span>${c.total_grupos||0}</span><small>Grupos</small></div>
          <div class="campus-stat"><span>${c.total_usuarios||0}</span><small>Usuarios</small></div>
        </div>
      </div>`).join('') || `<div class="empty-state"><i class="fas fa-building"></i><p>Sin campus registrados</p></div>`;
  } catch(e) { grid.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`; }
}

let _campusList = [];
async function editCampus(id) {
  if(!_campusList.length) _campusList = await get('/campus');
  const c = _campusList.find(x=>x.id===id); if(!c) return;
  document.getElementById('camp-id').value=c.id;
  document.getElementById('camp-nombre').value=c.nombre;
  document.getElementById('camp-clave').value=c.clave;
  document.getElementById('camp-ciudad').value=c.ciudad||'';
  document.getElementById('camp-estado').value=c.estado_rep||'';
  document.getElementById('camp-dir').value=c.direccion||'';
  document.getElementById('camp-tel').value=c.telefono||'';
  document.getElementById('camp-email').value=c.email||'';
  // Cargar directores disponibles
  await cargarDirectoresEnSelect('camp-director');
  document.getElementById('camp-director').value=c.director_id||'';
  document.getElementById('tit-campus').textContent='Editar Campus';
  openModal('modal-campus');
}

function autorellenarMateria(sel) {
  const opt = sel.options[sel.selectedIndex];
  if(!opt.value) return;
  const codigo   = opt.dataset.codigo;
  const nombre   = opt.dataset.nombre;
  const creditos = opt.dataset.creditos;
  const horas    = opt.dataset.horas;
  if(codigo)   document.getElementById('m-codigo').value   = codigo;
  if(nombre)   document.getElementById('m-nombre').value   = nombre;
  if(creditos) document.getElementById('m-creditos').value = creditos;
  if(horas)    document.getElementById('m-horas').value    = horas;
}

async function cargarDirectoresEnSelect(selectId) {
  const sel = document.getElementById(selectId);
  if(!sel) return;
  try {
    const usuarios = await get('/usuarios');
    const dirs = usuarios.filter(u=>u.rol==='director'||u.rol==='superadmin');
    sel.innerHTML = '<option value="">— Sin director asignado —</option>' +
      dirs.map(u=>`<option value="${u.id}">${u.nombre} (${u.rol})</option>`).join('');
  } catch{}
}

async function guardarCampus() {
  const id = document.getElementById('camp-id').value;
  const directorVal = document.getElementById('camp-director')?.value;
  const body = {
    nombre:     document.getElementById('camp-nombre').value,
    clave:      document.getElementById('camp-clave').value.toUpperCase(),
    ciudad:     document.getElementById('camp-ciudad').value,
    estado_rep: document.getElementById('camp-estado').value,
    direccion:  document.getElementById('camp-dir').value,
    telefono:   document.getElementById('camp-tel').value,
    email:      document.getElementById('camp-email').value,
    director_id: directorVal ? parseInt(directorVal) : null,
    activo: 1,
  };
  if(!body.nombre||!body.clave){ showToast('Nombre y clave son requeridos','warning'); return; }
  try {
    id ? await put(`/campus/${id}`,body) : await post('/campus',body);
    showToast(id?'Campus actualizado':'Campus creado ✅');
    closeModal('modal-campus'); _campusList=[];
    renderCampus();
  } catch(e){ showToast(e.message,'error'); }
}

// ═══════════════════════════════════════════════════
//  HORARIOS DE MATERIAS
// ═══════════════════════════════════════════════════
const DIAS = ['','Lunes','Martes','Miércoles','Jueves','Viernes'];

async function abrirHorarios(materiaId, materiaNombre) {
  document.getElementById('hor-materia-id').value = materiaId;
  document.getElementById('tit-horarios').textContent = `Horarios — ${materiaNombre}`;

  // Llenar select de grupos
  const grupos = await get('/grupos');
  document.getElementById('hor-grupo').innerHTML = grupos.map(g=>`<option value="${g.id}">${g.nombre}</option>`).join('');

  await recargarHorarios(materiaId);
  openModal('modal-horarios');
}

async function recargarHorarios(materiaId) {
  const mid = materiaId || document.getElementById('hor-materia-id').value;
  const horarios = await get(`/materias/${mid}/horarios`);
  const container = document.getElementById('lista-horarios');
  if (!horarios.length) {
    container.innerHTML = '<p style="font-size:.82rem;color:var(--text-sub)">Sin horarios configurados.</p>';
    return;
  }
  container.innerHTML = `
    <table class="data-table" style="font-size:.82rem">
      <thead><tr><th>Día</th><th>Hora</th><th>Grupo</th><th>Aula</th><th></th></tr></thead>
      <tbody>
        ${horarios.map(h=>`
          <tr>
            <td><strong>${DIAS[h.dia_semana]}</strong></td>
            <td>${h.hora_ini} – ${h.hora_fin}</td>
            <td>${h.grupo_nombre||'—'}</td>
            <td>${h.aula||'—'}</td>
            <td><button class="action-btn del" onclick="borrarHorario(${h.id})" title="Eliminar"><i class="fas fa-trash"></i></button></td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

async function agregarHorario() {
  const mid = document.getElementById('hor-materia-id').value;
  const body = {
    grupo_id:   parseInt(document.getElementById('hor-grupo').value),
    dia_semana: parseInt(document.getElementById('hor-dia').value),
    hora_ini:   document.getElementById('hor-ini').value,
    hora_fin:   document.getElementById('hor-fin').value,
    aula:       document.getElementById('hor-aula').value,
  };
  if(!body.hora_ini||!body.hora_fin){ showToast('Ingresa hora inicio y fin','warning'); return; }
  if(body.hora_ini >= body.hora_fin){ showToast('Hora fin debe ser mayor que hora inicio','warning'); return; }
  try {
    await post(`/materias/${mid}/horarios`, body);
    showToast(`Horario ${DIAS[body.dia_semana]} ${body.hora_ini}-${body.hora_fin} agregado ✅`);
    recargarHorarios(mid);
  } catch(e){ showToast(e.message,'error'); }
}

async function borrarHorario(id) {
  if(!confirm('¿Eliminar este bloque horario?')) return;
  try {
    await del(`/horarios/${id}`);
    const mid = document.getElementById('hor-materia-id').value;
    showToast('Horario eliminado','warning');
    recargarHorarios(mid);
  } catch(e){ showToast(e.message,'error'); }
}
