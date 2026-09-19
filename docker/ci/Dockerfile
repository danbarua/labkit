FROM oven/bun:1.4.2

RUN apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

# Cloud Build checks out as root; git refuses a tree it thinks belongs to
# someone else, and says "not a repository" rather than why.
RUN git config --global --add safe.directory /workspace
