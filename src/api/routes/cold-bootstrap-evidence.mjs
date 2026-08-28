export async function handleColdBootstrapEvidence({ method, path, response, coldEvidence }) {
  if (method !== 'GET' || path !== '/api/v1/cluster/cold-bootstrap/evidence') return false;
  if (!coldEvidence) throw Object.assign(new Error('cold bootstrap evidence is unavailable'), { statusCode: 503 });
  response.json(200, { ok: true, operation: 'cluster.cold-bootstrap.evidence', status: 'completed', data: await coldEvidence() });
  return true;
}
