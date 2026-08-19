FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

ARG DEBIAN_FRONTEND=noninteractive
ARG SOURCE_URL=https://github.com/joshua-bone/tworld
ARG VCS_REF=unknown

LABEL org.opencontainers.image.title="tworld native CI toolchain" \
      org.opencontainers.image.description="Ubuntu toolchain for tworld Qt5, Qt6, and SDL1 CI builds" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="GPL-2.0-or-later"

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    cmake \
    git \
    libgl1-mesa-dev \
    libsdl1.2-dev \
    libsdl2-dev \
    qt6-base-dev \
    qtbase5-dev \
  && rm -rf /var/lib/apt/lists/*
