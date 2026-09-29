/* ════════════════════════════════════════════════════════════════
   ACD System — Matriz de Monitoreo PREPROD
   app.js  —  Solo lectura. No escribe en TicketApi.
   ════════════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────────────────────
   CONFIG
   ────────────────────────────────────────────────────────────── */
const CFG = {
  SECURITY_BASE:  'https://gserpreprod.itsmwtt.com/security',
  TICKET_BASE:    'https://gserpreprod.itsmwtt.com/ticket',
  // AUTH_USER / AUTH_PASS eliminados — se ingresan en runtime via modal de auth
  // Ver js/services/auth.js para la implementación con sessionStorage
  DEFAULT_TICKET: '10089241',
};

/* ──────────────────────────────────────────────────────────────
   STATE  (token sólo en memoria JS — nunca al DOM)
   ────────────────────────────────────────────────────────────── */
const STATE = {
  token: null,
  ticketId: CFG.DEFAULT_TICKET,
  ticket: null,
  candidates: [],
  geolocations: [],
  loading: false,
};

/* ──────────────────────────────────────────────────────────────
   DOM REFS
   ────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const DOM = {
  sidebar:         $('sidebar'),
  mainContent:     $('mainContent'),
  sidebarToggle:   $('sidebarToggle'),
  loadBtn:         $('loadBtn'),
  ticketInput:     $('ticketIdInput'),
  liveClock:       $('liveClock'),
  statusDot:       document.querySelector('.connection-status .dot'),
  statusText:      $('statusText'),
  // Cards
  cardTicketId:    $('cardTicketId'),
  cardEstadoVal:   $('cardEstadoVal'),
  cardCandidatosVal:$('cardCandidatosVal'),
  cardGpsVal:      $('cardGpsVal'),
  cardServicioVal: $('cardServicioVal'),
  // Panels
  detailGrid:      $('detailGrid'),
  matrixBody:      $('matrixBody'),
  matrixSearch:    $('matrixSearch'),
  // Modal
  modalOverlay:    $('modalOverlay'),
  modalClose:      $('modalClose'),
  modalTitle:      $('modalTitle'),
  modalBody:       $('modalBody'),
  // Toasts
  toastContainer:  $('toastContainer'),
};

/* ──────────────────────────────────────────────────────────────
   MAP
   ────────────────────────────────────────────────────────────── */
let leafletMap = null;
let markersLayer = null;

function initMap(lat = 19.4326, lng = -99.1332) {
  if (leafletMap) return;
  leafletMap = L.map('map', { zoomControl: true }).setView([lat, lng], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);
  markersLayer = L.layerGroup().addTo(leafletMap);
}

function clearMapMarkers() {
  if (markersLayer) markersLayer.clearLayers();
}

function buildTicketIcon() {
  return L.divIcon({
    html: `<div style="
      background:#ef4444;border:2px solid #fff;border-radius:50% 50% 50% 0;
      width:28px;height:28px;transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;">
      <i class='fa-solid fa-ticket' style='transform:rotate(45deg);color:#fff;font-size:11px;'></i>
    </div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

function buildCandidateIcon(hasGps) {
  const color = hasGps ? '#3b82f6' : '#64748b';
  return L.divIcon({
    html: `<div style="
      background:${color};border:2px solid #fff;border-radius:50%;
      width:22px;height:22px;
      box-shadow:0 2px 8px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;">
      <i class='fa-solid fa-user' style='color:#fff;font-size:10px;'></i>
    </div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

function drawMapMarkers(ticketCoords, candidatesWithGps) {
  clearMapMarkers();
  const bounds = [];

  // Ticket marker
  if (ticketCoords) {
    const { lat, lng } = ticketCoords;
    const m = L.marker([lat, lng], { icon: buildTicketIcon() })
      .bindPopup(`<div class="popup-title">🎫 Ticket #${STATE.ticketId}</div>
        <div class="popup-row"><span>Dirección</span><span>${ticketCoords.address || 'Ver detalle'}</span></div>`)
      .addTo(markersLayer);
    bounds.push([lat, lng]);
    m.openPopup();
  }

  // Candidate markers
  candidatesWithGps.forEach(c => {
    if (!c.lat || !c.lng) return;
    const dist = ticketCoords ? haversine(ticketCoords.lat, ticketCoords.lng, c.lat, c.lng) : null;
    const distTxt = dist !== null ? `${dist.toFixed(2)} km` : 'N/A';
    L.marker([c.lat, c.lng], { icon: buildCandidateIcon(true) })
      .bindPopup(`
        <div class="popup-title">${escHtml(c.name || 'Sin nombre')}</div>
        <div class="popup-row"><span>User ID</span><span>${escHtml(String(c.userId || '—'))}</span></div>
        <div class="popup-row"><span>Distancia</span><span>${distTxt}</span></div>
        <div class="popup-row"><span>GPS</span><span style="color:#22c55e">✓ Real</span></div>
      `)
      .addTo(markersLayer);
    bounds.push([c.lat, c.lng]);
  });

  // Fit map to markers
  if (bounds.length > 1) {
    leafletMap.fitBounds(bounds, { padding: [40, 40] });
  } else if (bounds.length === 1) {
    leafletMap.setView(bounds[0], 13);
  }
}

/* ──────────────────────────────────────────────────────────────
   UTILS
   ────────────────────────────────────────────────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(iso));
  } catch { return iso; }
}

function renderStatusPill(status) {
  if (!status) return '—';
  const s = String(status).toLowerCase();
  let cls = 'status-default';
  if (s.includes('asigna') || s.includes('assign') || s.includes('dispatc')) cls = 'status-assigned';
  else if (s.includes('cerr') || s.includes('close') || s.includes('complet') || s.includes('finish')) cls = 'status-closed';
  else if (s.includes('abiert') || s.includes('open') || s.includes('new') || s.includes('nueva')) cls = 'status-open';
  else if (s.includes('progreso') || s.includes('progress') || s.includes('transit') || s.includes('viaje')) cls = 'status-progress';
  else if (s.includes('cancel') || s.includes('reject')) cls = 'status-cancelled';
  else if (s.includes('pend')) cls = 'status-pending';
  return `<span class="status-pill ${cls}">${escHtml(status)}</span>`;
}

/* ──────────────────────────────────────────────────────────────
   CLOCK
   ────────────────────────────────────────────────────────────── */
function startClock() {
  function tick() {
    const now = new Date();
    DOM.liveClock.textContent = now.toLocaleTimeString('es-MX', { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

/* ──────────────────────────────────────────────────────────────
   TOAST
   ────────────────────────────────────────────────────────────── */
function toast(msg, type = 'error', duration = 5000) {
  const icons = { error: 'fa-circle-xmark', success: 'fa-circle-check', warning: 'fa-triangle-exclamation' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.error}"></i><span>${escHtml(msg)}</span>`;
  DOM.toastContainer.prepend(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(100%)';
    t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, duration);
}

/* ──────────────────────────────────────────────────────────────
   STATUS INDICATOR
   ────────────────────────────────────────────────────────────── */
function setStatus(state, msg) {
  DOM.statusDot.className = 'dot dot-' + state;
  DOM.statusText.textContent = msg;
}

/* ──────────────────────────────────────────────────────────────
   API HELPERS
   ────────────────────────────────────────────────────────────── */
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
  }
  return res.json();
}

/* ──────────────────────────────────────────────────────────────
   AUTH
   ────────────────────────────────────────────────────────────── */
async function authenticate() {
  setStatus('loading', 'Autenticando…');
  const url = `${CFG.SECURITY_BASE}/api/v1/Integration/get-token`;
  const body = { userName: CFG.AUTH_USER, password: CFG.AUTH_PASS };
  const data = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
  // token lives inside downstreamTokens.ticketApiToken
  const token = data?.downstreamTokens?.ticketApiToken
              || data?.ticketApiToken
              || data?.token
              || data?.access_token
              || data?.accessToken;
  if (!token) throw new Error('Token no encontrado en la respuesta de autenticación');
  STATE.token = token;  // stored only in JS memory, never rendered
  setStatus('ok', 'PREPROD conectado');
  toast('Autenticación exitosa', 'success', 3000);
}

/* ──────────────────────────────────────────────────────────────
   FETCH TICKET
   PREPROD wraps the payload as response.data.data → unwrap here.
   ────────────────────────────────────────────────────────────── */
async function fetchTicket(ticketId) {
  const url      = `${CFG.TICKET_BASE}/api/v1/Tickets/${ticketId}`;
  const response = await apiFetch(url);
  // Unwrap envelope: response.data.data → response.data → response
  return response?.data?.data ?? response?.data ?? response;
}

/* ──────────────────────────────────────────────────────────────
   FETCH CANDIDATES
   ────────────────────────────────────────────────────────────── */
async function fetchCandidates(ticketId) {
  const url = `${CFG.TICKET_BASE}/api/v1/Assignations/getAssignableTaskForceByTicketsId`;
  const body = { ticketsId: [Number(ticketId)] };
  const data = await apiFetch(url, { method: 'POST', body: JSON.stringify(body) });
  // Response may be array or { data: [...] }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.taskForces)) return data.taskForces;
  return [];
}

/* ──────────────────────────────────────────────────────────────
   FETCH GPS GEOLOCATIONS
   ────────────────────────────────────────────────────────────── */
async function fetchGeolocations() {
  const url = `${CFG.TICKET_BASE}/api/v1/TaskForce/Geolocations`;
  const data = await apiFetch(url);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.geolocations)) return data.geolocations;
  return [];
}

/* ──────────────────────────────────────────────────────────────
   EXTRACT TICKET COORDINATES
   The ticket object may have location in several shapes:
   ticket.location.coordinates, ticket.latitude/longitude,
   ticket.address.latitude, etc.
   ────────────────────────────────────────────────────────────── */
function extractTicketCoords(ticket) {
  if (!ticket) return null;

  // Real PREPROD field names (primary)
  const lat = Number(ticket.ticketLocationLatitude);
  const lng = Number(ticket.ticketLocationLongitude);
  if (lat && lng) {
    return { lat, lng, address: ticket.ticketLocationAddress || '' };
  }

  // Fallbacks for other possible shapes
  if (ticket.latitude && ticket.longitude)
    return { lat: Number(ticket.latitude), lng: Number(ticket.longitude), address: ticket.address || '' };

  const loc = ticket.location || ticket.geoLocation || ticket.geolocation;
  if (loc) {
    if (loc.latitude && loc.longitude)
      return { lat: Number(loc.latitude), lng: Number(loc.longitude), address: loc.address || ticket.address || '' };
    if (loc.lat && loc.lng)
      return { lat: Number(loc.lat), lng: Number(loc.lng), address: ticket.address || '' };
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2)
      return { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]), address: ticket.address || '' };
  }

  const addr = ticket.address;
  if (addr && typeof addr === 'object' && addr.latitude && addr.longitude)
    return { lat: Number(addr.latitude), lng: Number(addr.longitude), address: addr.street || '' };

  return null;
}

