# InsureMate - Gemini setup

1. Install dependencies from the project root:
   `npm.cmd install`
2. Create `.env` beside `package.json` and `server.ts`:
   `GEMINI_API_KEY=your_key_here`
   `GEMINI_MODEL=gemini-3.5-flash-lite`
   Optional fallback keys: `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3`, and `GEMINI_API_KEY_4`.
   `APP_URL=http://localhost:3000`
   `PORT=3000`
3. Start the app:
   `npm.cmd run dev`
4. Open `http://localhost:3000`.

The `.env` file is intentionally not included. Never commit or share your API keys.

Natural-language requirement extraction uses Gemini's generateContent API, with the reference backend's model/key fallback order. The locally trained intent classifier still classifies each message before extraction. Policy similarity scoring is local TF-IDF/cosine similarity, so it does not call Gemini embeddings.
