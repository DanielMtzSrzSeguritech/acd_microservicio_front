import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE } from '../js/state.js';
import {
  fetchOperationalErrors, fetchOperationalJobs, fetchOperationalMetrics,
  fetchOperationalTicket, fetchActiveEngineers, fetchGlobalSlaTickets,
} from '../js/services/operational-api.js';
import { checkIn } from '../js/services/workforce-api.js';

test('lecturas ACD no envian token de usuario y escrituras siguen deshabilitadas', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = STATE.token;
  const calls = [];
  STATE.token = null;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ items: [], has_more: false }) };
  };
  try {
    await fetchGlobalSlaTickets();
    await fetchOperationalJobs({ status: 'received' });
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => !call.options.headers.Authorization));
    await assert.rejects(checkIn(), error => error.code === 'acd_writes_disabled');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
  }
});

test('consulta SLA usa cursor compuesto, nulos y errores HTTP seguros (fetch mock)', async () => {
  const original = globalThis.fetch;
  const previousToken = STATE.token;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://127.0.0.1:5500/index.html' };
  STATE.token = 'ticket-test';
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(new URL(String(url)));
    return { ok: true, json: async () => ({ source: 'gs_ticket_sql', items: [], has_more: false, next_cursor: null }) };
  };
  try {
    const empty = await fetchGlobalSlaTickets({ assignment: 'assigned', page_size: 50,
      cursor: { after_ticket_id: 42, after_due_at: '2026-01-01T10:00:00' } });
    assert.deepEqual(empty.items, []);
    assert.equal(calls[0].searchParams.get('assignment'), 'assigned');
    assert.equal(calls[0].searchParams.get('order'), 'sla_due');
    assert.equal(calls[0].searchParams.get('after_ticket_id'), '42');
    assert.equal(calls[0].searchParams.get('after_due_at'), '2026-01-01T10:00:00');
    await fetchGlobalSlaTickets({ cursor: { after_ticket_id: 43, after_due_at: null } });
    assert.equal(calls[1].searchParams.get('after_ticket_id'), '43');
    assert.equal(calls[1].searchParams.has('after_due_at'), false);
    globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ detail: { code: 'invalid_sla_cursor', message: 'SECRETO_NO_MOSTRAR' } }) });
    await assert.rejects(fetchGlobalSlaTickets(), error => error.code === 'invalid_sla_cursor' &&
      !error.message.includes('SECRETO_NO_MOSTRAR'));
  } finally { globalThis.fetch = original; STATE.token = previousToken; globalThis.location = previousLocation; }
});

test('bloqueos reales de API se muestran sin incluir mensajes técnicos (fetch mock)', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = STATE.token;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://127.0.0.1:5500/index.html' };
  STATE.token = 'ticket-test';
  try {
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'gs_global_sql_read_failed', message: 'SECRETO_NO_MOSTRAR' } }) });
    await assert.rejects(fetchOperationalMetrics(), error => {
      assert.equal(error.code, 'gs_global_sql_read_failed');
      assert.match(error.message, /consulta global SLA/);
      assert.doesNotMatch(error.message, /SECRETO_NO_MOSTRAR/);
      return true;
    });
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'acd_mysql_unavailable' } }) });
    await assert.rejects(fetchOperationalJobs({}), /MySQL ACD no está configurado/);
  } finally {
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
    globalThis.location = previousLocation;
  }
});

test('dashboard usa métricas verificables y NO DISPONIBLE para campos ausentes (DOM/fetch mock)', async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousLocation = globalThis.location;
  globalThis.location = { href: 'http://127.0.0.1:5500/index.html' };
  const previousToken = STATE.token;
  const nodes = new Map();
  for (const id of ['acdMetricsStatus', 'acdActiveEngineers', 'acdJobsTotal', 'acdFailedThree', 'acdPendingReconciliation', 'acdActiveSessions', 'acdMetricsUpdated', 'acdMetricsRefresh', 'acdSlaAlerts', 'acdUrgentTickets']) {
    nodes.set(id, { textContent: '', innerHTML: '', addEventListener() {} });
  }
  globalThis.document = { getElementById: id => nodes.get(id) };
  STATE.token = 'token-dashboard-prueba';
  let calls = 0;
  globalThis.fetch = async url => {
    calls++;
    const result = String(url).endsWith('/metrics')
      ? { source: 'acd_db', scope: 'jobs_received_by_acd', jobs_total: 4, failed_after_three: 1, pending_reconciliation: null, active_sessions: 2, sla_alerts: null }
      : String(url).includes('/engineers/active') ? { items: [{ engineer_id: 7, check_in_zone_id: 3 }], has_more: false }
      : { source: 'gs_ticket_sql', ordering: 'AttentionExpirationDateTime ASC NULLS LAST, Id ASC', items: [], has_more: false };
    return { ok: true, json: async () => result };
  };
  try {
    const { loadOperationalDashboard } = await import('../js/modules/operations-dashboard.js');
    await loadOperationalDashboard();
    assert.equal(nodes.get('acdJobsTotal').textContent, '4');
    assert.equal(nodes.get('acdFailedThree').textContent, '1');
    assert.equal(nodes.get('acdPendingReconciliation').textContent, 'NO DISPONIBLE');
    assert.match(nodes.get('acdActiveEngineers').innerHTML, /#7/);
    assert.match(nodes.get('acdMetricsUpdated').textContent, /NO DISPONIBLE/);
    assert.equal(calls, 3);
    await fetchActiveEngineers();
    assert.equal(calls, 3); // La vista Workforce reutiliza la primera página activa.
    globalThis.fetch = async url => ({ ok: true, json: async () => String(url).includes('/operations/tickets?')
      ? { source: 'gs_ticket_sql', ordering: 'AttentionExpirationDateTime ASC NULLS LAST, Id ASC', has_more: true, items: [
        { ticket_id: 10, sla_bucket: 'overdue' }, { ticket_id: 11, sla_bucket: 'due_soon' },
        { ticket_id: 12, sla_bucket: 'unverified' },
      ] }
      : String(url).includes('/engineers/active') ? { items: [], has_more: false }
      : { jobs_total: 0, failed_after_three: 0, pending_reconciliation: null, active_sessions: 0 } });
    await loadOperationalDashboard({ refresh: true });
    assert.equal(nodes.get('acdSlaAlerts').textContent, '2');
    assert.match(nodes.get('acdUrgentTickets').innerHTML, /#10/);
    assert.doesNotMatch(nodes.get('acdUrgentTickets').innerHTML, /#12/);
    globalThis.fetch = async url => String(url).includes('/operations/tickets?')
      ? { ok: false, status: 503, json: async () => ({ detail: { code: 'gs_global_sql_read_failed' } }) }
      : { ok: true, json: async () => ({ items: [], has_more: false }) };
    await loadOperationalDashboard({ refresh: true });
    assert.equal(nodes.get('acdSlaAlerts').textContent, 'NO DISPONIBLE');
    assert.match(nodes.get('acdUrgentTickets').textContent, /Lista SLA no disponible/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
    globalThis.location = previousLocation;
  }
});
