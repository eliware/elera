import { selectCandidate } from './candidate.mjs';
import { createRecoveryEpoch, transitionRecoveryEpoch, validateRecoveryEpoch } from './recovery-epoch.mjs';
import { validateRecoveryEvidence } from './evidence-validation.mjs';

export function createColdRecoveryProtocol({ nodes, localEvidence, fetchEvidence, store, publishEvent = async () => {}, now = () => new Date(), maxEvidenceAgeMs = 10000, log = {} } = {}) {
  if (!Array.isArray(nodes) || nodes.length === 0 || typeof localEvidence !== 'function' || typeof fetchEvidence !== 'function' || !store) throw new TypeError('cold recovery protocol dependencies are required');
  let current;
  const debug = typeof log.debug === 'function' ? log.debug : () => {};
  const read = async () => current ??= await store.read();
  const persist = (value, expectedEpoch) => store.write(value, expectedEpoch === undefined ? undefined : { expectedEpoch });
  const isActivePrimary = (item, evidence) => {
    const clusterUuid = item.galera?.clusterUuid;
    const localName = nodes.find((node) => node.local)?.name;
    const localItem = evidence.find((candidate) => candidate.node === localName);
    const localUuid = localItem?.galera?.clusterUuid ?? localItem?.uuid;
    return item.active === true && item.galera?.clusterStatus === 'Primary' && item.galera?.localState === 'Synced' && (item.galera?.ready === 'ON' || item.galera?.ready === true) && typeof clusterUuid === 'string' && (!localUuid || localUuid === clusterUuid);
  };
  const collect = async () => {
    debug('Collecting recovery evidence', { nodes: nodes.map((node) => node.name) });
    const results = await Promise.allSettled(nodes.map(async (node) => node.local ? localEvidence() : fetchEvidence(node.url ?? node, node.name)));
    const evidence = results.filter((result) => result.status === 'fulfilled').map(({ value: item }) => ({ ...(item.state ?? item), node: item.node, dataDirectory: item.dataDirectory, galera: item.galera, active: item.active, generation: item.generation, observedAt: item.observedAt }));
    const activePrimary = evidence.some((item) => isActivePrimary(item, evidence));
    if (activePrimary) { debug('Active Primary detected; recovery will join it', { evidence }); return { evidence, activePrimary: true }; }
    const failed = results.find((result) => result.status === 'rejected');
    if (failed && evidence.length === 0) throw failed.reason;
    const validated = validateRecoveryEvidence(evidence, { now: now(), maxAgeMs: maxEvidenceAgeMs });
    if (failed && validated.length < Math.floor(nodes.length / 2) + 1) throw failed.reason;
    debug('Recovery evidence validated', { evidence: validated, partial: Boolean(failed) });
    return { evidence: validated, failures: results.filter((result) => result.status === 'rejected').map((result) => result.reason), activePrimary: false, partial: Boolean(failed) };
  };
  return {
    async evidence() { return (await collect()).evidence; },
    async plan() {
      debug('Evaluating recovery plan');
      let evidence;
      let failures = [];
      try { ({ evidence, failures } = await collect()); }
      catch (error) {
        current = { version: 1, phase: 'blocked', reason: error.message, code: error.code ?? 'RECOVERY_EVIDENCE_UNAVAILABLE', evidence: [], updatedAt: now().toISOString() };
        await persist(current);
        await publishEvent({ type: 'recovery.refused', reason: current.reason, code: current.code });
        return { eligible: false, mode: 'blocked', ...current };
      }
      await publishEvent({ type: 'recovery.evidence-collected', evidence });
      const active = evidence.find((item) => isActivePrimary(item, evidence));
      if (active) return { eligible: true, mode: 'join', reason: 'primary component already exists', ...(Number.isInteger(active.galera.clusterSize) && active.galera.clusterSize > 0 ? { expectedMembership: active.galera.clusterSize } : {}), evidence };
      // Autonomous bootstrap requires confirmation from every configured supervisor,
      // but a stale/divergent SQL volume must not veto the surviving majority history.
      if (evidence.length < nodes.length) {
        const failedReason = 'recovery evidence is incomplete';
        const reason = `${failedReason}: all configured supervisors must provide recovery evidence before bootstrap`;
        const mismatch = failures.find((failure) => failure?.code === 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH');
        const code = mismatch ? mismatch.code : 'INSUFFICIENT_RECOVERY_EVIDENCE';
        current = { version: 1, phase: 'blocked', code, reason: mismatch ? mismatch.message : reason, evidence, errors: failures.map((failure) => ({ code: failure.code, message: failure.message, endpoint: failure.endpoint, expectedNode: failure.expectedNode, actualNode: failure.actualNode })), updatedAt: now().toISOString() };
        await persist(current);
        await publishEvent({ type: 'recovery.refused', reason, code: current.code, evidence });
        return { eligible: false, mode: 'blocked', ...current };
      }
      const decision = selectCandidate(evidence, { minimumHistorySize: Math.floor(nodes.length / 2) + 1 });
      debug('Recovery candidate decision complete', { eligible: decision.eligible, code: decision.code, reason: decision.reason, candidate: decision.candidate?.node, divergentCount: decision.divergent?.length ?? 0 });
      if (!decision.eligible) { current = { version: 1, phase: 'blocked', ...(decision.code ? { code: decision.code } : {}), reason: decision.reason, evidence, updatedAt: now().toISOString() }; await persist(current); await publishEvent({ type: 'recovery.refused', reason: decision.reason, code: decision.code, evidence }); return { eligible: false, mode: 'blocked', ...current }; }
      const epoch = createRecoveryEpoch({ clusterId: decision.candidate.uuid, evidence, winner: decision.candidate, quorum: nodes.map((node) => node.name), now: now() });
      current = { ...epoch, evidence, divergent: decision.divergent, histories: decision.histories };
      await persist(current);
      await publishEvent({ type: 'recovery.candidate-selected', epoch: epoch.epoch, winner: epoch.winner });
      return { eligible: true, mode: 'bootstrap', ...current };
    },
    async retry() {
      if (current?.code === 'RECOVERY_EVIDENCE_IDENTITY_MISMATCH') return current;
      current = undefined;
      return this.plan();
    },
    async authorize({ epoch, acknowledgements = [], force = false, supervisorQuorum } = {}) {
      debug('Authorizing recovery epoch', { epoch, acknowledgements, force, supervisorQuorum });
      const existing = await read();
      if (!existing || existing.epoch !== epoch || !validateRecoveryEpoch(existing, existing.clusterId)) throw Object.assign(new Error('unknown or stale recovery epoch'), { statusCode: 409 });
      const requestedQuorum = supervisorQuorum ?? existing.quorum.length;
      if (!Number.isInteger(requestedQuorum) || requestedQuorum < 1 || requestedQuorum > existing.quorum.length) throw Object.assign(new Error('supervisor quorum must be between one and the configured member count'), { statusCode: 400 });
      const acknowledgementsBy = force && supervisorQuorum === undefined ? existing.quorum.slice() : [...new Set(Array.isArray(acknowledgements) ? acknowledgements : [])].sort();
      current = transitionRecoveryEpoch(existing, 'authorized', { acknowledgements: acknowledgementsBy, acknowledgementsBy, requiredAcknowledgements: requestedQuorum, ...(force ? { operatorForced: true } : {}), authorizedAt: now().toISOString() });
      await persist(current, existing.epoch);
      await publishEvent({ type: 'recovery.bootstrap-authorized', epoch: current.epoch, acknowledgements: acknowledgementsBy });
      return current;
    },
    async beginBootstrap({ epoch, winner } = {}) {
      debug('Beginning authorized bootstrap', { epoch, winner });
      const existing = await read();
      if (!existing || existing.epoch !== epoch || !validateRecoveryEpoch(existing, existing.clusterId)) throw Object.assign(new Error('unknown or stale recovery epoch'), { statusCode: 409 });
      if (existing.phase !== 'authorized' || winner !== existing.winner.node) throw Object.assign(new Error('bootstrap authority does not match the recovery epoch'), { statusCode: 409 });
      let latest;
      try { ({ evidence: latest } = await collect()); } catch (error) {
        current = { ...existing, phase: 'blocked', reason: error.message, code: error.code ?? 'RECOVERY_EVIDENCE_UNAVAILABLE', updatedAt: now().toISOString() };
        await persist(current, existing.epoch);
        await publishEvent({ type: 'recovery.refused', epoch, reason: current.reason, code: current.code });
        throw Object.assign(new Error('bootstrap authority could not be revalidated'), { statusCode: 409, cause: error });
      }
      const refreshed = createRecoveryEpoch({ clusterId: existing.clusterId, evidence: latest, winner: existing.winner, quorum: existing.quorum, now: now() });
      if (refreshed.evidenceDigest !== existing.evidenceDigest) {
        current = { ...existing, phase: 'blocked', reason: 'recovery evidence changed after authorization', code: 'RECOVERY_EVIDENCE_CHANGED', evidence: latest, updatedAt: now().toISOString() };
        await persist(current, existing.epoch);
        await publishEvent({ type: 'recovery.refused', epoch, reason: current.reason, code: current.code });
        throw Object.assign(new Error(current.reason), { statusCode: 409, code: current.code });
      }
      current = transitionRecoveryEpoch(existing, 'bootstrapping', { bootstrapStartedAt: now().toISOString() });
      await persist(current, existing.epoch);
      await publishEvent({ type: 'recovery.bootstrap-started', epoch: current.epoch, winner });
      return current;
    },
    async complete({ epoch, winner, clusterId, membership } = {}) {
      debug('Completing recovery epoch', { epoch, winner, clusterId, membership });
      const existing = await read();
      if (!existing || existing.epoch !== epoch) throw Object.assign(new Error('unknown or stale recovery epoch'), { statusCode: 409 });
      if (winner !== existing.winner?.node || clusterId !== existing.clusterId) throw Object.assign(new Error('recovery completion authority does not match the authorized epoch'), { statusCode: 409 });
      if (!Array.isArray(membership) || membership.length !== existing.quorum.length || [...new Set(membership)].sort().join('\\0') !== existing.quorum.slice().sort().join('\\0')) throw Object.assign(new Error('recovery completion membership does not match the authorized quorum'), { statusCode: 409 });
      current = transitionRecoveryEpoch(existing, 'complete', { winner, clusterId, membership, completedAt: now().toISOString() });
      await persist(current, existing.epoch);
      await publishEvent({ type: 'recovery.bootstrap-complete', epoch: current.epoch, winner, membership });
      return current;
    },
    async status() { return (await read()) ?? { phase: 'pending' }; },
  };
}
