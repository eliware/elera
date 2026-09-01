export async function resolveCleanRestart({ restartMarker, recoveryProtocol, identity, startupTimeoutMs = 15000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = {} } = {}) {
  const markerReader = restartMarker?.read;
  const marker = markerReader ? await markerReader() : await restartMarker?.consume?.();
  if (!marker) { log.debug?.('Clean restart marker unavailable; evaluating cold recovery', { node: identity?.name }); return undefined; }
  const attempts = markerReader ? Math.max(1, Math.min(15, Math.ceil(startupTimeoutMs / 1000))) : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const evidence = await recoveryProtocol.evidence().catch(() => []);
    const peer = evidence.find((item) => item.node !== identity.name && item.active === true && item.galera?.clusterStatus === 'Primary');
    if (peer) {
      if (markerReader) await restartMarker.consume({ expectedNonce: marker.nonce });
      return { mode: 'join', reason: 'validated clean restart with active Primary peer', epoch: null, bootstrapComplete: true, evidence };
    }
    log.debug?.('Clean restart peer is not yet a validated Primary', { node: identity?.name, attempt: attempt + 1, evidence: evidence.map((item) => ({ node: item.node, active: item.active, clusterStatus: item.galera?.clusterStatus })) });
    if (attempt + 1 < attempts) await sleep(1000);
  }
  log.warn?.('Clean restart marker did not find an active Primary peer; evaluating cold recovery', { node: identity?.name, attempts });
  return undefined;
}
