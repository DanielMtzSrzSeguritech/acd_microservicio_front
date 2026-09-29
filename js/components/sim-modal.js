/* ════════════════════════════════════════════════════════════════
   js/components/sim-modal.js
   Modal de evaluación ACD — presentación de resultados de simulación.
   Extraído de js/app.js (Fase 1 → Fase 2 paso 1).

   Exports:
     initSimModal()      — llamar una vez en DOMContentLoaded
     openSimModal()      — abre modal + inicia animación/renders
     closeSimModal()     — cierra el modal
     runSimulationModal(ticketId, ticketCoords) — orquesta fetch + renders
   ════════════════════════════════════════════════════════════════ */
'use strict';

import { SIM_CFG, STEP_NAMES } from '../config.js';
import { STATE } from '../state.js';
import { escHtml } from '../utils.js';
import { simulateTicket } from '../services/acd-api.js';

/* ── DOM refs (resueltos en initSimModal) ────────────────────── */
let M = {}; // modal DOM cache

/* ── Helpers locales ─────────────────────────────────────────── */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const $ = id => document.getElementById(id);

/* ════════════════════════════════════════════════════════════════
   INIT — resuelve referencias DOM y conecta eventos
   ════════════════════════════════════════════════════════════════ */
export function initSimModal() {
  M = {
    overlay:      $('simModalOverlay'),
    closeBtn:     $('simModalClose'),
    ticketLabel:  $('simModalTicketLabel'),
    loadingEl:    $('simModalLoading'),
    bodyEl:       $('simModalBody'),
    stepper:      $('simModalStepper'),
    stepDetail:   $('simModalStepDetail'),
    sourcesRow:   $('simModalSourcesRow'),
    sourcesList:  $('simModalSourcesList'),
    gapsList:     $('simModalGapsList'),
    tableWrap:    $('simModalTableWrap'),
    tableBody:    $('simModalTableBody'),
    winnerCard:   $('simModalWinnerCard'),
    winnerLabel:  $('simModalWinnerLabel'),
    winnerBody:   $('simModalWinnerBody'),
    metaPanel:    $('simModalMetaPanel'),
    metaReady:    $('simModalMetaReady'),
    metaPartial:  $('simModalMetaPartial'),
    metaTicketId: $('simModalMetaTicketId'),
    metaMissing:  $('simModalMetaMissing'),
    metaMissingList: $('simModalMetaMissingList'),
    metaWarnings: $('simModalMetaWarnings'),
    metaWarnList: $('simModalMetaWarnList'),
    metaDq:       $('simModalMetaDq'),
    errorBanner:  $('simModalError'),
  };

  if (!M.overlay) { console.error('[SimModal] #simModalOverlay not found in DOM'); return; }

  M.closeBtn?.addEventListener('click', closeSimModal);
  M.overlay.addEventListener('click', e => { if (e.target === M.overlay) closeSimModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) closeSimModal(); });
}

/* ════════════════════════════════════════════════════════════════
   OPEN / CLOSE
   ════════════════════════════════════════════════════════════════ */
export function isOpen() {
  return M.overlay?.style.display !== 'none' && M.overlay?.style.display !== '';
}

