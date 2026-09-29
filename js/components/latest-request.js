// Identifica la solicitud vigente sin alterar el orden de respuestas HTTP.
export function createLatestRequest() {
  let version = 0;
  return {
    start() { return ++version; },
    isCurrent(request) { return request === version; },
    invalidate() { version++; },
  };
}
