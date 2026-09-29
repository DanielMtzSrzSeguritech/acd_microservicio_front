import { escHtml, formatDate } from '../utils.js';
import { createLatestRequest } from '../components/latest-request.js';
import { fetchActiveEngineers, fetchOperationalSessions, fetchEngineersDirectory } from '../services/operational-api.js';
import { checkIn, checkOut } from '../services/workforce-api.js';

const $ = id => document.getElementById(id);
const safe = value => value === null || value === undefined || value === '' ? 'Sin datos disponibles' : escHtml(String(value));
const date = value => value && Number.isFinite(new Date(value).getTime()) ? safe(formatDate(value)) : 'Sin datos disponibles';
const publicError = error => error?.status === 401 || error?.status === 403 ? 'No tienes acceso.'
  : error?.code === 'gs_identity_contract_pending' || error?.code === 'gs_acd_token_contract_pending'
    ? 'Sesiones pendientes de autorización.'
    : error?.code === 'acd_mysql_unavailable'
      ? 'Sesiones no disponibles: MySQL ACD no está disponible (acd_mysql_unavailable).'
      : (error?.message?.includes('Sesiones no disponibles') ? error.message : 'Sesiones no disponibles en este momento.');

const request = createLatestRequest();
let initialized = false;
let page = 1;
let cursors = [null];
let nextCursor = null;
let dom;

function refreshOwnSession() {
  const checkin = $('wfCheckinBtn');
  const checkout = $('wfCheckoutBtn');
  const result = $('wfCheckinResult');
  if (checkin) checkin.disabled = true;
  if (checkout) checkout.disabled = true;
  if (result) result.textContent = 'Check-in y check-out deshabilitados para la sesión general.';
}

function resetPage() { page = 1; cursors = [null]; nextCursor = null; }

function render(items, scope) {
  dom.body.innerHTML = items.length ? items.map(item => `<tr>
    <td>${safe(item.id)}</td>
    <td><span style="font-weight:600;color:var(--text-primary)">#${safe(item.engineer_id)}</span></td>
    <td>${safe(item.check_in_zone_id)}</td>
    <td>${safe(item.administrative_zone_id)}</td>
    <td>${scope === 'active' ? '<span class="status-badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981">Activa (Check-in)</span>' : item.check_out_at ? '<span class="status-badge" style="background:rgba(148,163,184,0.15);color:#94a3b8;border:1px solid #64748b">Cerrada</span>' : '<span class="status-badge" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid #10b981">Activa</span>'}</td>
    <td>${date(item.check_in_at)}</td>
    <td>${date(item.check_out_at)}</td>
    <td>${item.gps?.lat == null || item.gps?.lng == null ? 'Sin ubicación registrada' : `${safe(item.gps.lat)}, ${safe(item.gps.lng)} - informativo`}</td>
  </tr>`).join('') : '<tr><td colspan="8" class="table-loading">Sin sesiones para esta consulta.</td></tr>';
}

export async function loadTestEngineersSelect() {
  const select = $('wfTestEngineerSelect');
  if (!select) return;
  try {
    const data = await fetchEngineersDirectory({ page: 1, pageSize: 25 });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      select.innerHTML = '<option value="">No hay ingenieros operativos disponibles</option>';
      return;
    }
    select.innerHTML = items.map(eng => {
      const name = eng.fullName || eng.userName || `Ingeniero #${eng.id}`;
      const srvText = (typeof eng.services_count === 'number' && eng.services_count > 0)
        ? `${eng.services_count.toLocaleString()} servicios`
        : 'Sin servicios autorizados';
      return `<option value="${eng.id}">${eng.id} - ${escHtml(name)} (${srvText})</option>`;
    }).join('');
  } catch (error) {
    console.warn('[ACD selector ingenieros]', error);
    select.innerHTML = '<option value="">Error al cargar directorio de ingenieros</option>';
  }
}

export async function loadWorkforceSessions({ refresh = false } = {}) {
  if (!initialized) return;
  const current = request.start();
  const scope = dom.scope?.value || 'active';
  const engineerId = dom.engineer?.value ? dom.engineer.value.trim() : '';
  if (engineerId && (!Number.isSafeInteger(Number(engineerId)) || Number(engineerId) <= 0)) {
    dom.body.innerHTML = '<tr><td colspan="8" class="table-loading">ID de ingeniero inválido.</td></tr>';
    return;
  }
  dom.body.innerHTML = '<tr><td colspan="8" class="table-loading">Cargando sesiones ACD…</td></tr>';
  if (dom.prev) dom.prev.disabled = true;
  if (dom.next) dom.next.disabled = true;
  try {
    const cursor = cursors[page - 1];
    const data = scope === 'active' && !engineerId
      ? await fetchActiveEngineers({ refresh, cursor })
      : await fetchOperationalSessions({ page_size: 25, cursor, active_only: scope === 'active', engineer_id: engineerId });
    if (!request.isCurrent(current)) return;
    if (!Array.isArray(data.items)) throw new Error('Contrato de sesiones ACD no verificable.');
    const items = data.items;
    nextCursor = data.has_more ? data.next_cursor : null;
    if (nextCursor) cursors[page] = nextCursor;
    render(items, scope);
    if (dom.pageInfo) dom.pageInfo.textContent = `Pág. ${page}`;
    if (dom.prev) dom.prev.disabled = page <= 1;
    if (dom.next) dom.next.disabled = !nextCursor;
    if (dom.note) dom.note.textContent = `${scope === 'active' ? 'Sesiones activas' : 'Historial de sesiones'} registradas en MySQL acd_db. GPS informativo.`;
  } catch (error) {
    if (!request.isCurrent(current)) return;
    console.warn('[ACD sesiones]', error.code ?? error.message);
    dom.body.innerHTML = `<tr><td colspan="8" class="table-loading">${publicError(error)}</td></tr>`;
    if (dom.note) dom.note.textContent = publicError(error);
    nextCursor = null;
  }
}

