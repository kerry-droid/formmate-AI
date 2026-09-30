from concurrent.futures import ThreadPoolExecutor
import time

from flask import Blueprint, current_app, jsonify, request

from ..services.ai_service import get_provider

answer_bp = Blueprint("answer", __name__)


def validate_question(payload):
    if not isinstance(payload, dict):
        return "Request body must be a JSON object."
    question = payload.get("question")
    if not isinstance(question, str) or not question.strip():
        return "question must be a non-empty string."
    options = payload.get("options", [])
    if not isinstance(options, list) or any(not isinstance(option, str) for option in options):
        return "options must be a list of strings."
    if len(question) > 4000 or len(options) > 100:
        return "Question or options exceed the allowed size."
    return None


def answer_question(payload):
    error = validate_question(payload)
    if error:
        return jsonify(error=error), 400
    try:
        result = get_provider(current_app.config).answer(payload["question"].strip(), payload.get("options", []))
    except Exception as error:
        if any(marker in str(error) for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED")):
            return jsonify(error="The AI provider is temporarily busy. Please try again in a moment."), 503
        return jsonify(error="The AI provider request failed. Check the provider, model, and API key."), 502
    return jsonify(answer=result.answer, explanation=result.explanation, confidence=result.confidence)


@answer_bp.post("/answer")
def answer():
    return answer_question(request.get_json(silent=True))


@answer_bp.post("/answers")
def answers():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get("questions"), list):
        return jsonify(error="questions must be a list."), 400
    questions = payload["questions"]
    if len(questions) > 50:
        return jsonify(error="A maximum of 50 questions is allowed."), 400
    for question in questions:
        error = validate_question(question)
        if error:
            return jsonify(error=error), 400

    app_config = dict(current_app.config)

    def answer_one(question):
        for attempt in range(2):
            try:
                result = get_provider(app_config).answer(question["question"].strip(), question.get("options", []))
                return {"answer": result.answer, "explanation": result.explanation, "confidence": result.confidence}
            except Exception as error:
                transient = any(marker in str(error) for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED"))
                if not transient or attempt == 1:
                    raise
                time.sleep(1.5)

    try:
        if not questions:
            return jsonify(answers=[])
        # Three parallel requests reduce wait time for long quizzes while
        # staying below the burst level that previously caused provider throttling.
        # Temporary provider errors are retried once per question above.
        with ThreadPoolExecutor(max_workers=min(3, len(questions))) as executor:
            results = list(executor.map(answer_one, questions))
    except Exception as error:
        if any(marker in str(error) for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED")):
            return jsonify(error="The AI provider is temporarily busy. Please try again in a moment."), 503
        return jsonify(error="The AI provider request failed. Check the provider, model, and API key."), 502
    return jsonify(answers=results)
