# Elera 0.1.4 release evidence

This candidate contains the non-bootstrap startup hardening and the
Kubernetes-style runtime-path validation.

| Item | Status | Evidence |
| --- | --- | --- |
| Source commit | Required at release | Record the exact commit used to build the image. |
| Image digest | Required at release | Record and independently verify the registry digest after publication. |
| Runtime identity | Verified locally | UID 100 / GID 101 (`mysql`). |
| Runtime mounts | Verified locally | `/run/elera`, `/run/mysqld`, `/tmp`, and `/var/lib/mysql` are writable as required; `/etc/elera` is static configuration. |
| Bootstrap safety | Verified locally | Empty data with bootstrap disabled fails closed; explicit bootstrap is required; initialized data restarts without reinitialization. |
| Read-only root | Verified locally | Image starts with a read-only root filesystem and read-only `/etc/elera/supervisor.yaml` when runtime mounts are supplied. |
| Application tests | Verified locally | `npm test`: 100×4 coverage, zero lint warnings. |
| Image build | Verified locally | Elera, HAProxy, and backup/NAS lab images build successfully. |
| Fresh cluster safety | Verified locally | All three fresh nodes refuse implicit bootstrap when `ELERA_BOOTSTRAP=false`. |
| MariaDB/Galera versions | Build input | MariaDB 12.3.3 and Galera 4 from the configured repositories. |
| SBOM and vulnerability scan | Required at release | Generate and review final registry-image reports. |
| Signing and attestation | Required at release | Attach and independently verify image signature and provenance. |
| Real Galera lifecycle tests | Pending platform validation | SST/IST, quorum loss, recovery, and Kubernetes lifecycle testing remain platform/lab gates. |

## Rollback

Use the previous approved image digest and matching deployment revision. Do not
enable bootstrap during rollback or routine restart.
