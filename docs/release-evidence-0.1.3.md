# Elera 0.1.3 release evidence

This release separates writable supervisor runtime state from static
configuration so Kubernetes ConfigMap mounts can remain read-only.

| Item | Status | Evidence |
| --- | --- | --- |
| Source commit | Required at release | Record the exact Git commit used to build the image. |
| Image digest | Required at release | Record the final registry digest after publication; the local image is not a release digest. |
| Local image ID | Verified locally | `sha256:a1f4b9f2d207d3517d366f3a990a35f5356c377ed984c1182b9379366689e827`; not a release registry digest. |
| Runtime identity | Verified locally | UID 100 / GID 101 (`mysql`). |
| Writable runtime paths | Verified in source/tests | `/run/elera`, `/run/mysqld`, and `/tmp`; Kubernetes must mount them writable when using a read-only root filesystem. |
| Static configuration path | Verified in source/docs | `/etc/elera`; may be a read-only ConfigMap mount. |
| MariaDB package | Build input | MariaDB 12.3.3 repository configuration. |
| Galera package | Build input | `galera-4` package from the configured repository. |
| Target architecture | Required at release | Record each published platform manifest. |
| Base image | Verified locally | `node:26-bookworm-slim@sha256:4db36457f406501e6f608802e5da617e5fbd0e80b75901b6a09de1ae5a667d32`; record the final published build input at release. |
| SBOM | Required at release | Attach the generated image SBOM. |
| Vulnerability scan | Release blocker | Docker Scout local scan found 42 critical/high findings (10 critical, 32 high) in 8 packages; DevOps must review, remediate, or formally accept them. |
| Independent digest verification | Required at release | Verify the registry digest from an independent client. |
| Signing/attestation | Required at release | Attach image signature and provenance attestation. |
| Application tests | Verified locally | `npm test`: 100×4 coverage, zero lint warnings. |
| Kubernetes-style runtime test | Verified locally | Writable runtime state is separate from read-only static configuration. |
| Galera failure tests | Pending lab validation | SST/IST, quorum loss, shutdown, drain, and recovery scenarios. |
| Compose bootstrap default | Verified safe | Services do not configure startup initialization; first-node bootstrap is explicit. |
| Compose cluster restart/rejoin | Not passed | Existing persisted lab volumes still had the first node configured for bootstrap; the hardened image correctly refused it and the remaining nodes stayed non-Primary. |

## Rollback

Rollback uses the previous approved image digest and matching GitOps commit.
Do not enable initialization during rollback. The GitOps digest must not be
updated to this release until DevOps publishes and independently verifies the
image and the writable `/run/elera` mount is present in the candidate manifests.
