#!/bin/bash
# Wrapper che imposta il PATH per Node + Postgres prima di lanciare pnpm dev
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:/opt/homebrew/opt/postgresql@16/bin:$PATH"
cd "$(dirname "$0")"
exec pnpm dev
