#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-deploy}"

ALIYUN_PROFILE="${ALIYUN_PROFILE:-onsite-scheduler}"
ALIYUN_REGION="${ALIYUN_REGION:-cn-shanghai}"
APP_NAME="${ALIYUN_SAE_APP_NAME:-onsite-inspection-scheduler}"

ACR_REGISTRY="${ALIYUN_ACR_REGISTRY:-registry.${ALIYUN_REGION}.aliyuncs.com}"
ACR_NAMESPACE="${ALIYUN_ACR_NAMESPACE:-}"
ACR_REPO="${ALIYUN_ACR_REPO:-onsite-inspection-scheduler}"

SAE_APP_ID="${ALIYUN_SAE_APP_ID:-}"
SAE_NAMESPACE_ID="${ALIYUN_SAE_NAMESPACE_ID:-}"
SAE_CPU="${ALIYUN_SAE_CPU:-1000}"
SAE_MEMORY="${ALIYUN_SAE_MEMORY:-2048}"
SAE_REPLICAS="${ALIYUN_SAE_REPLICAS:-1}"
WORKSPACE_STATE_PATH="${WORKSPACE_STATE_PATH:-/data/workspace-state.json}"

DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
GIT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo local)"
IMAGE_TAG="${ALIYUN_IMAGE_TAG:-$(date +%Y%m%d%H%M%S)-${GIT_SHA}}"

SAE_HEALTH_PROBE='{"httpGet":{"path":"/api/health","port":3000,"scheme":"HTTP"},"initialDelaySeconds":20,"periodSeconds":30,"timeoutSeconds":5}'
SAE_LOG_CONFIG='[{"logDir":"","logType":"stdout"}]'

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy-aliyun-sae.sh check
  scripts/deploy-aliyun-sae.sh image
  scripts/deploy-aliyun-sae.sh deploy

Modes:
  check   Verify local Aliyun CLI and Docker readiness.
  image   Build and push the Docker image to ACR.
  deploy  Build, push, then create/update the SAE application.

Required env:
  ALIYUN_PROFILE
  ALIYUN_REGION
  ALIYUN_ACR_NAMESPACE
  ALIYUN_ACR_REPO

For deploying to SAE, provide one of:
  ALIYUN_SAE_APP_ID         Update an existing SAE app.
  ALIYUN_SAE_NAMESPACE_ID   Create a new SAE app.

Required for deploy:
  WORKSPACE_ADMIN_TOKEN     Token for workspace snapshot backup/restore.
  WORKSPACE_STATE_PATH      Persisted workspace snapshot path. Defaults to /data/workspace-state.json.
USAGE
}

info() {
  printf '\033[1;34m%s\033[0m\n' "$*"
}

warn() {
  printf '\033[1;33m%s\033[0m\n' "$*" >&2
}

