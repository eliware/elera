import { startupArguments } from '../cluster/cold-bootstrap/startup-arguments.mjs';

export async function startAuthorizedRecoveryJoin({ request, identity, args, mariaProcess, recoveryState, recoveryAudit, startRuntime, runtimeOptions = {}, startupArgs = startupArguments } = {}) {
  if (!request?.winnerAddress || typeof request.winnerAddress !== 'string') throw Object.assign(new Error('recovery join requires a winner address'), { code: 'RECOVERY_JOIN_WINNER_REQUIRED', statusCode: 409 });
  if (!Array.isArray(args)) throw new Error('recovery join arguments are unavailable');
  if (mariaProcess?.child && mariaProcess.child.exitCode === null) throw Object.assign(new Error('recovery join refused while mariadbd is already running'), { code: 'RECOVERY_PROCESS_ALREADY_RUNNING', statusCode: 409 });
  const joinArgs = startupArgs(args, { mode: 'join' }, { joinAddress: request.winnerAddress });
  if (!joinArgs.some((argument) => argument.startsWith('--wsrep-cluster-address='))) joinArgs.push(`--wsrep-cluster-address=gcomm://${request.winnerAddress}`);
  recoveryState?.set?.('joining', { reason: 'authorized recovery join', epoch: request.epoch });
  recoveryAudit?.joinStart?.({ node: identity?.name, epoch: request.epoch, winnerAddress: request.winnerAddress });
  await mariaProcess.start(joinArgs);
  if (typeof startRuntime !== 'function') return { node: identity?.name, status: 'joining', epoch: request.epoch };
  const runtime = await startRuntime({ ...runtimeOptions, startupDecision: { mode: 'join', bootstrapComplete: true, epoch: request.epoch, recoveryEpoch: { clusterId: request.clusterId, quorum: request.quorum } } });
  if (runtime?.sqlReady === false) throw Object.assign(new Error('recovery join did not reach ready Primary membership'), { code: 'JOINER_NOT_READY', statusCode: 409 });
  return { node: identity?.name, status: 'ready', epoch: request.epoch };
}