export function initWorkforce() {
  if (initialized) return;
  initialized = true;
  dom = {
    body: $('wfTableBody'), refresh: $('wfRefreshBtn'), scope: $('wfScope'), engineer: $('wfHistoryEngineerId'),
    filter: $('wfFilterBtn'), prev: $('wfPrevBtn'), next: $('wfNextBtn'), pageInfo: $('wfPageInfo'), note: $('wfScopeNote'),
  };
  dom.refresh?.addEventListener('click', () => {
    loadWorkforceSessions({ refresh: true });
    loadTestEngineersSelect();
  });
  dom.scope?.addEventListener('change', () => { resetPage(); loadWorkforceSessions(); });
  dom.filter?.addEventListener('click', () => { resetPage(); loadWorkforceSessions(); });
  dom.prev?.addEventListener('click', () => { if (page > 1) { page--; loadWorkforceSessions(); } });
  dom.next?.addEventListener('click', () => { if (nextCursor) { page++; loadWorkforceSessions(); } });

  // Mi sesión (deshabilitada para el usuario general)
  $('wfCheckinBtn')?.addEventListener('click', async () => {
    const btn = $('wfCheckinBtn');
    if (btn) btn.disabled = true;
    try { await checkIn(); } catch (error) {
      console.warn('[ACD check-in]', error.code ?? error.message);
      const res = $('wfCheckinResult');
      if (res) res.textContent = publicError(error);
    }
    refreshOwnSession();
  });
  $('wfCheckoutBtn')?.addEventListener('click', async () => {
    const btn = $('wfCheckoutBtn');
    if (btn) btn.disabled = true;
    try { await checkOut(); } catch (error) {
      console.warn('[ACD check-out]', error.code ?? error.message);
      const res = $('wfCheckinResult');
      if (res) res.textContent = publicError(error);
    }
    refreshOwnSession();
  });
  refreshOwnSession();

  // Selector y acciones de prueba autorizadas (directorio operativo GS)
  const testCheckinBtn = $('wfTestCheckinBtn');
  const testCheckoutBtn = $('wfTestCheckoutBtn');
  const testSelect = $('wfTestEngineerSelect');
  const testResult = $('wfTestActionResult');

  loadTestEngineersSelect();

  testCheckinBtn?.addEventListener('click', async () => {
    const engineerId = Number(testSelect?.value);
    if (!engineerId || isNaN(engineerId)) {
      if (testResult) {
        testResult.style.color = '#ef4444';
        testResult.textContent = 'Selecciona un ingeniero válido del directorio.';
      }
      return;
    }
    testCheckinBtn.disabled = true;
    if (testCheckoutBtn) testCheckoutBtn.disabled = true;
    if (testResult) {
      testResult.style.color = 'var(--text-secondary)';
      testResult.textContent = `Registrando check-in en MySQL para ingeniero #${engineerId}...`;
    }
    try {
      const res = await checkIn(engineerId);
      if (testResult) {
        testResult.style.color = '#10b981';
        const nameInfo = res.engineer_name ? ` (${res.engineer_name})` : '';
        testResult.textContent = `Check-in confirmado para #${res.engineer_id}${nameInfo}. Sesión #${res.session_id} persistida en MySQL.`;
      }
      await loadWorkforceSessions({ refresh: true });
    } catch (error) {
      if (testResult) {
        testResult.style.color = '#ef4444';
        testResult.textContent = `Error en check-in: ${error.message}`;
      }
    } finally {
      testCheckinBtn.disabled = false;
      if (testCheckoutBtn) testCheckoutBtn.disabled = false;
    }
  });

  testCheckoutBtn?.addEventListener('click', async () => {
    const engineerId = Number(testSelect?.value);
    if (!engineerId || isNaN(engineerId)) {
      if (testResult) {
        testResult.style.color = '#ef4444';
        testResult.textContent = 'Selecciona un ingeniero válido del directorio.';
      }
      return;
    }
    testCheckoutBtn.disabled = true;
    if (testCheckinBtn) testCheckinBtn.disabled = true;
    if (testResult) {
      testResult.style.color = 'var(--text-secondary)';
      testResult.textContent = `Registrando check-out en MySQL para ingeniero #${engineerId}...`;
    }
    try {
      const res = await checkOut(engineerId);
      if (testResult) {
        testResult.style.color = '#38bdf8';
        const nameInfo = res.engineer_name ? ` (${res.engineer_name})` : '';
        testResult.textContent = `Check-out confirmado para #${res.engineer_id}${nameInfo}. Turno finalizado en MySQL.`;
      }
      await loadWorkforceSessions({ refresh: true });
    } catch (error) {
      if (testResult) {
        testResult.style.color = '#ef4444';
        testResult.textContent = `Error en check-out: ${error.message}`;
      }
    } finally {
      testCheckoutBtn.disabled = false;
      if (testCheckinBtn) testCheckinBtn.disabled = false;
    }
  });

  document.querySelectorAll('.btn-wf-quick').forEach(button => { button.disabled = true; });
}
