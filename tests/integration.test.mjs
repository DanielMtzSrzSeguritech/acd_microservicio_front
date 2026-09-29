import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestRequest } from '../js/components/latest-request.js';
import { paginateRows } from '../js/components/pagination.js';
import { filterCandidates } from '../js/modules/candidates-model.js';
import { fetchGeolocations } from '../js/services/candidates-api.js';
import { STATE } from '../js/state.js';
import { authenticate, saveCredentials, clearCredentials } from '../js/services/auth.js';

test('cambio de ticket: una respuesta tardía no sustituye la vigente (mock)', async () => {
  const requests = createLatestRequest();
  const received = [];
  let finishOld;
  let finishNew;
  const old = new Promise(resolve => { finishOld = resolve; });
  const newer = new Promise(resolve => { finishNew = resolve; });
  async function load(ticketId, response) {
    const request = requests.start();
    const ticket = await response;
    if (requests.isCurrent(request)) received.push({ ticketId, ticket });
  }
  const first = load(1, old);
  const second = load(2, newer);
  finishNew({ id: 2 });
  finishOld({ id: 1 });
  await Promise.all([first, second]);
  assert.deepEqual(received, [{ ticketId: 2, ticket: { id: 2 } }]);
  requests.invalidate();
  assert.equal(requests.isCurrent(2), false);
});

test('filtro y paginación no mutan candidatos ni cambian su orden (mock)', () => {
  const source = Array.from({ length: 51 }, (_, i) => ({ userId: i + 1, name: `Técnico ${i + 1}`, hasGps: i % 2 === 0 }));
  const before = source.map(row => row.userId);
  const filtered = filterCandidates(source, { gps: 'yes' });
  const first = paginateRows(filtered, 1, 20);
  const second = paginateRows(filtered, 2, 20);
  assert.deepEqual(first.rows.map(row => row.userId), before.filter(id => id % 2 === 1).slice(0, 20));
  assert.deepEqual(second.rows.map(row => row.userId), before.filter(id => id % 2 === 1).slice(20));
  assert.equal(second.start, 21);
  assert.equal(second.end, 26);
  assert.deepEqual(source.map(row => row.userId), before);
  assert.equal(paginateRows([], 8, 20).page, 0);
  assert.equal(paginateRows(source, 99, 20).page, 3);
});

test('servicio GPS interpreta contrato GS y propaga errores HTTP (fetch mock)', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = STATE.token;
  STATE.token = 'token-de-prueba';
  try {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return { ok: true, json: async () => ({ workForceGeolocations: [{ workForceId: 42, coordinates: [{ latitude: 19.4, longitude: -99.1 }] }] }) };
    };
    assert.deepEqual(await fetchGeolocations(), [{ userId: 42, latitude: 19.4, longitude: -99.1, date: null }]);
    assert.equal(calls, 1);
    globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => 'temporal' });
    await assert.rejects(fetchGeolocations(), /HTTP 503/);
  } finally {
    globalThis.fetch = originalFetch;
    STATE.token = originalToken;
  }
});

test('autenticación GS comparte solicitud y descarta token tras cierre (fetch mock)', async () => {
  const previousStorage = globalThis.sessionStorage;
  const previousFetch = globalThis.fetch;
  const previousToken = STATE.token;
  const values = new Map();
  globalThis.sessionStorage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key), removeItem: key => values.delete(key) };
  let calls = 0;
  let finish;
  globalThis.fetch = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  try {
    saveCredentials('usuario-de-prueba', 'clave-de-prueba');
    const first = authenticate();
    const second = authenticate();
    assert.equal(calls, 1);
    assert.equal(first, second);
    clearCredentials();
    finish({ ok: true, json: async () => ({ downstreamTokens: { ticketApiToken: 'token-tardío' } }) });
    await assert.rejects(first, /cancelada/);
    assert.equal(STATE.token, null);
  } finally {
    clearCredentials();
    STATE.token = previousToken;
    globalThis.sessionStorage = previousStorage;
    globalThis.fetch = previousFetch;
  }
});

