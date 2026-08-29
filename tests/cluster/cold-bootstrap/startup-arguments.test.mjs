import { startupArguments } from '../../../src/cluster/cold-bootstrap/startup-arguments.mjs';

test('only the authorized local winner emits bootstrap arguments', () => {
  const args = ['--wsrep-on=ON', '--wsrep-new-cluster'];
  expect(startupArguments(args, { mode: 'bootstrap', localWinner: true })).toContain('--wsrep-new-cluster');
  expect(startupArguments(args, { mode: 'bootstrap', localWinner: false })).not.toContain('--wsrep-new-cluster');
  expect(startupArguments(args, { mode: 'join', localWinner: true })).not.toContain('--wsrep-new-cluster');
});

test('validates argument decision inputs', () => {
  expect(() => startupArguments()).toThrow('startup arguments require');
});
