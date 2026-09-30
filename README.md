# FormMate AI

FormMate AI is a user-controlled Chrome extension and Flask backend for understanding supported online form questions. It detects unanswered labelled form fields on page load, requests AI answers in the background, and fills answers with at least 85% confidence. It never submits a form.

## Project layout

- `extension/` Vite React Manifest V3 extension
- `backend/` Flask API with provider abstraction

## What it does

- Detects labelled text fields, dropdowns, and Google Forms multiple-choice questions
- Shows an in-page notice and toolbar badge when fields are found
- Requests answers for detected questions without opening the popup
- Fills unanswered supported fields and matching multiple-choice options when AI confidence is at least 85%
- Leaves uncertain or unmatched fields unchanged and shows an on-page status
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

The API runs at `http://localhost:5001`. Port `5001` avoids conflicts with other local services. Batch requests can include up to 50 questions; the backend processes up to five AI requests at a time. The `local` provider is a safe development fallback and does not claim an answer; configure Gemini or OpenAI for real AI responses.

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

The extension analyzes supported fields in the background after a page loads, without opening the popup. It fills only high-confidence answers (85% or higher), leaves uncertain fields blank, and shows a page notice with the result. It never submits the form; review the answers and submit manually. Questions and answer choices are sent to the configured backend to generate answers.

The detector supports labelled text fields and dropdowns on regular webpages, plus multiple-choice radio questions on Google Forms. It cannot inject into browser-internal pages such as `chrome://` URLs. In the popup, paste a question followed by each answer choice on its own line into the single question box.

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
