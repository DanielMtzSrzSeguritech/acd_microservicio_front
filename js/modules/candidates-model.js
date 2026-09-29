const first = (row, ...keys) => {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
};

export const candidateId = row => first(row, 'userId', 'taskForceId', 'id');
export const candidateName = row => {
  const name = first(row, 'name', 'taskForceName', 'fullName');
  return name ?? ([row.firstName, row.lastName].filter(Boolean).join(' ') || null);
};
export const candidateEmail = row => first(row, 'email', 'emailAddress', 'mail');
export const candidateZone = row => first(row, 'activeZoneName', 'locationZoneName', 'activeZoneId', 'locationZoneId');
export const candidateAvailability = row => {
  const status = first(row, 'availabilityStatus', 'availability');
  return typeof status === 'string' ? status : null;
};
export const candidateLoad = row => {
  const raw = first(row, 'activeTickets', 'active_tickets');
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
};
export const candidateSession = row => {
  const raw = first(row, 'hasActiveSession', 'activeSession', 'sessionActive', 'has_active_session');
  return raw === true || raw === 1 ? true : raw === false || raw === 0 ? false : null;
};

export function filterCandidates(rows, { search = '', gps = 'all', session = 'all', gpsAvailable = true } = {}) {
  const query = search.trim().toLocaleLowerCase('es-MX');
  return rows.filter(row => {
    if (query && ![candidateName(row), candidateId(row), candidateEmail(row)]
      .some(field => String(field ?? '').toLocaleLowerCase('es-MX').includes(query))) return false;
    const gpsState = gpsAvailable ? Boolean(row.hasGps) : null;
    if (gps === 'yes' && gpsState !== true) return false;
    if (gps === 'no' && gpsState !== false) return false;
    const active = candidateSession(row);
    if (session === 'yes' && active !== true) return false;
    if (session === 'no' && active !== false) return false;
    if (session === 'unknown' && active !== null) return false;
    return true;
  });
}
