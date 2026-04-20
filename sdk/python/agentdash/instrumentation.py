"""
Auto-instrumentation helpers for popular LLM SDKs and MCP servers.
Wraps SDK clients to automatically emit AgentDash events with cost tracking.
"""

from __future__ import annotations
import json
import time
from typing import TYPE_CHECKING, Union

if TYPE_CHECKING:
    from .run import AgentRun
    from .span import Span

Target = Union["AgentRun", "Span"]

# Per-model pricing: (input $/M tokens, output $/M tokens)
_MODEL_PRICING: dict[str, tuple[float, float]] = {
    # Anthropic
    "claude-opus-4-7":            (15.0,  75.0),
    "claude-sonnet-4-6":          (3.0,   15.0),
    "claude-haiku-4-5-20251001":  (0.8,    4.0),
    "claude-3-5-sonnet-20241022": (3.0,   15.0),
    "claude-3-5-haiku-20241022":  (0.8,    4.0),
    "claude-3-opus-20240229":     (15.0,  75.0),
    "claude-3-sonnet-20240229":   (3.0,   15.0),
    "claude-3-haiku-20240307":    (0.25,   1.25),
    # OpenAI
    "gpt-4o":                     (2.5,   10.0),
    "gpt-4o-mini":                (0.15,   0.6),
    "gpt-4-turbo":                (10.0,  30.0),
    "gpt-4":                      (30.0,  60.0),
    "gpt-3.5-turbo":              (0.5,    1.5),
    "o1":                         (15.0,  60.0),
    "o1-mini":                    (3.0,   12.0),
    "o3-mini":                    (1.1,    4.4),
}


def _compute_cost(model: str, in_tok: int, out_tok: int) -> float:
    pricing = _MODEL_PRICING.get(model)
    if not pricing:
        # strip date suffix and try prefix match (e.g. "claude-sonnet-4-6-20250514")
        for key, val in _MODEL_PRICING.items():
            if model.startswith(key):
                pricing = val
                break
    if not pricing:
        return 0.0
    in_price, out_price = pricing
    return round((in_tok * in_price + out_tok * out_price) / 1_000_000, 8)


class AnthropicInstrumentation:
    """
    Patches an Anthropic client so every messages.create() call is automatically
    logged to AgentDash with real token counts, cost, full prompt/response,
    and any tool-use blocks.

    Usage:
        import anthropic
        from agentdash import AgentDash, AnthropicInstrumentation

        dash   = AgentDash(url="http://localhost:4242")
        client = anthropic.Anthropic()

        with dash.start_run("my-agent") as run:
            client = AnthropicInstrumentation(run).wrap(client)
            response = client.messages.create(...)  # auto-tracked
    """

    def __init__(self, target: Target):
        self._target = target

    def wrap(self, client):
        original = client.messages.create
        target   = self._target

        def patched(*args, **kwargs):
            messages = list(kwargs.get("messages", args[0] if args else []))
            t0       = time.time()
            response = original(*args, **kwargs)
            duration_ms = int((time.time() - t0) * 1000)

            in_tok  = response.usage.input_tokens
            out_tok = response.usage.output_tokens
            model   = response.model
            cost    = _compute_cost(model, in_tok, out_tok)

            response_text = " ".join(
                b.text for b in response.content if hasattr(b, "text")
            )

            # Full llm_call event for the Prompts tab
            target.llm_call(
                model=model,
                messages=messages,
                response=response_text,
                input_tokens=in_tok,
                output_tokens=out_tok,
                cost_usd=cost,
                duration_ms=duration_ms,
            )

            # Summary log for the Logs tab
            cost_str = f" · ${cost:.4f}" if cost > 0 else ""
            target.log(
                f"[anthropic] {model} — {in_tok} in / {out_tok} out tokens{cost_str} ({duration_ms}ms)"
            )

            for block in response.content:
                if block.type == "tool_use":
                    target.tool_call(
                        tool=block.name,
                        input=block.input,
                        output=None,
                        duration_ms=0,
                    )

            return response

        client.messages.create = patched
        return client


