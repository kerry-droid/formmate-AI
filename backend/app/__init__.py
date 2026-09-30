import os

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from .routes.answer import answer_bp

load_dotenv()


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_mapping(
        AI_PROVIDER=os.getenv("AI_PROVIDER", "local"),
        AI_API_KEY=os.getenv("AI_API_KEY", ""),
        AI_API_URL=os.getenv("AI_API_URL", ""),
        AI_MODEL=os.getenv("AI_MODEL", "gemini-3.5-flash-lite"),
        CORS_ORIGINS=os.getenv("CORS_ORIGINS", "*"),
    )
    if test_config:
        app.config.update(test_config)

    origins = app.config["CORS_ORIGINS"]
    CORS(app, origins="*" if origins == "*" else [item.strip() for item in origins.split(",")])
    app.register_blueprint(answer_bp, url_prefix="/api")

    @app.get("/")
    def index():
        return jsonify(status="ok", service="FormMate AI API", health="/health", answer_endpoint="POST /api/answer")

    @app.get("/health")
    def health():
        return jsonify(status="ok")

    return app
