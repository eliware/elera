import { runBackupE2E } from '../docker/backup-dev-e2e.mjs';

test('exports the backup E2E runner without executing it on import', () => {
  expect(runBackupE2E).toEqual(expect.any(Function));
});