/* ──────────────────────────────────────────────────────────────
   MERGE CANDIDATES WITH GPS
   ────────────────────────────────────────────────────────────── */
function mergeCandidatesGps(candidates, geolocations) {
  // Build userId → geo lookup
  const geoMap = {};
  geolocations.forEach(g => {
    const uid = g.userId || g.taskForceId || g.id;
    if (uid) geoMap[String(uid)] = g;
  });

  return candidates.map(c => {
    const uid = String(c.userId || c.taskForceId || c.id || '');
    const geo = geoMap[uid];
    let lat = null, lng = null;
    if (geo) {
      lat = Number(geo.latitude || geo.lat || 0);
      lng = Number(geo.longitude || geo.lng || geo.lon || 0);
      if (lat === 0 && lng === 0) { lat = null; lng = null; }
    }
    return { ...c, lat, lng, hasGps: !!(lat && lng) };
  });
}

/* ──────────────────────────────────────────────────────────────
   DUMMY DATA GENERATORS
   All dummy values are clearly marked SIMULADO
   ────────────────────────────────────────────────────────────── */
const SPECIALTIES   = ['Redes','CCTV','Servidores','Helpdesk','Telecomunicaciones','Infraestructura','Cloud','Seguridad'];
const ZONES         = ['CDMX Norte','CDMX Sur','CDMX Oriente','CDMX Poniente','Estado de México','Querétaro','Guadalajara','Monterrey'];
const AVAIL_STATES  = ['Disponible','Disponible','Disponible','Parcial','No disponible'];

