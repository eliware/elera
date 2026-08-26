# Release notes

## Unreleased

- Bootstrapped the minimal ESM supervisor project structure.
- Added shared logging/lifecycle and MariaDB client dependencies.
- Selected the standard Eliware Node 26 Bookworm-slim image convention and
  documented ConfigMap, Secret, and cert-manager integration requirements.
- MariaDB 12.3.1 is the selected target; release selection must follow the official
  MariaDB release listing and validate the matching Galera package.
