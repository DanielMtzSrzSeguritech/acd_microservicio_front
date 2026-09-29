import { escHtml } from '../utils.js';
import { paginateRows } from '../components/pagination.js';
import { candidateEmail, candidateId, candidateName, filterCandidates } from './candidates-model.js';

const $ = id => document.getElementById(id);
let dom;
let source = () => [];
let ticketId = () => '';
let gpsAvailable = () => false;
let hasAuth = () => false;
let onDetail = () => {};
let page = 1;
let pageSize = 20;
let initialized = false;

const available = value => value === null || value === undefined || value === '' ? 'No disponible' : escHtml(String(value));

function render() {
  if (!initialized) return;
  const all = source();
  const visible = filterCandidates(all, {
    search: dom.search.value, gps: dom.gps.value, session: 'all',
    gpsAvailable: gpsAvailable(),
  });
  const result = paginateRows(visible, page, pageSize);
  page = result.page || 1;
  dom.context.textContent = `Ticket #${ticketId()}`;
  dom.count.textContent = `${result.total} de ${all.length} candidatos del ticket`;
  dom.range.textContent = `Mostrando ${result.start}–${result.end}`;
  dom.pageInfo.textContent = `Página ${result.page} de ${result.totalPages}`;
  dom.prev.disabled = result.page <= 1;
  dom.next.disabled = result.page >= result.totalPages;
  dom.body.innerHTML = result.rows.length ? result.rows.map((row, index) => {
    const sourceIndex = all.indexOf(row);
    const gps = gpsAvailable() ? row.hasGps ? 'Sí' : 'No' : 'No disponible';
    return `<tr>
      <td>${result.start + index}</td><td>${available(candidateName(row))}</td>
      <td>${available(candidateId(row))}</td><td>${available(candidateEmail(row))}</td>
      <td>Sin datos disponibles</td>
      <td>Sin datos disponibles</td><td>Sin datos disponibles</td>
      <td>Sin datos disponibles</td><td>${gps}</td>
      <td><button type="button" class="btn-detail" data-index="${sourceIndex}">Ver</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="10" class="table-loading">${hasAuth() ? 'Sin candidatos para mostrar con los filtros actuales.' : 'Autenticación GS requerida para cargar candidatos.'}</td></tr>`;
}

export function updateCandidates({ ticketChanged = false } = {}) {
  if (ticketChanged) page = 1;
  render();
}

export function initCandidates(options = {}) {
  if (initialized) return;
  source = options.getCandidates ?? source;
  ticketId = options.getTicketId ?? ticketId;
  gpsAvailable = options.gpsAvailable ?? gpsAvailable;
  hasAuth = options.hasAuth ?? hasAuth;
  onDetail = options.onDetail ?? onDetail;
  dom = {
    body: $('candidatesBody'), context: $('candidateTicketContext'),
    search: $('candidateSearch'), gps: $('candidateGpsFilter'),
    session: $('candidateSessionFilter'), size: $('candidatePageSize'),
    count: $('candidateCount'), range: $('candidateRange'),
    pageInfo: $('candidatePageInfo'), prev: $('candidatePrevBtn'), next: $('candidateNextBtn'),
  };
  initialized = true;
  dom.session.disabled = true;
  for (const control of [dom.search, dom.gps, dom.session]) control.addEventListener(control === dom.search ? 'input' : 'change', () => { page = 1; render(); });
  dom.size.addEventListener('change', () => { pageSize = Number(dom.size.value); page = 1; render(); });
  dom.prev.addEventListener('click', () => { if (page > 1) { page--; render(); } });
  dom.next.addEventListener('click', () => { page++; render(); });
  dom.body.addEventListener('click', event => {
    const button = event.target.closest('button[data-index]');
    if (!button) return;
    const candidate = source()[Number(button.dataset.index)];
    if (candidate) onDetail(candidate);
  });
  render();
}
