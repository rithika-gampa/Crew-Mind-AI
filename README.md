# CrewMindAI

CrewMindAI is a multi-agent AI research and content creation system. The user types or selects a topic, picks an output format, and five specialized AI agents collaborate to produce publication-ready content in real time.

## Stack

- Frontend: React in a single `app.jsx` file, loaded directly in the browser with no build step.
- Backend: shared Node.js backend logic in `lib/backend.js`.
- Local development server: `server.js`.
- Vercel deployment entrypoints: `api/claude-stream.js` and `api/research.js`.
- API providers: configurable multi-provider chain across Grok, Groq, and Gemini.
- Streaming: Server-sent events from `/api/research` to the frontend.
- Styling: A raw CSS string injected from the React app, plus small inline style objects for dynamic UI state.

## Agent pipeline

User Input -> Manager -> Scout -> Researcher -> Synthesizer -> Writer -> Output

- Manager Agent plans the research strategy.
- Scout Agent gathers factual context on the exact topic.
- Researcher Agent expands the findings with implications and mechanisms.
- Synthesizer Agent condenses the research into a content brief.
- Writer Agent generates the final output in the requested format.

## Run locally

Set your provider keys and provider order in your terminal, then start the app:

```powershell
$env:PRIMARY_PROVIDER="xai"
$env:BACKUP_PROVIDERS="groq,gemini"
$env:XAI_API_KEY="YOUR_XAI_KEY"
$env:XAI_MODEL="grok-4.20-reasoning"
$env:GROQ_API_KEY="YOUR_GROQ_KEY"
$env:GROQ_MODEL="llama-3.3-70b-versatile"
$env:GEMINI_API_KEY="YOUR_GEMINI_KEY"
$env:GEMINI_MODEL="gemini-2.5-flash"
npm start
```

Open `http://localhost:3000`.

## Deploy on Vercel

This repo is now structured for Vercel:

- Static frontend files are served directly from the project root.
- Backend endpoints live under `api/`.
- Shared provider and workflow code lives in `lib/backend.js`.
- `vercel.json` configures the Vercel Node runtime for the API functions.

In Vercel, import the GitHub repo and set these environment variables in the project dashboard:

```text
PRIMARY_PROVIDER
BACKUP_PROVIDERS
XAI_API_KEY
XAI_MODEL
GROQ_API_KEY
GROQ_MODEL
GEMINI_API_KEY
GEMINI_MODEL
```

Recommended values:

```text
PRIMARY_PROVIDER=groq
BACKUP_PROVIDERS=gemini,xai
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_MODEL=gemini-2.5-flash
XAI_MODEL=grok-4.20-reasoning
```

## Provider fallback

- Recommended chain for this project: `Grok -> Groq -> Gemini`.
- Set `PRIMARY_PROVIDER` to one of `xai`, `groq`, or `gemini`.
- Set `BACKUP_PROVIDERS` as a comma-separated list such as `groq,gemini` or `xai,gemini`.
- The backend retries the same step through the next configured provider if the current one fails.
- The activity log reports provider fallback when it happens.

## Important security note

Do not hardcode API keys in frontend files or commit them into the repo. If a key was pasted into chat or source code, treat it as exposed and rotate it.

## Notes

- The backend normalizes provider streaming so the frontend works the same whether Grok, Groq, or Gemini answered.
- A local `.env` file is supported; copy `.env.example` to `.env` and fill in your keys.
- The frontend triggers runs from the custom topic field when Enter is pressed.
- The layout is mobile-first with tabs on small screens and multi-column panels on larger screens.
