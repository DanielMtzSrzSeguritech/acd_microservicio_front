/* ════════════════════════════════════════════════════════════════
   js/app.js  —  Entry point ES Module
   ACD Dashboard — Orquestador principal.
   ════════════════════════════════════════════════════════════════ */
'use strict';

/* ── Imports ─────────────────────────────────────────────────── */
import { STATE } from './state.js';
import {
  haversine, escHtml, formatDate, renderStatusPill,
} from './utils.js';
import {
  authenticate,
  saveCredentials, loadCredentials, clearCredentials, hasCredentials,
} from './services/auth.js';
import { fetchTicket } from './services/tickets-api.js';
import { attentionSlaInfo, formatSlaProgress } from './services/sla-date.js';
import { fetchServiceResponseTimes, selectServiceTiming } from './services/client-api.js';
import { fetchCandidates, fetchGeolocations } from './services/candidates-api.js';
import { initSimModal, runSimulationModal, closeSimModal } from './components/sim-modal.js';
import { paginateRows } from './components/pagination.js';
import { createLatestRequest } from './components/latest-request.js';
import { initRouter, showSection } from './router.js';
import { initTickets, loadTicketsPage, showTicketHistory, refreshKnownTicketSla } from './modules/tickets.js';
import { initCandidates, updateCandidates } from './modules/candidates.js';
import { candidateEmail, candidateId, candidateName } from './modules/candidates-model.js';
import { initWorkforce, loadWorkforceSessions } from './modules/workforce.js';
import { initEngineers, loadEngineerDirectory } from './modules/engineers.js';
import { plotEngineerLocations } from './modules/engineer-map.js';
import { initOperationalDashboard, loadOperationalDashboard } from './modules/operations-dashboard.js';

/* ── DOM helper ──────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════════════════════
   DOM REFS
   ══════════════════════════════════════════════════════════════ */
const DOM = {
  sidebar:          $('sidebar'),
  mainContent:      $('mainContent'),
  sidebarToggle:    $('sidebarToggle'),
  loadBtn:          $('loadBtn'),
  ticketInput:      $('ticketIdInput'),
  liveClock:        $('liveClock'),
  statusDot:        document.querySelector('.connection-status .dot'),
  statusText:       $('statusText'),
  cardTicketId:     $('cardTicketId'),
  cardEstadoVal:    $('cardEstadoVal'),
  cardCandidatosVal:$('cardCandidatosVal'),
  cardGpsVal:       $('cardGpsVal'),
  cardServicioVal:  $('cardServicioVal'),
  detailGrid:       $('detailGrid'),
  matrixBody:       $('matrixBody'),
  matrixSearch:     $('matrixSearch'),
  matrixPageSize:   $('matrixPageSize'),
  matrixPrevBtn:    $('matrixPrevBtn'),
  matrixNextBtn:    $('matrixNextBtn'),
  matrixPageInfo:   $('matrixPageInfo'),
  matrixRange:      $('matrixRange'),
  matrixCount:      $('matrixCount'),
  modalOverlay:     $('modalOverlay'),
  modalClose:       $('modalClose'),
  modalTitle:       $('modalTitle'),
  modalBody:        $('modalBody'),
  toastContainer:   $('toastContainer'),
};

/* ══════════════════════════════════════════════════════════════
   GS AUTH INDICATOR + MODAL
   ══════════════════════════════════════════════════════════════ */
const GS_AUTH = {
  dot:         $('gsAuthDot'),
  text:        $('gsAuthText'),
  btn:         $('gsAuthBtn'),
  modal:       $('gsAuthModal'),
  modalClose:  $('gsAuthModalClose'),
  userInput:   $('gsAuthUserInput'),
  passInput:   $('gsAuthPassInput'),
  submitBtn:   $('gsAuthSubmitBtn'),
  clearBtn:    $('gsAuthClearBtn'),
  result:      $('gsAuthModalResult'),
};
function updateGsAuthIndicator() {
  const expired = Boolean(STATE.token && STATE.gsTokenExpiresAt && Date.now() >= STATE.gsTokenExpiresAt);
  const authed = Boolean(STATE.token) && !expired;
  if (GS_AUTH.dot) {
    GS_AUTH.dot.className = authed ? 'dot dot-ok' : 'dot dot-error';
  }
  if (GS_AUTH.text) {
    GS_AUTH.text.textContent = authed ? 'GS: autenticado' : expired ? 'GS: token vencido' : 'GS: no autenticado';
  }
  if (GS_AUTH.btn) {
    GS_AUTH.btn.innerHTML = authed
      ? '<i class="fa-solid fa-check"></i> GS OK'
      : '<i class="fa-solid fa-key"></i> Auth GS';
    GS_AUTH.btn.style.background = authed ? 'var(--success)' : '';
    GS_AUTH.btn.style.color      = authed ? '#fff' : '';
  }
}

