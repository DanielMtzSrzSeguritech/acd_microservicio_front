/* ════════════════════════════════════════════════════════════════
   js/services/api.js — Helper base de fetch centralizado.
   ════════════════════════════════════════════════════════════════ */
'use strict';

import { STATE } from '../state.js';

export async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 200)}`);
  }
  return res.json();
}
