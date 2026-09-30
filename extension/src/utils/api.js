const DEFAULT_API_URL = 'https://formmate-ai-ten.vercel.app';

export async function requestSuggestion(question, options, apiUrl = DEFAULT_API_URL) {
  const endpoint = `${apiUrl.replace(/\/$/, '')}/api/answer`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, options }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The AI provider took too long to respond. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(data?.error || `Backend returned ${response.status} from ${endpoint}. Start Flask and check the API URL.`);
  }
  if (!data) throw new Error(`Backend returned non-JSON data from ${endpoint}. Check that the API URL points to Flask.`);
  return data;
}

export { DEFAULT_API_URL };