function openGsAuthModal() {
  if (!GS_AUTH.modal) return;
  // Pre-fill user if stored (never pre-fill pass)
  const creds = loadCredentials();
  if (GS_AUTH.userInput && creds.user) GS_AUTH.userInput.value = creds.user;
  if (GS_AUTH.passInput) GS_AUTH.passInput.value = '';
  if (GS_AUTH.result) GS_AUTH.result.innerHTML = '';
  GS_AUTH.modal.style.display = 'flex';
  if (GS_AUTH.userInput && !GS_AUTH.userInput.value) GS_AUTH.userInput.focus();
  else if (GS_AUTH.passInput) GS_AUTH.passInput.focus();
}

function closeGsAuthModal() {
  if (!GS_AUTH.modal) return;
  GS_AUTH.modal.style.display = 'none';
  // Clear pass field from DOM on close — never leave it visible
  if (GS_AUTH.passInput) GS_AUTH.passInput.value = '';
}

async function submitGsAuth() {
  if (!GS_AUTH.userInput || !GS_AUTH.passInput) return;
  const user = GS_AUTH.userInput.value.trim();
  const pass = GS_AUTH.passInput.value;

  if (!user || !pass) {
    if (GS_AUTH.result) GS_AUTH.result.innerHTML =
      '<span style="color:var(--danger)">Ingresa usuario y contraseña.</span>';
    return;
  }

  if (GS_AUTH.submitBtn) {
    GS_AUTH.submitBtn.disabled = true;
    GS_AUTH.submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Autenticando…';
  }
  if (GS_AUTH.result) GS_AUTH.result.innerHTML = '';

  // Keep credentials in memory only for this tab load.
  saveCredentials(user, pass);
  // Clear pass from DOM immediately (not needed after save)
  if (GS_AUTH.passInput) GS_AUTH.passInput.value = '';

  try {
    STATE.token = null; // force fresh auth
    await authenticate();
    if (GS_AUTH.result) GS_AUTH.result.innerHTML =
      '<span style="color:var(--success)"><i class="fa-solid fa-check"></i> Autenticación exitosa</span>';
    updateGsAuthIndicator();
    loadOperationalDashboard({ refresh: true });
    if (ticketsRouteVisited) loadTicketsPage();
    if (engineersRouteVisited) loadEngineerDirectory();
    toast('GS PREPROD autenticado', 'success', 3000);
    setTimeout(closeGsAuthModal, 1200);
    // Reload dashboard data with new token
    setTimeout(() => { STATE.token && loadAll(); }, 1400);
  } catch (err) {
    // Never log user/pass. Only log the error type.
    console.warn('[GS Auth] Fallo de autenticación:', err.message);
    clearCredentials();
    updateGsAuthIndicator();
    if (GS_AUTH.result) GS_AUTH.result.innerHTML =
      `<span style="color:var(--danger)"><i class="fa-solid fa-xmark"></i> ${escHtml(err.message)}</span>`;
  } finally {
    if (GS_AUTH.submitBtn) {
      GS_AUTH.submitBtn.disabled = false;
      GS_AUTH.submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Autenticar';
    }
  }
}

function clearGsAuth() {
  dashboardRequest.invalidate();
  clearCredentials();
  STATE.token = null;
  STATE.ticket = null;
  STATE.candidates = [];
  STATE.geolocations = [];
  STATE.gpsAvailable = false;
  STATE.loading = false;
  clearMapMarkers();
  updateCandidates();
  renderMatrix([], null, DOM.matrixSearch.value);
  renderTicketDetail(null);
  DOM.cardEstadoVal.textContent = '—';
  DOM.cardServicioVal.textContent = '—';
  DOM.cardCandidatosVal.textContent = '—';
  DOM.cardGpsVal.textContent = '—';
  DOM.loadBtn.disabled = false;
  DOM.loadBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Cargar';
  if (GS_AUTH.userInput) GS_AUTH.userInput.value = '';
  if (GS_AUTH.passInput) GS_AUTH.passInput.value = '';
  if (GS_AUTH.result) GS_AUTH.result.innerHTML =
    '<span style="color:var(--text-muted)">Credenciales borradas.</span>';
  updateGsAuthIndicator();
  toast('Sesión GS cerrada', 'warning', 3000);
  window.location.reload(); // Clears operational DOM and in-memory pages from the prior GS session.
}

// Wire GS auth modal events
if (GS_AUTH.btn)        GS_AUTH.btn.addEventListener('click', openGsAuthModal);
if (GS_AUTH.modalClose) GS_AUTH.modalClose.addEventListener('click', closeGsAuthModal);
if (GS_AUTH.modal)      GS_AUTH.modal.addEventListener('click', e => { if (e.target === GS_AUTH.modal) closeGsAuthModal(); });
if (GS_AUTH.submitBtn)  GS_AUTH.submitBtn.addEventListener('click', submitGsAuth);
if (GS_AUTH.clearBtn)   GS_AUTH.clearBtn.addEventListener('click', clearGsAuth);
if (GS_AUTH.passInput)  GS_AUTH.passInput.addEventListener('keydown', e => { if (e.key === 'Enter') submitGsAuth(); });
if (GS_AUTH.userInput)  GS_AUTH.userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && GS_AUTH.passInput) GS_AUTH.passInput.focus(); });

