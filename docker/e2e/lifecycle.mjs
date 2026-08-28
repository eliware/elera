import { post, waitForHealth, waitForReady } from './http.mjs';
export async function initializeSupervisors() {
  await waitForHealth('http://elera-0:8080');
  await post('http://elera-0:8080', '/api/v1/cluster/bootstrap', { confirm: true });
  for (const node of ['elera-1', 'elera-2']) {
    await waitForHealth(`http://${node}:8080`);
    await post(`http://${node}:8080`, '/api/v1/cluster/join', { confirm: true });
  }
  await Promise.all(['elera-0', 'elera-1', 'elera-2'].map((node) => waitForReady(`http://${node}:8080`)));
  await waitForHealth('http://elera-single:8080');
  await post('http://elera-single:8080', '/api/v1/cluster/join', { confirm: true });
  await waitForReady('http://elera-single:8080');
}
