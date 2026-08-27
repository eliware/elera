# Elera 0.1.3 release evidence

This release separates writable supervisor runtime state from static
configuration so Kubernetes ConfigMap mounts can remain read-only.

| Item | Status | Evidence |
| --- | --- | --- |
| Source commit | Required at release | Record the exact Git commit used to build the image. |
| Image digest | Required at release | Record the final registry digest after publication. |
| Runtime identity | Verified locally | UID 100 / GID 101 (`mysql`). |
| Writable runtime path | Verified in source/tests | `/run/elera`, owned by `100:101`; Kubernetes must mount it writable. |
| Static configuration path | Verified in source/docs | `/etc/elera`; may be a read-only ConfigMap mount. |
| MariaDB package | Build input | MariaDB 12.3.3 repository configuration. |
| Galera package | Build input | `galera-4` package from the configured repository. |
| Target architecture | Required at release | Record each published platform manifest. |
| Base image | Required at release | Record the exact Node.js 26 Bookworm image digest. |
| SBOM | Required at release | Attach the generated image SBOM. |
| Vulnerability scan | Required at release | Attach the scanner report and acceptance decision. |
| Independent digest verification | Required at release | Verify the registry digest from an independent client. |
| Signing/attestation | Required at release | Attach image signature and provenance attestation. |
| Application tests | Verified locally | `npm test`: 100×4 coverage, zero lint warnings. |
| Kubernetes-style runtime test | Verified locally | Writable runtime state is separate from read-only static configuration. |
| Galera failure tests | Pending lab validation | SST/IST, quorum loss, shutdown, drain, and recovery scenarios. |

## Rollback

Rollback uses the previous approved image digest and matching GitOps commit.
Do not enable `ELERA_BOOTSTRAP` during rollback. The GitOps digest must not be
updated to this release until DevOps publishes and independently verifies the
image and the writable `/run/elera` mount is present in the candidate manifests.
