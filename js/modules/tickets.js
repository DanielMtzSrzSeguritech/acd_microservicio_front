import { escHtml, formatDate } from '../utils.js';
import { createLatestRequest } from '../components/latest-request.js';
import { fetchRemoteWorkTickets } from '../services/tickets-api.js';
import { attentionSlaInfo, formatSlaProgress } from '../services/sla-date.js';
import { STATE } from '../state.js';
import {
  fetchGlobalSlaTickets, fetchOperationalErrors, fetchOperationalJob, fetchOperationalJobs, fetchOperationalTicket,
} from '../services/operational-api.js';

const $ = id => document.getElementById(id);
const safe = value => value === null || value === undefined || value === '' ? 'Sin datos disponibles' : escHtml(String(value));
const date = value => value && Number.isFinite(new Date(value).getTime()) ? safe(formatDate(value)) : 'Sin datos disponibles';
const publicError = (error, gs = false) => {
  if (gs && /inicia sesión/i.test(error?.message)) return 'Inicia sesión GS para ver tickets.';
  if (error?.status === 401 || error?.status === 403 || /HTTP (401|403)/.test(error?.message ?? '')) return 'No tienes acceso.';
  if (error?.code === 'gs_global_sql_unavailable' || error?.code === 'gs_global_sql_read_failed') return 'Lista SLA no disponible.';
  if (error?.code === 'acd_mysql_unavailable' || error?.code === 'acd_mysql_read_failed') return 'Historial ACD no disponible.';
  if (error?.code === 'gs_identity_contract_pending') return 'Acceso ACD no disponible.';
  return gs ? 'Tickets GS no disponibles en este momento.' : 'Datos ACD no disponibles en este momento.';
};
const request = createLatestRequest();
let dom;
let initialized = false;
let tab = 'gs-remote';
let rows = [];
let page = 1;
let cursors = [null];
let nextCursor = null;
let gsHasNext = false;
let ticketFilter = null;
let loadError = null;
let getTicketId = () => null;
let notify = () => {};
let selectTicket = () => {};
let lookupNumber = 0;
const detailCache = new Map();

function isSlaList() { return tab === 'unassigned' || tab === 'assigned'; }
function isGsList() { return tab === 'gs-remote'; }
const bucketName = { overdue: 'Vencido', due_soon: 'Próximo a vencer', later: 'Posterior', unverified: 'Sin SLA verificable' };
const slaClass = { overdue: 'sla-bad', due_soon: 'sla-warn', later: 'sla-good', unverified: '' };
const knownDetail = id => String(STATE.ticket?.ticketId ?? STATE.ticket?.TicketId) === String(id) ? STATE.ticket : null;
const knownProgress = id => {
  const detail = knownDetail(id);
  return detail ? formatSlaProgress(detail.flags?.ticketProgress ?? detail.Flags?.TicketProgress) : 'Sin datos disponibles';
};

