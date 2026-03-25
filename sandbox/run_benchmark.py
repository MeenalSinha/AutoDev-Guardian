#!/usr/bin/env python3
"""
Sandbox benchmark runner.
Usage: python run_benchmark.py /code/solution.py [--runs 5] [--timeout 30]

Runs the code with timeit + tracemalloc and prints JSON metrics to stdout.
Designed to be executed inside the sandbox container with:
  docker run --rm --network none --memory 256m --cpus 0.5 \
    -v /tmp/code:/code:ro autodev-sandbox \
    python /sandbox/run_benchmark.py /code/solution.py
"""
import argparse
import json
import os
import statistics
import sys
import timeit
import tracemalloc


def benchmark(code_path: str, runs: int = 5) -> dict:
    with open(code_path) as f:
        code = f.read()

    times = []
    for _ in range(runs):
        try:
            t = timeit.timeit(code, number=1, globals={})
            times.append(t * 1000)
        except Exception as e:
            times.append(9999.0)
            print(f"[WARN] execution error: {e}", file=sys.stderr)

    tracemalloc.start()
    try:
        exec(compile(code, code_path, "exec"), {})
        _, peak = tracemalloc.get_traced_memory()
        memory_mb = peak / 1024 / 1024
    except Exception:
        memory_mb = 0.0
    finally:
        tracemalloc.stop()

    median_ms = statistics.median(times)
    return {
        "execution_time_ms": round(median_ms, 3),
        "memory_mb": round(memory_mb, 3),
        "throughput_rps": round(1000 / max(median_ms, 0.001) * 10, 1),
        "exit_code": 0 if all(t < 9999 for t in times) else 1,
        "runs": runs,
        "times_ms": [round(t, 3) for t in times],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("code_path", help="Path to Python file to benchmark")
    parser.add_argument("--runs", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()

    if not os.path.exists(args.code_path):
        print(json.dumps({"error": f"File not found: {args.code_path}",
                          "exit_code": 1}))
        sys.exit(1)

    result = benchmark(args.code_path, args.runs)
    print(json.dumps(result))
