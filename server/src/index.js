import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { extractLeaseText } from "./extractPdf.js";
import { analyzeLease, answerQuestion } from "./gemini.js";
import { getLease, listLeases, saveLease, toListItem } from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.join(__dirname, "..", "..", ".env");
const localEnv = path.join(__dirname, "..", ".env");
dotenv.config({ path: rootEnv });
dotenv.config({ path: localEnv });

const app = express();
const port = Number(process.env.PORT) || 3001;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ok =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (!ok) {
      cb(new Error("Please upload a PDF lease."));
      return;
    }
    cb(null, true);
  },
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(process.env.GEMINI_API_KEY) });
});

app.get("/api/leases", async (_req, res, next) => {
  try {
    res.json({ leases: await listLeases() });
  } catch (error) {
    next(error);
  }
});

app.get("/api/leases/:id", async (req, res, next) => {
  try {
    const lease = await getLease(req.params.id);
    if (!lease) {
      res.status(404).json({ error: "Lease not found." });
      return;
    }
    res.json({
      lease: {
        ...toListItem(lease),
        analysis: lease.analysis,
        preview: lease.extractedText.slice(0, 2500),
        messages: lease.messages || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/leases/analyze", upload.single("lease"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Upload a lease PDF." });
      return;
    }

    const extracted = await extractLeaseText(req.file.buffer);
    const analysis = await analyzeLease(extracted.text);
    const lease = {
      id: randomUUID(),
      filename: req.file.originalname,
      createdAt: new Date().toISOString(),
      pageCount: extracted.pageCount,
      extractedText: extracted.text,
      analysis,
      messages: [],
    };
    await saveLease(lease);
    res.json({
      lease: {
        ...toListItem(lease),
        analysis: lease.analysis,
        preview: lease.extractedText.slice(0, 2500),
        messages: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/leases/:id/ask", async (req, res, next) => {
  try {
    const question = (req.body?.question || "").trim();
    if (!question) {
      res.status(400).json({ error: "Ask a question about this lease." });
      return;
    }
    const lease = await getLease(req.params.id);
    if (!lease) {
      res.status(404).json({ error: "Lease not found." });
      return;
    }

    const result = await answerQuestion(
      lease.extractedText,
      question,
      lease.messages || [],
    );
    const userMessage = {
      id: randomUUID(),
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage = {
      id: randomUUID(),
      role: "assistant",
      content: result.answer,
      citations: result.citations,
      addressed: result.addressed,
      createdAt: new Date().toISOString(),
    };
    lease.messages = [...(lease.messages || []), userMessage, assistantMessage];
    await saveLease(lease);
    res.json({ message: assistantMessage, messages: lease.messages });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "That PDF is larger than 15 MB."
        : error.message;
    res.status(400).json({ error: message });
    return;
  }
  if (error.code === "EMPTY_PDF") {
    res.status(400).json({ error: error.message });
    return;
  }
  if (error.code === "MISSING_API_KEY") {
    res.status(500).json({ error: error.message });
    return;
  }
  if (error.code === "GEMINI_UNAVAILABLE" || error.status === 503) {
    res.status(503).json({
      error: "Gemini is busy right now. Please try again in a moment.",
      code: "GEMINI_UNAVAILABLE",
    });
    return;
  }
  console.error(error);
  res.status(500).json({
    error: error.message || "Something went wrong while reading this lease.",
  });
});

app.listen(port, () => {
  console.log(`LeaseLens API on http://localhost:${port}`);
});