function fakeSeed(uid) {
  // Deterministic seed from userId so values don't change per render
  let h = 0;
  for (const ch of String(uid)) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function dummyAvailability(uid) {
  const s = fakeSeed(uid);
  return AVAIL_STATES[s % AVAIL_STATES.length];
}
function dummyActiveTickets(uid) {
  return fakeSeed(uid) % 5; // 0-4
}
function dummySpecialty(uid) {
  return SPECIALTIES[fakeSeed(uid) % SPECIALTIES.length];
}
function dummyZone(uid) {
  return ZONES[(fakeSeed(uid) >> 2) % ZONES.length];
}

/* ──────────────────────────────────────────────────────────────
   RENDER SUMMARY CARDS
   ────────────────────────────────────────────────────────────── */
function renderCards(ticket, candidates, gpsCount) {
  DOM.cardTicketId.textContent      = `#${STATE.ticketId}`;
  DOM.cardCandidatosVal.textContent = candidates.length;
  DOM.cardGpsVal.textContent        = gpsCount;

  // Status — real PREPROD field first
  const status = ticket?.ticketStatusName
              || ticket?.status?.name || ticket?.status || ticket?.state || '—';
  DOM.cardEstadoVal.innerHTML = renderStatusPill(status);

  // Service — real PREPROD field first
  const svc = ticket?.ticketServiceName
           || ticket?.service?.name || ticket?.serviceName || ticket?.category?.name || '—';
  DOM.cardServicioVal.textContent = svc;
}

/* ──────────────────────────────────────────────────────────────
   RENDER TICKET DETAIL PANEL
   Field mapping: real PREPROD names as primary, fallbacks second.
   ────────────────────────────────────────────────────────────── */
function renderTicketDetail(ticket) {
  if (!ticket) {
    DOM.detailGrid.innerHTML = '<div class="detail-loading">Sin datos de ticket.</div>';
    return;
  }

  const t = ticket;

  // ── Real PREPROD fields (primary) with generic fallbacks ──
  const id       = t.ticketId       || t.id       || t.folio            || STATE.ticketId;
  const status   = t.ticketStatusName || t.status?.name || t.status     || t.state || '—';
  const client   = t.ticketClientName || t.client?.name || t.clientName || t.customer?.name || '—';
  const service  = t.ticketServiceName || t.service?.name || t.serviceName || t.category?.name || '—';
  const desc     = t.onSiteTaskDescription || t.description || t.subject || t.title || '—';
  const address  = t.ticketLocationAddress || t.address?.fullAddress || t.address?.street
                || (typeof t.address === 'string' ? t.address : null) || t.locationDescription || '—';
  const created  = formatDate(t.ticketCreationDateUTC || t.createdAt || t.creationDate || t.created);

  // SLA — two real fields from PREPROD
  const slaResponse  = t.slaResponseTime     || null;   // e.g. "4h"
  const slaDeadline  = t.ticketAttentionTime || t.sla?.deadline || t.slaDeadline || t.dueDate || null;
  const slaDeadlineTxt = slaDeadline ? formatDate(slaDeadline) : '—';
  const slaResponseTxt = slaResponse ? String(slaResponse) : '—';

  // Engineer — real PREPROD fields
  const engineer   = t.ticketAssignedEngineerFullName || t.assignedTo?.name || t.assignedUser?.name || null;
  const engineerId = t.ticketAssignedEnginnerId       || t.ticketAssignedEngineerId || null;  // note: API typo "Enginner"
  const hasEngineer = !!(engineer);

  // Progress — real if flags.ticketProgress exists, else dummy
  const progressReal = t.flags?.ticketProgress ?? t.progress ?? t.completionPercentage ?? null;
  const progress     = progressReal !== null ? Math.min(100, Math.max(0, Number(progressReal))) : (fakeSeed(String(id)) % 60 + 10);
  const progressSim  = progressReal === null;

  // SLA deadline traffic-light
  let slaClass = '';
  if (slaDeadline) {
    const rem = new Date(slaDeadline) - new Date();
    if (rem < 0)            slaClass = 'sla-bad';
    else if (rem < 3600000) slaClass = 'sla-warn';
    else                    slaClass = 'sla-good';
  }

  DOM.detailGrid.innerHTML = `
    <div class="detail-item">
      <div class="detail-label">Ticket ID</div>
      <div class="detail-value">#${escHtml(String(id))}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Estado</div>
      <div class="detail-value">${renderStatusPill(status)}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Cliente</div>
      <div class="detail-value">${escHtml(client)}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Servicio</div>
      <div class="detail-value">${escHtml(service)}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item full-width">
      <div class="detail-label">Descripción (onSiteTaskDescription)</div>
      <div class="detail-value" style="font-weight:400;font-size:.8rem;color:var(--text-secondary)">
        ${escHtml(desc)}<span class="badge-real">REAL</span>
      </div>
    </div>
    <div class="detail-item full-width">
      <div class="detail-label">Ubicación / Dirección</div>
      <div class="detail-value" style="font-size:.8rem">${escHtml(address)}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Creado (UTC)</div>
      <div class="detail-value" style="font-size:.8rem">${escHtml(created)}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item">
      <div class="detail-label">SLA Tiempo de Respuesta</div>
      <div class="detail-value" style="font-size:.8rem">${escHtml(slaResponseTxt)}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item full-width">
      <div class="detail-label">SLA Deadline (ticketAttentionTime)</div>
      <div class="detail-value ${slaClass}" style="font-size:.8rem">${escHtml(slaDeadlineTxt)}<span class="badge-real">REAL</span></div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Ingeniero Asignado<span class="badge-real">REAL</span></div>
      <div class="detail-value">${escHtml(engineer || 'Sin asignar')}</div>
    </div>
    <div class="detail-item">
      <div class="detail-label">Engineer ID<span class="badge-real">REAL</span></div>
      <div class="detail-value" style="font-family:monospace;font-size:.8rem;color:var(--info)">
        ${escHtml(String(engineerId ?? '—'))}
      </div>
    </div>
    <div class="detail-item full-width">
      <div class="detail-label">
        Progreso (flags.ticketProgress)
        ${progressSim ? '<span class="badge-simulated">SIMULADO</span>' : '<span class="badge-real">REAL</span>'}
      </div>
      <div class="detail-value">
        ${progress}%
        <div class="progress-bar-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
      </div>
    </div>
  `;
}

/* ──────────────────────────────────────────────────────────────
   STATUS PILL HELPER
   ────────────────────────────────────────────────────────────── */
function renderStatusPill(status) {
  const s = String(status).toLowerCase();
  let cls = 'open';
  if (s.includes('progres') || s.includes('curso') || s.includes('proceso')) cls = 'progress';
  else if (s.includes('resuel') || s.includes('solved') || s.includes('complet')) cls = 'resolved';
  else if (s.includes('cerr') || s.includes('closed') || s.includes('cancel')) cls = 'closed';
  else if (s.includes('asign') || s.includes('assign')) cls = 'assigned';
  return `<span class="status-pill ${cls}">${escHtml(status)}</span>`;
}

/* ──────────────────────────────────────────────────────────────
   RENDER MATRIX TABLE
   ────────────────────────────────────────────────────────────── */
function renderMatrix(candidates, ticketCoords, filter = '') {
  const fl = filter.toLowerCase();
  const rows = candidates.filter(c => {
    if (!fl) return true;
    const name  = (c.name || c.taskForceName || c.fullName || '').toLowerCase();
    const uid   = String(c.userId || c.taskForceId || c.id || '').toLowerCase();
    const email = (c.email || c.emailAddress || '').toLowerCase();
    return name.includes(fl) || uid.includes(fl) || email.includes(fl);
  });

  if (rows.length === 0) {
    DOM.matrixBody.innerHTML = `<tr><td colspan="11" class="table-loading">Sin candidatos para mostrar.</td></tr>`;
    return;
  }

  DOM.matrixBody.innerHTML = rows.map((c, idx) => {
    const uid    = c.userId || c.taskForceId || c.id || `candidate-${idx}`;
    const name   = c.name || c.taskForceName || c.fullName || c.firstName + ' ' + (c.lastName || '') || '—';
    const email  = c.email || c.emailAddress || c.mail || '—';
    const hasGps = c.hasGps;

    // Distance
    let distTxt = '<span class="gps-no">—</span>';
    if (hasGps && ticketCoords) {
      const d = haversine(ticketCoords.lat, ticketCoords.lng, c.lat, c.lng);
      distTxt = `<span class="gps-yes">${d.toFixed(2)} km</span>`;
    }

    // Dummy fields
    const avail   = dummyAvailability(uid);
    const tickets = dummyActiveTickets(uid);
    const spec    = dummySpecialty(uid);
    const zone    = dummyZone(uid);

    const availClass = { 'Disponible': 'avail-available', 'Parcial': 'avail-partial', 'No disponible': 'avail-unavailable' }[avail] || '';

    return `<tr data-candidate='${JSON.stringify({
      uid, name: name.trim(), email, hasGps,
      lat: c.lat, lng: c.lng,
      avail, tickets, spec, zone,
      distTxt: hasGps && ticketCoords ? haversine(ticketCoords.lat, ticketCoords.lng, c.lat, c.lng).toFixed(2) + ' km' : '—'
    }).replace(/'/g, "&#39;")}'>
      <td style="color:var(--text-muted)">${idx + 1}</td>
      <td style="font-weight:600">${escHtml(name.trim())}</td>
      <td style="font-family:monospace;color:var(--info)">${escHtml(String(uid))}</td>
      <td style="color:var(--text-secondary)">${escHtml(email)}</td>
      <td>${hasGps
        ? '<i class="fa-solid fa-satellite-dish gps-yes" title="GPS disponible"></i> <span class="gps-yes">Sí</span>'
        : '<i class="fa-solid fa-ban gps-no" title="Sin GPS"></i> <span class="gps-no">No</span>'}</td>
      <td>${distTxt}</td>
      <td><span class="${availClass}">${escHtml(avail)}</span><span class="badge-simulated">SIMULADO</span></td>
      <td>${tickets}<span class="badge-simulated">SIMULADO</span></td>
      <td>${escHtml(spec)}<span class="badge-simulated">SIMULADO</span></td>
      <td>${escHtml(zone)}<span class="badge-simulated">SIMULADO</span></td>
      <td><button class="btn-detail" onclick="showCandidateDetail(this)"><i class="fa-solid fa-eye"></i> Ver</button></td>
    </tr>`;
  }).join('');
}

/* ──────────────────────────────────────────────────────────────
   CANDIDATE DETAIL MODAL
   ────────────────────────────────────────────────────────────── */
window.showCandidateDetail = function(btn) {
  const row  = btn.closest('tr');
  const data = JSON.parse(row.dataset.candidate);

  DOM.modalTitle.textContent = data.name;
  DOM.modalBody.innerHTML = `
    ${modalRow('User ID',   data.uid,   true)}
    ${modalRow('Email',     data.email, true)}
    ${modalRow('GPS',       data.hasGps ? '✓ Disponible (Real)' : '✗ No disponible', true)}
    ${modalRow('Latitud',   data.lat ?? '—', true)}
    ${modalRow('Longitud',  data.lng ?? '—', true)}
    ${modalRow('Distancia al Ticket', data.distTxt, true)}
    ${modalRow('Disponibilidad', data.avail, false)}
    ${modalRow('Tickets Activos', data.tickets, false)}
    ${modalRow('Especialidad', data.spec, false)}
    ${modalRow('Zona', data.zone, false)}
  `;
  DOM.modalOverlay.style.display = 'flex';
};

function modalRow(label, value, isReal) {
  const badge = isReal
    ? '<span class="badge-real">REAL</span>'
    : '<span class="badge-simulated">SIMULADO</span>';
  return `<div class="modal-row">
    <span class="modal-label">${escHtml(label)}</span>
    <span class="modal-value">${escHtml(String(value))} ${badge}</span>
  </div>`;
}

/* ──────────────────────────────────────────────────────────────
   MAIN LOAD FLOW
   ────────────────────────────────────────────────────────────── */
async function loadAll() {
  if (STATE.loading) return;
  STATE.loading = true;
  DOM.loadBtn.disabled = true;
  DOM.loadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando…';

  // Reset UI
  DOM.detailGrid.innerHTML = '<div class="detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ticket…</div>';
  DOM.matrixBody.innerHTML = '<tr><td colspan="11" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando candidatos…</td></tr>';
  DOM.cardTicketId.textContent = `#${STATE.ticketId}`;
  DOM.cardEstadoVal.textContent = '…';
  DOM.cardCandidatosVal.textContent = '…';
  DOM.cardGpsVal.textContent = '…';
  DOM.cardServicioVal.textContent = '…';

  try {
    // 1. Auth
    if (!STATE.token) await authenticate();

    setStatus('loading', 'Cargando datos…');

    // 2. Parallel: ticket + candidates + geolocations
    const [ticket, rawCandidates, geolocations] = await Promise.allSettled([
      fetchTicket(STATE.ticketId),
      fetchCandidates(STATE.ticketId),
      fetchGeolocations(),
    ]);

    // Handle ticket
    STATE.ticket = ticket.status === 'fulfilled' ? ticket.value : null;
    if (ticket.status === 'rejected') {
      toast(`Error al cargar ticket: ${ticket.reason?.message}`, 'error');
    }

    // Handle candidates
    const candidatesRaw = rawCandidates.status === 'fulfilled' ? rawCandidates.value : [];
    if (rawCandidates.status === 'rejected') {
      toast(`Error al cargar candidatos: ${rawCandidates.reason?.message}`, 'warning');
    }

    // Handle geolocations
    const geos = geolocations.status === 'fulfilled' ? geolocations.value : [];
    if (geolocations.status === 'rejected') {
      toast(`Error al cargar GPS: ${geolocations.reason?.message}`, 'warning');
    }

    // 3. Merge
    STATE.candidates   = mergeCandidatesGps(candidatesRaw, geos);
    STATE.geolocations = geos;

    const withGps   = STATE.candidates.filter(c => c.hasGps);
    const ticketCoords = extractTicketCoords(STATE.ticket);

    // 4. Render cards
    renderCards(STATE.ticket, STATE.candidates, withGps.length);

    // 5. Render ticket detail
    renderTicketDetail(STATE.ticket);

    // 6. Map
    if (!leafletMap) {
      initMap(ticketCoords?.lat ?? 19.4326, ticketCoords?.lng ?? -99.1332);
    } else {
      // Invalidate size in case panel resized
      setTimeout(() => leafletMap.invalidateSize(), 100);
    }
    drawMapMarkers(ticketCoords, withGps);

    // 7. Render matrix
    renderMatrix(STATE.candidates, ticketCoords, DOM.matrixSearch.value);

    setStatus('ok', `PREPROD — ${new Date().toLocaleTimeString('es-MX')}`);
    toast('Datos cargados correctamente', 'success', 3000);

  } catch (err) {
    console.error('[ACD] Error:', err);
    setStatus('error', 'Error de conexión');
    toast(`Error general: ${err.message}`, 'error', 8000);
    // Show fallback
    if (!STATE.ticket) {
      DOM.detailGrid.innerHTML = `<div class="detail-loading" style="color:var(--danger)">
        <i class="fa-solid fa-triangle-exclamation"></i> Error al cargar ticket: ${escHtml(err.message)}
      </div>`;
    }
    if (!STATE.candidates.length) {
      DOM.matrixBody.innerHTML = `<tr><td colspan="11" class="table-loading" style="color:var(--danger)">
        Error al cargar candidatos.
      </td></tr>`;
    }
  } finally {
    STATE.loading = false;
    DOM.loadBtn.disabled = false;
    DOM.loadBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Cargar';
  }
}

/* ──────────────────────────────────────────────────────────────
   SIDEBAR NAV (smooth section scroll)
   ────────────────────────────────────────────────────────────── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    const section = item.dataset.section;
    const targets = {
      dashboard: $('cardsGrid'),
      matrix:    $('matrixSection'),
      map:       document.querySelector('.map-panel'),
      ticket:    $('ticketPanel'),
    };
    const el = targets[section];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ──────────────────────────────────────────────────────────────
   SIDEBAR TOGGLE
   ────────────────────────────────────────────────────────────── */
DOM.sidebarToggle.addEventListener('click', () => {
  DOM.sidebar.classList.toggle('collapsed');
  DOM.mainContent.classList.toggle('sidebar-collapsed');
  setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 250);
});

