import { fetchEngineersDirectory } from './operational-api.js';

/**
 * Directorio de ingenieros habilitados a través del endpoint local ACD (SQL de solo lectura).
 * No consulta SecurityApi ni expone tokens GS desde el cliente.
 */
export async function fetchEngineerDirectory({ page = 1, pageSize = 25, search = '' } = {}) {
  return fetchEngineersDirectory({ page, pageSize, search });
}

