/* ════════════════════════════════════════════════════════════════
   js/services/auth.js
   Autenticación GS PREPROD — credenciales solo en memoria.

   REGLAS DE SEGURIDAD:
   ✅ Credenciales solo en memoria (se borran al recargar o cerrar pestaña)
   ✅ Token solo en STATE (memoria JS — nunca al DOM)
   ✅ Nunca en localStorage
   ✅ Nunca en código fuente
   ✅ Nunca impresas en console (ni user ni pass)
   ✅ Nunca en mensajes de error visibles al usuario
   ════════════════════════════════════════════════════════════════ */

'use strict';

import { CFG } from '../config.js';
import { STATE } from '../state.js';

/** Credenciales temporales solo en memoria; se limpian claves de versiones previas. */
let credentials = { user: '', pass: '' };
let authGeneration = 0;
let pendingAuth = null;

/* ── Lectura/escritura segura de sessionStorage ───────────────── */

/** Guarda credenciales en sessionStorage. Nunca en código fuente. */
export function saveCredentials(user, pass) {
  authGeneration++;
  pendingAuth = null;
  credentials = { user, pass };
  try {
    sessionStorage.removeItem('gs_preprod_u');
    sessionStorage.removeItem('gs_preprod_p');
  } catch (_) { /* storage may be unavailable */ }
}

/** Lee las credenciales guardadas en sessionStorage. */
export function loadCredentials() {
  return { ...credentials };
}

/** Borra credenciales y token de memoria. Llama al cierre de sesión GS. */
export function clearCredentials() {
  authGeneration++;
  pendingAuth = null;
  credentials = { user: '', pass: '' };
  try {
    sessionStorage.removeItem('gs_preprod_u');
    sessionStorage.removeItem('gs_preprod_p');
  } catch (_) { /* clean up credentials saved by older versions */ }
  STATE.token = null;
  STATE.securityToken = null;
  STATE.clientToken = null;
  STATE.serviceTiming = null;
  STATE.gsTokenExpiresAt = null;
}

/** ¿Hay credenciales guardadas en sessionStorage? */
export function hasCredentials() {
  return !!(credentials.user && credentials.pass);
}

/**
 * Autentica contra el endpoint GS Security.
 * - Lee credenciales de memoria (nunca de código fuente ni almacenamiento web).
 * - Almacena el token resultante en STATE.token (solo memoria JS).
 * - Nunca imprime user/pass en console.
 * - Si no hay credenciales, lanza error descriptivo sin revelar valores.
 */
async function authenticateOnce(generation) {
  const creds = loadCredentials();

  if (!creds.user || !creds.pass) {
    const err = new Error(
      'GS_AUTH_REQUIRED: Credenciales GS PREPROD no disponibles. ' +
      'Usa el botón "Auth GS" en la barra superior para autenticarte. ' +
      'El check-in ACD permanece bloqueado hasta verificar identidad y permisos GS.'
    );
    err.isAuthRequired = true;
    throw err;
  }

  const url  = `${CFG.SECURITY_BASE}/api/v1/Integration/get-token`;
  const body = JSON.stringify({ userName: creds.user, password: creds.pass });

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (netErr) {
    throw new Error(`GS auth — error de red: ${netErr.message}`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    // 401 probably means wrong credentials — clear them so next attempt re-prompts
    if (res.status === 401 || res.status === 403) {
      clearCredentials();
    }
    throw new Error(`GS auth HTTP ${res.status} — verifica usuario/contraseña`);
  }

  const data = await res.json();

  const token = data?.downstreamTokens?.ticketApiToken || data?.ticketApiToken;

  if (!token) {
    throw new Error('GS auth — token no encontrado en respuesta');
  }

  if (generation !== authGeneration) throw new Error('GS auth cancelada por cambio de sesión');
  STATE.token = token;
  STATE.securityToken = data?.accessToken || null;
  STATE.clientToken = data?.downstreamTokens?.clientApiToken || null;
  const expiry = Date.parse(data?.downstreamTokens?.expiresAt ?? data?.expiresAt ?? '');
  STATE.gsTokenExpiresAt = Number.isFinite(expiry) ? expiry : null;
}

export function authenticate() {
  if (pendingAuth) return pendingAuth;
  const operation = authenticateOnce(authGeneration);
  pendingAuth = operation;
  operation.then(
    () => { if (pendingAuth === operation) pendingAuth = null; },
    () => { if (pendingAuth === operation) pendingAuth = null; },
  );
  return operation;
}
