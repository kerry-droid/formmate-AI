from google import genai

# The client automatically picks up the GEMINI_API_KEY environment variable
client = genai.Client()

response = client.models.generate_content(
    model="gemini-2.5-flash",
    contents="Give me a 3-word motivational phrase.",
)

print(response.text)
