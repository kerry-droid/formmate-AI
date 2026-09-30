import pytest

from app import create_app


@pytest.fixture()
def client():
    app = create_app({"TESTING": True, "CORS_ORIGINS": "*", "AI_PROVIDER": "local", "AI_API_KEY": ""})
    return app.test_client()


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json == {"status": "ok"}


def test_answer_uses_local_provider(client):
    response = client.post("/api/answer", json={"question": "Pick one", "options": ["A", "B"]})
    assert response.status_code == 200
    assert response.json["answer"] == ""
    assert response.json["confidence"] == 0


def test_answer_rejects_invalid_payload(client):
    response = client.post("/api/answer", json={"question": ""})
    assert response.status_code == 400
    assert "error" in response.json


def test_answers_processes_multiple_questions(client):
    response = client.post("/api/answers", json={"questions": [{"question": "One"}, {"question": "Two"}]})
    assert response.status_code == 200
    assert len(response.json["answers"]) == 2


def test_answers_limits_concurrency_and_retries_transient_provider_errors(monkeypatch):
    import importlib
    import threading
    from types import SimpleNamespace

    answer_module = importlib.import_module("app.routes.answer")
    lock = threading.Lock()
    state = {"active": 0, "peak": 0, "attempts": {}}

    class FlakyProvider:
        def answer(self, question, options):
            with lock:
                state["active"] += 1
                state["peak"] = max(state["peak"], state["active"])
                state["attempts"][question] = state["attempts"].get(question, 0) + 1
                attempt = state["attempts"][question]
            try:
                if attempt == 1:
                    raise RuntimeError("429 RESOURCE_EXHAUSTED")
                return SimpleNamespace(answer=question, explanation="ok", confidence=1.0)
            finally:
                with lock:
                    state["active"] -= 1

    monkeypatch.setattr(answer_module, "get_provider", lambda config: FlakyProvider())
    monkeypatch.setattr(answer_module.time, "sleep", lambda _seconds: None)
    app = create_app({"TESTING": True, "AI_PROVIDER": "local", "AI_API_KEY": "", "CORS_ORIGINS": "*"})
    questions = [{"question": f"Question {i}", "options": ["A", "B", "C", "D"]} for i in range(20)]

    response = app.test_client().post("/api/answers", json={"questions": questions})

    assert response.status_code == 200
    assert [item["answer"] for item in response.json["answers"]] == [item["question"] for item in questions]
    assert state["peak"] <= 2
    assert all(attempts == 2 for attempts in state["attempts"].values())


def test_answers_uses_provider_batch_once(monkeypatch):
    import importlib
    from types import SimpleNamespace

    answer_module = importlib.import_module("app.routes.answer")

    class BatchProvider:
        calls = 0

        def answer_many(self, questions):
            self.calls += 1
            return [SimpleNamespace(answer=item["question"], explanation="ok", confidence=1.0) for item in questions]

    provider = BatchProvider()
    monkeypatch.setattr(answer_module, "get_provider", lambda config: provider)
    app = create_app({"TESTING": True, "AI_PROVIDER": "local", "AI_API_KEY": "", "CORS_ORIGINS": "*"})
    questions = [{"question": f"Question {i}", "options": ["A", "B"]} for i in range(20)]

    response = app.test_client().post("/api/answers", json={"questions": questions})

    assert response.status_code == 200
    assert provider.calls == 1
    assert len(response.json["answers"]) == 20
    assert [item["answer"] for item in response.json["answers"]] == [item["question"] for item in questions]
