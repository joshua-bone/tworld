#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"

build_type="${TWORLD_LEGACY_BUILD_TYPE:-Debug}"
requested_oshw="${TWORLD_LEGACY_OSHW:-auto}"

build_only=0
forward_args=()

for arg in "$@"; do
  case "${arg}" in
    --build-only)
      build_only=1
      ;;
    *)
      forward_args+=("${arg}")
      ;;
  esac
done

configure_and_build() {
  local oshw="$1"
  local build_dir="$2"

  cmake -S "${repo_root}" -B "${build_dir}" -DOSHW="${oshw}" -DCMAKE_BUILD_TYPE="${build_type}"
  cmake --build "${build_dir}" -j
}

resolve_exe_name() {
  case "$1" in
    qt)
      echo "tworld2"
      ;;
    sdl)
      echo "tworld"
      ;;
    *)
      return 1
      ;;
  esac
}

resolve_exe_path() {
  local build_dir="$1"
  local exe_name="$2"
  local flat_path="${build_dir}/legacy_c/${exe_name}"
  local app_bundle_path="${build_dir}/legacy_c/${exe_name}.app/Contents/MacOS/${exe_name}"

  if [[ -x "${flat_path}" ]]; then
    echo "${flat_path}"
    return 0
  fi
  if [[ -x "${app_bundle_path}" ]]; then
    echo "${app_bundle_path}"
    return 0
  fi

  return 1
}

pick_oshw() {
  if [[ "${requested_oshw}" != "auto" ]]; then
    case "${requested_oshw}" in
      qt|sdl)
        echo "${requested_oshw}"
        return 0
        ;;
      *)
        echo "Unsupported TWORLD_LEGACY_OSHW: ${requested_oshw}" >&2
        echo "Use 'qt', 'sdl', or leave it unset for auto." >&2
        return 1
        ;;
    esac
  fi

  local qt_build_dir="${repo_root}/build/legacy-qt"
  if cmake -S "${repo_root}" -B "${qt_build_dir}" -DOSHW=qt -DCMAKE_BUILD_TYPE="${build_type}" >/dev/null 2>&1; then
    echo "qt"
    return 0
  fi

  local sdl_build_dir="${repo_root}/build/legacy-sdl"
  if cmake -S "${repo_root}" -B "${sdl_build_dir}" -DOSHW=sdl -DCMAKE_BUILD_TYPE="${build_type}" >/dev/null 2>&1; then
    echo "sdl"
    return 0
  fi

  echo "Could not configure legacy Tile World with either Qt or SDL." >&2
  echo "Install Qt5/6 or SDL development packages, or set TWORLD_LEGACY_OSHW explicitly once available." >&2
  return 1
}

oshw="$(pick_oshw)"
exe_name="$(resolve_exe_name "${oshw}")"
build_dir="${repo_root}/build/legacy-${oshw}"

configure_and_build "${oshw}" "${build_dir}"
exe_path="$(resolve_exe_path "${build_dir}" "${exe_name}" || true)"

if [[ -z "${exe_path}" ]]; then
  echo "Legacy executable not found after build for ${exe_name} in ${build_dir}" >&2
  exit 1
fi

if [[ "${build_only}" -eq 1 ]]; then
  echo "Built ${exe_path}"
  exit 0
fi

export TWORLDDIR="${repo_root}"
export TWORLDSAVEDIR="${repo_root}/save"

exec "${exe_path}" "${forward_args[@]}"
