import { expect, jest, test } from '@jest/globals';
import { parseRecoveredPosition, recoverState } from '../../../src/cluster/cold-bootstrap/recovery.mjs';
test('parses the recovered Galera position', () => expect(parseRecoveredPosition('WSREP: Recovered position: abc-def:1452')).toEqual({ source: 'wsrep-recover', uuid: 'abc-def', seqno: 1452, recovered: true }));
test('rejects missing recovered position', () => expect(() => parseRecoveredPosition('no position')).toThrow('did not report'));
test('rejects invalid recovered positions and requires a runner', async () => { expect(() => parseRecoveredPosition('Recovered position: abc:-1')).toThrow('invalid seqno'); await expect(recoverState('/data')).rejects.toThrow('runner'); });
test('runs the injected recovery command', async () => { const run = jest.fn().mockResolvedValue('Recovered position: abc:12'); await expect(recoverState('/data', { run })).resolves.toMatchObject({ uuid: 'abc', seqno: 12, source: '/data' }); expect(run).toHaveBeenCalledWith('/data'); });
