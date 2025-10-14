#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICES_DIR="${ROOT_DIR}/services"

declare -a SERVICES=(
  "api-gateway"
  "code-analysis"
  "llm-service"
  "test-validation"
)

command="npm install"
if [[ ${1:-} == "--ci" ]]; then
  command="npm ci"
fi

echo "Running '${command}' for all services..."

for service in "${SERVICES[@]}"; do
  service_path="${SERVICES_DIR}/${service}"
  if [[ ! -d "${service_path}" ]]; then
    echo "Skipping ${service} (directory not found)."
    continue
  fi

  echo "----------------------------------------"
  echo "Installing dependencies in ${service}..."
  (cd "${service_path}" && ${command})
done

echo "----------------------------------------"
echo "Dependency installation complete."
