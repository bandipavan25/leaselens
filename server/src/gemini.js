import { GoogleGenAI } from "@google/genai";
import { RISK_CATEGORIES } from "./categories.js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const UNAVAILABLE_MESSAGE =
  "Gemini is busy right now. Please try again in a moment.";

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error(
      "GEMINI_API_KEY is missing. Add it to a .env file in the project root.",
    );
    error.code = "MISSING_API_KEY";
    throw error;
  }
  return new GoogleGenAI({ apiKey });
}

function isUnavailable(error) {
  const status = error?.status ?? error?.code ?? error?.statusCode;
  const text = `${error?.message || ""} ${error?.status || ""}`;
  return (
    status === 503 ||
    status === "UNAVAILABLE" ||
    /503|UNAVAILABLE|overloaded|try again later/i.test(text)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withGeminiRetry(fn, attempts = 4) {
  let delay = 1000;
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isUnavailable(error) || i === attempts - 1) {
        if (isUnavailable(error)) {
          const busy = new Error(UNAVAILABLE_MESSAGE);
          busy.code = "GEMINI_UNAVAILABLE";
          busy.status = 503;
          throw busy;
        }
        throw error;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
  throw lastError;
}

function parseJsonResponse(text) {
  const trimmed = (text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1] : trimmed;
  return JSON.parse(payload);
}

const analysisSchema = {
  type: "object",
  properties: {
    summary: {
      type: "object",
      properties: {
        title: { type: "string" },
        propertyAddress: { type: "string" },
        landlord: { type: "string" },
        tenant: { type: "string" },
      },
      required: ["title", "propertyAddress", "landlord", "tenant"],
    },
    keyTerms: {
      type: "object",
      properties: {
        monthlyRent: { type: "string" },
        termLength: { type: "string" },
        escalationPercent: { type: "string" },
        securityDeposit: { type: "string" },
        renewalNoticeDeadline: { type: "string" },
      },
      required: [
        "monthlyRent",
        "termLength",
        "escalationPercent",
        "securityDeposit",
        "renewalNoticeDeadline",
      ],
    },
    overallRisk: {
      type: "object",
      properties: {
        label: { type: "string", enum: ["High", "Moderate", "Lower"] },
        summary: { type: "string" },
      },
      required: ["label", "summary"],
    },
    clauses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: { type: "string", enum: ["red", "amber", "green"] },
          explanation: { type: "string" },
          found: { type: "boolean" },
          citation: {
            type: "object",
            properties: {
              section: { type: "string" },
              page: { type: "string" },
            },
            required: ["section", "page"],
          },
        },
        required: ["id", "severity", "explanation", "found", "citation"],
      },
    },
  },
  required: ["summary", "keyTerms", "overallRisk", "clauses"],
};

function normalizeAnalysis(raw) {
  const byId = new Map((raw.clauses || []).map((clause) => [clause.id, clause]));
  const clauses = RISK_CATEGORIES.map((category) => {
    const match = byId.get(category.id) || {};
    const severity = ["red", "amber", "green"].includes(match.severity)
      ? match.severity
      : "amber";
    return {
      id: category.id,
      label: category.label,
      severity,
      found: Boolean(match.found),
      explanation:
        match.explanation ||
        "This topic was not clearly classified. Review the lease language with counsel.",
      citation: {
        section: match.citation?.section || "—",
        page: match.citation?.page || "—",
      },
    };
  });

  const reds = clauses.filter((c) => c.severity === "red").length;
  let label = raw.overallRisk?.label;
  if (!["High", "Moderate", "Lower"].includes(label)) {
    label = reds >= 4 ? "High" : reds >= 1 ? "Moderate" : "Lower";
  }

  const missing = "Not stated in the lease";
  return {
    summary: {
      title: raw.summary?.title || "Commercial lease",
      propertyAddress: raw.summary?.propertyAddress || missing,
      landlord: raw.summary?.landlord || missing,
      tenant: raw.summary?.tenant || missing,
    },
    keyTerms: {
      monthlyRent: raw.keyTerms?.monthlyRent || missing,
      termLength: raw.keyTerms?.termLength || missing,
      escalationPercent: raw.keyTerms?.escalationPercent || missing,
      securityDeposit: raw.keyTerms?.securityDeposit || missing,
      renewalNoticeDeadline: raw.keyTerms?.renewalNoticeDeadline || missing,
    },
    overallRisk: {
      label,
      summary:
        raw.overallRisk?.summary ||
        `${reds} high-risk clause${reds === 1 ? "" : "s"} flagged for review.`,
    },
    clauses,
  };
}

export async function analyzeLease(extractedText) {
  const ai = getClient();
  const categoryList = RISK_CATEGORIES.map(
    (c) => `- ${c.id}: ${c.label}. ${c.prompt}`,
  ).join("\n");

  const prompt = `You are LeaseLens, a commercial-lease explainer for small business owners.
This is legal information, not legal advice.

Read the lease text. Pages are marked as "--- Page N ---".
Return JSON only.

Rules:
- Classify ALL 15 categories below. Use those exact ids.
- Severity: red = tenant-unfriendly or high risk; amber = mixed, unclear, or missing a protection the tenant would want; green = relatively tenant-balanced or standard and not obviously harsh.
- If a category is absent, still include it. Prefer amber when silence hurts the tenant (no exclusivity, no early termination option, uncapped CAM not addressed). Explain in plain English that it was not found.
- Explanations: 2-4 sentences, grade-8 reading level, no legalese unless quoting a defined term.
- Citations must use the lease section/article number and page number from the markers. If unknown, use "Not specified".
- keyTerms: monthly rent, term length, escalation %, security deposit, renewal notice deadline. If missing, say "Not stated in the lease".

Categories:
${categoryList}

LEASE TEXT:
${extractedText}`;

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
      },
    }),
  );

  const raw = parseJsonResponse(response.text);
  return normalizeAnalysis(raw);
}

const qaSchema = {
  type: "object",
  properties: {
    addressed: { type: "boolean" },
    answer: { type: "string" },
    citations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          section: { type: "string" },
          page: { type: "string" },
          quote: { type: "string" },
        },
        required: ["section", "page"],
      },
    },
  },
  required: ["addressed", "answer", "citations"],
};

export async function answerQuestion(extractedText, question, history = []) {
  const ai = getClient();
  const prior = history
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "User" : "LeaseLens"}: ${turn.content}`)
    .join("\n");

  const prompt = `You answer questions about ONE commercial lease for a small business owner.
This is legal information, not legal advice.

STRICT RULES:
- Use only the lease text below. Do not use outside law or assumptions.
- Every answer MUST cite section number and page (from "--- Page N ---" markers).
- If the lease does not cover the question, set addressed=false and set answer EXACTLY to:
Your lease doesn't appear to address this.
- Otherwise addressed=true. Plain English, 2-5 sentences, then citations.
- quote in citations should be a short excerpt from the lease.

Prior Q&A:
${prior || "(none)"}

Question: ${question}

LEASE TEXT:
${extractedText}`;

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: qaSchema,
      },
    }),
  );

  const raw = parseJsonResponse(response.text);
  if (!raw.addressed) {
    return {
      addressed: false,
      answer: "Your lease doesn't appear to address this.",
      citations: [],
    };
  }

  return {
    addressed: true,
    answer: raw.answer || "Your lease doesn't appear to address this.",
    citations: Array.isArray(raw.citations) ? raw.citations : [],
  };
}
