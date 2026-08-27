#!/bin/sh
set -eu

mkdir -p /run/sshd /root/.ssh /srv/backups
ssh-keygen -A
until [ -s /lab/exchange/dev_authorized_key ]; do sleep 1; done
cp /lab/exchange/dev_authorized_key /root/.ssh/authorized_keys
chmod 0700 /root/.ssh
chmod 0600 /root/.ssh/authorized_keys

exec /usr/sbin/sshd -D -e