export function openSimModal() {
  if (!M.overlay) return;
  M.overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

export function closeSimModal() {
  if (!M.overlay) return;
  M.overlay.style.display = 'none';
  document.body.style.overflow = '';
}

/* ════════════════════════════════════════════════════════════════
   STEPPER
   ════════════════════════════════════════════════════════════════ */
function setStepState(idx, state) {
  const steps = M.stepper?.querySelectorAll('.step');
  if (steps?.[idx]) steps[idx].className = `step ${state}`;
}

function resetStepper() {
  M.stepper?.querySelectorAll('.step').forEach(s => { s.className = 'step'; });
  if (M.stepDetail) M.stepDetail.innerHTML =
    '<span style="color:var(--text-muted)">Ejecutando cascada ACD…</span>';
}

function animateStepper(stepsSummary) {
  STEP_NAMES.forEach((s, idx) => {
    setTimeout(() => {
      setStepState(idx, 'active');
      let detail = '';
      if (s.key === 'ticket') {
        detail = `<strong>Ticket #${STATE.ticketId}</strong> cargado.`;
      } else if (s.key === 'winner') {
        const count = stepsSummary?.step6_scored ?? 0;
        detail = count > 0
          ? `<span class="pass">✓ Winner seleccionado</span> — ${count} candidato(s) pasaron.`
          : `<span class="fail">✗ Sin winner</span>`;
      } else {
        const passCount = stepsSummary?.[s.key] ?? '?';
        detail = `<strong>${s.label}:</strong> <span class="pass">${passCount} candidatos pasan</span>`;
      }
      if (M.stepDetail) M.stepDetail.innerHTML = detail;
      if (idx > 0) setStepState(idx - 1, 'done');
      if (idx === STEP_NAMES.length - 1) {
        setTimeout(() =>
          setStepState(idx, (stepsSummary?.step6_scored ?? 0) > 0 ? 'winner' : 'error'),
        400);
      }
    }, idx * 400);
  });
}

/* ════════════════════════════════════════════════════════════════
   RENDERS
   ════════════════════════════════════════════════════════════════ */
function renderSources(sources, gaps) {
  if (!M.sourcesRow) return;
  M.sourcesRow.style.display = '';
  M.sourcesList.innerHTML = Object.entries(sources || {}).map(([name, s]) => {
    const st   = (s.status || '').toLowerCase();
    const cls  = st.includes('ok') ? 'ok' : st.includes('timeout') ? 'timeout'
               : st.includes('error') ? 'error' : 'unknown';
    const icon = { ok: 'fa-circle-check', timeout: 'fa-clock',
                   error: 'fa-circle-xmark', unknown: 'fa-circle-question' }[cls];
    const ms   = s.duration_ms != null ? ` (${Math.round(s.duration_ms)}ms)` : '';
    return `<div class="source-chip ${cls}"><i class="fa-solid ${icon}"></i>${escHtml(name)}${ms}</div>`;
  }).join('');
  M.gapsList.innerHTML = (gaps || []).length
    ? gaps.map(g => `<div class="gap-item"><i class="fa-solid fa-triangle-exclamation"></i>${escHtml(g)}</div>`).join('')
    : '';
}

function getDiscardStep(c) {
  if (!c.discard_reason) return null;
  const r = (c.discard_reason || '').toLowerCase();
  if (r.includes('sesión') || r.includes('session'))   return 'step1_active_session';
  if (r.includes('cliente') || r.includes('client'))   return 'step2_client_permission';
  if (r.includes('servicio') || r.includes('service')) return 'step3_service_permission';
  if (r.includes('on_site') || r.includes('on-site') || r.includes('carga') || r.includes('load'))
                                                        return 'step4_load_limit';
  if (r.includes('zona') || r.includes('zone') || r.includes('geofence') || r.includes('geo'))
                                                        return 'step5_geofence';
  if (r.includes('score')) return 'step6_scored';
  return 'unknown';
}

function renderTable(evaluated, winner, ticketCoords) {
  if (!M.tableWrap) return;
  M.tableWrap.style.display = '';
  const winnerId = winner?.user_id ?? winner?.userId ?? null;
  const sorted   = [...evaluated].sort((a, b) => {
    const aEl = !a.discard_reason, bEl = !b.discard_reason;
    if (aEl !== bEl) return aEl ? -1 : 1;
    return (b.score ?? -1) - (a.score ?? -1);
  });
  let rank = 1;
  M.tableBody.innerHTML = sorted.map(c => {
    const uid        = c.user_id ?? c.userId ?? '—';
    const name       = c.name || '—';
    const eligible   = !c.discard_reason;
    const isWinner   = eligible && String(uid) === String(winnerId);
    const discardStep= eligible ? null : getDiscardStep(c);
    const stepLabel  = discardStep
      ? (STEP_NAMES.find(s => s.key === discardStep)?.label ?? discardStep)
      : null;
    const lat     = c.latitude ?? c.lat ?? null;
    const lng     = c.longitude ?? c.lng ?? null;
    const hasGps  = lat != null && lng != null && lat !== 0 && lng !== 0;
    const distKm  = hasGps && ticketCoords
      ? haversine(ticketCoords.lat, ticketCoords.lng, lat, lng).toFixed(2) + ' km'
      : '—';
    const activeTkts = c.active_tickets_count
      ?? (Array.isArray(c.active_tickets) ? c.active_tickets.length : c.active_tickets)
      ?? '?';
    const rowRank  = eligible ? rank++ : '—';
    const rowClass = isWinner ? 'eligible is-winner' : eligible ? 'eligible' : 'discarded';

    return `<tr class="${rowClass}">
      <td class="sim-col-rank">${isWinner ? '👑' : rowRank}</td>
      <td class="sim-col-name">${escHtml(name)}${isWinner
        ? ' <span class="winner-badge-inline">WINNER</span>' : ''}</td>
      <td class="sim-col-id">${escHtml(String(uid))}</td>
      <td>${eligible
        ? '<span class="eligible-badge">✅ Elegible</span>'
        : '<span class="discarded-badge">❌ Descartado</span>'}</td>
      <td>${stepLabel
        ? `<span class="step-chip discarded">${escHtml(stepLabel)}</span>`
        : eligible ? '<span class="step-chip">—</span>' : '—'}</td>
      <td class="sim-col-reason">${escHtml(c.discard_reason || '—')}</td>
      <td class="sim-col-score">${c.score != null ? c.score.toFixed(4) : '—'}</td>
      <td>${c.has_active_session
        ? '<span style="color:var(--success)">✓</span>'
        : '<span style="color:var(--danger)">✗</span>'}</td>
      <td>${c.on_site != null ? (c.on_site ? '<span style="color:var(--warning)">On-site</span>' : 'No') : '—'}</td>
      <td style="font-family:monospace;font-size:.75rem">${c.active_zone_id ?? '—'}</td>
      <td>${activeTkts}</td>
      <td>${hasGps
        ? `<span class="gps-yes" title="${distKm}">✓ ${distKm}</span>`
        : '<span class="gps-no">—</span>'}</td>
    </tr>`;
  }).join('');
}

function renderWinner(winner, isPartial) {
  if (!M.winnerCard) return;
  M.winnerCard.style.display = '';
  if (!winner) {
    if (M.winnerLabel) M.winnerLabel.textContent = 'Sin Winner — ningún candidato superó la cascada';
    if (M.winnerBody)  M.winnerBody.innerHTML = `
      <div class="winner-field-full">
        <span class="winner-field-label">Resultado</span>
        <span class="winner-field-value" style="color:var(--danger)">Sin candidatos elegibles</span>
      </div>`;
    return;
  }
  if (M.winnerLabel) M.winnerLabel.textContent = isPartial
    ? 'Winner Diagnóstico (Decisión Parcial)'
    : 'Winner Simulado — Motor ACD PREPROD';

  const safe = v => (v === null || v === undefined || v === 'null' || v === 'undefined') ? '—' : String(v);
  const activeTkts = winner.active_tickets_count
    ?? (Array.isArray(winner.active_tickets) ? winner.active_tickets.length : winner.active_tickets)
    ?? '—';
  const gpsInfo = (winner.latitude && winner.longitude)
    ? `${Number(winner.latitude).toFixed(5)}, ${Number(winner.longitude).toFixed(5)}`
    : (winner.lat && winner.lng)
      ? `${Number(winner.lat).toFixed(5)}, ${Number(winner.lng).toFixed(5)}`
      : 'No disponible';

  const fields = [
    ['User ID',         safe(winner.user_id ?? winner.userId)],
    ['Nombre',          safe(winner.name)],
    ['Email',           safe(winner.email)],
    ['Score',           winner.score != null ? winner.score.toFixed(4) : '—'],
    ['Status',          safe(winner.status)],
    ['Tickets activos', safe(activeTkts)],
    ['Carga máxima',    safe(winner.max_active_tickets)],
    ['On-site',         winner.on_site != null ? (winner.on_site ? 'Sí' : 'No') : '—'],
    ['Sesión activa',   winner.has_active_session ? 'Sí' : 'No'],
    ['Zona activa ID',  safe(winner.active_zone_id)],
    ['Zona (nombre)',   safe(winner.zone_name)],
    ['GPS (info)',      gpsInfo],
  ];
  if (M.winnerBody) {
    M.winnerBody.innerHTML = fields.map(([label, val]) =>
      `<div class="winner-field">
         <span class="winner-field-label">${escHtml(label)}</span>
         <span class="winner-field-value">${escHtml(val)}</span>
       </div>`
    ).join('');
  }
}

function renderMeta(data) {
  if (!M.metaPanel) return;
  M.metaPanel.style.display = '';

  const ready = data.production_ready;
  if (M.metaReady) M.metaReady.innerHTML = ready === true
    ? '<span class="meta-true">✅ true</span>'
    : ready === false ? '<span class="meta-false">❌ false</span>' : '—';

  const partial = data.decision_is_partial;
  if (M.metaPartial) M.metaPartial.innerHTML = partial === true
    ? '<span class="meta-warn">⚠ true</span>'
    : partial === false ? '<span class="meta-ok">false</span>' : '—';

  if (M.metaTicketId) M.metaTicketId.textContent = data.ticket_id ?? '—';

  const missing = data.missing_requirements ?? [];
  if (M.metaMissing) M.metaMissing.style.display = missing.length ? '' : 'none';
  if (M.metaMissingList && missing.length) {
    M.metaMissingList.innerHTML = missing.map(r =>
      `<div class="gap-item"><i class="fa-solid fa-circle-minus"></i>${escHtml(String(r))}</div>`
    ).join('');
  }

  const warnings = data.warnings ?? [];
  if (M.metaWarnings) M.metaWarnings.style.display = warnings.length ? '' : 'none';
  if (M.metaWarnList && warnings.length) {
    M.metaWarnList.innerHTML = warnings.map(w =>
      `<div class="gap-item"><i class="fa-solid fa-triangle-exclamation"></i>${escHtml(String(w))}</div>`
    ).join('');
  }

  const dq = data.data_quality ?? {};
  if (M.metaDq) {
    M.metaDq.innerHTML = Object.entries(dq).map(([k, v]) => {
      const cls = v === 'real' ? 'dq-real' : v === 'fallback' ? 'dq-fallback'
               : v === 'unavailable' ? 'dq-unavailable' : 'dq-other';
      return `<div class="dq-item ${cls}"><span class="dq-key">${escHtml(k)}</span><span class="dq-val">${escHtml(String(v))}</span></div>`;
    }).join('') || '<span style="color:var(--text-muted)">Sin datos</span>';
  }
}

/* ════════════════════════════════════════════════════════════════
   LOADING STATE
   ════════════════════════════════════════════════════════════════ */
function setLoading(loading) {
  if (M.loadingEl) M.loadingEl.style.display = loading ? '' : 'none';
  if (M.bodyEl)    M.bodyEl.style.display    = loading ? 'none' : '';
}

function showError(msg) {
  if (M.errorBanner) {
    M.errorBanner.style.display = '';
    M.errorBanner.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${escHtml(msg)}`;
  }
  if (M.loadingEl) M.loadingEl.style.display = 'none';
  if (M.bodyEl)    M.bodyEl.style.display    = '';
}

/* ════════════════════════════════════════════════════════════════
   MAIN ENTRY — runSimulationModal
   ════════════════════════════════════════════════════════════════ */
export async function runSimulationModal(ticketId, ticketCoords) {
  // Reset UI
  setLoading(true);
  if (M.errorBanner)  M.errorBanner.style.display  = 'none';
  if (M.sourcesRow)   M.sourcesRow.style.display    = 'none';
  if (M.tableWrap)    M.tableWrap.style.display     = 'none';
  if (M.winnerCard)   M.winnerCard.style.display    = 'none';
  if (M.metaPanel)    M.metaPanel.style.display     = 'none';
  resetStepper();
  if (M.ticketLabel) M.ticketLabel.textContent = `#${ticketId}`;

  openSimModal();

  try {
    const data         = await simulateTicket(ticketId);
    const winner       = data.winner ?? data.diagnostic_winner ?? null;
    const evaluated    = data.evaluated ?? [];
    const stepsSummary = data.steps_summary ?? {};
    const sources      = data.sources ?? {};
    const gaps         = data.gaps ?? [];
    const isPartial    = data.decision_is_partial ?? false;
    const missingReqs  = data.missing_requirements ?? [];

    setLoading(false);
    animateStepper(stepsSummary);

    const animDelay = STEP_NAMES.length * 400 + 300;
    setTimeout(() => {
      renderSources(sources, [...gaps, ...missingReqs.map(r => `MISSING: ${r}`)]);
      renderTable(evaluated, winner, ticketCoords);
      renderWinner(winner, isPartial);
      renderMeta(data);
    }, animDelay);

    return { winner, evaluated, stepsSummary, isPartial };

  } catch (err) {
    const isNetErr = err.message.toLowerCase().includes('failed to fetch')
                  || err.message.toLowerCase().includes('networkerror')
                  || err.message.toLowerCase().includes('load failed');
    showError(isNetErr
      ? `No se pudo conectar a acd_microservice. ¿Está corriendo en ${SIM_CFG?.ACD_BASE ?? 'http://127.0.0.1:8000'}?`
      : `Error de simulación: ${err.message}`);
    setLoading(false);
    throw err;
  }
}
