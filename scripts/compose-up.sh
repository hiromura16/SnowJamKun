#!/usr/bin/env bash
# 複数ユーザーで同一ホスト上にクローンしても干渉しないよう、
# ユーザー名を含んだプロジェクト名で docker compose を実行するヘルパー。
# 使い方: ./scripts/compose-up.sh [docker compose の引数] （省略時は up --build）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_CMD=("up" "--build")
if [[ $# -eq 0 ]]; then
  set -- "${DEFAULT_CMD[@]}"
fi

USER_NAME="$(id -un 2>/dev/null || echo user)"
PROJECT_SUFFIX="${PROJECT_SUFFIX:-${USER_NAME}-$(basename "$ROOT_DIR")}"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-snowjamkun-${PROJECT_SUFFIX}}"

echo "Using project name: ${PROJECT_NAME}" 1>&2

exec docker compose -p "${PROJECT_NAME}" "$@"
