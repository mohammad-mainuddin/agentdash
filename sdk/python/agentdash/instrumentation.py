"""
Auto-instrumentation helpers for popular LLM SDKs and MCP servers.
Wraps SDK clients to automatically emit AgentDash events.
"""

import time
from datetime import datetime, timezone
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


class MCPInstrumentation:
    """
    Wraps an MCP ClientSession so every call_tool() and read_resource() is
    automatically logged to AgentDash as an mcp_call event.

    Works with async MCP sessions (mcp.ClientSession from the mcp package).

    Usage:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.stdio import stdio_client
        from agentdash import AgentDash, MCPInstrumentation

        dash = AgentDash(url="http://localhost:4242")

        async with stdio_client(StdioServerParameters(command="npx", args=["-y", "@modelcontextprotocol/server-filesystem", "/tmp"])) as (r, w):
            async with ClientSession(r, w) as session:
                await session.initialize()
                with dash.start_run("mcp-agent") as run:
                    session = MCPInstrumentation(run, server_name="filesystem").wrap(session)
                    result = await session.call_tool("read_file", {"path": "/tmp/hello.txt"})
    """

    def __init__(self, target: Target, server_name: str = "mcp"):
        self._target = target
        self._server_name = server_name

    def wrap(self, session):
        """Patch session.call_tool and session.read_resource in-place and return the session."""
        original_call_tool     = session.call_tool
        original_read_resource = session.read_resource
        target = self._target
        server = self._server_name

        async def patched_call_tool(name, arguments=None, **kwargs):
            t0 = time.time()
            error = None
            result = None
            try:
                result = await original_call_tool(name, arguments, **kwargs)
                return result
            except Exception as e:
                error = str(e)
                raise
            finally:
                duration_ms = int((time.time() - t0) * 1000)
                output = None
                if result is not None:
                    if hasattr(result, "content"):
                        output = [
                            c.model_dump() if hasattr(c, "model_dump") else str(c)
                            for c in result.content
                        ]
                    else:
                        output = str(result)
                target.mcp_call(
                    server=server,
                    tool=name,
                    kind="tool",
                    input=arguments or {},
                    output=output,
                    duration_ms=duration_ms,
                    error=error,
                )

        async def patched_read_resource(uri, **kwargs):
            t0 = time.time()
            error = None
            result = None
            try:
                result = await original_read_resource(uri, **kwargs)
                return result
            except Exception as e:
                error = str(e)
                raise
            finally:
                duration_ms = int((time.time() - t0) * 1000)
                output = None
                if result is not None:
                    if hasattr(result, "contents"):
                        output = [
                            c.model_dump() if hasattr(c, "model_dump") else str(c)
                            for c in result.contents
                        ]
                    else:
                        output = str(result)
                target.mcp_call(
                    server=server,
                    tool=str(uri),
                    kind="resource",
                    input={"uri": str(uri)},
                    output=output,
                    duration_ms=duration_ms,
                    error=error,
                )

        session.call_tool     = patched_call_tool
        session.read_resource = patched_read_resource
        return session
