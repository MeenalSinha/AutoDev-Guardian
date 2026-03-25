# Sandbox Dockerfile for isolated code execution in the Auto-Research loop.
# This container runs untrusted generated code with no network access,
# limited CPU/memory, and a read-only filesystem except /tmp.
#
# Build: docker build -t autodev-sandbox ./sandbox
# Run:   docker run --rm --network none --memory 256m --cpus 0.5 \
#               --read-only --tmpfs /tmp:size=64m \
#               -v /path/to/code:/code:ro \
#               autodev-sandbox python /code/solution.py

FROM python:3.11-slim

# Security: no internet, no privileged access
RUN addgroup --system sandbox && adduser --system --ingroup sandbox sandboxuser

# Pre-install common packages so generated code can import them
RUN pip install --no-cache-dir \
    fastapi==0.109.2 \
    uvicorn==0.27.0 \
    pydantic==2.5.3 \
    requests==2.31.0 \
    sqlalchemy==2.0.23 \
    pytest==8.0.2 \
    pytest-json-report==1.5.0 \
    numpy \
    pandas

WORKDIR /code

USER sandboxuser

# Default: run benchmarks
CMD ["python", "-c", "print('Sandbox ready')"]
