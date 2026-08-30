import { expect, jest, test } from '@jest/globals';
import { parseStateFile, readStateFile } from '../../../src/cluster/cold-bootstrap/state-file.mjs';

const state = (seqno, safe = 0) => `version: 2.1\nuuid: cluster-uuid\nseqno: ${seqno}\nsafe_to_bootstrap: ${safe}\n`;
test('parses Galera state evidence', () => expect(parseStateFile(state(12, 1))).toMatchObject({ uuid: 'cluster-uuid', seqno: 12, safeToBootstrap: true }));
test('rejects incomplete or invalid state', () => { expect(() => parseStateFile('seqno: 1')).toThrow('incomplete'); expect(() => parseStateFile(state(-2))).toThrow('invalid Galera seqno'); });
test('rejects invalid input and bootstrap marker', () => { expect(() => parseStateFile(null)).toThrow('contents'); expect(() => parseStateFile(state(1).replace('safe_to_bootstrap: 0', 'safe_to_bootstrap: 2'))).toThrow('safe_to_bootstrap'); });
test('reads a normalized state path through the injected reader', async () => { const read = jest.fn().mockResolvedValue(state(4, 1)); await expect(readStateFile('/data/', { read })).resolves.toMatchObject({ source: '/data/grastate.dat', seqno: 4 }); expect(read).toHaveBeenCalledWith('/data/grastate.dat', 'utf8'); });
test('rejects invalid values and propagates reader failures', async () => { expect(() => parseStateFile(state(1).replace('seqno: 1', 'seqno: nope'))).toThrow('invalid Galera seqno'); expect(() => parseStateFile(state(1).replace('uuid: cluster-uuid', 'uuid: '))).toThrow('incomplete'); await expect(readStateFile('/data', { read: jest.fn().mockRejectedValue(new Error('read failed')) })).rejects.toThrow('read failed'); });
