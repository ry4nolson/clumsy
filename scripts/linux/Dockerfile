FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl file git pkg-config rpm wget xdg-utils \
    libayatana-appindicator3-dev librsvg2-dev libssl-dev libwebkit2gtk-4.1-dev libxdo-dev \
    dbus-x11 fonts-dejavu-core imagemagick xdotool xvfb \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g corepack@latest && corepack enable

ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --component clippy

ENV CARGO_TARGET_DIR=/target APPIMAGE_EXTRACT_AND_RUN=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
WORKDIR /work
