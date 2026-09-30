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


def build_batch_prompt(questions):
    return {
        "questions": [
            {"index": index, "question": item["question"].strip(), "options": item.get("options", [])}
            for index, item in enumerate(questions)
        ],
        "instruction": (
            "Answer every question. For questions with choices, copy the best choice exactly. "
            "For questions without choices, give a concise answer. If uncertain, use an empty answer "
            "and confidence 0. Return JSON only as {\"answers\":[{\"index\":0,\"answer\":\"...\","
            "\"explanation\":\"...\",\"confidence\":0.0}]}. Include exactly one item for every input index, "
            "in the same order, with brief explanations."
        ),
    }


@dataclass
class Answer:
    answer: str
    explanation: str
    confidence: float


def _read_answer(result):
    return Answer(
        answer=str(result.get("answer", "")),
        explanation=str(result.get("explanation", "")),
        confidence=max(0.0, min(1.0, float(result.get("confidence", 0)))),
    )


def _parse_json(text):
    return json.loads(text.strip().removeprefix("```json").removesuffix("```").strip())


def _parse_batch(text, count):
    payload = _parse_json(text)
    entries = payload.get("answers") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise ValueError("AI provider returned no answers list")
    parsed = [Answer("", "No reliable answer was returned.", 0.0) for _ in range(count)]
    for fallback_index, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        index = entry.get("index", fallback_index)
        if not isinstance(index, int) or index < 0 or index >= count:
            continue
        try:
            parsed[index] = _read_answer(entry)
        except (TypeError, ValueError):
            parsed[index] = Answer("", "The provider returned an invalid confidence score.", 0.0)
    return parsed


class LocalProvider:
    def answer(self, question, options):
        return Answer(
            answer="",
            explanation="No AI provider is configured. Add an API key and select a provider to receive an answer.",
            confidence=0.0,
        )

    def answer_many(self, questions):
        return [self.answer(item["question"], item.get("options", [])) for item in questions]


class OpenAIProvider:
    def __init__(self, api_key, api_url):
        self.api_key = api_key
        self.api_url = api_url or "https://api.openai.com/v1/chat/completions"

    def _complete(self, prompt):
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
        return _parse_json(payload["choices"][0]["message"]["content"])

    def answer(self, question, options):
        return _read_answer(self._complete(build_prompt(question, options)))

    def answer_many(self, questions):
        payload = self._complete(build_batch_prompt(questions))
        return _parse_batch(json.dumps(payload), len(questions))


class GeminiProvider:
    def __init__(self, api_key, model, api_url):
        from google import genai
        from google.genai import types

        self.api_key = api_key
        self.model = model
        self.client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=30000))

    def _generate(self, prompt):
        for attempt, delay in enumerate((1.5, 3)):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=json.dumps(prompt),
                    config={"temperature": 0, "response_mime_type": "application/json"},
                )
                return response.text
            except Exception as error:
                transient = any(marker in str(error) for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED"))
                if not transient or attempt == 1:
                    raise
                time.sleep(delay)

    def answer(self, question, options):
        return _read_answer(_parse_json(self._generate(build_prompt(question, options))))

    def answer_many(self, questions):
        return _parse_batch(self._generate(build_batch_prompt(questions)), len(questions))


def get_provider(config):
    if config.get("AI_PROVIDER") == "gemini" and config.get("AI_API_KEY"):
        return GeminiProvider(config["AI_API_KEY"], config["AI_MODEL"], config.get("AI_API_URL", ""))
    if config.get("AI_PROVIDER") == "openai" and config.get("AI_API_KEY"):
        return OpenAIProvider(config["AI_API_KEY"], config.get("AI_API_URL", ""))
    return LocalProvider()
