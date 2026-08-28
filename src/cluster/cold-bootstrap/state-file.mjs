import { readFile } from 'node:fs/promises';

export function parseStateFile(text, source = 'grastate.dat') {
  if (typeof text !== 'string') throw new TypeError('state file contents are required');
  const values = Object.fromEntries(text.split(/\r?\n/).map((line) => line.match(/^\s*([\w-]+):\s*(.*?)\s*$/)).filter(Boolean).map((match) => [match[1], match[2]]));
  if (!values.uuid || !values.seqno || !values.safe_to_bootstrap) throw new Error(`incomplete Galera state file: ${source}`);
  const seqno = Number(values.seqno);
  if (!Number.isInteger(seqno) || seqno < -1) throw new Error(`invalid Galera seqno in ${source}`);
  if (!['0', '1'].includes(values.safe_to_bootstrap)) throw new Error(`invalid safe_to_bootstrap in ${source}`);
  return { source, uuid: values.uuid, seqno, safeToBootstrap: values.safe_to_bootstrap === '1' };
}

export async function readStateFile(directory, { read = readFile } = {}) {
  const source = `${directory.replace(/[\\/]$/, '')}/grastate.dat`;
  return parseStateFile(await read(source, 'utf8'), source);
}
