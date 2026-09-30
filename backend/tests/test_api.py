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
