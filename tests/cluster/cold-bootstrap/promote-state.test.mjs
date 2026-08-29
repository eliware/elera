import { expect, test, jest } from '@jest/globals';
import { promoteSafeToBootstrap } from '../../../src/cluster/cold-bootstrap/promote-state.mjs';

test('promotes a safe-to-bootstrap flag atomically', async () => {
  const writes = []; const moves = [];
  const result = await promoteSafeToBootstrap('/state/grastate.dat', { read: async () => 'safe_to_bootstrap: 0\n', write: async (...args) => writes.push(args), move: async (...args) => moves.push(args), setMode: jest.fn() });
  expect(result).toEqual({ changed: true, path: '/state/grastate.dat' });
  expect(writes[0][1]).toContain('safe_to_bootstrap: 1'); expect(moves[0][1]).toBe('/state/grastate.dat');
});
test('is idempotent and rejects invalid state files or paths', async () => {
  await expect(promoteSafeToBootstrap('')).rejects.toThrow('state path');
  const write = jest.fn(); const move = jest.fn(); const setMode = jest.fn();
  await expect(promoteSafeToBootstrap('/state', { read: async () => 'safe_to_bootstrap: 1', write, move, setMode })).resolves.toEqual({ changed: false, path: '/state' });
  expect(write).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled(); expect(setMode).not.toHaveBeenCalled();
  await expect(promoteSafeToBootstrap('/state', { read: async () => 'not a state' })).rejects.toThrow('invalid Galera state');
});