/* ──────────────────────────────────────────────────────────────
   LOAD BUTTON + ENTER KEY
   ────────────────────────────────────────────────────────────── */
DOM.loadBtn.addEventListener('click', () => {
  const id = DOM.ticketInput.value.trim();
  if (!id) { toast('Ingresa un Ticket ID', 'warning'); return; }
  STATE.ticketId = id;
  STATE.token    = null; // re-authenticate to ensure fresh token
  loadAll();
});

DOM.ticketInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') DOM.loadBtn.click();
});

/* ──────────────────────────────────────────────────────────────
   MATRIX SEARCH FILTER
   ────────────────────────────────────────────────────────────── */
DOM.matrixSearch.addEventListener('input', () => {
  const ticketCoords = extractTicketCoords(STATE.ticket);
  renderMatrix(STATE.candidates, ticketCoords, DOM.matrixSearch.value);
});

/* ──────────────────────────────────────────────────────────────
   MODAL
   ────────────────────────────────────────────────────────────── */
DOM.modalClose.addEventListener('click', () => { DOM.modalOverlay.style.display = 'none'; });
DOM.modalOverlay.addEventListener('click', e => {
  if (e.target === DOM.modalOverlay) DOM.modalOverlay.style.display = 'none';
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') DOM.modalOverlay.style.display = 'none';
});

/* ──────────────────────────────────────────────────────────────
   INIT
   ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  // Initialize map with placeholder center (CDMX)
  initMap(19.4326, -99.1332);
  // Kick off data load
  loadAll();
});


/* ══════════════════════════════════════════════════════════════════
   ACD SIMULATION MODULE
   Calls POST /api/v1/acd/simulate-ticket/{ticket_id} on acd_microservice.
   NEVER calls assignTaskForceToTickets. Read-only / dry-run only.
   GPS distance is shown as informative metadata — NOT used in scoring.
   ══════════════════════════════════════════════════════════════════ */

/* ── ACD microservice config — single source of truth for the base URL ── */
const SIM_CFG = {
  ACD_BASE: 'http://127.0.0.1:8000',
};

const STEP_NAMES = [
  { key: 'ticket',                  label: 'Ticket',           icon: 'fa-ticket'       },
  { key: 'step1_active_session',    label: 'Sesión activa',    icon: 'fa-id-badge'     },
  { key: 'step2_client_permission', label: 'Perm. Cliente',    icon: 'fa-handshake'    },
  { key: 'step3_service_permission',label: 'Perm. Servicio',   icon: 'fa-shield-halved'},
  { key: 'step4_load_limit',        label: 'Carga/On-site',    icon: 'fa-weight-scale' },
  { key: 'step5_geofence',          label: 'Geofence/Zona',    icon: 'fa-map-pin'      },
  { key: 'step6_scored',            label: 'Scoring',          icon: 'fa-star'         },
  { key: 'winner',                  label: 'Winner',           icon: 'fa-crown'        },
];

const SIM_DOM = {
  btn:          $('simulateBtn'),
  section:      $('simSection'),
  closeSim:     $('closeSim'),
  stepper:      $('acdStepper'),
  stepDetail:   $('stepDetail'),
  sourcesRow:   $('sourcesRow'),
  sourcesList:  $('sourcesList'),
  gapsList:     $('gapsList'),
  simTableWrap: $('simTableWrap'),
  simTableBody: $('simTableBody'),
  winnerCard:   $('winnerCard'),
  winnerLabel:  $('winnerLabel'),
  winnerBody:   $('winnerBody'),
};

/* ── Step dot state ──────────────────────────────────────────── */
function setStepState(idx, state) {
  const steps = SIM_DOM.stepper.querySelectorAll('.step');
  if (steps[idx]) {
    steps[idx].className = `step ${state}`;
  }
}

function resetStepper() {
  SIM_DOM.stepper.querySelectorAll('.step').forEach(s => { s.className = 'step'; });
  SIM_DOM.stepDetail.innerHTML = '<span style="color:var(--text-muted)">Ejecutando cascada ACD…</span>';
}

function animateStepper(stepsData, stepsSummary) {
  // Animate steps sequentially
  const total = stepsData.length;
  stepsData.forEach((s, idx) => {
    setTimeout(() => {
      setStepState(idx, 'active');
      // Generate detail message
      let detail = '';
      if (s.key === 'ticket') {
        detail = `<strong>Ticket #${STATE.ticketId}</strong> cargado desde PREPROD real.`;
      } else if (s.key === 'winner') {
        const count = stepsSummary?.step6_scored ?? 0;
        detail = count > 0
          ? `<span class="pass">✓ Winner seleccionado</span> — ${count} candidato(s) pasaron todos los filtros.`
          : `<span class="fail">✗ Sin winner</span> — ningún candidato superó la cascada.`;
      } else {
        const passCount = stepsSummary?.[s.key] ?? '?';
        detail = `<strong>${s.label}:</strong> <span class="pass">${passCount} candidatos pasan</span> este filtro.`;
      }
      SIM_DOM.stepDetail.innerHTML = detail;

      // Mark previous as done
      if (idx > 0) setStepState(idx - 1, 'done');
      // Final step
      if (idx === total - 1) {
        const hasWinner = stepsSummary?.step6_scored > 0;
        setTimeout(() => {
          setStepState(idx, hasWinner ? 'winner' : 'error');
        }, 400);
      }
    }, idx * 450);
  });
}

/* ── Render sources ──────────────────────────────────────────── */
function renderSources(sources, gaps) {
  SIM_DOM.sourcesRow.style.display = '';
  SIM_DOM.sourcesList.innerHTML = Object.entries(sources || {}).map(([name, s]) => {
    const st = (s.status || '').toLowerCase();
    const cls = st.includes('ok') ? 'ok' : st.includes('timeout') ? 'timeout' : st.includes('error') ? 'error' : 'unknown';
    const icon = cls === 'ok' ? 'fa-circle-check' : cls === 'timeout' ? 'fa-clock' : cls === 'error' ? 'fa-circle-xmark' : 'fa-circle-question';
    const ms = s.duration_ms != null ? ` (${Math.round(s.duration_ms)}ms)` : '';
    return `<div class="source-chip ${cls}"><i class="fa-solid ${icon}"></i>${escHtml(name)}${ms}</div>`;
  }).join('');

  const gapArr = gaps || [];
  SIM_DOM.gapsList.innerHTML = gapArr.length
    ? gapArr.map(g => `<div class="gap-item"><i class="fa-solid fa-triangle-exclamation"></i>${escHtml(g)}</div>`).join('')
    : '';
}

/* ── Determine which step discarded a candidate ──────────────── */
function getDiscardStep(c) {
  if (!c.discard_reason) return null;
  const r = (c.discard_reason || '').toLowerCase();
  if (r.includes('sesión') || r.includes('session')) return 'step1_active_session';
  if (r.includes('cliente') || r.includes('client'))  return 'step2_client_permission';
  if (r.includes('servicio') || r.includes('service')) return 'step3_service_permission';
  if (r.includes('on_site') || r.includes('on-site') || r.includes('carga') || r.includes('load')) return 'step4_load_limit';
  if (r.includes('zona') || r.includes('zone') || r.includes('geofence') || r.includes('geo')) return 'step5_geofence';
  if (r.includes('score')) return 'step6_scored';
  return 'unknown';
}

