/* Four client views. Ticket detail and candidates live inside Tickets. */
const ROUTES = {
  dashboard: 'dashboardSection',
  'tickets-list': 'ticketsSection',
  engineers: 'engineersSection',
  workforce: 'workforceSection',
};
const CONTEXT = new Set(['ticket', 'matrix', 'candidates']);
let currentSection = null;
let onShow = () => {};
let initialized = false;

function normalize(section) {
  if (CONTEXT.has(section)) return 'tickets-list';
  if (section === 'map') return 'dashboard';
  return Object.hasOwn(ROUTES, section) ? section : 'dashboard';
}

function sectionFromUrl() {
  const match = /^#view=([a-z-]+)$/.exec(window.location.hash);
  return normalize(match?.[1]);
}

function placeSharedPanels() {
  const mapRow = document.getElementById('dashboardMapDetailRow');
  mapRow.prepend(document.getElementById('mapPanel'));
  document.getElementById('dashboardSection').insertBefore(mapRow, document.getElementById('acdSummary'));
  const context = document.getElementById('ticketContext');
  context.append(
    document.getElementById('ticketActionBar'),
    document.getElementById('cardsGrid'),
    document.getElementById('ticketPanel'),
    document.getElementById('matrixSection'),
    document.getElementById('candidatesSection'),
  );
}

function renderSection(section) {
  if (section === currentSection) return;
  placeSharedPanels();
  for (const [key, id] of Object.entries(ROUTES)) {
    document.getElementById(id).hidden = key !== section;
  }
  document.querySelectorAll('.nav-item[data-section]').forEach(link => {
    const active = link.dataset.section === section;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  currentSection = section;
  onShow(section);
}

export function showSection(section) {
  const target = normalize(section);
  const contextual = CONTEXT.has(section);
  const context = document.getElementById('ticketContext');
  if (context) context.hidden = !contextual;
  if (contextual) {
    const candidates = document.getElementById('candidatesSection');
    if (candidates) candidates.hidden = section !== 'candidates';
  }
  if (target !== currentSection) {
    window.history.pushState({ section: target }, '', `#view=${target}`);
    renderSection(target);
  }
  if (contextual) context?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

export function initRouter(options = {}) {
  if (initialized) return;
  initialized = true;
  onShow = options.onShow ?? onShow;
  document.querySelectorAll('.nav-item[data-section]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      showSection(link.dataset.section);
    });
  });
  document.getElementById('closeTicketContext')?.addEventListener('click', () => {
    document.getElementById('ticketContext').hidden = true;
  });
  const restore = () => {
    document.getElementById('ticketContext').hidden = true;
    renderSection(sectionFromUrl());
  };
  window.addEventListener('popstate', restore);
  window.addEventListener('hashchange', restore);
  restore();
}