test('router conserva nodos compartidos, estado y retroceso (DOM mock)', async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const elements = new Map();
  const make = id => ({ id, hidden: false, children: [], append(...nodes) { this.children.push(...nodes); }, prepend(...nodes) { this.children.unshift(...nodes); }, insertBefore(node) { this.children.push(node); }, classList: { toggle() {} }, setAttribute() {}, removeAttribute() {}, addEventListener() {} });
  for (const id of ['dashboardMapDetailRow', 'mapPanel', 'ticketPanel', 'matrixSection', 'dashboardSection', 'acdSummary', 'ticketContext', 'ticketActionBar', 'cardsGrid', 'ticketsSection', 'engineersSection', 'candidatesSection', 'workforceSection', 'closeTicketContext']) elements.set(id, make(id));
  const listeners = {};
  const history = { pushState(_state, _unused, hash) { globalThis.window.location.hash = hash; } };
  const links = ['dashboard', 'tickets-list', 'engineers', 'workforce'].map(section => ({ dataset: { section }, classList: { toggle() {} }, setAttribute() {}, removeAttribute() {}, addEventListener() {} }));
  globalThis.document = { getElementById: id => elements.get(id), querySelectorAll: () => links };
  globalThis.window = { location: { hash: '#view=dashboard' }, history, addEventListener: (name, handler) => { listeners[name] = handler; } };
  try {
    const { initRouter, showSection } = await import('../js/router.js');
    initRouter();
    const map = elements.get('mapPanel');
    map.customState = 7;
    showSection('ticket');
    assert.equal(elements.get('ticketsSection').hidden, false);
    assert.equal(elements.get('dashboardSection').hidden, true);
    assert.equal(elements.get('ticketContext').hidden, false);
    assert.equal(elements.get('ticketContext').children.includes(elements.get('ticketPanel')), true);
    showSection('candidates');
    assert.equal(elements.get('candidatesSection').hidden, false);
    showSection('ticket');
    assert.equal(elements.get('candidatesSection').hidden, true);
    showSection('engineers');
    assert.equal(elements.get('engineersSection').hidden, false);
    globalThis.window.location.hash = '#view=dashboard';
    listeners.popstate();
    assert.equal(elements.get('dashboardMapDetailRow').children[0], map);
    assert.equal(map.customState, 7);
    assert.equal(elements.get('dashboardSection').hidden, false);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('Tickets ignora respuestas antiguas y pagina jobs ACD por cursor (DOM y fetch mock)', async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://127.0.0.1:5500/index.html' };
  const previousToken = STATE.token;
  const previousClientToken = STATE.clientToken;
  const previousTicket = STATE.ticket;
  const nodes = new Map();
  const element = id => {
    const node = {
      id, value: '', disabled: false, hidden: false, innerHTML: '', textContent: '', style: {}, dataset: {},
      handlers: {}, classList: { toggle() {} }, setAttribute() {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      click() { this.handlers.click?.({ target: this }); },
    };
    nodes.set(id, node);
    return node;
  };
  for (const id of ['ticketsBody', 'ticketsTableWrap', 'ticketsTableHeader', 'tktTableHead', 'tktTableTitle', 'tktTableSource', 'tktErrorsEmpty', 'tktGsStatus', 'tktAcdStatus', 'tktScopeNote', 'tktVisibleCount', 'tktSearch', 'tktReloadBtn', 'tktPageSize', 'tktStatusFilter', 'tktClearTicketFilter', 'tktPrevBtn', 'tktNextBtn', 'tktPageInfo', 'tktCount', 'tktLookupId', 'tktLookupBtn', 'tktLookupResult', 'drawerOverlay', 'drawerBody', 'drawerTitle', 'drawerClose', 'drawerSimBtn']) element(id);
  nodes.get('tktPageSize').value = '25';
  const tabs = ['unassigned', 'assigned', 'errors', 'jobs', 'gs-remote'].map(tab => {
    const node = element(`tab-${tab}`);
    node.dataset.tab = tab;
    return node;
  });
  globalThis.document = { getElementById: id => nodes.get(id), querySelectorAll: selector => selector === '.tkt-tab' ? tabs : [] };
  STATE.token = 'token-de-prueba';
  STATE.clientToken = null;
  let finishOld;
  let finishNew;
  const old = new Promise(resolve => { finishOld = resolve; });
  const newer = new Promise(resolve => { finishNew = resolve; });
  let calls = 0;
  let selectedTicket = null;
  globalThis.fetch = () => ++calls === 1 ? old : newer;
  try {
    const { initTickets, loadTicketsPage, refreshKnownTicketSla } = await import('../js/modules/tickets.js');
    initTickets({ onSelectTicket: id => { selectedTicket = id; } });
    assert.equal(calls, 0);
    tabs[3].click();
    const second = loadTicketsPage();
    finishNew({ ok: true, json: async () => ({ items: [{ id: 2, ticket_id: 22, status: 'received', attempt_count: 0 }], has_more: true, next_cursor: 'CURSOR' }) });
    await second;
    finishOld({ ok: true, json: async () => ({ items: [{ id: 1, ticket_id: 11 }], has_more: false }) });
    await Promise.resolve();
    assert.match(nodes.get('ticketsBody').innerHTML, /#22/);
    assert.doesNotMatch(nodes.get('ticketsBody').innerHTML, /#11/);
    assert.equal(nodes.get('tktNextBtn').disabled, false);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      job: { id: 2, ticket_id: 22, status: 'failed_review', attempt_count: 3 },
      history: {
        dispatch_attempts: [{ attempt_no: 3, status: 'failed', error_code: 'TIMEOUT', started_at: '2026-01-01T12:00:00Z', error_detail: 'SECRETO_NO_MOSTRAR' }],
        dispatch_decisions: [{ winner_engineer_id: 8, details: { token: 'SECRETO_NO_MOSTRAR' } }],
        dispatch_events: [{ event_type: 'failed', details: { token: 'SECRETO_NO_MOSTRAR' } }],
      },
    }) });
    nodes.get('ticketsBody').handlers.click({ target: { closest: selector => selector.includes('data-job-index') ? { dataset: { jobIndex: '0' } } : null } });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(nodes.get('drawerBody').innerHTML, /TIMEOUT/);
    assert.match(nodes.get('drawerBody').innerHTML, /2026/);
    assert.doesNotMatch(nodes.get('drawerBody').innerHTML, /SECRETO_NO_MOSTRAR/);
    nodes.get('ticketsBody').handlers.click({ target: { closest: selector => selector.includes('data-job-ticket') ? { dataset: { jobTicket: '22' } } : null } });
    assert.equal(selectedTicket, '22');
    let requested;
    globalThis.fetch = async url => { requested = String(url); return { ok: true, json: async () => ({ items: [], has_more: false, next_cursor: null }) }; };
    nodes.get('tktNextBtn').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(requested, /cursor=CURSOR/);
    assert.equal(nodes.get('tktPageInfo').textContent, 'Pág. 2');
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'acd_mysql_unavailable' } }) });
    await loadTicketsPage();
    assert.match(nodes.get('ticketsBody').innerHTML, /Historial ACD no disponible/);
    assert.equal(nodes.get('tktNextBtn').disabled, true);
    tabs[0].click();
    assert.match(nodes.get('tktScopeNote').textContent, /ordenados por vencimiento SLA/);
    nodes.get('tktLookupId').value = '42';
    globalThis.fetch = async url => ({ ok: true, json: async () => String(url).includes('/tickets/42')
      ? { ticket_id: 42, assigned: false, status_name: 'Abierto', sla_attention_due_at: '2030-01-01T00:00:00Z' }
      : { items: [], has_more: false } });
    nodes.get('tktLookupBtn').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(nodes.get('tktLookupResult').innerHTML, /Coincide con la pestaña/);
    assert.match(nodes.get('tktLookupResult').innerHTML, /Vencimiento SLA oficial/);
    let historyUrl = '';
    globalThis.fetch = async url => { historyUrl = String(url); return { ok: true, json: async () => ({ items: [], has_more: false }) }; };
    nodes.get('tktLookupResult').handlers.click({ target: { closest: () => ({ dataset: { ticketHistory: '42' } }) } });
    await new Promise(resolve => setImmediate(resolve));
    assert.match(historyUrl, /\/jobs\?page_size=25&ticket_id=42/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ unexpected: true }) });
    await loadTicketsPage();
    assert.match(nodes.get('ticketsBody').innerHTML, /Datos ACD no disponibles/);
    tabs[0].click();
    const slaCalls = [];
    globalThis.fetch = async url => {
      slaCalls.push(String(url));
      return { ok: true, json: async () => slaCalls.length === 1
        ? { source: 'gs_ticket_sql', ordering: 'AttentionExpirationDateTime ASC NULLS LAST, Id ASC', items: [
          { ticket_id: 11, status_id: 2, assigned_engineer_id: null, sla_due_at: '2026-01-01T10:00:00', sla_bucket: 'overdue' },
          { ticket_id: 13, status_id: 2, assigned_engineer_id: null, sla_due_at: new Date(Date.now() + 30 * 60000).toISOString(), sla_bucket: 'due_soon' },
          { ticket_id: 12, status_id: 2, assigned_engineer_id: null, sla_due_at: null, sla_bucket: 'unverified' },
        ], has_more: true, next_cursor: { after_ticket_id: 12, after_due_at: null } }
        : { source: 'gs_ticket_sql', ordering: 'AttentionExpirationDateTime ASC NULLS LAST, Id ASC', items: [], has_more: false, next_cursor: null } };
    };
    await loadTicketsPage();
    assert.match(nodes.get('tktTableHead').innerHTML, /Tiempo restante/);
    assert.match(nodes.get('tktTableHead').innerHTML, /Consumido/);
    assert.match(nodes.get('tktTableHead').innerHTML, /Urgencia/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Vencido/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Próximo a vencer/);
    assert.match(nodes.get('ticketsBody').innerHTML, /sla-warn/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Vencido hace/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Sin asignar/);
    assert.ok(nodes.get('ticketsBody').innerHTML.indexOf('#11') < nodes.get('ticketsBody').innerHTML.indexOf('#13'));
    assert.ok(nodes.get('ticketsBody').innerHTML.indexOf('#13') < nodes.get('ticketsBody').innerHTML.indexOf('#12'));
    assert.match(nodes.get('ticketsBody').innerHTML, /Sin SLA verificable/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Sin datos disponibles/);
    STATE.ticket = { ticketId: 11, flags: { ticketProgress: 72 }, ticketAttentionTime: '2026-01-01T10:00:00Z' };
    refreshKnownTicketSla();
    assert.equal((nodes.get('ticketsBody').innerHTML.match(/72%/g) ?? []).length, 1);
    assert.equal(slaCalls.length, 1);
    nodes.get('ticketsBody').handlers.click({ target: { closest: selector => selector.includes('data-sla-ticket') ? { dataset: { slaTicket: '11' } } : null } });
    assert.equal(selectedTicket, '11');
    assert.equal(nodes.get('tktNextBtn').disabled, false);
    nodes.get('tktNextBtn').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(slaCalls[1], /after_ticket_id=12/);
    assert.doesNotMatch(slaCalls[1], /after_due_at=/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Sin tickets para esta consulta/);
    assert.equal(nodes.get('tktNextBtn').disabled, true);
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'gs_global_sql_unavailable', message: 'SECRETO_NO_MOSTRAR' } }) });
    await loadTicketsPage();
    assert.match(nodes.get('ticketsBody').innerHTML, /Lista SLA no disponible/);
    assert.doesNotMatch(nodes.get('ticketsBody').innerHTML, /SECRETO_NO_MOSTRAR/);
    const acdFailure = nodes.get('tktAcdStatus').textContent;
    const gsCalls = [];
    globalThis.fetch = async (url, options) => {
      gsCalls.push({ url: String(url), options });
      const currentPage = Number(new URL(String(url)).searchParams.get('PageNumber'));
      return { ok: true, json: async () => ({ data: {
        items: currentPage === 1
          ? [{ ticketId: 51, clientName: 'Cliente GS', projectName: 'Proyecto GS', assignedEngineer: 'Ana' }]
          : [],
        currentPage, totalPages: 2, totalCount: 1,
      } }) };
    };
    tabs[4].click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(gsCalls[0].url, /\/ticket\/api\/v1\/Dashboard\/GetRemoteWorkTickets/);
    assert.equal(gsCalls[0].options.headers.Authorization, 'Bearer token-de-prueba');
    assert.match(nodes.get('ticketsBody').innerHTML, /Cliente GS/);
    assert.match(nodes.get('tktTableHead').innerHTML, /SLA atención/);
    STATE.ticket = { ticketId: 51, flags: { ticketProgress: 47 }, ticketAttentionTime: '2030-01-01T10:00:00Z' };
    refreshKnownTicketSla();
    assert.match(nodes.get('ticketsBody').innerHTML, /Restan|Vencido hace/);
    assert.match(nodes.get('ticketsBody').innerHTML, /47%/);
    assert.equal(nodes.get('tktAcdStatus').textContent, acdFailure);
    assert.match(nodes.get('tktScopeNote').textContent, /Sin prioridad SLA global/);
    nodes.get('tktSearch').value = 'no-coincide';
    nodes.get('tktSearch').handlers.input();
    assert.match(nodes.get('ticketsBody').innerHTML, /Sin coincidencias en esta página/);
    assert.equal(gsCalls.length, 1);
    nodes.get('tktSearch').value = '';
    nodes.get('tktSearch').handlers.input();
    assert.match(nodes.get('ticketsBody').innerHTML, /Cliente GS/);
    nodes.get('tktNextBtn').click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(gsCalls[1].url, /PageNumber=2/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Sin tickets remotos en esta página/);
    globalThis.fetch = async () => ({ ok: false, status: 403, text: async () => 'SECRETO_NO_MOSTRAR' });
    await loadTicketsPage();
    assert.match(nodes.get('tktGsStatus').textContent, /No tienes acceso/);
    assert.doesNotMatch(nodes.get('ticketsBody').innerHTML, /SECRETO_NO_MOSTRAR/);
    assert.equal(nodes.get('tktAcdStatus').textContent, acdFailure);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      source: 'gs_ticket_sql', ordering: 'AttentionExpirationDateTime ASC NULLS LAST, Id ASC',
      items: [{ ticket_id: 99, assigned_engineer_id: 7, status_id: 4, sla_due_at: null, sla_bucket: 'unverified' }],
      has_more: false, next_cursor: null,
    }) });
    tabs[1].click();
    await new Promise(resolve => setImmediate(resolve));
    assert.match(nodes.get('tktTableHead').innerHTML, /Tiempo restante/);
    assert.match(nodes.get('ticketsBody').innerHTML, /#99/);
    assert.match(nodes.get('ticketsBody').innerHTML, /<td>#7<\/td>/);
    assert.match(nodes.get('ticketsBody').innerHTML, /Sin datos disponibles/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
    globalThis.location = previousLocation;
    STATE.clientToken = previousClientToken;
    STATE.ticket = previousTicket;
  }
});