/* ── Render evaluation table ─────────────────────────────────── */
function renderSimTable(evaluated, winner, ticketCoords) {
  SIM_DOM.simTableWrap.style.display = '';
  const winnerId = winner?.user_id ?? winner?.userId ?? null;

  // Sort: eligible first (by score desc), then discarded
  const sorted = [...evaluated].sort((a, b) => {
    const aEl = !a.discard_reason;
    const bEl = !b.discard_reason;
    if (aEl !== bEl) return aEl ? -1 : 1;
    return (b.score ?? -1) - (a.score ?? -1);
  });

  let rank = 1;
  SIM_DOM.simTableBody.innerHTML = sorted.map(c => {
    const uid     = c.user_id ?? c.userId ?? '—';
    const name    = c.name || '—';
    const eligible = !c.discard_reason;
    const isWinner = eligible && String(uid) === String(winnerId);
    const discardStep = eligible ? null : getDiscardStep(c);
    const stepLabel = discardStep
      ? (STEP_NAMES.find(s => s.key === discardStep)?.label ?? discardStep)
      : null;

    // GPS — informative only
    const lat = c.latitude ?? c.lat ?? null;
    const lng = c.longitude ?? c.lng ?? null;
    const hasGps = lat != null && lng != null && lat !== 0 && lng !== 0;
    const distKm = hasGps && ticketCoords
      ? haversine(ticketCoords.lat, ticketCoords.lng, lat, lng).toFixed(2) + ' km'
      : '—';

    const activeTickets = c.active_tickets_count ?? (Array.isArray(c.active_tickets) ? c.active_tickets.length : c.active_tickets) ?? '?';
    const rowRank  = eligible ? rank++ : '—';
    const rowClass = isWinner ? 'eligible is-winner' : eligible ? 'eligible' : 'discarded';

    return `<tr class="${rowClass}">
      <td style="font-weight:700;color:${isWinner ? 'var(--warning)' : 'var(--text-muted)'}">${isWinner ? '👑' : rowRank}</td>
      <td style="font-weight:600">${escHtml(name)}${isWinner ? ' <span style="color:var(--warning);font-size:.7rem">WINNER</span>' : ''}</td>
      <td style="font-family:monospace;color:var(--info)">${escHtml(String(uid))}</td>
      <td style="font-size:.78rem">${escHtml(c.status || '—')}</td>
      <td>${eligible
        ? '<span class="eligible-badge">✅ Elegible</span>'
        : '<span class="discarded-badge">❌ Descartado</span>'}</td>
      <td>${stepLabel
        ? `<span class="step-chip discarded">${escHtml(stepLabel)}</span>`
        : eligible ? '<span class="step-chip">—</span>' : '—'}</td>
      <td style="font-size:.78rem;color:var(--text-secondary)">${escHtml(c.discard_reason || '—')}</td>
      <td style="font-variant-numeric:tabular-nums">${c.score != null ? c.score.toFixed(4) : '—'}</td>
      <td>${activeTickets}</td>
      <td>${c.on_site != null ? (c.on_site ? '<span style="color:var(--warning)">On-site</span>' : 'No') : '—'}</td>
      <td>${c.has_active_session
        ? '<span style="color:var(--success)">✓ Activa</span>'
        : '<span style="color:var(--danger)">✗ Sin sesión</span>'}</td>
      <td style="font-family:monospace;font-size:.78rem">${c.active_zone_id ?? '—'}</td>
      <td>${hasGps
        ? '<span class="gps-yes" title="GPS informativo">✓</span>'
        : '<span class="gps-no">—</span>'}</td>
      <td style="color:var(--text-muted);font-size:.78rem">${distKm}<br><span style="font-size:.62rem;color:var(--text-muted)">(solo visual)</span></td>
    </tr>`;
  }).join('');
}

/* ── Render winner card ──────────────────────────────────────── */
function renderWinnerCard(winner, decisionPartial) {
  SIM_DOM.winnerCard.style.display = '';
  if (!winner) {
    SIM_DOM.winnerLabel.textContent = 'Sin Winner — ningún candidato superó la cascada';
    SIM_DOM.winnerBody.innerHTML = `<div class="winner-field" style="grid-column:1/-1">
      <span class="winner-field-label">Resultado</span>
      <span class="winner-field-value" style="color:var(--danger)">Sin candidatos elegibles</span>
    </div>`;
    return;
  }

  if (decisionPartial) {
    SIM_DOM.winnerLabel.textContent = 'Winner Diagnóstico (Decisión Parcial)';
  } else {
    SIM_DOM.winnerLabel.textContent = 'Winner Simulado — Motor ACD PREPROD';
  }

  const fields = [
    ['User ID',        winner.user_id ?? winner.userId ?? '—'],
    ['Nombre',         winner.name || '—'],
    ['Email',          winner.email || '—'],
    ['Score',          winner.score != null ? winner.score.toFixed(4) : '—'],
    ['Status',         winner.status || '—'],
    ['Tickets activos', winner.active_tickets_count ?? (Array.isArray(winner.active_tickets) ? winner.active_tickets.length : winner.active_tickets) ?? '—'],
    ['Carga máx.',     winner.max_active_tickets ?? '—'],
    ['On-site',        winner.on_site != null ? (winner.on_site ? 'Sí' : 'No') : '—'],
    ['Sesión activa',  winner.has_active_session ? 'Sí' : 'No'],
    ['Zona activa ID', winner.active_zone_id ?? '—'],
    ['Zona (nombre)',  winner.zone_name || '—'],
    ['GPS (info)',     (winner.latitude && winner.longitude) ? `${Number(winner.latitude).toFixed(4)}, ${Number(winner.longitude).toFixed(4)}` : (winner.lat && winner.lng) ? `${Number(winner.lat).toFixed(4)}, ${Number(winner.lng).toFixed(4)}` : 'No disponible'],
  ];

  SIM_DOM.winnerBody.innerHTML = fields.map(([label, val]) => {
    const displayVal = (val === null || val === undefined || val === 'null' || val === 'undefined')
      ? '—' : String(val);
    return `<div class="winner-field">
      <span class="winner-field-label">${escHtml(label)}</span>
      <span class="winner-field-value">${escHtml(displayVal)}</span>
    </div>`;
  }).join('');
}

/* ── Render simulation meta panel ────────────────────────────── */
function renderSimMeta(data) {
  const panel      = $('simMetaPanel');
  const readyEl    = $('simMetaReady');
  const partialEl  = $('simMetaPartial');
  const ticketEl   = $('simMetaTicketId');
  const missingWrap= $('simMetaMissing');
  const missingList= $('simMetaMissingList');
  const warnWrap   = $('simMetaWarnings');
  const warnList   = $('simMetaWarningsList');
  const dqBody     = $('simMetaDqBody');

  if (!panel) return;
  panel.style.display = '';

  // production_ready
  const ready = data.production_ready;
  readyEl.innerHTML = ready === true
    ? '<span style="color:var(--success);font-weight:700">✅ true</span>'
    : ready === false
    ? '<span style="color:var(--danger);font-weight:700">❌ false</span>'
    : '—';

  // decision_is_partial
  const partial = data.decision_is_partial;
  partialEl.innerHTML = partial === true
    ? '<span style="color:var(--warning);font-weight:700">⚠ true</span>'
    : partial === false
    ? '<span style="color:var(--success)">false</span>'
    : '—';

  // ticket_id
  ticketEl.textContent = data.ticket_id ?? '—';

  // missing_requirements
  const missing = data.missing_requirements ?? [];
  if (missing.length) {
    missingWrap.style.display = '';
    missingList.innerHTML = missing.map(r =>
      `<div class="gap-item"><i class="fa-solid fa-circle-minus"></i>${escHtml(String(r))}</div>`
    ).join('');
  } else {
    missingWrap.style.display = 'none';
  }

  // warnings
  const warnings = data.warnings ?? [];
  if (warnings.length) {
    warnWrap.style.display = '';
    warnList.innerHTML = warnings.map(w =>
      `<div class="gap-item"><i class="fa-solid fa-triangle-exclamation"></i>${escHtml(String(w))}</div>`
    ).join('');
  } else {
    warnWrap.style.display = 'none';
  }

  // data_quality
  const dq = data.data_quality ?? {};
  dqBody.innerHTML = Object.entries(dq).map(([k, v]) => {
    const cls = v === 'real' ? 'dq-real' : v === 'fallback' ? 'dq-fallback' : v === 'unavailable' ? 'dq-unavailable' : 'dq-other';
    return `<div class="dq-item ${cls}"><span class="dq-key">${escHtml(k)}</span><span class="dq-val">${escHtml(String(v))}</span></div>`;
  }).join('') || '<span style="color:var(--text-muted)">Sin datos</span>';
}

