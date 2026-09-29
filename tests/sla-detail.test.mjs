import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE } from '../js/state.js';
import { fetchTicket } from '../js/services/tickets-api.js';
import { attentionSlaInfo, parseAttentionDue } from '../js/services/sla-date.js';

test('detalle TicketsAPI extrae ticketAttentionTime con la sesión GS existente', async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = STATE.token;
  const calls = [];
  STATE.token = 'ticket-token-de-prueba';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ data: { data: {
      ticketId: 10698018, ticketAttentionTime: '2030-04-05T12:00:00',
      ticketScheduledDateTime: '2030-04-06T12:00:00',
    } } }) };
  };
  try {
    const detail = await fetchTicket(10698018);
    assert.equal(detail.ticketAttentionTime, '2030-04-05T12:00:00');
    assert.equal(calls[0].url, 'https://gserpreprod.itsmwtt.com/ticket/api/v1/Tickets/10698018');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer ticket-token-de-prueba');
    assert.equal(parseAttentionDue(detail.ticketAttentionTime).toISOString(), '2030-04-05T12:00:00.000Z');
    assert.notEqual(detail.ticketAttentionTime, detail.ticketScheduledDateTime);
    STATE.token = null;
    await assert.rejects(fetchTicket(10698018), /inicia sesión/);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = oldFetch;
    STATE.token = oldToken;
  }
});

test('SLA de atención interpreta UTC sin sufijo, offsets, nulos y vencidos', () => {
  assert.equal(parseAttentionDue('2030-01-01T12:00:00+02:00').toISOString(), '2030-01-01T10:00:00.000Z');
  assert.equal(parseAttentionDue('2030-01-01T10:00:00.1234567').toISOString(), '2030-01-01T10:00:00.123Z');
  assert.equal(parseAttentionDue('2030-02-30T10:00:00'), null);
  assert.equal(attentionSlaInfo(null).status, 'unverified');
  assert.equal(attentionSlaInfo('').dateText, 'Sin SLA verificable');
  const now = new Date('2030-01-01T10:00:00Z');
  assert.equal(attentionSlaInfo('2030-01-01T09:30:00', now).remainingText, 'Vencido hace 30 min');
  assert.equal(attentionSlaInfo('2030-01-01T10:00:00Z', now).remainingText, 'Vence ahora');
  assert.equal(attentionSlaInfo('2030-01-01T10:45:00Z', now).remainingText, 'Restan 45 min');
  assert.equal(attentionSlaInfo('2030-01-01T12:00:00Z', now).status, 'later');
  assert.ok(attentionSlaInfo('2030-01-01T12:00:00Z', now).dateText.includes('2030'));
});

test('detalle TicketsAPI propaga HTTP erróneo sin atribuirle un SLA', async () => {
  const oldFetch = globalThis.fetch;
  const oldToken = STATE.token;
  STATE.token = 'ticket-token-de-prueba';
  globalThis.fetch = async () => ({ ok: false, status: 503, text: async () => 'no disponible' });
  try {
    await assert.rejects(fetchTicket(10698018), /HTTP 503/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { ticketId: 5, ticketAttentionTime: '2030-01-01T10:00:00Z' } }) });
    await assert.rejects(fetchTicket(10698018), /no coincide/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ isError: true, data: null }) });
    await assert.rejects(fetchTicket(10698018), /rechazó el detalle/);
  } finally {
    globalThis.fetch = oldFetch;
    STATE.token = oldToken;
  }
});