test('Candidatos reinicia la página al cambiar ticket y conserva orden (DOM mock)', async () => {
  const previousDocument = globalThis.document;
  const nodes = new Map();
  const make = id => {
    const node = { id, value: '', disabled: false, innerHTML: '', textContent: '', handlers: {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      fire(name) { this.handlers[name]?.({ target: this }); },
    };
    nodes.set(id, node);
    return node;
  };
  for (const id of ['candidatesBody', 'candidateTicketContext', 'candidateSearch', 'candidateGpsFilter', 'candidateSessionFilter', 'candidatePageSize', 'candidateCount', 'candidateRange', 'candidatePageInfo', 'candidatePrevBtn', 'candidateNextBtn']) make(id);
  nodes.get('candidateGpsFilter').value = 'all';
  nodes.get('candidateSessionFilter').value = 'all';
  nodes.get('candidatePageSize').value = '20';
  globalThis.document = { getElementById: id => nodes.get(id) };
  let ticket = 1;
  let candidates = Array.from({ length: 21 }, (_, index) => ({ userId: index + 1, name: `Técnico ${index + 1}` }));
  try {
    const { initCandidates, updateCandidates } = await import('../js/modules/candidates.js');
    initCandidates({ getCandidates: () => candidates, getTicketId: () => ticket, hasAuth: () => true });
    nodes.get('candidateNextBtn').fire('click');
    assert.equal(nodes.get('candidatePageInfo').textContent, 'Página 2 de 2');
    ticket = 2;
    candidates = [{ userId: 99, name: 'Nuevo' }];
    updateCandidates({ ticketChanged: true });
    assert.equal(nodes.get('candidatePageInfo').textContent, 'Página 1 de 1');
    assert.match(nodes.get('candidatesBody').innerHTML, /Nuevo/);
    assert.equal(nodes.get('candidateTicketContext').textContent, 'Ticket #2');
    assert.equal(nodes.get('candidateNextBtn').disabled, true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('Workforce carga sesiones y conserva error HTTP (DOM y fetch mock)', async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousToken = STATE.token;
  const previousLocation = globalThis.location;
  STATE.token = 'ticket-test';
  globalThis.location = { href: 'http://127.0.0.1:5500/index.html' };
  const nodes = new Map();
  for (const id of ['wfTableBody', 'wfRefreshBtn', 'wfScope', 'wfHistoryEngineerId', 'wfFilterBtn', 'wfPrevBtn', 'wfNextBtn', 'wfPageInfo', 'wfScopeNote', 'wfCheckinBtn', 'wfCheckoutBtn', 'wfCheckinResult']) {
    nodes.set(id, { innerHTML: '', value: '', textContent: '', disabled: false, addEventListener() {} });
  }
  nodes.get('wfScope').value = 'active';
  globalThis.document = { getElementById: id => nodes.get(id), querySelectorAll: () => [] };
  try {
    const { initWorkforce, loadWorkforceSessions } = await import('../js/modules/workforce.js');
    initWorkforce();
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [{ id: 1, engineer_id: 42, check_in_zone_id: 3, administrative_zone_id: null, check_in_at: '2026-01-01T00:00:00Z', gps: { lat: 19.4, lng: -99.1 } }], has_more: false }) });
    await loadWorkforceSessions();
    assert.match(nodes.get('wfTableBody').innerHTML, /42/);
    assert.match(nodes.get('wfTableBody').innerHTML, /Sin datos disponibles/);
    assert.equal(nodes.get('wfCheckinBtn').disabled, true);
    assert.equal(nodes.get('wfCheckoutBtn').disabled, true);
    assert.match(nodes.get('wfCheckinResult').textContent, /Check-in y check-out deshabilitados/);
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'acd_mysql_unavailable' } }) });
    await loadWorkforceSessions({ refresh: true });
    assert.match(nodes.get('wfTableBody').innerHTML, /Sesiones no disponibles/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
    globalThis.location = previousLocation;
  }
});

