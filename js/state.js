/* ════════════════════════════════════════════════════════════════
   js/state.js — Estado global de la aplicación.
   ════════════════════════════════════════════════════════════════ */
'use strict';

import { CFG } from './config.js';

export const STATE = {
  token:        null,
  securityToken: null,
  clientToken: null,
  serviceTiming: null,
  gsTokenExpiresAt: null,
  ticketId:     CFG.DEFAULT_TICKET,
  ticket:       null,
  candidates:   [],
  geolocations: [],
  gpsAvailable: false,
  loading:      false,
};
