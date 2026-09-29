import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE } from '../js/state.js';

test('vista Ingenieros integra servicios autorizados reales, búsqueda y expansión', async () => {
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const previousSecurity = STATE.securityToken;

  const nodes = new Map();
  for (const id of ['engineerSearch', 'engineerBody', 'engineerPage', 'engineerPrev', 'engineerNext', 'engineerVisible', 'engineerRefresh', 'engineerStatus']) {
    nodes.set(id, {
      value: '', textContent: '', innerHTML: '', disabled: false, handlers: {},
      addEventListener(name, handler) { this.handlers[name] = handler; },
      querySelector(selector) { return null; }
    });
  }
  globalThis.document = { getElementById: id => nodes.get(id) };
  STATE.securityToken = 'sec-test-token';

  const fetchCalls = [];
  globalThis.fetch = async url => {
    const u = new URL(String(url));
    fetchCalls.push(u.pathname + u.search);

    // Mock directorio GS (endpoint local ACD /engineers)
    if (u.pathname.includes('/Accounts/GeneralSearch') || (u.pathname.includes('/operations/engineers') && !u.pathname.includes('/services'))) {
      return {
        ok: true,
        json: async () => ({
          items: [
            { id: 12309, fullName: 'Ingeniero 12309 Real' },
            { id: 3006, fullName: 'Ingeniero 3006 Real' },
            { id: 1, fullName: 'Usuario Sin Servicios' }
          ],
          currentPage: 1,
          totalPages: 1,
          totalCount: 3,
          hasNext: false,
        })
      };
    }

    // Mock endpoint servicios autorizados ACD
    if (u.pathname.includes('/engineers/services')) {
      const eid = u.searchParams.get('engineer_id');
      if (eid === '12309') {
        return {
          ok: true,
          json: async () => ({
            engineer_id: 12309,
            status: 'verified',
            total_count: 4134,
            services: [
              { id: 374, name: '**AC-001 AJUSTE CCTV', client_name: 'MEX-HUIXQUILUCAN' },
              { id: 1179, name: '**AZCA-SI-01 REVISIÓN', client_name: 'CDMX-AZCAPOTZALCO' }
            ]
          })
        };
      }

      return {
        ok: true,
        json: async () => ({
          engineers: {
            '12309': {
              status: 'verified',
              total_count: 4134,
              services: [{ id: 374, name: '**AC-001 AJUSTE CCTV', client_name: 'MEX-HUIXQUILUCAN' }]
            },
            '3006': {
              status: 'verified',
              total_count: 4145,
              services: [{ id: 374, name: '**AC-001 AJUSTE CCTV', client_name: 'MEX-HUIXQUILUCAN' }]
            },
            '1': {
              status: 'no_services',
              total_count: 0,
              services: []
            }
          }
        })
      };
    }

    return { ok: true, json: async () => ({}) };
  };

  try {
    const { initEngineers, loadEngineerDirectory } = await import('../js/modules/engineers.js');
    initEngineers();
    await loadEngineerDirectory();

    const bodyHtml = nodes.get('engineerBody').innerHTML;

    // 1. Verifica que se muestran los ingenieros
    assert.match(bodyHtml, /12309/);
    assert.match(bodyHtml, /3006/);

    // 2. Verifica badges y conteos reales
    assert.match(bodyHtml, /4,134 autorizados/);
    assert.match(bodyHtml, /4,145 autorizados/);
    assert.match(bodyHtml, /Sin servicios/);
    assert.match(bodyHtml, /AJUSTE CCTV/);

    // 3. Probar búsqueda por servicio
    nodes.get('engineerSearch').value = 'CCTV';
    nodes.get('engineerSearch').handlers.input();
    assert.match(nodes.get('engineerBody').innerHTML, /12309/);
    assert.match(nodes.get('engineerBody').innerHTML, /3006/);
    assert.doesNotMatch(nodes.get('engineerBody').innerHTML, /Usuario Sin Servicios/);

    // 4. Probar búsqueda sin coincidencias
    nodes.get('engineerSearch').value = 'SERVICIO_INEXISTENTE_XYZ';
    nodes.get('engineerSearch').handlers.input();
    assert.match(nodes.get('engineerBody').innerHTML, /Sin coincidencias en esta página/);

    // 5. Restaurar búsqueda y probar expansión de fila
    nodes.get('engineerSearch').value = '';
    nodes.get('engineerSearch').handlers.input();

    // Simular click en botón expandir de 12309
    const fakeBtn = {
      tagName: 'BUTTON',
      dataset: { engineerId: '12309' },
      closest: selector => fakeBtn
    };
    nodes.get('engineerBody').handlers.click({ target: fakeBtn });
    await new Promise(resolve => setTimeout(resolve, 10));

    // El HTML ahora incluye la fila expandida con el catálogo
    const expandedHtml = nodes.get('engineerBody').innerHTML;
    assert.match(expandedHtml, /engineer-detail-row/);
    assert.match(expandedHtml, /Servicios autorizados · Ingeniero 12309 Real/);
    assert.match(expandedHtml, /AZCA-SI-01 REVISIÓN/);

  } finally {
    globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
    STATE.securityToken = previousSecurity;
  }
});
