import { evaluateQuorum } from '../cluster/quorum.mjs';

export function createQuorumAssignmentCoordinator({ assignmentStore, observationStore, environment = process.env, now = Date.now, log = { error() {} } } = {}) {
  if (!assignmentStore?.get || !assignmentStore?.set || !observationStore?.snapshot) throw new TypeError('quorum assignment dependencies are required');
  async function read(application) { return assignmentStore.get(application); }
  async function write(application, writer, observations = observationStore.snapshot()) {
    const quorum = evaluateQuorum(observations, { now: now(), expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length) });
    if (!quorum.quorum) throw Object.assign(new Error(`writer assignment requires quorum: ${quorum.reason}`), { code: 'QUORUM_REQUIRED', statusCode: 503 });
    const eligible = quorum.observations.some((item) => item.address === writer && item.synced && item.primary === 'Primary' && item.health === 'ok' && !item.drain);
    if (!eligible) throw Object.assign(new Error('writer assignment target is not eligible'), { code: 'WRITER_INELIGIBLE', statusCode: 409 });
    try { return await assignmentStore.set(application, writer); } catch (error) { log.error('Writer assignment persistence failed', { application, writer, error }); throw error; }
  }
  return { read, write };
}