/* ══════════════════════════════════════════════════════════════
   MAP
   ══════════════════════════════════════════════════════════════ */
let leafletMap   = null;
let markersLayer = null;

function initMap(lat = 19.4326, lng = -99.1332) {
  if (leafletMap) return;
  if (typeof L === 'undefined') {
    $('mapStatus').textContent = 'Mapa no disponible. La lista de ubicaciones se mantiene visible.';
    return;
  }
  leafletMap = L.map('map', { zoomControl: true }).setView([lat, lng], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);
  markersLayer = L.layerGroup().addTo(leafletMap);
}

function clearMapMarkers() { if (markersLayer) markersLayer.clearLayers(); }

function drawMapMarkers(geolocations) {
  const count = leafletMap && markersLayer
    ? plotEngineerLocations({ leaflet: L, map: leafletMap, layer: markersLayer, geolocations })
    : geolocations.filter(g => Number.isFinite(g.latitude) && Number.isFinite(g.longitude)).length;
  $('mapStatus').textContent = !leafletMap
    ? 'Mapa no disponible. Consulta la lista de ingenieros debajo.'
    : count
    ? `${count} ingeniero${count === 1 ? '' : 's'} con ubicación GS registrada hoy. La ubicación no confirma disponibilidad.`
    : 'Sin ubicación registrada hoy. Consulta el directorio de Ingenieros para ver los registros disponibles.';
  $('mapEngineerList').innerHTML = geolocations.length
    ? geolocations.map(g => `<span class="acd-engineer-chip">Ingeniero #${escHtml(String(g.userId))} · ${g.latitude === null ? 'Sin ubicación registrada' : 'GPS registrado'}</span>`).join('')
    : 'Sin datos de ingenieros en la fuente GPS.';
}

/* ══════════════════════════════════════════════════════════════
   CLOCK / TOAST / STATUS
   ══════════════════════════════════════════════════════════════ */
function startClock() {
  function tick() { DOM.liveClock.textContent = new Date().toLocaleTimeString('es-MX', { hour12: false }); }
  tick();
  setInterval(tick, 1000);
}

