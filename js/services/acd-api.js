/* ════════════════════════════════════════════════════════════════
   js/services/acd-api.js — ACD microservice (dry-run only).
   ════════════════════════════════════════════════════════════════ */
'use strict';

import { SIM_CFG } from '../config.js';
import { STATE } from '../state.js';

export async function simulateTicket(ticketId) {
  const headers = { 'Content-Type': 'application/json' };
  if (STATE.token) headers['Authorization'] = `Bearer ${STATE.token}`;
  const url = `${SIM_CFG.ACD_BASE}/api/v1/acd/simulate-ticket/${ticketId}`;
  const res = await fetch(url, { method: 'POST', headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`acd_microservice HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }
  return res.json();
}