/* ── Main simulation flow ────────────────────────────────────── */
async function runSimulation() {
  const ticketId = STATE.ticketId;
  if (!ticketId) { toast('Carga un ticket primero', 'warning'); return; }

  // Show section
  SIM_DOM.section.style.display = '';
  SIM_DOM.section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Reset UI
  resetStepper();
  SIM_DOM.sourcesRow.style.display   = 'none';
  SIM_DOM.simTableWrap.style.display = 'none';
  SIM_DOM.winnerCard.style.display   = 'none';
  const metaPanel = $('simMetaPanel');
  if (metaPanel) metaPanel.style.display = 'none';

  SIM_DOM.btn.disabled = true;
  SIM_DOM.btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Simulando…';

  try {
    // POST to acd_microservice simulate-ticket
    const headers = { 'Content-Type': 'application/json' };
    if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;

    const url = `${SIM_CFG.ACD_BASE}/api/v1/acd/simulate-ticket/${ticketId}`;
    const res  = await fetch(url, { method: 'POST', headers });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`acd_microservice respondió HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();

    /*
      Response fields from simulate-ticket:
        ticket_id                    (int)
        winner / diagnostic_winner   (dict or null)
        evaluated                    (list of all candidates)
        steps_summary                (dict step_key → count)
        production_ready             (bool)
        decision_is_partial          (bool)
        missing_requirements         (list)
        sources                      (dict)
        warnings                     (list)
        gaps                         (list)
        data_quality                 (dict)
    */

    const winner       = data.winner ?? data.diagnostic_winner ?? null;
    const evaluated    = data.evaluated ?? [];
    const stepsSummary = data.steps_summary ?? {};
    const sources      = data.sources ?? {};
    const gaps         = data.gaps ?? [];
    const isPartial    = data.decision_is_partial ?? false;
    const missingReqs  = data.missing_requirements ?? [];

    // Animate stepper
    const ticketCoords = extractTicketCoords(STATE.ticket);
    animateStepper(STEP_NAMES, stepsSummary);

    // After animation completes, show all panels
    const animDelay = STEP_NAMES.length * 450 + 200;
    setTimeout(() => {
      renderSources(sources, [...gaps, ...missingReqs.map(r => `MISSING: ${r}`)]);
      renderSimTable(evaluated, winner, ticketCoords);
      renderWinnerCard(winner, isPartial);
      renderSimMeta(data);

      if (isPartial) {
        toast('Decisión parcial — datos incompletos en PREPROD. Ver warnings.', 'warning', 7000);
      } else {
        toast(`Simulación completada. Winner: ${winner?.name ?? 'Sin winner'}`, 'success', 5000);
      }
    }, animDelay);

  } catch (err) {
    console.error('[SIM]', err);
    const isConnErr = err.message.toLowerCase().includes('failed to fetch') ||
                      err.message.toLowerCase().includes('networkerror') ||
                      err.message.toLowerCase().includes('load failed');
    if (isConnErr) {
      toast(
        `No se pudo conectar a acd_microservice (${SIM_CFG.ACD_BASE}). ` +
        '¿Está corriendo? uvicorn main:app --host 127.0.0.1 --port 8000',
        'error', 10000
      );
    } else {
      toast(`Error de simulación: ${err.message}`, 'error', 8000);
    }
    SIM_DOM.stepDetail.innerHTML = `<span class="fail">✗ Error: ${escHtml(err.message)}</span>`;
    setStepState(0, 'error');
  } finally {
    SIM_DOM.btn.disabled = false;
    SIM_DOM.btn.innerHTML = '<i class="fa-solid fa-play"></i> Simular despacho';
  }
}

/* ── Simulate button ─────────────────────────────────────────── */
SIM_DOM.btn.addEventListener('click', runSimulation);

/* ── Close sim panel ─────────────────────────────────────────── */
SIM_DOM.closeSim.addEventListener('click', () => {
  SIM_DOM.section.style.display = 'none';
});


/* ══════════════════════════════════════════════════════════════════
   TICKETS PREPROD MODULE
   Source: GET /ticket/api/v1/Dashboard/GetRemoteWorkTickets
   NOTE: This endpoint returns a SUBSET of tickets (Remote Work only).
   Missing fields are lazy-loaded via GET /api/v1/Tickets/{ticketId}.
   NEVER writes or assigns. Read-only.
   ══════════════════════════════════════════════════════════════════ */

/* ── State ── */
const TKT = {
  page:    1,
  pageSize: 50,
  order:   'Id',
  descending: true,
  total:   null,
  rows:    [],         // current page raw rows from API
  detailCache: {},     // ticketId → full ticket (lazy-loaded)
  activeDrawerTicketId: null,
};

/* ── DOM refs ── */
const TKDOM = {
  section:    $('ticketsSection'),
  body:       $('ticketsBody'),
  reloadBtn:  $('tktReloadBtn'),
  pageSizeSel:$('tktPageSize'),
  orderSel:   $('tktOrder'),
  prevBtn:    $('tktPrevBtn'),
  nextBtn:    $('tktNextBtn'),
  pageInfo:   $('tktPageInfo'),
  count:      $('tktCount'),
  search:     $('tktSearch'),
  // Drawer
  overlay:    $('drawerOverlay'),
  drawerBody: $('drawerBody'),
  drawerTitle:$('drawerTitle'),
  drawerClose:$('drawerClose'),
  drawerSimBtn:$('drawerSimBtn'),
};

/* ── Field extractor helpers (handles various casing conventions) ── */
function tktField(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
    // Try camelCase and PascalCase variants
    const lk = k.charAt(0).toLowerCase() + k.slice(1);
    const uk = k.charAt(0).toUpperCase() + k.slice(1);
    if (row[lk] !== undefined && row[lk] !== null && row[lk] !== '') return row[lk];
    if (row[uk] !== undefined && row[uk] !== null && row[uk] !== '') return row[uk];
  }
  return null;
}

function tktId(row)       { return tktField(row, 'ticketId','TicketId','id','Id','folio','Folio'); }
function tktStatus(row)   { return tktField(row, 'ticketStatusName','TicketStatusName','statusName','status','Status','ticketStatus','state'); }
function tktClient(row)   { return tktField(row, 'ticketClientName','TicketClientName','clientName','client','Client','customerName'); }
function tktService(row)  { return tktField(row, 'ticketServiceName','TicketServiceName','serviceName','service','Service','categoryName'); }
function tktDesc(row)     { return tktField(row, 'onSiteTaskDescription','OnSiteTaskDescription','description','Description','subject','title'); }
function tktAddress(row)  { return tktField(row, 'ticketLocationAddress','TicketLocationAddress','address','locationDescription'); }
function tktCreated(row)  { return tktField(row, 'ticketCreationDateUTC','TicketCreationDateUTC','createdAt','creationDate','created','openDate','dateCreated'); }
function tktSla(row)      { return tktField(row, 'ticketAttentionTime','TicketAttentionTime','slaDeadline','slaDate','dueDate','slaResponseTime'); }
function tktEngineer(row) { return tktField(row, 'ticketAssignedEngineerFullName','TicketAssignedEngineerFullName','assignedEngineer','engineerName','technician'); }
function tktRemote(row)   { return tktField(row, 'ticketRemote','TicketRemote','remote','Remote','isRemote'); }

/* ── Fetch GetRemoteWorkTickets ── */
async function fetchRemoteWorkTickets() {
  const params = new URLSearchParams({
    PageNumber: TKT.page,
    PageSize:   TKT.pageSize,
    Descending: TKT.descending ? 'true' : 'false',
    OrderColumn: TKT.order,
  });
  const url = `${CFG.TICKET_BASE}/api/v1/Dashboard/GetRemoteWorkTickets?${params}`;
  const raw = await apiFetch(url);

  // Unwrap envelope — same pattern as tickets
  // Shape may be: { data: { data: [...], totalCount: N } } or { data: [...] } or [...]
  let list = null;
  let total = null;

  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw?.data) {
    const inner = raw.data;
    if (Array.isArray(inner)) {
      list = inner;
    } else if (inner?.data) {
      // double-wrapped: { data: { data: [...], totalCount: N, ... } }
      list = Array.isArray(inner.data) ? inner.data : [];
      total = inner.totalCount ?? inner.total ?? inner.count ?? null;
    } else {
      // May have items/results key
      for (const k of ['items','results','tickets','records']) {
        if (Array.isArray(inner[k])) { list = inner[k]; total = inner.totalCount ?? inner.total ?? null; break; }
      }
      if (!list) list = [];
    }
    // totalCount at top level
    if (total === null) total = raw.totalCount ?? raw.total ?? raw.count ?? null;
  } else {
    // Try common list keys
    for (const k of ['items','results','tickets','records','data']) {
      if (Array.isArray(raw[k])) { list = raw[k]; total = raw.totalCount ?? raw.total ?? raw.count ?? null; break; }
    }
    if (!list) list = [];
  }

  return { list, total };
}

/* ── Fetch single ticket detail (lazy) ── */
async function fetchTicketDetail(ticketId) {
  if (TKT.detailCache[ticketId]) return TKT.detailCache[ticketId];
  const raw = await apiFetch(`${CFG.TICKET_BASE}/api/v1/Tickets/${ticketId}`);
  // Unwrap envelope
  const ticket = raw?.data?.data ?? raw?.data ?? raw;
  TKT.detailCache[ticketId] = ticket;
  return ticket;
}

/* ── Truncate long text ── */
function trunc(str, max = 40) {
  if (!str) return '—';
  const s = String(str);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/* ── Render tickets table ── */
function renderTicketsTable(rows) {
  const filter = (TKDOM.search?.value || '').toLowerCase();
  const visible = filter
    ? rows.filter(r => {
        const id  = String(tktId(r) ?? '');
        const cl  = String(tktClient(r) ?? '');
        const sv  = String(tktService(r) ?? '');
        const st  = String(tktStatus(r) ?? '');
        const eng = String(tktEngineer(r) ?? '');
        return [id, cl, sv, st, eng].some(v => v.toLowerCase().includes(filter));
      })
    : rows;

  if (!visible.length) {
    TKDOM.body.innerHTML = `<tr><td colspan="11" class="table-loading">Sin tickets para mostrar${filter ? ' con ese filtro' : ''}.</td></tr>`;
    return;
  }

  TKDOM.body.innerHTML = visible.map((row, idx) => {
    const id       = tktId(row) ?? '—';
    const status   = tktStatus(row) ?? null;
    const client   = tktClient(row);
    const service  = tktService(row);
    const desc     = tktDesc(row);
    const address  = tktAddress(row);
    const created  = tktCreated(row);
    const sla      = tktSla(row);
    const engineer = tktEngineer(row);
    const remote   = tktRemote(row);

    const statusHtml = status ? renderStatusPill(status) : '<span class="text-muted">—</span>';
    const remoteHtml = remote === true || remote === 1 || remote === 'true' || remote === 'True'
      ? '<span class="remote-yes"><i class="fa-solid fa-wifi"></i> Sí</span>'
      : (remote === false || remote === 0 || remote === 'false' || remote === 'False'
          ? '<span class="remote-no">No</span>'
          : '<span class="text-muted">—</span>');

    // SLA traffic-light
    let slaHtml = '—';
    if (sla) {
      const rem = new Date(sla) - new Date();
      const cls = rem < 0 ? 'sla-bad' : rem < 3600000 ? 'sla-warn' : 'sla-good';
      slaHtml = `<span class="${cls}">${formatDate(sla)}</span>`;
    }

    return `<tr data-idx="${idx}" data-ticketid="${escHtml(String(id))}">
      <td style="font-weight:700;color:var(--accent)">#${escHtml(String(id))}</td>
      <td>${statusHtml}</td>
      <td>${escHtml(client ?? '—')}</td>
      <td>${escHtml(service ?? '—')}</td>
      <td style="font-size:.78rem;color:var(--text-secondary)" title="${escHtml(desc ?? '')}">${escHtml(trunc(desc, 45))}</td>
      <td style="font-size:.78rem;color:var(--text-secondary)" title="${escHtml(address ?? '')}">${escHtml(trunc(address, 35))}</td>
      <td style="font-size:.78rem">${created ? formatDate(created) : '—'}</td>
      <td style="font-size:.78rem">${slaHtml}</td>
      <td style="font-size:.78rem">${escHtml(engineer ?? '—')}</td>
      <td>${remoteHtml}</td>
      <td>
        <button class="btn-tkt-action" onclick="openTicketDrawer('${escHtml(String(id))}',${idx})">
          <i class="fa-solid fa-eye"></i> Ver
        </button>
        <button class="btn-tkt-sim" onclick="tktSimulateAcd('${escHtml(String(id))}')">
          <i class="fa-solid fa-play"></i> Simular ACD
        </button>
      </td>
    </tr>`;
  }).join('');
}

/* ── Load tickets page ── */
async function loadTicketsPage() {
  TKDOM.body.innerHTML = `<tr><td colspan="11" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando tickets PREPROD…</td></tr>`;
  TKDOM.reloadBtn.disabled = true;

  try {
    if (!STATE.token) await authenticate();
    const { list, total } = await fetchRemoteWorkTickets();
    TKT.rows  = list;
    TKT.total = total;

    // Update pager UI
    TKDOM.pageInfo.textContent = `Pág. ${TKT.page}`;
    const hasMore = list.length >= TKT.pageSize;
    TKDOM.prevBtn.disabled = TKT.page <= 1;
    TKDOM.nextBtn.disabled = !hasMore;
    TKDOM.count.textContent = total != null
      ? `${list.length} de ${total} total`
      : `${list.length} registros`;

    renderTicketsTable(list);
    toast(`${list.length} tickets cargados (pág. ${TKT.page})`, 'success', 3000);

  } catch (err) {
    console.error('[TICKETS]', err);
    TKDOM.body.innerHTML = `<tr><td colspan="11" class="table-loading" style="color:var(--danger)">
      <i class="fa-solid fa-circle-xmark"></i> Error: ${escHtml(err.message)}
    </td></tr>`;
    toast(`Error al cargar tickets: ${err.message}`, 'error', 8000);
  } finally {
    TKDOM.reloadBtn.disabled = false;
  }
}

/* ── Drawer: render ticket detail ── */
function renderDrawerFields(ticket, rawRow) {
  // Collect all fields: prefer full ticket, fall back to row
  const t = ticket ?? rawRow ?? {};

  const id       = tktField(t, 'ticketId','TicketId','id','Id') ?? tktId(rawRow);
  const status   = tktField(t, 'ticketStatusName','TicketStatusName','statusName','status','ticketStatus') ?? tktStatus(rawRow);
  const client   = tktField(t, 'ticketClientName','TicketClientName','clientName','client') ?? tktClient(rawRow);
  const service  = tktField(t, 'ticketServiceName','TicketServiceName','serviceName','service') ?? tktService(rawRow);
  const desc     = tktField(t, 'onSiteTaskDescription','description','subject') ?? tktDesc(rawRow);
  const address  = tktField(t, 'ticketLocationAddress','address','locationDescription') ?? tktAddress(rawRow);
  const created  = tktField(t, 'ticketCreationDateUTC','createdAt','creationDate') ?? tktCreated(rawRow);
  const sla      = tktField(t, 'ticketAttentionTime','slaDeadline','dueDate') ?? tktSla(rawRow);
  const slaResp  = tktField(t, 'slaResponseTime','SlaResponseTime') ?? null;
  const engineer = tktField(t, 'ticketAssignedEngineerFullName','assignedEngineer') ?? tktEngineer(rawRow);
  const engId    = tktField(t, 'ticketAssignedEnginnerId','ticketAssignedEngineerId') ?? null;
  const remote   = tktField(t, 'ticketRemote','remote') ?? tktRemote(rawRow);
  const lat      = tktField(t, 'ticketLocationLatitude','latitude') ?? null;
  const lng      = tktField(t, 'ticketLocationLongitude','longitude') ?? null;
  const clientId = tktField(t, 'ticketClientId','TicketClientId','clientId') ?? null;
  const serviceId= tktField(t, 'ticketServiceId','TicketServiceId','serviceId') ?? null;
  const priority = tktField(t, 'priorityId','PriorityId','assignmentPriorityId','priority') ?? null;
  const progress = tktField(t, 'flags.ticketProgress') ?? t?.flags?.ticketProgress ?? null;

  let slaClass = '';
  if (sla) {
    const rem = new Date(sla) - new Date();
    slaClass = rem < 0 ? 'sla-bad' : rem < 3600000 ? 'sla-warn' : 'sla-good';
  }

  const field = (label, val, cls = '') =>
    `<div class="drawer-field">
      <span class="drawer-field-label">${label}</span>
      <span class="drawer-field-value ${cls}">${val !== null && val !== undefined && val !== '' ? escHtml(String(val)) : '—'}</span>
    </div>`;

  return `
    <div class="drawer-section-title">Identificación</div>
    ${field('Ticket ID', `#${id}`)}
    ${field('Estado', status ? renderStatusPill(status) : '—')}
    ${field('Prioridad', priority)}
    ${field('Remoto', remote === true || remote === 1 || remote === 'true' || remote === 'True' ? '🌐 Sí' : 'No')}

    <div class="drawer-section-title">Cliente &amp; Servicio</div>
    ${field('Cliente', client)}
    ${clientId ? field('Client ID', clientId) : ''}
    ${field('Servicio', service)}
    ${serviceId ? field('Service ID', serviceId) : ''}

    <div class="drawer-section-title">Descripción</div>
    ${field('Tarea on-site', desc)}

    <div class="drawer-section-title">Ubicación</div>
    ${field('Dirección', address)}
    ${lat ? field('Coordenadas', `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`) : ''}

    <div class="drawer-section-title">Fechas &amp; SLA</div>
    ${field('Creado (UTC)', created ? formatDate(created) : null)}
    ${slaResp ? field('SLA Respuesta', slaResp) : ''}
    ${field('SLA Deadline', sla ? `<span class="${slaClass}">${formatDate(sla)}</span>` : '—')}

    <div class="drawer-section-title">Asignación</div>
    ${field('Ingeniero', engineer)}
    ${engId ? field('Engineer ID', engId) : ''}
    ${progress !== null ? `<div class="drawer-field">
      <span class="drawer-field-label">Progreso</span>
      <span class="drawer-field-value">${Number(progress)}%
        <div class="progress-bar-wrap" style="margin-top:4px"><div class="progress-bar" style="width:${Math.min(100,Number(progress))}%"></div></div>
      </span>
    </div>` : ''}

    <details class="drawer-raw-toggle">
      <summary><i class="fa-solid fa-code"></i> Ver JSON completo del ticket</summary>
      <pre>${escHtml(JSON.stringify(ticket ?? rawRow, null, 2))}</pre>
    </details>
  `;
}

/* ── Open drawer ── */
window.openTicketDrawer = async function(ticketId, rowIdx) {
  const rawRow = TKT.rows[rowIdx] ?? {};
  TKT.activeDrawerTicketId = ticketId;

  // Show drawer immediately with list data
  TKDOM.overlay.style.display = 'flex';
  TKDOM.drawerTitle.textContent = `Ticket #${ticketId}`;
  TKDOM.drawerBody.innerHTML = renderDrawerFields(null, rawRow);

  // Lazy-load full detail in background
  try {
    const full = await fetchTicketDetail(ticketId);
    if (TKT.activeDrawerTicketId === ticketId) {
      TKDOM.drawerBody.innerHTML = renderDrawerFields(full, rawRow);
    }
  } catch (err) {
    const errNote = `<div style="color:var(--warning);font-size:.78rem;margin-top:8px">
      <i class="fa-solid fa-triangle-exclamation"></i>
      No se pudo cargar detalle completo: ${escHtml(err.message)}
    </div>`;
    TKDOM.drawerBody.insertAdjacentHTML('beforeend', errNote);
  }
};

/* ── Simulate ACD from table row ── */
window.tktSimulateAcd = async function(ticketId) {
  // 1. Set ticket in main dashboard
  DOM.ticketInput.value = ticketId;
  STATE.ticketId = ticketId;
  STATE.token = null; // fresh auth

  // 2. Close drawer if open
  TKDOM.overlay.style.display = 'none';

  // 3. Load ticket data first, then run simulation
  toast(`Cargando ticket #${ticketId} para simulación ACD…`, 'warning', 3000);

  // Switch view back to dashboard first so user sees the loading
  showSection('dashboard');

  try {
    await loadAll();
  } catch (_) { /* errors already handled in loadAll */ }

  // 4. Trigger simulation
  await runSimulation();
};

/* ── Close drawer ── */
TKDOM.drawerClose.addEventListener('click', () => {
  TKDOM.overlay.style.display = 'none';
  TKT.activeDrawerTicketId = null;
});
TKDOM.overlay.addEventListener('click', e => {
  if (e.target === TKDOM.overlay) {
    TKDOM.overlay.style.display = 'none';
    TKT.activeDrawerTicketId = null;
  }
});

/* "Simular ACD" button inside drawer */
TKDOM.drawerSimBtn.addEventListener('click', () => {
  if (TKT.activeDrawerTicketId) {
    tktSimulateAcd(TKT.activeDrawerTicketId);
  }
});

/* ── Search filter (client-side) ── */
TKDOM.search.addEventListener('input', () => renderTicketsTable(TKT.rows));

/* ── Controls ── */
TKDOM.reloadBtn.addEventListener('click', loadTicketsPage);

TKDOM.pageSizeSel.addEventListener('change', () => {
  TKT.pageSize = Number(TKDOM.pageSizeSel.value);
  TKT.page = 1;
  loadTicketsPage();
});

TKDOM.orderSel.addEventListener('change', () => {
  TKT.order = TKDOM.orderSel.value;
  TKT.page  = 1;
  loadTicketsPage();
});

TKDOM.prevBtn.addEventListener('click', () => {
  if (TKT.page > 1) { TKT.page--; loadTicketsPage(); }
});

TKDOM.nextBtn.addEventListener('click', () => {
  TKT.page++;
  loadTicketsPage();
});

/* ── Section visibility helper (used by nav + tktSimulateAcd) ── */
function showSection(sectionKey) {
  const sectionMap = {
    dashboard:      $('cardsGrid'),
    matrix:         $('matrixSection'),
    map:            document.querySelector('.map-panel'),
    ticket:         $('ticketPanel'),
    'tickets-list': TKDOM.section,
    workforce:      $('workforceSection'),
  };

  // Update nav
  document.querySelectorAll('.nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.section === sectionKey);
  });

  // Show tickets section if needed
  if (sectionKey === 'tickets-list') {
    TKDOM.section.style.display = '';
    if (!TKT.rows.length) loadTicketsPage();
  }

  // Show workforce section if needed
  if (sectionKey === 'workforce') {
    const wfSection = $('workforceSection');
    if (wfSection) {
      wfSection.style.display = '';
      loadWorkforceSessions();
    }
  }

  // Scroll to target
  const target = sectionMap[sectionKey];
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ── Override/extend sidebar nav to handle tickets-list ── */
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();
    const section = item.dataset.section;
    showSection(section);
    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 260);
  });
});