function toast(msg, type = 'error', duration = 5000) {
  const icons = { error: 'fa-circle-xmark', success: 'fa-circle-check', warning: 'fa-triangle-exclamation' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="fa-solid ${icons[type] || icons.error}"></i><span>${escHtml(msg)}</span>`;
  DOM.toastContainer.prepend(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(100%)'; t.style.transition = '.3s';
    setTimeout(() => t.remove(), 300);
  }, duration);
}

function setStatus(state, msg) {
  DOM.statusDot.className = 'dot dot-' + state;
  DOM.statusText.textContent = msg;
}

/* ══════════════════════════════════════════════════════════════
   DATA HELPERS
   ══════════════════════════════════════════════════════════════ */
function extractTicketCoords(ticket) {
  if (!ticket) return null;
  const lat = Number(ticket.ticketLocationLatitude);
  const lng = Number(ticket.ticketLocationLongitude);
  if (lat && lng) return { lat, lng, address: ticket.ticketLocationAddress || '' };
  if (ticket.latitude && ticket.longitude)
    return { lat: Number(ticket.latitude), lng: Number(ticket.longitude), address: ticket.address || '' };
  const loc = ticket.location || ticket.geoLocation || ticket.geolocation;
  if (loc) {
    if (loc.latitude && loc.longitude) return { lat: Number(loc.latitude), lng: Number(loc.longitude), address: loc.address || ticket.address || '' };
    if (loc.lat && loc.lng)            return { lat: Number(loc.lat), lng: Number(loc.lng), address: ticket.address || '' };
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2)
      return { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]), address: ticket.address || '' };
  }
  const addr = ticket.address;
  if (addr && typeof addr === 'object' && addr.latitude && addr.longitude)
    return { lat: Number(addr.latitude), lng: Number(addr.longitude), address: addr.street || '' };
  return null;
}

function mergeCandidatesGps(candidates, geolocations) {
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

/* ══════════════════════════════════════════════════════════════
   RENDER — CARDS
   ══════════════════════════════════════════════════════════════ */
function renderCards(ticket, candidates, gpsCount, candidatesAvailable) {
  DOM.cardTicketId.textContent      = ticket?.ticketId ?? ticket?.id ? `#${ticket.ticketId ?? ticket.id}` : 'Sin datos disponibles';
  DOM.cardCandidatosVal.textContent = candidatesAvailable ? candidates.length : 'Sin datos disponibles';
  DOM.cardGpsVal.textContent        = STATE.gpsAvailable && candidatesAvailable ? gpsCount : 'Sin datos disponibles';
  const status = ticket?.ticketStatusName || ticket?.status?.name || ticket?.status || ticket?.state || '—';
  DOM.cardEstadoVal.innerHTML = renderStatusPill(status);
  const svc = ticket?.ticketServiceName || ticket?.service?.name || ticket?.serviceName || ticket?.category?.name || '—';
  DOM.cardServicioVal.textContent = svc;
}

/* ══════════════════════════════════════════════════════════════
   RENDER — TICKET DETAIL
   ══════════════════════════════════════════════════════════════ */
function renderTicketDetail(ticket) {
  if (!ticket) {
    DOM.detailGrid.innerHTML = '<div class="detail-loading">Sin datos de ticket.</div>';
    return;
  }
  const t          = ticket;
  const id         = t.ticketId       || t.id       || t.folio         || STATE.ticketId;
  const status     = t.ticketStatusName || t.status?.name || t.status  || t.state || '—';
  const client     = t.ticketClientName || t.client?.name || t.clientName || t.customer?.name || '—';
  const service    = t.ticketServiceName || t.service?.name || t.serviceName || t.category?.name || '—';
  const desc       = t.onSiteTaskDescription || t.description || t.subject || t.title || '—';
  const address    = t.ticketLocationAddress || t.address?.fullAddress || t.address?.street
                  || (typeof t.address === 'string' ? t.address : null) || t.locationDescription || '—';
  const created    = formatDate(t.ticketCreationDateUTC || t.createdAt || t.creationDate || t.created);
  const slaResponse  = Number.isFinite(Number(t.slaResponseTime)) && t.slaResponseTime !== null && t.slaResponseTime !== undefined && t.slaResponseTime !== ''
    ? Number(t.slaResponseTime) : null;
  const sla = attentionSlaInfo(t.ticketAttentionTime ?? t.TicketAttentionTime ?? null);
  const slaResponseTxt = slaResponse === null ? 'Sin datos disponibles' : `${slaResponse} h`;
  const progressTxt = formatSlaProgress(t.flags?.ticketProgress ?? t.Flags?.TicketProgress);
  const serviceId = Number(t.ticketServiceId ?? t.TicketServiceId);
  const timing = STATE.serviceTiming?.serviceId === serviceId ? STATE.serviceTiming : null;
  const engineer   = t.ticketAssignedEngineerFullName || t.assignedTo?.name || t.assignedUser?.name || null;
  const engineerId = t.ticketAssignedEnginnerId || t.ticketAssignedEngineerId || null;
  const badgeFor = value => value === null || value === undefined || value === '' || value === '—'
    ? '<span class="badge-unavailable">Sin datos disponibles</span>' : '';
  let slaClass = '';
  if (sla.status !== 'unverified') slaClass = sla.status === 'overdue' ? 'sla-bad' : sla.status === 'due_soon' ? 'sla-warn' : 'sla-good';
  DOM.detailGrid.innerHTML = `
    <div class="detail-item"><div class="detail-label">Ticket ID</div><div class="detail-value">#${escHtml(String(id))}${badgeFor(t.ticketId ?? t.id ?? t.folio)}</div></div>
    <div class="detail-item"><div class="detail-label">Estado</div><div class="detail-value">${renderStatusPill(status)}${badgeFor(status)}</div></div>
    <div class="detail-item"><div class="detail-label">Cliente</div><div class="detail-value">${escHtml(client)}${badgeFor(client)}</div></div>
    <div class="detail-item"><div class="detail-label">Servicio</div><div class="detail-value">${escHtml(service)}${badgeFor(service)}</div></div>
    <div class="detail-item"><div class="detail-label">Servicio ID</div><div class="detail-value">${Number.isSafeInteger(serviceId) && serviceId > 0 ? escHtml(String(serviceId)) : 'Sin datos disponibles'}</div></div>
    <div class="detail-item full-width"><div class="detail-label">Descripción</div><div class="detail-value" style="font-weight:400;font-size:.8rem;color:var(--text-secondary)">${escHtml(desc)}${badgeFor(desc)}</div></div>
    <div class="detail-item full-width"><div class="detail-label">Ubicación</div><div class="detail-value" style="font-size:.8rem">${escHtml(address)}${badgeFor(address)}</div></div>
    <div class="detail-item"><div class="detail-label">Creado (UTC)</div><div class="detail-value" style="font-size:.8rem">${escHtml(created)}${badgeFor(created)}</div></div>
    <div class="detail-item"><div class="detail-label">Plazo de atención del ticket</div><div class="detail-value" style="font-size:.8rem">${escHtml(slaResponseTxt)}</div></div>
    <div class="detail-item"><div class="detail-label">SLA consumido (GS)</div><div class="detail-value" style="font-size:.8rem">${escHtml(progressTxt)}</div></div>
    ${timing ? `<div class="detail-item full-width"><div class="detail-label">Configuración actual del servicio · PREPROD</div><div class="detail-value" style="font-size:.8rem">Atención: ${escHtml(String(timing.attentionHours))} h · Resolución: ${escHtml(String(timing.expireHours))} h</div></div>` : ''}
    <div class="detail-item full-width"><div class="detail-label">Vencimiento SLA de atención</div><div class="detail-value ${slaClass}" style="font-size:.8rem">${escHtml(sla.dateText)} · ${escHtml(sla.remainingText)}</div></div>
    <div class="detail-item"><div class="detail-label">Ingeniero${badgeFor(engineer)}</div><div class="detail-value">${escHtml(engineer || 'Sin datos disponibles')}</div></div>
    <div class="detail-item"><div class="detail-label">Ingeniero ID${badgeFor(engineerId)}</div><div class="detail-value" style="font-family:monospace;font-size:.8rem;color:var(--info)">${escHtml(String(engineerId ?? 'Sin datos disponibles'))}</div></div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   RENDER — MATRIX
   ══════════════════════════════════════════════════════════════ */
const MATRIX = { page: 1, pageSize: 20 };
const dashboardRequest = createLatestRequest();

function updateMatrixPager(result) {
  DOM.matrixPageInfo.textContent = `Página ${result.page} de ${result.totalPages}`;
  DOM.matrixRange.textContent = `Mostrando ${result.start}–${result.end}`;
  DOM.matrixCount.textContent = `${result.total} registros`;
  DOM.matrixPrevBtn.disabled = result.page <= 1;
  DOM.matrixNextBtn.disabled = result.page >= result.totalPages;
}

function renderMatrix(candidates, ticketCoords, filter = '') {
  const fl   = filter.trim().toLowerCase();
  const rows = candidates.filter(c => {
    if (!fl) return true;
    const name  = (c.name || c.taskForceName || c.fullName || '').toLowerCase();
    const uid   = String(c.userId || c.taskForceId || c.id || '').toLowerCase();
    const email = (c.email || c.emailAddress || '').toLowerCase();
    return name.includes(fl) || uid.includes(fl) || email.includes(fl);
  });
  const result = paginateRows(rows, MATRIX.page, MATRIX.pageSize);
  MATRIX.page = result.page || 1;
  updateMatrixPager(result);
  if (!result.rows.length) {
    DOM.matrixBody.innerHTML = `<tr><td colspan="11" class="table-loading">Sin candidatos para mostrar.</td></tr>`;
    return;
  }
  DOM.matrixBody.innerHTML = result.rows.map((c, idx) => {
    const rowNumber = result.start + idx;
    const uid    = c.userId ?? c.taskForceId ?? c.id ?? null;
    const name   = c.name || c.taskForceName || c.fullName || ((c.firstName || '') + ' ' + (c.lastName || '')).trim() || '—';
    const email  = c.email || c.emailAddress || c.mail || '—';
    const hasGps = STATE.gpsAvailable ? c.hasGps : null;
    let distTxt  = '<span class="gps-no">—</span>';
    if (hasGps && ticketCoords) {
      const d = haversine(ticketCoords.lat, ticketCoords.lng, c.lat, c.lng);
      distTxt = `<span class="gps-yes">${d.toFixed(2)} km</span>`;
    }
    const avail = null;
    const tickets = null;
    const spec = null;
    const zone = null;
    return `<tr data-candidate='${JSON.stringify({
      uid, name: name.trim(), email, hasGps, lat: c.lat, lng: c.lng, avail, tickets, spec, zone,
      distTxt: hasGps && ticketCoords ? haversine(ticketCoords.lat, ticketCoords.lng, c.lat, c.lng).toFixed(2) + ' km' : '—',
    }).replace(/'/g, "&#39;")}'>
      <td style="color:var(--text-muted)">${rowNumber}</td>
      <td style="font-weight:600">${escHtml(name.trim())}</td>
      <td style="font-family:monospace;color:var(--info)">${escHtml(String(uid ?? 'No disponible'))}</td>
      <td style="color:var(--text-secondary)">${escHtml(email)}</td>
      <td>${hasGps === null ? 'No disponible' : hasGps ? '<i class="fa-solid fa-satellite-dish gps-yes"></i> <span class="gps-yes">Sí</span>' : '<i class="fa-solid fa-ban gps-no"></i> <span class="gps-no">No</span>'}</td>
      <td>${distTxt}</td>
      <td>${avail === null ? 'Sin datos disponibles' : escHtml(avail)}</td>
      <td>${tickets === null ? 'Sin datos disponibles' : escHtml(String(tickets))}</td>
      <td>Sin datos disponibles</td>
      <td>${zone === null ? 'Sin datos disponibles' : escHtml(String(zone))}</td>
      <td><button class="btn-detail" onclick="showCandidateDetail(this)"><i class="fa-solid fa-eye"></i> Ver</button></td>
    </tr>`;
  }).join('');
}

/* ══════════════════════════════════════════════════════════════
   CANDIDATE MODAL
   ══════════════════════════════════════════════════════════════ */
window.showCandidateDetail = function(btn) {
  const row  = btn.closest('tr');
  const data = JSON.parse(row.dataset.candidate);
  DOM.modalTitle.textContent = data.name;
  DOM.modalBody.innerHTML = `
    ${modalRow('User ID', data.uid, data.uid === null ? null : true)}
    ${modalRow('Email', data.email, data.email === '—' ? null : true)}
    ${modalRow('GPS', data.hasGps === null ? 'No disponible' : data.hasGps ? 'Disponible' : 'Sin ubicación', data.hasGps === null ? null : true)}
    ${modalRow('Latitud', data.lat, data.lat === null ? null : true)}
    ${modalRow('Longitud', data.lng, data.lng === null ? null : true)}
    ${modalRow('Distancia al Ticket', data.distTxt, data.distTxt === '—' ? null : true)}
    ${modalRow('Disponibilidad', data.avail, data.avail === null ? null : true)}
    ${modalRow('Tickets Activos', data.tickets, data.tickets === null ? null : true)}
    ${modalRow('Especialidad', data.spec, null)}
    ${modalRow('Zona', data.zone, data.zone === null ? null : true)}
  `;
  DOM.modalOverlay.style.display = 'flex';
};

function modalRow(label, value, isReal) {
  const badge = isReal ? '<span class="badge-real">REAL</span>' : '<span class="badge-unavailable">NO DISPONIBLE</span>';
  return `<div class="modal-row"><span class="modal-label">${escHtml(label)}</span><span class="modal-value">${escHtml(String(value ?? 'No disponible'))} ${badge}</span></div>`;
}

function openCandidateDataDetail(candidate) {
  const field = (label, value) => modalRow(label, value, value === null || value === undefined || value === '' ? null : true);
  const gps = STATE.gpsAvailable ? candidate.hasGps ? 'Sí' : 'No' : null;
  DOM.modalTitle.textContent = candidateName(candidate) || 'Candidato';
  DOM.modalBody.innerHTML = `
    ${field('ID', candidateId(candidate))}
    ${field('Correo', candidateEmail(candidate))}
    ${field('Sesión activa', null)}
    ${field('Zona administrativa GS', null)}
    ${field('Habilidades GS', null)}
    ${field('Disponibilidad', null)}
    ${field('Carga activa', null)}
    ${field('GPS informativo', gps)}
  `;
  DOM.modalOverlay.style.display = 'flex';
}

/* ══════════════════════════════════════════════════════════════
   MAIN LOAD FLOW
   loadAll() — GS-dependent. Shows prompt if no GS auth.
   ACD (simulate, workforce) work independently.
   ══════════════════════════════════════════════════════════════ */
async function loadAll() {
  const request = dashboardRequest.start();
  const ticketId = STATE.ticketId;
  STATE.loading = true;
  STATE.ticket = null;
  STATE.serviceTiming = null;
  refreshKnownTicketSla();
  STATE.candidates = [];
  STATE.geolocations = [];
  STATE.gpsAvailable = false;
  clearMapMarkers();
  $('mapStatus').textContent = 'Consultando ubicaciones de ingenieros…';
  $('mapEngineerList').textContent = 'Cargando ingenieros…';
  updateCandidates();
  DOM.loadBtn.disabled = true;
  DOM.loadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando…';
  DOM.detailGrid.innerHTML  = '<div class="detail-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando ticket…</div>';
  DOM.matrixBody.innerHTML  = '<tr><td colspan="11" class="table-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando candidatos…</td></tr>';
  updateMatrixPager(paginateRows([], 1, MATRIX.pageSize));
  DOM.cardTicketId.textContent      = 'Cargando…';
  DOM.cardEstadoVal.textContent     = '…';
  DOM.cardCandidatosVal.textContent = '…';
  DOM.cardGpsVal.textContent        = '…';
  DOM.cardServicioVal.textContent   = '…';

  try {
    // GS auth — if no token, try from sessionStorage; if no credentials, show prompt (non-blocking)
    if (!STATE.token) {
      try {
        await authenticate();
        if (!dashboardRequest.isCurrent(request)) return;
        updateGsAuthIndicator();
        loadOperationalDashboard({ refresh: true });
        if (ticketsRouteVisited) loadTicketsPage();
        if (engineersRouteVisited) loadEngineerDirectory();
      } catch (authErr) {
        if (!dashboardRequest.isCurrent(request)) return;
        if (authErr.isAuthRequired) {
          // No credentials — show UI indicator, continue without GS data
          STATE.candidates = [];
          STATE.gpsAvailable = false;
          updateCandidates();
          updateGsAuthIndicator();
          setStatus('error', 'GS: sin auth');
          DOM.detailGrid.innerHTML = `<div class="detail-loading" style="color:var(--warning)">
            <i class="fa-solid fa-key"></i>
            GS PREPROD requiere autenticación.
            <br><br>
            <button onclick="document.getElementById('gsAuthBtn').click()"
                    style="margin-top:.5rem;padding:.4rem .9rem;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.82rem">
              <i class="fa-solid fa-key"></i> Autenticar GS PREPROD
            </button>
            <br><br>
            <span style="font-size:.78rem;color:var(--text-muted)">Las consultas ACD requieren una sesión GS autorizada; Workforce de escritura permanece bloqueado.</span>
          </div>`;
          DOM.matrixBody.innerHTML = `<tr><td colspan="11" class="table-loading" style="color:var(--text-muted)">Sin auth GS — candidatos no disponibles.</td></tr>`;
          DOM.cardEstadoVal.textContent = '—';
          DOM.cardCandidatosVal.textContent = '—';
          DOM.cardGpsVal.textContent = '—';
          DOM.cardServicioVal.textContent = '—';
          // Init map at default coords
          if (!leafletMap) initMap(19.4326, -99.1332);
          $('mapStatus').textContent = 'No tienes acceso a las ubicaciones GS.';
          $('mapEngineerList').textContent = 'Sin datos disponibles.';
          return;
        }
        throw authErr; // other auth errors propagate
      }
    }

    setStatus('loading', 'Cargando datos…');
    const [ticket, rawCandidates, geolocations] = await Promise.allSettled([
      fetchTicket(ticketId),
      fetchCandidates(ticketId),
      fetchGeolocations(),
    ]);
    if (!dashboardRequest.isCurrent(request)) return;

    STATE.ticket = ticket.status === 'fulfilled' ? ticket.value : null;
    refreshKnownTicketSla();
    if (ticket.status === 'rejected') toast(`Error al cargar ticket: ${ticket.reason?.message}`, 'error');

    const candidatesRaw = rawCandidates.status === 'fulfilled' ? rawCandidates.value : [];
    if (rawCandidates.status === 'rejected') toast(`Error al cargar candidatos: ${rawCandidates.reason?.message}`, 'warning');

    const geos = geolocations.status === 'fulfilled' ? geolocations.value : [];
    STATE.gpsAvailable = geolocations.status === 'fulfilled';
    if (geolocations.status === 'rejected') toast(`Error GPS: ${geolocations.reason?.message}`, 'warning');

    STATE.candidates   = mergeCandidatesGps(candidatesRaw, geos);
    STATE.geolocations = geos;
    updateCandidates();

    const withGps      = STATE.candidates.filter(c => c.hasGps);
    const ticketCoords = extractTicketCoords(STATE.ticket);

    renderCards(STATE.ticket, STATE.candidates, withGps.length, rawCandidates.status === 'fulfilled');
    renderTicketDetail(STATE.ticket);
    const serviceId = Number(STATE.ticket?.ticketServiceId ?? STATE.ticket?.TicketServiceId);
    if (STATE.clientToken && Number.isSafeInteger(serviceId) && serviceId > 0) {
      fetchServiceResponseTimes(serviceId).then(page => {
        if (!dashboardRequest.isCurrent(request)) return;
        STATE.serviceTiming = selectServiceTiming(page);
        renderTicketDetail(STATE.ticket);
      }).catch(error => console.warn('[GS ClientAPI tiempos]', error.status ?? error.message));
    }

    if (!leafletMap) initMap(19.4326, -99.1332);
    else             setTimeout(() => leafletMap.invalidateSize(), 100);
    drawMapMarkers(geos);
    if (geolocations.status === 'rejected') {
      $('mapStatus').textContent = geolocations.reason?.message?.includes('HTTP 403') ? 'No tienes acceso al GPS de GS.' : 'Ubicaciones GS no disponibles.';
      $('mapEngineerList').textContent = 'Sin datos disponibles.';
    }
    renderMatrix(STATE.candidates, ticketCoords, DOM.matrixSearch.value);

    const partial = [ticket, rawCandidates, geolocations].some(result => result.status === 'rejected');
    setStatus(partial ? 'error' : 'ok', partial ? 'Datos parciales de GS' : `PREPROD — ${new Date().toLocaleTimeString('es-MX')}`);
    if (!partial) toast('Datos cargados correctamente', 'success', 3000);

  } catch (err) {
    if (!dashboardRequest.isCurrent(request)) return;
    console.error('[ACD] loadAll error:', err.message);
    setStatus('error', 'Error de conexión');
    toast(`Error: ${err.message}`, 'error', 8000);
    if (!STATE.ticket) {
      DOM.detailGrid.innerHTML = `<div class="detail-loading" style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Error: ${escHtml(err.message)}</div>`;
    }
    if (!STATE.candidates.length) {
      DOM.matrixBody.innerHTML = `<tr><td colspan="11" class="table-loading" style="color:var(--danger)">Error al cargar candidatos.</td></tr>`;
    }
    if (!leafletMap) initMap(19.4326, -99.1332);
    $('mapStatus').textContent = 'Ubicaciones GS no disponibles.';
    $('mapEngineerList').textContent = 'Sin datos disponibles.';
  } finally {
    if (dashboardRequest.isCurrent(request)) {
      STATE.loading = false;
      DOM.loadBtn.disabled = false;
      DOM.loadBtn.innerHTML = '<i class="fa-solid fa-rotate"></i> Cargar';
      updateGsAuthIndicator();
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   ACD SIMULATION MODULE — thin adapter
   Lógica de presentación → js/components/sim-modal.js
   ══════════════════════════════════════════════════════════════ */

async function runSimulation() {
  const ticketId = STATE.ticketId;
  if (!ticketId) { toast('Ingresa un Ticket ID', 'warning'); return; }

  const btn = $('simulateBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Simulando…';
  }

  try {
    const ticketCoords = extractTicketCoords(STATE.ticket);
    const result = await runSimulationModal(ticketId, ticketCoords);
    const { winner, isPartial } = result ?? {};
    if (isPartial) toast('Decisión parcial — ver warnings.', 'warning', 7000);
    else           toast(`Simulación completada. Winner: ${winner?.name ?? 'Sin winner'}`, 'success', 5000);
  } catch (err) {
    console.error('[SIM]', err.message);
    const isNetErr = err.message?.toLowerCase().includes('failed to fetch') ||
                     err.message?.toLowerCase().includes('networkerror');
    toast(isNetErr
      ? `No se pudo conectar a acd_microservice. ¿Está corriendo?`
      : `Error: ${err.message}`,
      'error', 10000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-play"></i> Simular despacho';
    }
  }
}

$('simulateBtn')?.addEventListener('click', runSimulation);


/* Secciones: carga inicial al entrar; los módulos conservan su estado. */
let ticketsRouteVisited = false;
let workforceRouteVisited = false;
let engineersRouteVisited = false;

function onSectionShown(section) {
  if (section === 'tickets-list' && !ticketsRouteVisited) {
    ticketsRouteVisited = true;
    loadTicketsPage();
  }
  if (section === 'workforce' && !workforceRouteVisited) {
    workforceRouteVisited = true;
    loadWorkforceSessions();
  }
  if (section === 'engineers' && !engineersRouteVisited) {
    engineersRouteVisited = true;
    loadEngineerDirectory();
  }
  if (section === 'dashboard' || section === 'map') {
    requestAnimationFrame(() => {
      if (leafletMap) leafletMap.invalidateSize();
    });
  }
}

DOM.sidebarToggle.addEventListener('click', () => {
  DOM.sidebar.classList.toggle('collapsed');
  DOM.mainContent.classList.toggle('sidebar-collapsed');
  setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 250);
});

$('viewTicketDetailBtn').addEventListener('click', () => showSection('ticket'));
$('viewCandidatesBtn').addEventListener('click', () => showSection('candidates'));
$('tktOpenTicketBtn').addEventListener('click', () => showSection('ticket'));
$('viewUrgentTicketsBtn').addEventListener('click', () => {
  showSection('tickets-list');
  document.querySelector('.tkt-tab[data-tab="unassigned"]')?.click();
});
$('acdUrgentTickets').addEventListener('click', event => {
  const button = event.target.closest('button[data-urgent-ticket]');
  if (!button) return;
  DOM.ticketInput.value = button.dataset.urgentTicket;
  DOM.loadBtn.click();
  showSection('ticket');
});
$('ticketHistoryBtn').addEventListener('click', () => {
  showSection('tickets-list');
  showTicketHistory(STATE.ticketId);
});

DOM.loadBtn.addEventListener('click', () => {
  const id = DOM.ticketInput.value.trim();
  if (!id) { toast('Ingresa un Ticket ID', 'warning'); return; }
  STATE.ticketId = id;
  MATRIX.page = 1;
  STATE.candidates = [];
  STATE.gpsAvailable = false;
  updateCandidates({ ticketChanged: true });
  loadAll();
});

DOM.ticketInput.addEventListener('keydown', e => { if (e.key === 'Enter') DOM.loadBtn.click(); });
DOM.matrixSearch.addEventListener('input', () => {
  MATRIX.page = 1;
  renderMatrix(STATE.candidates, extractTicketCoords(STATE.ticket), DOM.matrixSearch.value);
});
DOM.matrixPageSize.addEventListener('change', () => {
  MATRIX.pageSize = Number(DOM.matrixPageSize.value);
  MATRIX.page = 1;
  renderMatrix(STATE.candidates, extractTicketCoords(STATE.ticket), DOM.matrixSearch.value);
});
DOM.matrixPrevBtn.addEventListener('click', () => {
  if (MATRIX.page > 1) {
    MATRIX.page--;
    renderMatrix(STATE.candidates, extractTicketCoords(STATE.ticket), DOM.matrixSearch.value);
  }
});
DOM.matrixNextBtn.addEventListener('click', () => {
  MATRIX.page++;
  renderMatrix(STATE.candidates, extractTicketCoords(STATE.ticket), DOM.matrixSearch.value);
});

DOM.modalClose.addEventListener('click', () => { DOM.modalOverlay.style.display = 'none'; });
DOM.modalOverlay.addEventListener('click', e => { if (e.target === DOM.modalOverlay) DOM.modalOverlay.style.display = 'none'; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    DOM.modalOverlay.style.display = 'none';
    closeGsAuthModal();
  }
});

/* ══════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  startClock();
  initMap(19.4326, -99.1332);
  initTickets({ toast, getCurrentTicketId: () => STATE.ticketId, onSelectTicket: id => {
    DOM.ticketInput.value = String(id);
    DOM.loadBtn.click();
    showSection('ticket');
  } });
  initCandidates({ getCandidates: () => STATE.candidates, getTicketId: () => STATE.ticketId, gpsAvailable: () => STATE.gpsAvailable, hasAuth: () => Boolean(STATE.token), onDetail: openCandidateDataDetail });
  initWorkforce();
  initEngineers();
  initOperationalDashboard();
  initRouter({ onShow: onSectionShown });
  updateGsAuthIndicator();
  setInterval(updateGsAuthIndicator, 60_000);
  initSimModal();                  // wire sim modal events
  loadAll(); // attempts GS auth from sessionStorage; shows prompt if not available
});