class OpenAIInstrumentation:
    """
    Patches an OpenAI client so every chat.completions.create() call is
    automatically logged to AgentDash with real token counts and cost.

    Usage:
        import openai
        from agentdash import AgentDash, OpenAIInstrumentation

        dash   = AgentDash(url="http://localhost:4242")
        client = openai.OpenAI()

        with dash.start_run("my-agent") as run:
            client = OpenAIInstrumentation(run).wrap(client)
    """

    def __init__(self, target: Target):
        self._target = target

    def wrap(self, client):
        original = client.chat.completions.create
        target   = self._target

        def patched(*args, **kwargs):
            messages = list(kwargs.get("messages", []))
            t0       = time.time()
            response = original(*args, **kwargs)
            duration_ms = int((time.time() - t0) * 1000)

            usage   = response.usage
            model   = response.model
            in_tok  = usage.prompt_tokens
            out_tok = usage.completion_tokens
            cost    = _compute_cost(model, in_tok, out_tok)

            response_text = " ".join(
                c.message.content or ""
                for c in response.choices
                if hasattr(c.message, "content") and c.message.content
            )

            target.llm_call(
                model=model,
                messages=messages,
                response=response_text,
                input_tokens=in_tok,
                output_tokens=out_tok,
                cost_usd=cost,
                duration_ms=duration_ms,
            )

            cost_str = f" · ${cost:.4f}" if cost > 0 else ""
            target.log(
                f"[openai] {model} — {in_tok} in / {out_tok} out tokens{cost_str} ({duration_ms}ms)"
            )

            for choice in response.choices:
                tool_calls = getattr(choice.message, "tool_calls", None) or []
                for tc in tool_calls:
                    target.tool_call(
                        tool=tc.function.name,
                        input=json.loads(tc.function.arguments or "{}"),
                        output=None,
                        duration_ms=0,
                    )

            return response

        client.chat.completions.create = patched
        return client


class MCPInstrumentation:
    """
    Wraps an MCP ClientSession so every call_tool() and read_resource() is
    automatically logged to AgentDash as an mcp_call event.

    Works with async MCP sessions (mcp.ClientSession from the mcp package).

    Usage:
        session = MCPInstrumentation(run, server_name="filesystem").wrap(session)
        result  = await session.call_tool("read_file", {"path": "/tmp/hello.txt"})
    """

    def __init__(self, target: Target, server_name: str = "mcp"):
        self._target      = target
        self._server_name = server_name

    def wrap(self, session):
        original_call_tool     = session.call_tool
        original_read_resource = session.read_resource
        target = self._target
        server = self._server_name

        async def patched_call_tool(name, arguments=None, **kwargs):
            t0 = time.time(); error = None; result = None
            try:
                result = await original_call_tool(name, arguments, **kwargs)
                return result
            except Exception as e:
                error = str(e); raise
            finally:
                duration_ms = int((time.time() - t0) * 1000)
                output = None
                if result is not None:
                    output = ([c.model_dump() if hasattr(c, "model_dump") else str(c)
                               for c in result.content]
                              if hasattr(result, "content") else str(result))
                target.mcp_call(server=server, tool=name, kind="tool",
                                input=arguments or {}, output=output,
                                duration_ms=duration_ms, error=error)

        async def patched_read_resource(uri, **kwargs):
            t0 = time.time(); error = None; result = None
            try:
                result = await original_read_resource(uri, **kwargs)
                return result
            except Exception as e:
                error = str(e); raise
            finally:
                duration_ms = int((time.time() - t0) * 1000)
                output = None
                if result is not None:
                    output = ([c.model_dump() if hasattr(c, "model_dump") else str(c)
                               for c in result.contents]
                              if hasattr(result, "contents") else str(result))
                target.mcp_call(server=server, tool=str(uri), kind="resource",
                                input={"uri": str(uri)}, output=output,
                                duration_ms=duration_ms, error=error)

        session.call_tool     = patched_call_tool
        session.read_resource = patched_read_resource
        return session
