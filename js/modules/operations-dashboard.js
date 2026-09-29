import { escHtml, formatDate } from '../utils.js';
import { fetchActiveEngineers, fetchGlobalSlaTickets, fetchOperationalMetrics } from '../services/operational-api.js';

const $ = id => document.getElementById(id);
let initialized = false;
let loadNumber = 0;
const publicError = error => error?.status === 401 || error?.status === 403
  ? 'No tienes acceso.'
  : error?.code === 'gs_global_sql_unavailable' || error?.code === 'gs_global_sql_read_failed'
    ? 'Lista SLA no disponible.' : 'Datos no disponibles en este momento.';

export async function loadOperationalDashboard({ refresh = false } = {}) {
  const current = ++loadNumber;
  const fields = ['acdJobsTotal', 'acdFailedThree', 'acdPendingReconciliation', 'acdActiveSessions'];
  $('acdMetricsStatus').textContent = 'Cargando actividad ACD…';
  $('acdActiveEngineers').textContent = 'Cargando ingenieros con check-in…';
  $('acdSlaAlerts').textContent = 'Cargando…';
  $('acdUrgentTickets').textContent = 'Consultando tickets próximos a vencer…';
  const [metrics, engineers, sla] = await Promise.allSettled([
    fetchOperationalMetrics(), fetchActiveEngineers({ refresh }), fetchGlobalSlaTickets({ page_size: 25 }),
  ]);
  if (current !== loadNumber) return;
  if (metrics.status === 'fulfilled') {
    const data = metrics.value;
    for (const [index, value] of [data.jobs_total, data.failed_after_three, data.pending_reconciliation, data.active_sessions].entries()) {
      $(fields[index]).textContent = typeof value === 'number' && Number.isFinite(value) ? String(value) : 'NO DISPONIBLE';
    }
    $('acdMetricsStatus').textContent = 'Actividad de trabajos recibidos por ACD.';
    $('acdMetricsUpdated').textContent = data.updated_at ? `Última actualización: ${formatDate(data.updated_at)}` : 'Última actualización: NO DISPONIBLE';
  } else {
    fields.forEach(id => { $(id).textContent = 'NO DISPONIBLE'; });
    console.warn('[ACD métricas]', metrics.reason.code ?? metrics.reason.message);
    $('acdMetricsStatus').textContent = publicError(metrics.reason);
    $('acdMetricsUpdated').textContent = 'Última actualización: NO DISPONIBLE';
  }
  if (engineers.status === 'fulfilled') {
    const data = engineers.value;
    const items = Array.isArray(data.items) ? data.items : null;
    if (!items) {
      $('acdActiveEngineers').textContent = 'Sin datos disponibles.';
      return;
    }
    $('acdActiveEngineers').innerHTML = items.length
      ? items.slice(0, 8).map(item => `<span class="acd-engineer-chip">Ingeniero #${escHtml(String(item.engineer_id))} · zona ${item.check_in_zone_id == null ? 'Sin datos disponibles' : escHtml(String(item.check_in_zone_id))}</span>`).join('') + (data.has_more || items.length > 8 ? '<span>Ver más en Sesiones</span>' : '')
      : 'Sin sesión activa registrada en ACD.';
  } else {
    console.warn('[ACD ingenieros activos]', engineers.reason.code ?? engineers.reason.message);
    $('acdActiveEngineers').textContent = publicError(engineers.reason);
  }
  if (sla.status === 'fulfilled' && Array.isArray(sla.value.items) && sla.value.source === 'gs_ticket_sql' &&
      sla.value.ordering === 'AttentionExpirationDateTime ASC NULLS LAST, Id ASC') {
    const urgent = sla.value.items.filter(item => item.sla_bucket === 'overdue' || item.sla_bucket === 'due_soon');
    $('acdSlaAlerts').textContent = String(urgent.length);
    $('acdUrgentTickets').innerHTML = urgent.length
      ? `Primera página SLA${sla.value.has_more ? ' · hay más páginas' : ''}: ` + urgent.slice(0, 8).map(item =>
        `<button type="button" class="acd-engineer-chip" data-urgent-ticket="${escHtml(String(item.ticket_id))}">#${escHtml(String(item.ticket_id))} · ${item.sla_bucket === 'overdue' ? 'Vencido' : 'Próximo a vencer'} · ${item.sla_due_at ? escHtml(formatDate(item.sla_due_at)) : 'Sin fecha disponible'}</button>`).join('') +
        (urgent.length > 8 ? '<span>Ver más en Tickets</span>' : '')
      : 'Sin vencidos ni próximos a vencer en esta página. Ver Tickets para recorrer el resto.';
  } else {
    $('acdSlaAlerts').textContent = 'NO DISPONIBLE';
    if (sla.status === 'rejected') console.warn('[ACD SLA]', sla.reason.code ?? sla.reason.message);
    $('acdUrgentTickets').textContent = sla.status === 'rejected' ? publicError(sla.reason) : 'Sin datos disponibles.';
  }
}

export function initOperationalDashboard() {
  if (initialized) return;
  initialized = true;
  $('acdMetricsRefresh').addEventListener('click', () => loadOperationalDashboard({ refresh: true }));
  loadOperationalDashboard();
}
