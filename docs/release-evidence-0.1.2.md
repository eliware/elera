# Elera 0.1.2 release evidence

This release adds fail-closed persistent-data startup behavior. The following
must be completed by DevOps before production approval.

| Item | Status | Evidence |
| --- | --- | --- |
| Source commit | Required at release | Record the exact Git commit used to build the image. |
| Image digest | Required at release | Record the final registry digest after publication. |
| Runtime identity | Verified locally | UID 100 / GID 101 (`mysql`). |
| MariaDB package | Build input | MariaDB 12.3.3 repository configuration. |
| Galera package | Build input | `galera-4` package from the configured repository. |
| Target architecture | Required at release | Record each published platform manifest. |
| Base image | Required at release | Record the exact Node.js 26 Bookworm image digest. |
| SBOM | Required at release | Attach the generated image SBOM. |
| Vulnerability scan | Required at release | Attach the scanner report and acceptance decision. |
| Independent digest verification | Required at release | Verify the registry digest from an independent client. |
| Signing/attestation | Required at release | Attach image signature and provenance attestation. |
| Application tests | Verified locally | `npm test`: 100×4 coverage, zero lint warnings. |
| Data-directory safety tests | Verified locally | All supported directory states and bootstrap modes are covered. |
| Galera failure tests | Pending lab validation | SST/IST, quorum loss, shutdown, drain, and recovery scenarios. |

## Build and verification

Build from the repository root with `docker build -f Dockerfile .`. Run
`npm test`, record the source commit, generate the SBOM and vulnerability
report, publish by immutable digest, and independently verify that digest
before updating GitOps.

## Rollback and limitations

Rollback uses the previous approved image digest and matching GitOps commit.
Do not enable `ELERA_BOOTSTRAP` during rollback. The image does not repair
stale or corrupted data and does not claim SST/IST or Kubernetes failure
behavior until the isolated lab evidence is attached.