function renderRows() {
  if (loadError) {
    dom.body.innerHTML = `<tr><td colspan="${isGsList() ? 9 : isSlaList() ? 8 : 8}" class="table-loading">${safe(loadError)}</td></tr>`;
    dom.visibleCount.textContent = '';
    return;
  }
  if (isGsList()) {
    const filter = dom.search.value.trim().toLowerCase();
    const visible = filter ? rows.filter(row => [row.ticketId, row.clientName, row.projectName, row.assignedEngineer]
      .some(value => String(value ?? '').toLowerCase().includes(filter))) : rows;
    dom.body.innerHTML = visible.length ? visible.map(row => {
      const detail = knownDetail(row.ticketId);
      const sla = detail ? attentionSlaInfo(detail.ticketAttentionTime ?? detail.TicketAttentionTime) : null;
      return `<tr>
      <td>#${safe(row.ticketId)}</td><td>${safe(row.clientName)}</td><td>${safe(row.projectName)}</td>
      <td>${date(row.createdDateTime)}</td><td>${date(row.closedDateTime)}</td>
      <td>${safe(row.assignedEngineer)}</td>
      <td>${sla ? `${safe(sla.dateText)} · ${safe(sla.remainingText)}` : 'Sin datos disponibles'}</td>
      <td>${safe(knownProgress(row.ticketId))}</td>
      <td><button type="button" data-gs-ticket="${safe(row.ticketId)}">Seleccionar ticket</button></td>
    </tr>`;
    }).join('') : `<tr><td colspan="9" class="table-loading">${filter ? 'Sin coincidencias en esta página.' : 'Sin tickets remotos en esta página.'}</td></tr>`;
    dom.visibleCount.textContent = `${visible.length} visibles de ${rows.length} en esta página · el filtro no busca en otras páginas`;
    return;
  }
  if (isSlaList()) {
    dom.body.innerHTML = rows.length ? rows.map(row => {
      const sla = attentionSlaInfo(row.sla_due_at);
      const status = sla.status === 'unverified' ? 'unverified' : sla.status;
      const engineer = Number.isSafeInteger(row.assigned_engineer_id) && row.assigned_engineer_id > 0
        ? `#${row.assigned_engineer_id}` : tab === 'unassigned' ? 'Sin asignar' : 'Sin datos disponibles';
      return `<tr>
      <td>#${safe(row.ticket_id)}</td><td>${safe(row.status_id)}</td>
      <td>${safe(engineer)}</td><td>${safe(sla.dateText)}</td>
      <td class="${slaClass[status]}">${safe(sla.remainingText)}</td>
      <td>${safe(knownProgress(row.ticket_id))}</td>
      <td><span class="${slaClass[status]}">${safe(bucketName[status])}</span></td>
      <td><button type="button" data-sla-ticket="${safe(row.ticket_id)}">Seleccionar ticket</button></td>
    </tr>`;
    }).join('') : '<tr><td colspan="8" class="table-loading">Sin tickets para esta consulta.</td></tr>';
    dom.visibleCount.textContent = `${rows.length} tickets en esta página · no representa un total global`;
    return;
  }
  dom.body.innerHTML = rows.length ? rows.map((row, index) => `<tr>
    <td>#${safe(row.id)}</td><td>#${safe(row.ticket_id)}</td><td>${safe(row.status)}</td>
    <td>${safe(row.attempt_count)}</td><td>${date(row.created_at)}</td><td>${date(row.updated_at)}</td>
    <td>${tab === 'errors' ? 'Ver motivo en detalle' : row.reconciliation_required ? 'Pendiente' : 'No'}</td>
    <td><button type="button" data-job-index="${index}">${tab === 'errors' ? 'Ver motivo' : 'Ver historial'}</button> <button type="button" data-job-ticket="${safe(row.ticket_id)}">Ver ticket</button></td>
  </tr>`).join('') : '<tr><td colspan="8" class="table-loading">Sin registros ACD para esta consulta.</td></tr>';
  dom.visibleCount.textContent = `${rows.length} jobs en esta página · alcance: tickets recibidos por ACD`;
}

