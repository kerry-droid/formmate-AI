from dataclasses import dataclass
import json
import time
from urllib.request import Request, urlopen


def build_prompt(question, options):
    task = "Answer the question directly in a concise form."
    if options:
        task = "Choose the best answer from the provided options."
    return {
        "question": question,
        "options": options,
        "instruction": f"{task} Return JSON only with answer, explanation, and confidence from 0 to 1. Do not guess when uncertain.",
    }


@dataclass
class Answer:
    answer: str
    explanation: str
    confidence: float


class LocalProvider:
    def answer(self, question, options):
        return Answer(
            answer="",
            explanation="No AI provider is configured. Add an API key and select a provider to receive an answer.",
            confidence=0.0,
        )


class OpenAIProvider:
    def __init__(self, api_key, api_url):
        self.api_key = api_key
        self.api_url = api_url or "https://api.openai.com/v1/chat/completions"

    def answer(self, question, options):
        prompt = build_prompt(question, options)
        request = Request(
            self.api_url,
            data=json.dumps({
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": json.dumps(prompt)}],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            }).encode(),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
        result = json.loads(payload["choices"][0]["message"]["content"])
        return Answer(
            answer=str(result.get("answer", "")),
            explanation=str(result.get("explanation", "")),
            confidence=max(0.0, min(1.0, float(result.get("confidence", 0)))),
        )


class GeminiProvider:
    def __init__(self, api_key, model, api_url):
        from google import genai
        from google.genai import types

        self.api_key = api_key
        self.model = model
        self.client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=15000))

    def answer(self, question, options):
        prompt = build_prompt(question, options)
        for attempt in range(2):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=json.dumps(prompt),
                    config={"temperature": 0, "response_mime_type": "application/json"},
                )
                break
            except Exception as error:
                transient = any(marker in str(error) for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED"))
                if not transient or attempt == 1:
                    raise
                time.sleep(1)
        text = response.text.strip()
        result = json.loads(text.removeprefix("```json").removesuffix("```").strip())
        return Answer(
            answer=str(result.get("answer", "")),
            explanation=str(result.get("explanation", "")),
            confidence=max(0.0, min(1.0, float(result.get("confidence", 0)))),
        )


def get_provider(config):
    if config.get("AI_PROVIDER") == "gemini" and config.get("AI_API_KEY"):
        return GeminiProvider(config["AI_API_KEY"], config["AI_MODEL"], config.get("AI_API_URL", ""))
    if config.get("AI_PROVIDER") == "openai" and config.get("AI_API_KEY"):
        return OpenAIProvider(config["AI_API_KEY"], config.get("AI_API_URL", ""))
    return LocalProvider()
