#!/usr/bin/env python3
"""
Send a >16K-token prompt to qwen3.6-27b via local New API gateway.

Usage:
  python3 test/large_context_demo.py
  python3 test/large_context_demo.py --target-tokens 20000
  BASE_URL=http://127.0.0.1:3000 API_KEY=sk-xxx python3 test/large_context_demo.py
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
DEFAULT_API_KEY = os.environ.get("API_KEY", "")
DEFAULT_MODEL = os.environ.get("MODEL", "qwen3.6-27b")

# Rough estimate for mixed Chinese text on Qwen-like tokenizers (~1.6 chars/token).
CHARS_PER_TOKEN = float(os.environ.get("CHARS_PER_TOKEN", "1.6"))


def estimate_tokens(text: str) -> int:
    return max(1, int(len(text) / CHARS_PER_TOKEN))


def build_large_prompt(target_tokens: int) -> str:
    paragraph = (
        "这是用于测试超长上下文请求的示例段落。"
        "我们需要向 qwen3.6-27b 发送超过 16K token 的输入，"
        "以验证 New API 网关和上游渠道在大上下文场景下的行为。"
        "请忽略重复内容，只需在收到完整输入后回复：已收到超长上下文测试。"
        "编号：{idx}。"
    )
    chunks: list[str] = []
    idx = 0
    while estimate_tokens("\n".join(chunks)) < target_tokens:
        chunks.append(paragraph.format(idx=idx))
        idx += 1
    return "\n".join(chunks)


def post_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    user_content: str,
    max_tokens: int,
    timeout: int,
) -> tuple[int, str, float]:
    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": user_content,
            }
        ],
        "max_tokens": max_tokens,
        "temperature": 0,
    }
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            elapsed = time.perf_counter() - started
            return resp.status, resp.read().decode("utf-8", errors="replace"), elapsed
    except urllib.error.HTTPError as exc:
        elapsed = time.perf_counter() - started
        detail = exc.read().decode("utf-8", errors="replace")
        return exc.code, detail, elapsed
    except urllib.error.URLError as exc:
        elapsed = time.perf_counter() - started
        return 0, json.dumps({"error": f"request failed: {exc}"}, ensure_ascii=False), elapsed


def main() -> int:
    parser = argparse.ArgumentParser(description="Large context demo for New API + Qwen")
    parser.add_argument(
        "--target-tokens",
        type=int,
        default=17000,
        help="Approximate input token count to generate (default: 17000)",
    )
    parser.add_argument(
        "--max-output-tokens",
        type=int,
        default=128,
        help="max_tokens for model response (default: 128)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=600,
        help="HTTP timeout in seconds (default: 600)",
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--api-key", default=DEFAULT_API_KEY)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    if not args.api_key.strip():
        print("Error: API_KEY is required. Set env API_KEY or pass --api-key.", file=sys.stderr)
        return 1

    if args.target_tokens <= 16000:
        print("Warning: target tokens <= 16000; bumping to 17000 for this demo.")
        args.target_tokens = 17000

    print("=== Large Context Demo ===")
    print(f"Base URL      : {args.base_url}")
    print(f"Model         : {args.model}")
    print(f"Target tokens : {args.target_tokens}")
    print(f"Token estimate: ~{args.target_tokens} chars/token ratio = {CHARS_PER_TOKEN}")
    print()

    user_content = build_large_prompt(args.target_tokens)
    input_chars = len(user_content)
    input_tokens = estimate_tokens(user_content)
    request_bytes = len(
        json.dumps(
            {
                "model": args.model,
                "messages": [{"role": "user", "content": user_content}],
                "max_tokens": args.max_output_tokens,
                "temperature": 0,
            },
            ensure_ascii=False,
        ).encode("utf-8")
    )

    print(f"Generated input chars  : {input_chars:,}")
    print(f"Estimated input tokens : {input_tokens:,}")
    print(f"Request JSON size      : {request_bytes:,} bytes ({request_bytes / 1024:.1f} KiB)")
    print()
    print("Sending request...")

    status, body, elapsed = post_chat_completion(
        base_url=args.base_url,
        api_key=args.api_key,
        model=args.model,
        user_content=user_content,
        max_tokens=args.max_output_tokens,
        timeout=args.timeout,
    )

    print(f"HTTP status : {status}")
    print(f"Elapsed     : {elapsed:.2f}s")
    print()
    print("=== Response body ===")

    try:
        parsed = json.loads(body)
        print(json.dumps(parsed, ensure_ascii=False, indent=2))
        if status == 200:
            content = (
                parsed.get("choices", [{}])[0]
                .get("message", {})
                .get("content", "")
            )
            if content:
                print()
                print("=== Model reply (first 500 chars) ===")
                print(content[:500])
    except json.JSONDecodeError:
        print(body)

    return 0 if status == 200 else 1


if __name__ == "__main__":
    sys.exit(main())
