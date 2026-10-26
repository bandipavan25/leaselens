const UNAVAILABLE =
  "Gemini is busy right now. Please try again in a moment.";

async function parseResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback =
      response.status === 503
        ? UNAVAILABLE
        : `Request failed (${response.status}).`;
    const error = new Error(data.error || fallback);
    error.status = response.status;
    error.code = data.code;
    throw error;
  }
  return data;
}

async function withClientRetry(fn, attempts = 3) {
  let delay = 1000;
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const busy =
        error.status === 503 || error.code === "GEMINI_UNAVAILABLE";
      if (!busy || i === attempts - 1) {
        if (busy) {
          throw new Error(UNAVAILABLE);
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw lastError;
}

export async function fetchHealth() {
  const response = await fetch("/api/health");
  return parseResponse(response);
}

export async function fetchLeases() {
  const response = await fetch("/api/leases");
  const data = await parseResponse(response);
  return data.leases;
}

export async function fetchLease(id) {
  const response = await fetch(`/api/leases/${id}`);
  const data = await parseResponse(response);
  return data.lease;
}

export async function analyzeLease(file) {
  const body = new FormData();
  body.append("lease", file);
  return withClientRetry(async () => {
    const response = await fetch("/api/leases/analyze", {
      method: "POST",
      body,
    });
    const data = await parseResponse(response);
    return data.lease;
  });
}

export async function askQuestion(leaseId, question) {
  return withClientRetry(async () => {
    const response = await fetch(`/api/leases/${leaseId}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    return parseResponse(response);
  });
}
