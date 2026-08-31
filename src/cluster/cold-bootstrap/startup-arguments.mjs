export function startupArguments(args, decision, { joinAddress } = {}) {
  if (!Array.isArray(args) || !decision) throw new TypeError('startup arguments require args and recovery decision');
  const joinOnly = args.filter((argument) => argument !== '--wsrep-new-cluster');
  if (decision.mode === 'bootstrap' && decision.localWinner === true) return [...joinOnly, '--wsrep-new-cluster'];
  if (decision.mode === 'join' && typeof joinAddress === 'string' && joinAddress) return joinOnly.map((argument) => argument.startsWith('--wsrep-cluster-address=') ? `--wsrep-cluster-address=gcomm://${joinAddress}` : argument);
  return joinOnly;
}
