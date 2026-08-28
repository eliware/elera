export function parseRecoveredPosition(output, source = 'wsrep-recover') {
  const matches = [...String(output).matchAll(/Recovered position:\s*([0-9a-f-]+):(-?\d+)/gi)];
  const match = matches.at(-1);
  if (!match) throw new Error(`wsrep-recover did not report a position: ${source}`);
  const seqno = Number(match[2]);
  if (!Number.isInteger(seqno) || seqno < 0) throw new Error(`wsrep-recover reported an invalid seqno: ${source}`);
  return { source, uuid: match[1], seqno, recovered: true };
}

export async function recoverState(directory, { run } = {}) {
  if (typeof run !== 'function') throw new TypeError('wsrep-recover runner is required');
  const output = await run(directory);
  return parseRecoveredPosition(output, directory);
}