fail() {
  printf '\033[1;31m%s\033[0m\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

aliyun_call() {
  aliyun "$@" --profile "$ALIYUN_PROFILE" --region "$ALIYUN_REGION" --yes
}

check_aliyun() {
  require_command aliyun
  info "Checking Aliyun CLI profile: ${ALIYUN_PROFILE} (${ALIYUN_REGION})"

  if ! aliyun configure list >/dev/null 2>&1; then
    fail "Aliyun CLI is installed but not configured. Run: aliyun configure --mode OAuth --profile ${ALIYUN_PROFILE} --oauth-site-type CN"
  fi

  if ! aliyun_call sts GetCallerIdentity >/dev/null 2>&1; then
    fail "Aliyun CLI profile cannot call STS. Check profile, region, and RAM permissions."
  fi
}

check_docker() {
  require_command docker
  info "Checking Docker daemon"
  docker info >/dev/null 2>&1 || fail "Docker daemon is not running. Start Docker Desktop, then rerun this script."
}

check_required_env() {
  [[ -n "$ACR_NAMESPACE" ]] || fail "Missing ALIYUN_ACR_NAMESPACE."
  [[ -n "$ACR_REPO" ]] || fail "Missing ALIYUN_ACR_REPO."
}

check_deploy_env() {
  [[ -n "${WORKSPACE_ADMIN_TOKEN:-}" ]] || fail "Missing WORKSPACE_ADMIN_TOKEN. Generate a strong random token before deploying."
  [[ -n "$WORKSPACE_STATE_PATH" ]] || fail "Missing WORKSPACE_STATE_PATH."
  warn "Before deploying, confirm the SAE app mounts persistent storage at $(dirname "$WORKSPACE_STATE_PATH")."
}

build_sae_envs() {
  WORKSPACE_ADMIN_TOKEN="$WORKSPACE_ADMIN_TOKEN" WORKSPACE_STATE_PATH="$WORKSPACE_STATE_PATH" node <<'NODE'
const env = {
  NODE_ENV: "production",
  PORT: "3000",
  HOSTNAME: "0.0.0.0",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_API_BASE_URL: "/api/backend",
  API_BASE_URL: "http://127.0.0.1:3000/api/backend",
  WORKSPACE_ADMIN_TOKEN: process.env.WORKSPACE_ADMIN_TOKEN,
  WORKSPACE_STATE_PATH: process.env.WORKSPACE_STATE_PATH
};
console.log(JSON.stringify(Object.entries(env).map(([name, value]) => ({ name, value: String(value) }))));
NODE
}

docker_login_if_needed() {
  if [[ -n "${ALIYUN_ACR_USERNAME:-}" && -n "${ALIYUN_ACR_PASSWORD:-}" ]]; then
    info "Logging in to ACR registry: ${ACR_REGISTRY}"
    printf '%s' "$ALIYUN_ACR_PASSWORD" | docker login "$ACR_REGISTRY" -u "$ALIYUN_ACR_USERNAME" --password-stdin
  else
    warn "Skipping docker login because ALIYUN_ACR_USERNAME / ALIYUN_ACR_PASSWORD are not both set."
    warn "If push fails, run docker login ${ACR_REGISTRY} or export registry credentials."
  fi
}

build_and_push_image() {
  check_required_env
  check_docker
  docker_login_if_needed

  IMAGE_URL="${ACR_REGISTRY}/${ACR_NAMESPACE}/${ACR_REPO}:${IMAGE_TAG}"
  info "Building image: ${IMAGE_URL}"
  docker build --platform "$DOCKER_PLATFORM" -t "$IMAGE_URL" .

  info "Pushing image to ACR"
  docker push "$IMAGE_URL"

  info "Image pushed: ${IMAGE_URL}"
}

deploy_to_sae() {
  check_aliyun
  check_required_env
  check_deploy_env

  IMAGE_URL="${ACR_REGISTRY}/${ACR_NAMESPACE}/${ACR_REPO}:${IMAGE_TAG}"
  SAE_ENVS="$(build_sae_envs)"

  if [[ -n "$SAE_APP_ID" ]]; then
    info "Deploying image to existing SAE app: ${SAE_APP_ID}"
    aliyun_call sae DeployApplication \
      --AppId "$SAE_APP_ID" \
      --PackageType Image \
      --ImageUrl "$IMAGE_URL" \
      --Cpu "$SAE_CPU" \
      --Memory "$SAE_MEMORY" \
      --Replicas "$SAE_REPLICAS" \
      --Envs "$SAE_ENVS" \
      --Readiness "$SAE_HEALTH_PROBE" \
      --Liveness "$SAE_HEALTH_PROBE" \
      --StartupProbe "$SAE_HEALTH_PROBE" \
      --SlsConfigs "$SAE_LOG_CONFIG" \
      --Timezone Asia/Shanghai
  else
    [[ -n "$SAE_NAMESPACE_ID" ]] || fail "Missing ALIYUN_SAE_APP_ID or ALIYUN_SAE_NAMESPACE_ID. Provide AppId to update an existing app, or NamespaceId to create a new app."

    info "Creating SAE app: ${APP_NAME} in namespace ${SAE_NAMESPACE_ID}"
    aliyun_call sae CreateApplication \
      --AppName "$APP_NAME" \
      --NamespaceId "$SAE_NAMESPACE_ID" \
      --PackageType Image \
      --ImageUrl "$IMAGE_URL" \
      --Replicas "$SAE_REPLICAS" \
      --Cpu "$SAE_CPU" \
      --Memory "$SAE_MEMORY" \
      --ProgrammingLanguage other \
      --Deploy true \
      --Envs "$SAE_ENVS" \
      --Readiness "$SAE_HEALTH_PROBE" \
      --Liveness "$SAE_HEALTH_PROBE" \
      --StartupProbe "$SAE_HEALTH_PROBE" \
      --SlsConfigs "$SAE_LOG_CONFIG" \
      --Timezone Asia/Shanghai
  fi

  info "SAE deployment request submitted."
  info "Next checks:"
  info "  aliyun sae ListApplications --AppName ${APP_NAME} --profile ${ALIYUN_PROFILE} --region ${ALIYUN_REGION}"
  info "  aliyun sae DescribeApplicationStatus --AppId <app-id> --profile ${ALIYUN_PROFILE} --region ${ALIYUN_REGION}"
}

case "$MODE" in
  check)
    check_aliyun
    check_docker
    info "Aliyun CLI and Docker are ready."
    ;;
  image)
    build_and_push_image
    ;;
  deploy)
    check_deploy_env
    build_and_push_image
    deploy_to_sae
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    fail "Unknown mode: ${MODE}"
    ;;
esac