function renderTab() {
  dom.tableWrap.hidden = false;
  dom.tableHeader.hidden = false;
  dom.errors.hidden = !isSlaList();
  dom.scope.hidden = false;
  dom.visibleCount.hidden = false;
  dom.search.disabled = isSlaList();
  dom.search.placeholder = isGsList() ? 'Filtrar solo esta página GS…' : 'Buscar ticket o evento ACD…';
  dom.size.disabled = false;
  dom.status.disabled = tab !== 'jobs';
  dom.reload.disabled = false;
  dom.clearTicketFilter.hidden = !ticketFilter || tab !== 'jobs';
  dom.tabs.forEach(button => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  dom.scope.textContent = isGsList()
    ? 'Trabajo remoto GS resuelto o histórico. Sin prioridad SLA global; la búsqueda filtra únicamente esta página.'
    : isSlaList()
    ? 'Tickets GS ordenados por vencimiento SLA desde ACD. La zona del ingeniero se muestra cuando esté disponible.'
    : tab === 'errors'
    ? 'Trabajos ACD en revisión tras tres intentos fallidos. Abre un trabajo para ver el motivo registrado.'
    : `Trabajos recibidos por ACD, ordenados por fecha. ${ticketFilter ? `Ticket #${ticketFilter}.` : ''}`;
  dom.pageInfo.textContent = `Pág. ${page}`;
  dom.prev.disabled = page <= 1;
  dom.next.disabled = isGsList() ? !gsHasNext : !nextCursor;
  dom.count.textContent = isGsList() ? `${rows.length} en esta página · total GS: ${gsTotal ?? 'Sin datos disponibles'}` : `${rows.length} en esta página`;
  dom.tableTitle.textContent = isGsList() ? 'Trabajo remoto GS' : isSlaList() ? 'Tickets por SLA' : 'Jobs e intentos ACD';
  dom.tableSource.textContent = isGsList() ? 'TicketsAPI GS' : isSlaList() ? 'SLA ACD' : 'ACD';
  dom.tableHead.innerHTML = isGsList()
    ? '<tr><th>Ticket ID</th><th>Cliente</th><th>Proyecto</th><th>Creado</th><th>Cerrado</th><th>Ingeniero</th><th>SLA atención</th><th>Consumido</th><th>Acción</th></tr>'
    : isSlaList()
    ? '<tr><th>Ticket ID</th><th>Estado GS ID</th><th>Ingeniero ID</th><th>Vencimiento SLA</th><th>Tiempo restante</th><th>Consumido</th><th>Urgencia</th><th>Acción</th></tr>'
    : `<tr><th>Trabajo</th><th>Ticket ID</th><th>Estado</th><th>Intentos</th><th>Creado</th><th>Actualizado</th><th>${tab === 'errors' ? 'Motivo' : 'Conciliación'}</th><th>Acciones</th></tr>`;
  renderRows();
}

let gsTotal = null;
function resetPage() { page = 1; cursors = [null]; nextCursor = null; gsHasNext = false; gsTotal = null; }

export function refreshKnownTicketSla() {
  if (initialized && (isGsList() || isSlaList()) && !loadError) renderRows();
}

export async function loadTicketsPage() {
  if (!initialized) return;
  const current = request.start();
  loadError = null;
  dom.body.innerHTML = `<tr><td colspan="${isGsList() ? 9 : isSlaList() ? 8 : 8}" class="table-loading">Cargando registros…</td></tr>`;
  dom.reload.disabled = true;
  dom.prev.disabled = true;
  dom.next.disabled = true;
  try {
    const params = { page_size: Number(dom.size.value) || 25, cursor: cursors[page - 1], search: dom.search.value.trim() };
    const data = await (isGsList()
      ? fetchRemoteWorkTickets({ page, pageSize: params.page_size })
      : isSlaList()
      ? fetchGlobalSlaTickets({ assignment: tab, page_size: params.page_size, cursor: cursors[page - 1] })
      : tab === 'errors'
      ? fetchOperationalErrors(params)
      : fetchOperationalJobs({ ...params, status: dom.status.value, ticket_id: ticketFilter }));
    if (!request.isCurrent(current)) return;
    if (!Array.isArray(data.items) || (isSlaList() && (data.source !== 'gs_ticket_sql' || data.ordering !== 'AttentionExpirationDateTime ASC NULLS LAST, Id ASC')))
      throw new Error(isSlaList() ? 'Contrato de consulta global SLA no verificable.' : 'Contrato de jobs ACD no verificable.');
    rows = data.items;
    if (isGsList()) dom.gsStatus.textContent = `GS: página ${page} cargada desde TicketsAPI.`;
    else dom.acdStatus.textContent = `ACD: consulta ${tab} disponible.`;
    if (isGsList()) { gsHasNext = data.hasNext; gsTotal = data.totalCount; nextCursor = null; }
    else nextCursor = data.has_more ? data.next_cursor : null;
    if (isSlaList() && data.has_more && !nextCursor) throw new Error('Cursor SLA no verificable.');
    if (isSlaList() && nextCursor && (!Number.isSafeInteger(nextCursor.after_ticket_id) || nextCursor.after_ticket_id <= 0 ||
      (nextCursor.after_due_at !== null && (typeof nextCursor.after_due_at !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(nextCursor.after_due_at)))))
      throw new Error('Cursor SLA no verificable.');
    if (nextCursor) cursors[page] = nextCursor;
    renderTab();
  } catch (error) {
    if (!request.isCurrent(current)) return;
    rows = [];
    nextCursor = null;
    gsHasNext = false;
    console.warn(isGsList() ? '[GS tickets]' : '[ACD tickets]', error.code ?? error.message);
    loadError = publicError(error, isGsList());
    if (isGsList()) dom.gsStatus.textContent = `GS: ${loadError}`;
    else dom.acdStatus.textContent = `ACD: ${loadError}`;
    renderTab();
    notify(loadError, 'error', 6000);
  } finally {
    if (request.isCurrent(current)) dom.reload.disabled = false;
  }
}

function detailFields(job, history) {
  const attempts = history?.dispatch_attempts ?? [];
  const lastError = [...attempts].reverse().find(item => item.error_code);
  const decisions = history?.dispatch_decisions ?? [];
  const events = history?.dispatch_events ?? [];
  return `<div class="drawer-section-title">Job ACD #${safe(job.id)} · MySQL</div>
    <div class="drawer-field"><span>Ticket</span><strong>#${safe(job.ticket_id)}</strong></div>
    <div class="drawer-field"><span>Estado actual</span><strong>${safe(job.status)}</strong></div>
    <div class="drawer-field"><span>Intentos</span><strong>${safe(job.attempt_count)}</strong></div>
    <div class="drawer-field"><span>Último error</span><strong>${safe(lastError?.error_code)}</strong></div>
    <div class="drawer-field"><span>Última actualización</span><strong>${date(job.updated_at)}</strong></div>
    <div class="drawer-section-title">Intentos registrados</div>
    ${attempts.length ? attempts.map(item => `<div class="drawer-field"><span>#${safe(item.attempt_no)} · ${date(item.started_at)}</span><strong>${safe(item.status)} · error ${safe(item.error_code)}</strong></div>`).join('') : '<p>Sin intentos registrados.</p>'}
    <div class="drawer-section-title">Decisiones</div>
    ${decisions.length ? decisions.map(item => `<div class="drawer-field"><span>${date(item.created_at)}</span><strong>Ingeniero ganador: ${safe(item.winner_engineer_id)}</strong></div>`).join('') : '<p>Sin decisiones registradas.</p>'}
    <div class="drawer-section-title">Eventos</div>
    ${events.length ? events.map(item => `<div class="drawer-field"><span>${date(item.created_at)}</span><strong>${safe(item.event_type)} · ${safe(item.to_status)}</strong></div>`).join('') : '<p>Sin eventos registrados.</p>'}`;
}

async function openJob(row) {
  dom.drawer.style.display = 'flex';
  dom.drawerTitle.textContent = `Job ACD #${row.id} · Ticket #${row.ticket_id}`;
  dom.drawerBody.innerHTML = '<p>Cargando historial ACD…</p>';
  const opened = row.id;
  dom.drawer.dataset.jobId = String(opened);
  try {
    if (!detailCache.has(opened)) detailCache.set(opened, await fetchOperationalJob(opened));
    if (dom.drawer.dataset.jobId === String(opened)) {
      const data = detailCache.get(opened);
      if (!data.job || !data.history) throw new Error('Contrato de historial ACD no verificable.');
      dom.drawerBody.innerHTML = detailFields(data.job, data.history);
    }
  } catch (error) {
    console.warn('[ACD historial]', error.code ?? error.message);
    if (dom.drawer.dataset.jobId === String(opened)) dom.drawerBody.innerHTML = `<p>${publicError(error)}</p>`;
  }
}

async function lookupTicket() {
  const current = ++lookupNumber;
  const id = Number(dom.lookupId.value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    dom.lookupResult.textContent = 'Ingresa un Ticket ID válido.';
    return;
  }
  dom.lookupResult.textContent = 'Consultando detalle GS…';
  try {
    const ticket = await fetchOperationalTicket(id);
    if (current !== lookupNumber || Number(dom.lookupId.value) !== id) return;
    if (String(ticket.ticket_id) !== String(id)) throw new Error('El ID del ticket GS no coincide con el solicitado.');
    const matches = ticket.assigned === (tab === 'assigned');
    const assignment = ticket.assigned === true ? 'Asignado' : ticket.assigned === false ? 'Sin asignar' : 'NO DISPONIBLE';
    dom.lookupResult.innerHTML = `<p>Ticket #${safe(ticket.ticket_id)} · ${safe(ticket.status_name)} · ${assignment}</p>
      <p>Responsable: ${safe(ticket.assigned_engineer_name ?? ticket.assigned_engineer_id)}</p>
      <p>Vencimiento SLA oficial: ${date(ticket.sla_attention_due_at)}</p>
      <p>${matches ? 'Coincide con la pestaña seleccionada.' : 'No coincide con la pestaña seleccionada o no hay dato de asignación verificable.'}</p>
      <button type="button" data-ticket-history="${id}">Ver jobs e historial ACD del ticket</button>`;
  } catch (error) {
    console.warn('[ACD detalle ticket]', error.code ?? error.message);
    if (current === lookupNumber && Number(dom.lookupId.value) === id) dom.lookupResult.textContent = publicError(error);
  }
}

function setTab(next) {
  if (!['gs-remote', 'unassigned', 'assigned', 'errors', 'jobs'].includes(next)) return;
  request.invalidate();
  lookupNumber++;
  tab = next;
  dom.search.value = '';
  dom.lookupResult.textContent = '';
  resetPage();
  rows = [];
  loadError = null;
  renderTab();
  loadTicketsPage();
}

export function showTicketHistory(ticketId) {
  const id = Number(ticketId);
  if (!initialized || !Number.isSafeInteger(id) || id <= 0) return;
  ticketFilter = id;
  dom.search.value = '';
  setTab('jobs');
}

export function initTickets({ toast, getCurrentTicketId, onSelectTicket } = {}) {
  if (initialized) return;
  initialized = true;
  notify = toast ?? notify;
  getTicketId = getCurrentTicketId ?? getTicketId;
  selectTicket = onSelectTicket ?? selectTicket;
  dom = {
    body: $('ticketsBody'), tableWrap: $('ticketsTableWrap'), tableHeader: $('ticketsTableHeader'), tableHead: $('tktTableHead'), tableTitle: $('tktTableTitle'), tableSource: $('tktTableSource'), errors: $('tktErrorsEmpty'), gsStatus: $('tktGsStatus'), acdStatus: $('tktAcdStatus'),
    scope: $('tktScopeNote'), visibleCount: $('tktVisibleCount'), tabs: [...document.querySelectorAll('.tkt-tab')],
    search: $('tktSearch'), reload: $('tktReloadBtn'), size: $('tktPageSize'), status: $('tktStatusFilter'), clearTicketFilter: $('tktClearTicketFilter'),
    prev: $('tktPrevBtn'), next: $('tktNextBtn'), pageInfo: $('tktPageInfo'), count: $('tktCount'),
    lookupId: $('tktLookupId'), lookupBtn: $('tktLookupBtn'), lookupResult: $('tktLookupResult'),
    drawer: $('drawerOverlay'), drawerBody: $('drawerBody'), drawerTitle: $('drawerTitle'),
    drawerClose: $('drawerClose'),
  };
  dom.acdStatus.textContent = 'ACD: aún no consultado; las consultas SLA y el historial requieren autorización ACD.';
  dom.tabs.forEach(button => button.addEventListener('click', () => setTab(button.dataset.tab)));
  dom.reload.addEventListener('click', () => { detailCache.clear(); loadTicketsPage(); });
  dom.size.addEventListener('change', () => { resetPage(); loadTicketsPage(); });
  dom.status.addEventListener('change', () => { resetPage(); loadTicketsPage(); });
  dom.clearTicketFilter.addEventListener('click', () => { ticketFilter = null; resetPage(); loadTicketsPage(); });
  let searchTimer;
  dom.search.addEventListener('input', () => {
    if (isGsList()) { renderRows(); return; }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { ticketFilter = null; resetPage(); loadTicketsPage(); }, 250);
  });
  dom.prev.addEventListener('click', () => { if (page > 1) { page--; loadTicketsPage(); } });
  dom.next.addEventListener('click', () => { if (isGsList() ? gsHasNext : nextCursor) { page++; loadTicketsPage(); } });
  dom.lookupBtn.addEventListener('click', lookupTicket);
  dom.lookupResult.addEventListener('click', event => {
    const button = event.target.closest('button[data-ticket-history]');
    if (!button) return;
    showTicketHistory(button.dataset.ticketHistory);
  });
  dom.body.addEventListener('click', event => {
    const jobTicket = event.target.closest('button[data-job-ticket]');
    if (jobTicket) { selectTicket(jobTicket.dataset.jobTicket); return; }
    const gsButton = event.target.closest('button[data-gs-ticket]');
    if (gsButton) { selectTicket(gsButton.dataset.gsTicket); return; }
    const ticketButton = event.target.closest('button[data-sla-ticket]');
    if (ticketButton) { selectTicket(ticketButton.dataset.slaTicket); return; }
    const button = event.target.closest('button[data-job-index]');
    if (button && rows[Number(button.dataset.jobIndex)]) openJob(rows[Number(button.dataset.jobIndex)]);
  });
  dom.drawerClose.addEventListener('click', () => { dom.drawer.style.display = 'none'; dom.drawer.dataset.jobId = ''; });
  dom.drawer.addEventListener('click', event => {
    if (event.target === dom.drawer) { dom.drawer.style.display = 'none'; dom.drawer.dataset.jobId = ''; }
  });
  renderTab();
}
