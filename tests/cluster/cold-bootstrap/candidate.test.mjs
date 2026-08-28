import { selectCandidate } from '../../../src/cluster/cold-bootstrap/candidate.mjs';
const node = (node, seqno, safeToBootstrap = false) => ({ node, uuid: 'cluster', seqno, safeToBootstrap });
test('selects the sole safe highest-seqno node', () => expect(selectCandidate([node('a', 10, true), node('b', 9)])).toMatchObject({ eligible: true, candidate: { node: 'a' } }));
test('selects the unique highest seqno when none is marked safe', () => expect(selectCandidate([node('a', 10), node('b', 12)])).toMatchObject({ eligible: true, candidate: { node: 'b' } }));
test('rejects ties, UUID mismatch, and conflicting safe markers', () => { expect(selectCandidate([node('a', 10), node('b', 10)]).eligible).toBe(false); expect(selectCandidate([node('a', 10), { ...node('b', 9), uuid: 'other' }]).reason).toContain('UUID'); expect(selectCandidate([node('a', 10, true), node('b', 11)]).reason).toContain('highest'); });
test('rejects empty evidence and multiple safe nodes', () => { expect(() => selectCandidate([])).toThrow('no Galera state'); expect(selectCandidate([node('a', 1, true), node('b', 1, true)]).reason).toContain('multiple'); });
test('rejects an unrecoverable all-negative state set', () => expect(selectCandidate([node('a', -1), node('b', -1)]).reason).toContain('recoverable'));
