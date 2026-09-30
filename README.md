# FormMate AI

FormMate AI is a user-controlled Chrome extension and Flask backend for understanding supported online form questions. It detects labelled form fields, alerts the user on the page, pre-fills the extension with the first detected question, and shows an AI suggestion for review. It never submits a form.

## Project layout

- `extension/` Vite React Manifest V3 extension
- `backend/` Flask API with provider abstraction

## What it does

- Detects labelled `input`, `textarea`, and `select` fields on regular webpages
- Shows an in-page notice and toolbar badge when fields are found
- Loads the first detected question and choices into the popup
- Supports multiple-choice and free-response questions
- Returns an answer, explanation, and confidence for review
- Never submits forms automatically

## Backend

```bash
cd /home/kerry/my-projects/Form-mate-AI/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

The API runs at `http://localhost:5001`. Port `5001` avoids conflicts with other local services. The `local` provider is a safe development fallback and does not claim an answer; configure Gemini or OpenAI for real AI responses.

### Configure an AI provider

Copy `.env.example` to `.env`, then choose one provider. For Gemini:

```dotenv
AI_PROVIDER=gemini
AI_API_KEY=your_gemini_api_key
AI_API_URL=
AI_MODEL=gemini-3.5-flash-lite
```

For OpenAI:

```dotenv
AI_PROVIDER=openai
AI_API_KEY=your_openai_api_key
AI_API_URL=
AI_MODEL=gpt-4o-mini
```

Keep API keys in the backend `.env` file. Never put them in the extension or commit them to Git. Restart Flask whenever `.env` changes.

```bash
curl http://localhost:5001/health
curl -X POST http://localhost:5001/api/answer \
  -H 'Content-Type: application/json' \
  -d '{"question":"What is the capital of Kenya?","options":["Kampala","Nairobi","Kigali"]}'
```

Run tests with the project virtual environment from `backend/`:

```bash
venv/bin/python -m pytest
```

If Gemini is temporarily busy, FormMate retries transient failures and returns a short retry message. The extension request also has a 30-second timeout.

## Extension

```bash
cd extension
npm install
npm run build
```

In Chrome, open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `extension/dist`.

After changing extension code:

1. Run `npm run build` from `extension/`.
2. Click **Reload** for FormMate in `chrome://extensions`.
3. Refresh the webpage containing the form.
4. Open the FormMate toolbar popup.

The page notice and toolbar badge indicate detected fields. The popup loads the first detected question and its options automatically. Chrome does not allow a webpage to open the extension popup silently, so the user must click the toolbar icon.

The current detector supports labelled `input`, `textarea`, and `select` fields on regular webpages. It cannot inject into browser-internal pages such as `chrome://` URLs.

If the popup says `Failed to fetch`, confirm Flask is running on port `5001`, rebuild the extension, click **Reload** in `chrome://extensions`, and refresh the form page.

## Responsible use

Use FormMate only with forms you are authorized to complete. Review every suggestion yourself and follow the rules of the relevant school, employer, organization, or assessment platform.

## Deploy the backend to Vercel

The Flask API includes a Vercel serverless entry point at `api/index.py` and deployment configuration in `vercel.json`.

From the project root:

```bash
npx vercel login
npx vercel --prod
```

Add these environment variables in the Vercel project settings. Do not commit the API key:

```text
AI_PROVIDER=gemini
AI_API_KEY=your_new_gemini_key
AI_API_URL=
AI_MODEL=gemini-3.5-flash-lite
CORS_ORIGINS=*
```

After deployment, verify the API at `https://your-project.vercel.app/health`. The Chrome extension currently targets local port `5001`; update its API URL and `host_permissions` to the deployed Vercel domain before rebuilding the extension.