/* ══════════════════════════════════════════════════════════════════
   WORKFORCE MODULE
   GET  /api/v1/acd/workforce/active
   POST /api/v1/acd/workforce/check-in
   ══════════════════════════════════════════════════════════════════ */

const WFDOM = {
  section:       $('workforceSection'),
  tableBody:     $('wfTableBody'),
  refreshBtn:    $('wfRefreshBtn'),
  engineerInput: $('wfEngineerId'),
  zoneInput:     $('wfZoneId'),
  checkinBtn:    $('wfCheckinBtn'),
  result:        $('wfCheckinResult'),
};

/* ── Load active sessions ── */
async function loadWorkforceSessions() {
  if (!WFDOM.tableBody) return;
  WFDOM.tableBody.innerHTML = `<tr><td colspan="6" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando sesiones…</td></tr>`;
  try {
    const res = await fetch(`${SIM_CFG.ACD_BASE}/api/v1/acd/workforce/active`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const sessions = data.sessions ?? (Array.isArray(data) ? data : []);
    if (!sessions.length) {
      WFDOM.tableBody.innerHTML = `<tr><td colspan="6" class="table-loading">Sin sesiones activas.</td></tr>`;
      return;
    }
    WFDOM.tableBody.innerHTML = sessions.map(s => `
      <tr>
        <td style="font-family:monospace">${escHtml(String(s.session_id ?? '—'))}</td>
        <td style="font-weight:700;color:var(--accent)">${escHtml(String(s.engineer_id ?? '—'))}</td>
        <td style="font-family:monospace">${escHtml(String(s.location_zone_id ?? '—'))}</td>
        <td>${s.active
          ? '<span style="color:var(--success)">✓ Activa</span>'
          : '<span style="color:var(--danger)">✗ Inactiva</span>'}</td>
        <td style="font-size:.78rem">${s.check_in_at ? formatDate(s.check_in_at) : '—'}</td>
        <td style="font-size:.78rem;color:var(--text-muted)">${escHtml(s.source ?? '—')}</td>
      </tr>`).join('');
    toast(`${sessions.length} sesion(es) activa(s)`, 'success', 3000);
  } catch (err) {
    console.error('[WF]', err);
    WFDOM.tableBody.innerHTML = `<tr><td colspan="6" class="table-loading" style="color:var(--danger)">
      <i class="fa-solid fa-circle-xmark"></i> Error: ${escHtml(err.message)}
    </td></tr>`;
    toast(`Error sesiones: ${err.message}`, 'error', 6000);
  }
}

/* ── Check-in ── */
async function doCheckin(engineerId, zoneId) {
  if (!engineerId || !zoneId) { toast('Ingresa Engineer ID y Zone ID', 'warning'); return; }
  if (WFDOM.checkinBtn) {
    WFDOM.checkinBtn.disabled = true;
    WFDOM.checkinBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
  }
  if (WFDOM.result) WFDOM.result.innerHTML = '';
  try {
    const res = await fetch(`${SIM_CFG.ACD_BASE}/api/v1/acd/workforce/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ engineer_id: Number(engineerId), location_zone_id: Number(zoneId) }),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch (e) { data = { detail: text }; }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
    const msg = `Check-in OK - Engineer ${engineerId} / Zona ${zoneId}`;
    if (WFDOM.result) WFDOM.result.innerHTML = `<span style="color:var(--success)">${escHtml(msg)}</span>`;
    toast(msg, 'success', 5000);
    await loadWorkforceSessions();
  } catch (err) {
    console.error('[WF] Check-in error:', err);
    const errMsg = `Error check-in: ${err.message}`;
    if (WFDOM.result) WFDOM.result.innerHTML = `<span style="color:var(--danger)">${escHtml(errMsg)}</span>`;
    toast(errMsg, 'error', 7000);
  } finally {
    if (WFDOM.checkinBtn) {
      WFDOM.checkinBtn.disabled = false;
      WFDOM.checkinBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Check-in';
    }
  }
}

/* ── Wire workforce UI ── */
if (WFDOM.refreshBtn)  WFDOM.refreshBtn.addEventListener('click', loadWorkforceSessions);
if (WFDOM.checkinBtn) {
  WFDOM.checkinBtn.addEventListener('click', () => {
    doCheckin(WFDOM.engineerInput && WFDOM.engineerInput.value.trim(),
              WFDOM.zoneInput && WFDOM.zoneInput.value.trim());
  });
}
document.querySelectorAll('.btn-wf-quick').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var eng = btn.dataset.eng; var zone = btn.dataset.zone;
    if (WFDOM.engineerInput) WFDOM.engineerInput.value = eng;
    if (WFDOM.zoneInput)     WFDOM.zoneInput.value = zone;
    doCheckin(eng, zone);
  });
});
