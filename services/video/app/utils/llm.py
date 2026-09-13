import os

from dotenv import load_dotenv
from openai import AzureOpenAI

load_dotenv()

_client = None
_anthropic_client = None


def call_llm(prompt: str) -> str:
    global _client, _anthropic_client

    load_dotenv()
    llm_provider = os.getenv("LLM_PROVIDER", "azure").lower()

    if llm_provider == "azure":
        api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2025-04-14")
        endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
        api_key = os.getenv("AZURE_OPENAI_API_KEY") or os.getenv("AZURE_API_KEY")
        deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT")

        if not endpoint:
            raise RuntimeError("AZURE_OPENAI_ENDPOINT is required")
        if not api_key:
            raise RuntimeError("AZURE_OPENAI_API_KEY is required")
        if not deployment_name:
            raise RuntimeError("AZURE_OPENAI_DEPLOYMENT is required")

        if _client is None:
            _client = AzureOpenAI(
                api_version=api_version,
                azure_endpoint=endpoint,
                api_key=api_key,
            )

        response = _client.chat.completions.create(
            model=deployment_name,
            messages=[{"role": "user", "content": prompt}],
        )

        content = response.choices[0].message.content
        if not content:
            raise RuntimeError("LLM returned an empty response")

        try:
            from utils.cost_tracker import get_tracker

            tracker = get_tracker()
            if tracker and response.usage:
                model_used = response.model or deployment_name
                tracker.add_llm_call(
                    prompt_tokens=response.usage.prompt_tokens,
                    completion_tokens=response.usage.completion_tokens,
                    model_name=model_used,
                )
        except Exception as e:
            print(f"[cost-tracker] Error recording LLM tokens: {e}")

        return content.strip()

    elif llm_provider in ("anthropic", "claude"):
        api_key = os.getenv("ANTHROPIC_API_KEY")
        anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-latest")

        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required when LLM_PROVIDER is anthropic/claude")

        if _anthropic_client is None:
            from anthropic import Anthropic

            _anthropic_client = Anthropic(api_key=api_key)

        response = _anthropic_client.messages.create(
            model=anthropic_model,
            max_tokens=16384,
            messages=[{"role": "user", "content": prompt}],
        )

        content = ""
        for block in response.content:
            if hasattr(block, "text"):
                content += block.text

        if not content:
            raise RuntimeError("LLM returned an empty response")

        try:
            from utils.cost_tracker import get_tracker

            tracker = get_tracker()
            if tracker and response.usage:
                tracker.add_llm_call(
                    prompt_tokens=response.usage.input_tokens,
                    completion_tokens=response.usage.output_tokens,
                    model_name=anthropic_model,
                )
        except Exception as e:
            print(f"[cost-tracker] Error recording LLM tokens: {e}")

        return content.strip()

    else:
        raise RuntimeError(f"Unsupported LLM_PROVIDER: {llm_provider}")