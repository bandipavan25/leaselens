# LeaseLens

Plain-English, cited analysis of commercial leases for small business owners.

## Setup

1. Copy `.env.example` to `.env` in the project root and set `GEMINI_API_KEY`.
2. Install dependencies:

```bash
npm run install:all
```

3. Start the API (port 3001) and the Vite app (port 5173) in two terminals:

```bash
npm run dev:server
npm run dev:client
```

Open [http://localhost:5173](http://localhost:5173). Optional sample PDF:

```bash
npm run sample-lease
```

This writes `server/fixtures/sample-commercial-lease.pdf`.

## Notes

- Gemini is called only from the Express server.
- Saved leases are stored in `server/data/leases.json`.
- This product provides legal information, not legal advice.
