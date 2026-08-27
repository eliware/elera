#!/bin/sh
set -eu

mkdir -p /lab/ssh /lab/exchange /lab/backups
if [ ! -f /lab/ssh/id_ed25519 ]; then
  ssh-keygen -q -t ed25519 -N '' -f /lab/ssh/id_ed25519
fi
cp /lab/ssh/id_ed25519.pub /lab/exchange/dev_authorized_key
chmod 0600 /lab/ssh/id_ed25519

exec tail -f /dev/null
