# NVIDIA SkillSpector, the skill scanner of our intake procedure (D13, D16).
# Procedure: security/skill-intake/README.md. Built and run by tools/skill-intake/scan.sh.
#
# Everything that decides the content of the image is pinned:
# - the source by its full commit SHA (the commit of tag v2.12.0);
# - both base images by the digest of their multi-arch index;
# - every Python dependency by upstream's committed uv.lock (`uv sync --frozen` installs the
#   locked versions and verifies their hashes). Upstream's own Dockerfile runs `pip install .`,
#   which resolves the dependency ranges anew on every build.
#
# To upgrade the scanner: change the version, the commit and (if upstream moved them) the
# digests together, then re-scan every registry entry (security/skill-intake/README.md).

ARG SKILLSPECTOR_VERSION=2.12.0
ARG SKILLSPECTOR_COMMIT=c7958a3268d9498644b22edb75d0f051bbc8cbfc

FROM ghcr.io/astral-sh/uv:0.12.22@sha256:f513a91fc62fe7c17567eee97230dd198e43edb8a9fbecca843714a4358fe1bc AS uv

# The same Python image that upstream's Dockerfile pins at this commit.
FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b AS builder
ARG SKILLSPECTOR_COMMIT
# A full commit SHA is content-addressed: git verifies what it fetched.
ADD https://github.com/NVIDIA/SkillSpector.git#${SKILLSPECTOR_COMMIT} /src
WORKDIR /src
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON=/usr/local/bin/python3 \
    UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    UV_NO_CACHE=1
RUN --mount=from=uv,source=/uv,target=/usr/local/bin/uv \
    uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b
ARG SKILLSPECTOR_VERSION
ARG SKILLSPECTOR_COMMIT
# No git and no CA certificates on top of the base image: we scan local folders only, offline.
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1
# Fail the build if the pinned commit is not the pinned version.
RUN skillspector --version | grep -F "${SKILLSPECTOR_VERSION}" \
    || { echo "the pinned commit is not SkillSpector ${SKILLSPECTOR_VERSION}" >&2; exit 1; }
LABEL whz.skillspector.version="${SKILLSPECTOR_VERSION}" \
      whz.skillspector.commit="${SKILLSPECTOR_COMMIT}"
USER 65534:65534
WORKDIR /scan
ENTRYPOINT ["skillspector"]
