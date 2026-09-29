import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE } from '../js/state.js';
import { fetchServiceResponseTimes, selectServiceTiming } from '../js/services/client-api.js';
import { formatSlaProgress } from '../js/services/sla-date.js';

test('ticketProgress se presenta como porcentaje consumido, sin convertirlo a horas', () => {
  assert.equal(formatSlaProgress(0), '0%');
  assert.equal(formatSlaProgress(37.5), '37.5%');
  assert.equal(formatSlaProgress(100), '100%');
  for (const value of [null, undefined, '', -1, 101, 'incorrecto'])
    assert.equal(formatSlaProgress(value), 'Sin datos disponibles');
});

test('ClientAPI usa solo su token y el ServiceId real en PREPROD', async () => {
  const previous = { fetch: globalThis.fetch, client: STATE.clientToken, ticket: STATE.token, security: STATE.securityToken };
  const calls = [];
  STATE.clientToken = 'client-token-de-prueba';
  STATE.token = 'ticket-token-de-prueba';
  STATE.securityToken = 'security-token-de-prueba';
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, json: async () => ({ data: { items: [
      { responseTimeId: 7, serviceId: 42, attentionHours: 2, expireHours: 48 },
    ], totalCount: 1 } }) };
  };
  try {
    const page = await fetchServiceResponseTimes(42);
    assert.equal(calls[0].url, 'https://gserpreprod.itsmwtt.com/client/api/v1/ServiceResponseTimes/Service/42?PageNumber=1&PageSize=50');
    assert.equal(calls[0].options.method, 'GET');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer client-token-de-prueba');
    assert.deepEqual(selectServiceTiming(page), { responseTimeId: 7, serviceId: 42, attentionHours: 2, expireHours: 48 });
    assert.equal(selectServiceTiming({ ...page, totalCount: 2 }), null);
    assert.equal(selectServiceTiming({ ...page, items: [{ ...page.items[0], serviceId: 43 }] }), null);
    STATE.clientToken = null;
    await assert.rejects(fetchServiceResponseTimes(42), /no autorizado/);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = previous.fetch;
    STATE.clientToken = previous.client;
    STATE.token = previous.ticket;
    STATE.securityToken = previous.security;
  }
});

test('ClientAPI rechaza HTTP y contratos incompletos', async () => {
  const previous = { fetch: globalThis.fetch, client: STATE.clientToken };
  STATE.clientToken = 'client-token-de-prueba';
  try {
    globalThis.fetch = async () => ({ ok: false, status: 403 });
    await assert.rejects(fetchServiceResponseTimes(42), error => error.status === 403);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { items: [], totalCount: null } }) });
    await assert.rejects(fetchServiceResponseTimes(42), /Contrato de tiempos/);
  } finally {
    globalThis.fetch = previous.fetch;
    STATE.clientToken = previous.client;
  }
});