test('Workforce selector de ingenieros consume endpoint local y muestra ingenieros reales con y sin servicios', async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const selectNode = { innerHTML: '', value: '' };
  globalThis.document = {
    getElementById: id => id === 'wfTestEngineerSelect' ? selectNode : null,
    querySelectorAll: () => [],
  };
  let calledUrl = '';
  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      json: async () => ({
        source: 'SQL:SystemUser',
        items: [
          { id: 3006, fullName: 'Engineer2 Gser', userName: 'GserEngineer2', services_count: 4145 },
          { id: 12309, fullName: 'Engineer Cassia', userName: 'ENGINEERCA', services_count: 4134 },
          { id: 12553, fullName: 'Ingeniero Sin Servicios', userName: 'NOSRV', services_count: 0 },
        ],
      }),
    };
  };
  try {
    const { loadTestEngineersSelect } = await import('../js/modules/workforce.js');
    await loadTestEngineersSelect();
    assert.match(calledUrl, /\/api\/v1\/acd\/operations\/engineers\?/);
    assert.match(selectNode.innerHTML, /3006 - Engineer2 Gser \(4,145 servicios\)/);
    assert.match(selectNode.innerHTML, /12309 - Engineer Cassia \(4,134 servicios\)/);
    assert.match(selectNode.innerHTML, /12553 - Ingeniero Sin Servicios \(Sin servicios autorizados\)/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});
