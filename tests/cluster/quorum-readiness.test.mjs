import { describe, expect, test } from '@jest/globals';
import { isQuorumReady } from '../src/cluster/quorum-readiness.mjs';

describe('quorum readiness', () => {
  test.each([[3, 2, true], [3, 1, false], [3, 0, false], [1, 1, true]])('requires majority for %i expected members and %i actual members', (expected, actual, ready) => {
    expect(isQuorumReady({ wsrep_cluster_size: String(actual) }, { expectedSize: expected })).toBe(ready);
  });
  test('rejects malformed values', () => { expect(isQuorumReady({ wsrep_cluster_size: 'unknown' }, { expectedSize: 3 })).toBe(false); });
});
