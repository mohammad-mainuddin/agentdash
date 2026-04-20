"""
Auto-instrumentation helpers for popular LLM SDKs.
Wraps SDK clients to automatically emit AgentDash events.
"""

import time
from typing import TYPE_CHECKING, Union

if TYPE_CHECKING:
    from .run import AgentRun
    from .span import Span

Target = Union["AgentRun", "Span"]


class AnthropicInstrumentation:
    """
    Patches an Anthropic client so every messages.create() call is automatically
    logged to AgentDash with real token counts and tool-use blocks.

    Usage:
        import anthropic
        from agentdash import AgentDash, AnthropicInstrumentation

        dash   = AgentDash(url="http://localhost:4242")
        client = anthropic.Anthropic()

        with dash.start_run("my-agent") as run:
            instr = AnthropicInstrumentation(run)
            client = instr.wrap(client)
            # all client.messages.create() calls are now tracked
    """

    def __init__(self, target: Target):
        self._target = target

    def wrap(self, client):
        """Patch client.messages.create in-place and return the client."""
        original = client.messages.create
        target = self._target

        def patched(*args, **kwargs):
            t0 = time.time()
            response = original(*args, **kwargs)
            duration_ms = int((time.time() - t0) * 1000)

            in_tok  = response.usage.input_tokens
            out_tok = response.usage.output_tokens
            model   = response.model

            target.log(
                f"[anthropic] {model} — {in_tok} in / {out_tok} out tokens ({duration_ms}ms)"
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
    automatically logged to AgentDash with real token counts.

    Usage:
        import openai
        from agentdash import AgentDash, OpenAIInstrumentation

        dash   = AgentDash(url="http://localhost:4242")
        client = openai.OpenAI()

        with dash.start_run("my-agent") as run:
            instr = OpenAIInstrumentation(run)
            client = instr.wrap(client)
    """

    def __init__(self, target: Target):
        self._target = target

    def wrap(self, client):
        original = client.chat.completions.create
        target = self._target

        def patched(*args, **kwargs):
            t0 = time.time()
            response = original(*args, **kwargs)
            duration_ms = int((time.time() - t0) * 1000)

            usage = response.usage
            model = response.model

            target.log(
                f"[openai] {model} — {usage.prompt_tokens} in / {usage.completion_tokens} out tokens ({duration_ms}ms)"
            )

            for choice in response.choices:
                tool_calls = getattr(choice.message, "tool_calls", None) or []
                for tc in tool_calls:
                    import json
                    target.tool_call(
                        tool=tc.function.name,
                        input=json.loads(tc.function.arguments or "{}"),
                        output=None,
                        duration_ms=0,
                    )

            return response

        client.chat.completions.create = patched
        return client
