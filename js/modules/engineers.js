import { escHtml } from '../utils.js';
import { fetchEngineerDirectory } from '../services/engineers-api.js?v=20260928-acd-engineers';
import { fetchEngineerAuthorizedServices } from '../services/operational-api.js';

const $ = id => document.getElementById(id);
let initialized = false;
let page = 1;
let currentItems = [];
let hasNext = false;
let requestId = 0;
let lastError = null;

// Estado de servicios autorizados en tiempo real
let servicesData = {};
const expandedRows = new Set();
const detailCache = {};
const innerFilters = {};

function renderServicesCell(item) {
  const svc = servicesData[item.id];
  const isExpanded = expandedRows.has(item.id);

  if (!svc || svc.status === 'loading') {
    return `<span class="badge-service loading" id="svc-status-${item.id}"><i class="fa-solid fa-spinner fa-spin"></i> Consultando...</span>`;
  }

  if (svc.status === 'no_services') {
    return `<span class="badge-service empty" title="Usuario habilitado sin servicios registrados en SystemUserService"><i class="fa-solid fa-circle-xmark"></i> Sin servicios</span>`;
  }

  if (svc.status === 'disabled') {
    return `<span class="badge-service disabled" title="${escHtml(svc.note ?? 'Usuario deshabilitado en GS')}"><i class="fa-solid fa-user-slash"></i> No operativo</span>`;
  }

  if (svc.status === 'not_found') {
    return `<span class="badge-service empty" title="No encontrado en SystemUser GS"><i class="fa-solid fa-question"></i> No registrado</span>`;
  }

  if (svc.status === 'error') {
    return `<span class="badge-service error" title="${escHtml(svc.error_message ?? 'Error consultando servicios')}"><i class="fa-solid fa-triangle-exclamation"></i> Error consulta</span>`;
  }

  // Estado verificado con servicios autorizados
  const count = svc.total_count ?? svc.services?.length ?? 0;
  const sample = (svc.services ?? []).slice(0, 3);
  const chipsHtml = sample.map(s =>
    `<span class="service-chip" title="${escHtml(s.name ?? '')}${s.client_name ? ` (${escHtml(s.client_name)})` : ''}">${escHtml(s.name ?? '')}</span>`
  ).join('');

  return `
    <div class="service-preview-wrap">
      <div class="service-preview-top">
        <span class="badge-service verified" title="${count} servicios autorizados en SystemUserService">
          <i class="fa-solid fa-shield-check"></i> ${count.toLocaleString()} autorizados
        </span>
        <button type="button" class="btn-expand-services ${isExpanded ? 'active' : ''}" data-engineer-id="${item.id}" title="${isExpanded ? 'Contraer listado' : 'Ver listado completo'}">
          <i class="fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i> ${isExpanded ? 'Ocultar' : 'Ver todos'}
        </button>
      </div>
      ${chipsHtml ? `<div class="service-preview-chips">${chipsHtml}${count > sample.length ? `<span class="service-chip" style="color:var(--text-muted)">+${(count - sample.length).toLocaleString()} más</span>` : ''}</div>` : ''}
    </div>
  `;
}

