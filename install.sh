#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SKIP_SKILL_INSTALL=${MIFFY_SKIP_SKILL_INSTALL:-0}
USER_HOME=${HOME:-$PWD}

install_skill() {
  target=$1
  parent=$(dirname -- "$target")
  mkdir -p "$parent"
  rm -rf -- "$target"
  mkdir -p "$target"
  cp -R "$ROOT/skills/miffy-video-intel/." "$target/"
  echo "Skill installed: $target"
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/^v//')
NODE_MAJOR=${NODE_VERSION%%.*}
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required. Current version: $NODE_VERSION" >&2
  exit 1
fi

cd "$ROOT"
npm install
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Fill it with local Feishu values."
fi

if [ "$SKIP_SKILL_INSTALL" != "1" ]; then
  CODEX_HOME=${CODEX_HOME:-"$USER_HOME/.codex"}
  CODEX_SKILLS=${MIFFY_SKILLS_DIR:-"$CODEX_HOME/skills"}
  install_skill "$CODEX_SKILLS/miffy-video-intel"

  if [ -n "${CLAUDE_SKILLS_DIR:-}" ]; then
    install_skill "$CLAUDE_SKILLS_DIR/miffy-video-intel"
  elif [ -d "$USER_HOME/.claude/skills" ]; then
    install_skill "$USER_HOME/.claude/skills/miffy-video-intel"
  fi

  if [ -n "${MUSE_SKILLS_DIR:-}" ]; then
    install_skill "$MUSE_SKILLS_DIR/miffy-video-intel"
  fi
fi

chmod +x bin/miffy-video.mjs

cat <<'MESSAGE'

Next steps:
1. Edit .env with your Feishu app and Bitable values.
2. npm run doctor
3. npm run validate:examples
4. npm run dry-run
MESSAGE
