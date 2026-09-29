/* ════════════════════════════════════════════════════════════════
   js/config.js — Configuración centralizada sin credenciales.
   ════════════════════════════════════════════════════════════════ */
'use strict';

export const CFG = {
  SECURITY_BASE:  'https://gserpreprod.itsmwtt.com/security',
  TICKET_BASE:    'https://gserpreprod.itsmwtt.com/ticket',
  CLIENT_BASE:    'https://gserpreprod.itsmwtt.com/client',
  DEFAULT_TICKET: '10089241',
  // AUTH_USER / AUTH_PASS eliminados — se ingresan en runtime via modal de auth
  // y se almacenan únicamente en sessionStorage (nunca en código fuente)
};

export const SIM_CFG = {
  ACD_BASE: 'http://127.0.0.1:8000',
};

export const STEP_NAMES = [
  { key: 'ticket',                   label: 'Ticket',          icon: 'fa-ticket'        },
  { key: 'step1_active_session',     label: 'Sesión activa',   icon: 'fa-id-badge'      },
  { key: 'step2_client_permission',  label: 'Perm. Cliente',   icon: 'fa-handshake'     },
  { key: 'step3_service_permission', label: 'Perm. Servicio',  icon: 'fa-shield-halved' },
  { key: 'step4_load_limit',         label: 'Carga/On-site',   icon: 'fa-weight-scale'  },
  { key: 'step5_geofence',           label: 'Geofence/Zona',   icon: 'fa-map-pin'       },
  { key: 'step6_scored',             label: 'Scoring',         icon: 'fa-star'          },
  { key: 'winner',                   label: 'Winner',          icon: 'fa-crown'         },
];
