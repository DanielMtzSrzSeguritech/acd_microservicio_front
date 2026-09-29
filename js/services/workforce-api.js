import { checkInSession, checkOutSession } from './operational-api.js';

// ACD write operations remain disabled for general user session until deployment access controls are defined.
const disabled = async () => {
  const error = new Error('Check-in y check-out deshabilitados.');
  error.status = 503;
  error.code = 'acd_writes_disabled';
  throw error;
};

export const fetchOwnSession = disabled;

export const checkIn = async (engineerId) => {
  if (!engineerId) return disabled();
  return checkInSession(engineerId);
};

export const checkOut = async (engineerId) => {
  if (!engineerId) return disabled();
  return checkOutSession(engineerId);
};
