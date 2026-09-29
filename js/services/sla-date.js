/** GS stores AttentionExpirationDateTime as SQL datetime calculated from UTC. */
export function parseAttentionDue(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const source = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2})?$/i.test(source)) return null;
  const hasZone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(source);
  const instant = new Date(hasZone ? source : `${source}Z`);
  if (!Number.isFinite(instant.getTime())) return null;
  // Date.parse accepts impossible calendar dates in some runtimes.
  const calendar = source.slice(0, 10);
  const [year, month, day] = calendar.split('-').map(Number);
  const validDay = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  return validDay === calendar ? instant : null;
}

export function attentionSlaInfo(value, now = new Date()) {
  const due = parseAttentionDue(value);
  if (!due) return { status: 'unverified', dateText: 'Sin SLA verificable', remainingText: 'Sin datos disponibles' };
  const dateText = new Intl.DateTimeFormat('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(due);
  const delta = due.getTime() - now.getTime();
  const minutes = Math.ceil(Math.abs(delta) / 60000);
  const duration = minutes < 1 ? 'menos de 1 min'
    : minutes < 60 ? `${minutes} min`
    : minutes < 1440 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${Math.floor(minutes / 1440)} d ${Math.floor((minutes % 1440) / 60)} h`;
  return {
    status: delta < 0 ? 'overdue' : delta <= 3600000 ? 'due_soon' : 'later',
    dateText,
    remainingText: delta < 0 ? `Vencido hace ${duration}` : delta === 0 ? 'Vence ahora' : `Restan ${duration}`,
  };
}

/** TicketsAPI flags.ticketProgress is a nullable consumed-SLA percentage. */
export function formatSlaProgress(value) {
  if (value === null || value === undefined || value === '') return 'Sin datos disponibles';
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100
    ? `${percent}%` : 'Sin datos disponibles';
}
