import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE } from '../js/state.js';
import { fetchRemoteWorkTickets } from '../js/services/tickets-api.js';

test('lista GS usa la sesión existente, el orden y la paginación oficiales', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = STATE.token;
  const calls = [];
  STATE.token = 'gs-token-prueba';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(String(url)), options });
    return { ok: true, json: async () => ({ data: {
      items: [{ ticketId: 42, clientName: 'Cliente GS' }],
      currentPage: 2, totalPages: 3, totalCount: 51,
    } }) };
  };
  try {
    const page = await fetchRemoteWorkTickets({ page: 2, pageSize: 25 });
    assert.deepEqual(page.items, [{ ticketId: 42, clientName: 'Cliente GS' }]);
    assert.equal(page.hasNext, true);
    assert.equal(page.totalCount, 51);
    assert.equal(calls[0].url.pathname, '/ticket/api/v1/Dashboard/GetRemoteWorkTickets');
    assert.equal(calls[0].url.searchParams.get('PageNumber'), '2');
    assert.equal(calls[0].url.searchParams.get('PageSize'), '25');
    assert.equal(calls[0].url.searchParams.get('OrderColumn'), 'Id');
    assert.equal(calls[0].url.searchParams.get('Descending'), 'true');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer gs-token-prueba');
    assert.notEqual(calls[0].options.headers.Authorization, 'Bearer acd-token-prueba');
  } finally {
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
  }
});

test('GS admite página vacía y separa sesión ausente, HTTP y contrato inválido', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = STATE.token;
  try {
    STATE.token = null;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('No debe consultar sin sesión'); };
    await assert.rejects(fetchRemoteWorkTickets(), /GS: inicia sesión/);
    assert.equal(calls, 0);
    STATE.token = 'gs-token-prueba';
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: {
      items: [], currentPage: 1, totalPages: 0, totalCount: 0,
    } }) });
    const empty = await fetchRemoteWorkTickets();
    assert.deepEqual(empty.items, []);
    assert.equal(empty.hasNext, false);
    globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'SECRETO_NO_MOSTRAR' });
    await assert.rejects(fetchRemoteWorkTickets(), error =>
      /TicketsAPI GS: HTTP 401/.test(error.message) && !error.message.includes('SECRETO_NO_MOSTRAR'));
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { items: [{ ticketId: 1 }] } }) });
    await assert.rejects(fetchRemoteWorkTickets(), /Contrato de paginación/);
  } finally {
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
  }
});