function renderDetailRow(item) {
  const eid = item.id;
  const name = String(item.fullName ?? ([item.firstName, item.firstLastName, item.secondLastName].filter(Boolean).join(' ') || `Ingeniero #${eid}`));
  const cached = detailCache[eid];
  const baseSvc = servicesData[eid] ?? {};
  const total = cached?.total_count ?? baseSvc.total_count ?? 0;
  const rawList = cached?.services ?? baseSvc.services ?? [];
  const filter = (innerFilters[eid] ?? '').trim().toLowerCase();

  const filteredList = filter ? rawList.filter(s =>
    String(s.name ?? '').toLowerCase().includes(filter) ||
    String(s.id ?? '').includes(filter) ||
    String(s.client_name ?? '').toLowerCase().includes(filter)
  ) : rawList;

  let bodyHtml = '';
  if (cached?.loading) {
    bodyHtml = `<div class="esd-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando catálogo completo de servicios en tiempo real desde GS…</div>`;
  } else if (cached?.error) {
    bodyHtml = `<div class="esd-empty"><i class="fa-solid fa-triangle-exclamation"></i> ${escHtml(cached.error)}</div>`;
  } else if (!filteredList.length) {
    bodyHtml = `<div class="esd-empty">${filter ? `Sin coincidencias para “${escHtml(filter)}”.` : 'Sin servicios autorizados habilitados.'}</div>`;
  } else {
    bodyHtml = `
      <div class="engineer-services-list">
        ${filteredList.map(s => `
          <div class="engineer-service-card">
            <span class="engineer-service-card-id">#${s.id}${s.client_name ? ` · ${escHtml(s.client_name)}` : ''}</span>
            <span class="engineer-service-card-name">${escHtml(s.name ?? '')}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  return `
    <tr class="engineer-detail-row" id="engineer-detail-${eid}">
      <td colspan="7">
        <div class="engineer-services-panel">
          <div class="engineer-services-panel-header">
            <div class="esd-title">
              <i class="fa-solid fa-shield-halved" style="color:var(--accent)"></i>
              <span>Servicios autorizados · ${escHtml(name)} (${total.toLocaleString()}${filteredList.length !== rawList.length ? ` · ${filteredList.length} coincidentes` : ''})</span>
            </div>
            <div class="esd-controls">
              <input type="search" class="esd-search" placeholder="Filtrar servicios de ${escHtml(item.firstName || 'este ingeniero')}…" data-engineer-id="${eid}" value="${escHtml(innerFilters[eid] ?? '')}" />
              <button type="button" class="btn-expand-services" data-engineer-id="${eid}"><i class="fa-solid fa-xmark"></i> Cerrar</button>
            </div>
          </div>
          ${bodyHtml}
        </div>
      </td>
    </tr>
  `;
}

function render() {
  if (lastError) {
    $('engineerBody').innerHTML = `<tr><td colspan="7" class="table-loading table-error" style="color:var(--danger, #ef4444)"><i class="fa-solid fa-triangle-exclamation"></i> ${escHtml(lastError.message)}</td></tr>`;
    $('engineerPage').textContent = `Página ${page}`;
    $('engineerPrev').disabled = page <= 1;
    $('engineerNext').disabled = true;
    $('engineerVisible').textContent = `Error: ${lastError.message}`;
    return;
  }

  const search = $('engineerSearch').value.trim().toLowerCase();
  const items = search ? currentItems.filter(item => {
    const matchesUser = [item.id, item.fullName, item.firstName, item.firstLastName].some(value =>
      String(value ?? '').toLowerCase().includes(search)
    );
    if (matchesUser) return true;

    // Búsqueda por servicio autorizado
    const services = servicesData[item.id]?.services ?? [];
    const cachedServices = detailCache[item.id]?.services ?? [];
    const allServices = cachedServices.length ? cachedServices : services;
    return allServices.some(s =>
      String(s.name ?? '').toLowerCase().includes(search) ||
      String(s.id ?? '').includes(search) ||
      String(s.client_name ?? '').toLowerCase().includes(search)
    );
  }) : currentItems;

  if (!items.length) {
    $('engineerBody').innerHTML = `<tr><td colspan="7" class="table-loading">${search ? 'Sin coincidencias en esta página.' : 'Sin ingenieros disponibles.'}</td></tr>`;
  } else {
    const rowsHtml = items.map(item => {
      const isExpanded = expandedRows.has(item.id);
      const name = escHtml(String(item.fullName ?? ([item.firstName, item.firstLastName, item.secondLastName].filter(Boolean).join(' ') || 'Sin datos disponibles')));
      const mainRow = `<tr>
        <td>${escHtml(String(item.id))}</td>
        <td>${name}</td>
        <td>${renderServicesCell(item)}</td>
        <td>Sin datos disponibles</td><td>Sin datos disponibles</td>
        <td>Sin datos disponibles</td><td>Sin datos disponibles</td>
      </tr>`;
      return isExpanded ? mainRow + renderDetailRow(item) : mainRow;
    }).join('');
    $('engineerBody').innerHTML = rowsHtml;
  }

  $('engineerPage').textContent = `Página ${page}`;
  $('engineerPrev').disabled = page <= 1;
  $('engineerNext').disabled = !hasNext;
  $('engineerVisible').textContent = `${items.length} visibles en esta página. El filtro busca por nombre, ID o servicio en la página actual.`;
}

async function loadBatchServices(ids) {
  if (!ids || !ids.length) return;
  try {
    const data = await fetchEngineerAuthorizedServices({ ids, limit: 5 });
    if (data?.engineers) {
      for (const [idStr, info] of Object.entries(data.engineers)) {
        const id = Number(idStr);
        servicesData[id] = info;
      }
    }
  } catch (error) {
    console.warn('[ACD servicios autorizados]', error?.message);
    for (const id of ids) {
      if (!servicesData[id] || servicesData[id].status === 'loading') {
        servicesData[id] = { status: 'error', error_message: error?.message || 'Error al consultar servicios' };
      }
    }
  }
  render();
}

async function loadEngineerDetail(engineerId) {
  if (detailCache[engineerId]?.services?.length) return;
  detailCache[engineerId] = { loading: true, services: [], total_count: servicesData[engineerId]?.total_count ?? 0, error: null };
  render();
  try {
    const res = await fetchEngineerAuthorizedServices({ engineerId, limit: 500 });
    detailCache[engineerId] = {
      loading: false,
      services: res?.services ?? [],
      total_count: res?.total_count ?? (res?.services?.length ?? 0),
      error: null,
    };
  } catch (error) {
    console.warn(`[ACD detalle servicios ${engineerId}]`, error?.message);
    detailCache[engineerId] = {
      loading: false,
      services: servicesData[engineerId]?.services ?? [],
      total_count: servicesData[engineerId]?.total_count ?? 0,
      error: 'No se pudo cargar el listado completo de servicios GS.',
    };
  }
  render();
}

export async function loadEngineerDirectory() {
  if (!initialized) return;
  const current = ++requestId;
  $('engineerBody').innerHTML = '<tr><td colspan="7" class="table-loading">Cargando ingenieros…</td></tr>';
  $('engineerNext').disabled = true;
  servicesData = {};
  expandedRows.clear();
  lastError = null;

  try {
    const data = await fetchEngineerDirectory({ page });
    if (current !== requestId) return;
    currentItems = data.items ?? [];
    hasNext = Boolean(data.hasNext);
    lastError = null;
    $('engineerStatus').textContent = `Directorio GS · ${data.totalCount} ingenieros habilitados. Página ${page} de ${data.totalPages || 1}.`;

    // Si los items ya traen services_info del endpoint ACD, poblarlos directamente
    const idsToLoad = [];
    for (const item of currentItems) {
      if (item.services_info) {
        servicesData[item.id] = item.services_info;
      } else if (item.id) {
        servicesData[item.id] = { status: 'loading' };
        idsToLoad.push(item.id);
      }
    }
    render();

    // Consultar servicios autorizados en lote solo para los que no vinieron pre-poblados
    if (idsToLoad.length) {
      await loadBatchServices(idsToLoad);
    }
  } catch (error) {
    if (current !== requestId) return;
    currentItems = [];
    hasNext = false;
    lastError = error;
    $('engineerStatus').textContent = error.message;
    render();
  }
}

export function initEngineers() {
  if (initialized) return;
  initialized = true;
  $('engineerRefresh').addEventListener('click', loadEngineerDirectory);
  $('engineerSearch').addEventListener('input', render);
  $('engineerPrev').addEventListener('click', () => { if (page > 1) { page--; loadEngineerDirectory(); } });
  $('engineerNext').addEventListener('click', () => { if (hasNext) { page++; loadEngineerDirectory(); } });

  // Delegación de eventos en engineerBody para expandir/contraer y filtrar servicios internos
  $('engineerBody').addEventListener('click', event => {
    const btn = event.target.closest('[data-engineer-id]');
    if (!btn || btn.tagName === 'INPUT') return;
    const eid = Number(btn.dataset.engineerId);
    if (!eid) return;

    if (expandedRows.has(eid)) {
      expandedRows.delete(eid);
      render();
    } else {
      expandedRows.add(eid);
      render();
      loadEngineerDetail(eid);
    }
  });

  $('engineerBody').addEventListener('input', event => {
    const input = event.target.closest('.esd-search');
    if (!input) return;
    const eid = Number(input.dataset.engineerId);
    if (!eid) return;
    innerFilters[eid] = input.value;
    const panel = $(`engineer-detail-${eid}`);
    if (panel) {
      const item = currentItems.find(i => i.id === eid);
      if (item) {
        panel.outerHTML = renderDetailRow(item);
        // Restaurar cursor en el input
        const updatedInput = $(`engineer-detail-${eid}`)?.querySelector('.esd-search');
        if (updatedInput) {
          updatedInput.focus();
          updatedInput.setSelectionRange(updatedInput.value.length, updatedInput.value.length);
        }
      }
    }
  });
}
