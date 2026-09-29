import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE } from '../js/state.js';
import { fetchEngineerDirectory } from '../js/services/engineers-api.js';
import { fetchGeolocations } from '../js/services/candidates-api.js';
import { plotEngineerLocations } from '../js/modules/engineer-map.js';
import { authenticate, saveCredentials, clearCredentials } from '../js/services/auth.js';

test('autenticación GS conserva token SecurityApi separado del token TicketsAPI', async () => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { removeItem() {} };
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    accessToken: 'security-test', downstreamTokens: { ticketApiToken: 'ticket-test', clientApiToken: 'client-test' },
  }) });
  try {
    saveCredentials('usuario', 'clave');
    await authenticate();
    assert.equal(STATE.securityToken, 'security-test');
    assert.equal(STATE.token, 'ticket-test');
    assert.equal(STATE.clientToken, 'client-test');
    clearCredentials();
    assert.equal(STATE.securityToken, null);
    assert.equal(STATE.token, null);
    assert.equal(STATE.clientToken, null);
  } finally {
    clearCredentials();
    globalThis.fetch = previousFetch;
    globalThis.sessionStorage = previousStorage;
  }
});

test('directorio GS usa endpoint local ACD, rol ingeniero y paginación del servidor', async () => {
  const previousFetch = globalThis.fetch;
  const previousSecurity = STATE.securityToken;
  const previousTicket = STATE.token;
  STATE.securityToken = 'security-test';
  STATE.token = 'ticket-test';
  let requested;
  globalThis.fetch = async (url, options) => {
    requested = { url: new URL(String(url)), options };
    return { ok: true, json: async () => ({
      items: [{ id: 7, fullName: 'Ingeniera GS' }], currentPage: 2, totalPages: 3, totalCount: 52, hasNext: true,
    }) };
  };
  try {
    const result = await fetchEngineerDirectory({ page: 2, pageSize: 25 });
    assert.equal(result.items[0].fullName, 'Ingeniera GS');
    assert.equal(result.hasNext, true);
    assert.equal(requested.url.pathname, '/api/v1/acd/operations/engineers');
    assert.equal(requested.url.searchParams.get('page'), '2');
    assert.equal(requested.url.searchParams.get('page_size'), '25');
    assert.equal(requested.options?.headers?.Authorization, undefined);
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'gs_directory_sql_unavailable' } }) });
    await assert.rejects(fetchEngineerDirectory(), error => error.code === 'gs_directory_sql_unavailable');
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({ detail: { code: 'gs_directory_sql_read_failed' } }) });
    await assert.rejects(fetchEngineerDirectory(), error => error.code === 'gs_directory_sql_read_failed');
  } finally {
    globalThis.fetch = previousFetch;
    STATE.securityToken = previousSecurity;
    STATE.token = previousTicket;
  }
});

test('GPS GS respeta envoltura oficial, coordenadas vacías y valores inválidos', async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = STATE.token;
  STATE.token = 'ticket-test';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { workForceGeolocations: [
    { workForceId: 5, coordinates: [{ latitude: 19.4, longitude: -99.1, date: '2026-09-28T10:00:00Z' }] },
    { workForceId: 6, coordinates: [] },
    { workForceId: 7, coordinates: [{ latitude: 120, longitude: -99.1 }] },
  ] } }) });
  try {
    const rows = await fetchGeolocations();
    assert.deepEqual(rows, [
      { userId: 5, latitude: 19.4, longitude: -99.1, date: '2026-09-28T10:00:00Z' },
      { userId: 6, latitude: null, longitude: null, date: null },
      { userId: 7, latitude: null, longitude: null, date: null },
    ]);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { workForceGeolocations: [] } }) });
    assert.deepEqual(await fetchGeolocations(), []);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ data: { unknown: true } }) });
    await assert.rejects(fetchGeolocations(), /Respuesta GPS/);
  } finally {
    globalThis.fetch = previousFetch;
    STATE.token = previousToken;
  }
});

test('mapa dibuja solo ingenieros con coordenadas GS y conserva estado vacío', () => {
  const markers = [];
  const views = [];
  const layer = { clearLayers() { markers.length = 0; } };
  const leaflet = {
    divIcon: options => options,
    marker(coords, options) {
      return { bindPopup(popup) { this.popup = popup; return this; }, addTo() { markers.push({ coords, options, popup: this.popup }); return this; } };
    },
  };
  const map = { setView(...args) { views.push(args); }, fitBounds(...args) { views.push(args); } };
  const data = [
    { userId: 42, latitude: 19.4, longitude: -99.1, date: null },
    { userId: 43, latitude: null, longitude: null, date: null },
  ];
  assert.equal(plotEngineerLocations({ leaflet, map, layer, geolocations: data }), 1);
  assert.equal(markers.length, 1);
  assert.deepEqual(markers[0].coords, [19.4, -99.1]);
  assert.match(markers[0].popup, /Ingeniero GS #42/);
  assert.match(markers[0].popup, /Sesión.*Sin datos disponibles/s);
  assert.doesNotMatch(markers[0].popup, /Ticket #|Disponible para asignar/);
  assert.equal(views.length, 1);
  assert.equal(plotEngineerLocations({ leaflet, map, layer, geolocations: [] }), 0);
  assert.equal(markers.length, 0);
});

test('vista Ingenieros filtra solo página cargada, pagina y muestra bloqueo', async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousSecurity = STATE.securityToken;
  const nodes = new Map();
  for (const id of ['engineerSearch', 'engineerBody', 'engineerPage', 'engineerPrev', 'engineerNext', 'engineerVisible', 'engineerRefresh', 'engineerStatus']) {
    nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, handlers: {}, addEventListener(name, handler) { this.handlers[name] = handler; } });
  }
  globalThis.document = { getElementById: id => nodes.get(id) };
  STATE.securityToken = 'security-test';
  const calls = [];
  globalThis.fetch = async url => {
    const u = new URL(String(url));
    const pageParam = u.searchParams.get('page') ?? u.searchParams.get('PageNumber');
    if (pageParam !== null && !u.pathname.includes('/services')) {
      const page = Number(pageParam);
      calls.push(page);
      return { ok: true, json: async () => ({
        items: page === 1 ? [{ id: 1, fullName: 'Ana' }] : [],
        currentPage: page, totalPages: 2, totalCount: 26, hasNext: page < 2,
      }) };
    }
    return { ok: true, json: async () => ({ engineers: {} }) };
  };
  try {
    const { initEngineers, loadEngineerDirectory } = await import('../js/modules/engineers.js');
    initEngineers();
    await loadEngineerDirectory();
    assert.match(nodes.get('engineerBody').innerHTML, /Ana/);
    nodes.get('engineerSearch').value = 'nadie';
    nodes.get('engineerSearch').handlers.input();
    assert.match(nodes.get('engineerBody').innerHTML, /Sin coincidencias en esta página/);
    assert.deepEqual(calls, [1]);
    nodes.get('engineerSearch').value = '';
    nodes.get('engineerNext').handlers.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [1, 2]);
    assert.match(nodes.get('engineerBody').innerHTML, /Sin ingenieros disponibles/);
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ detail: { code: 'gs_directory_sql_unavailable' } }) });
    await loadEngineerDirectory();
    assert.match(nodes.get('engineerStatus').textContent, /Directorio GS no disponible/);
    assert.match(nodes.get('engineerBody').innerHTML, /table-error/);
  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    STATE.securityToken = previousSecurity;
  }
});
