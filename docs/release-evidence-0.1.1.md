# Elera 0.1.1 release evidence

This record distinguishes locally verified evidence from evidence still
required before production approval.

| Item | Status | Evidence |
| --- | --- | --- |
| Source commit | Required at release | Record the exact Git commit used to build the image. |
| Image digest | GitOps candidate recorded | `sha256:8ec29c3b0fb80ad4ee9b4ae1960a508cb25863b0cff615a28f88e00e1d1b0f44` |
| Runtime identity | Verified | UID 100 / GID 101 (`mysql`). |
| MariaDB package | Build input | MariaDB 12.3.3 repository configuration. |
| Galera package | Build input | `galera-4` package from the configured MariaDB repository. |
| Target architecture | Required at release | Record each published platform manifest. |
| SBOM | Required at release | Attach the generated image SBOM. |
| Vulnerability scan | Required at release | Attach the scanner report and acceptance decision. |
| Independent digest verification | Required at release | Verify the registry digest from an independent client. |
| Application tests | Verified locally | `npm test`: 100×4 coverage, zero lint warnings. |
| Container smoke test | Verified locally | Non-root startup, MariaDB readiness, and supervisor startup passed. |
| Data-directory safety tests | Verified locally | Missing, empty, explicit bootstrap, partial, stale, initialized, non-directory, and non-writable cases covered. |

## Known limitations

SST/IST failure, multi-member loss, total-cluster recovery, worker drain,
physical storage failure, and Kubernetes policy behavior require the isolated
lab and are not claimed by the local unit/smoke results.

## Rollback

Rollback must use the previously approved image digest and its matching GitOps
manifest. Do not change `ELERA_BOOTSTRAP` during a routine rollback. Any
cluster bootstrap or recovery remains an explicit, audited operator action.
