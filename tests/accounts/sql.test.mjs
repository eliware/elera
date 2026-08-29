import { expect, test } from '@jest/globals';
import { accountName, identifier, literal } from '../../src/accounts/sql.mjs';
import { parseRecoveredPosition, recoverState } from '../../src/cluster/cold-bootstrap/recovery.mjs';

test('account SQL helpers validate and quote values', () => { expect(accountName('app_user')).toBe('app_user'); expect(() => accountName('bad name')).toThrow(); expect(() => accountName(null)).toThrow(); expect(identifier('a`b')).toBe('`a``b`'); expect(literal("a'b\\c")).toBe("'a''b\\\\c'"); });
test('rejects every non-string or empty account form', () => { expect(() => accountName(42)).toThrow('invalid account name'); expect(() => accountName('')).toThrow('invalid account name'); expect(() => accountName('bad.name')).toThrow('invalid account name'); });
test('parses the last recovered position and rejects invalid recovery output', async () => {
  expect(parseRecoveredPosition('old Recovered position: abc:1\nRecovered position: def-2:9', 'scan')).toEqual({ source: 'scan', uuid: 'def-2', seqno: 9, recovered: true });
  expect(() => parseRecoveredPosition('Recovered position: abc:-1')).toThrow('invalid seqno');
  expect(() => parseRecoveredPosition('no position')).toThrow('did not report');
  await expect(recoverState('/data', { run: async (directory) => { expect(directory).toBe('/data'); return 'Recovered position: abc:4'; } })).resolves.toMatchObject({ source: '/data', seqno: 4 });
  await expect(recoverState('/data')).rejects.toThrow('runner');
});
