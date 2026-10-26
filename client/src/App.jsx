import { useEffect, useMemo, useState } from "react";
import { analyzeLease, askQuestion, fetchLease, fetchLeases } from "./api.js";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "red", label: "Red" },
  { id: "amber", label: "Amber" },
  { id: "green", label: "Green" },
];

function formatDate(value) {
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export default function App() {
  const [leases, setLeases] = useState([]);
  const [current, setCurrent] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState("all");
  const [question, setQuestion] = useState("");

  async function refreshList(preferredId) {
    const items = await fetchLeases();
    setLeases(items);
    if (preferredId) {
      const full = await fetchLease(preferredId);
      setCurrent(full);
    }
  }

  useEffect(() => {
    refreshList().catch((err) => setError(err.message));
  }, []);

  async function onFile(file) {
    if (!file) return;
    setError("");
    setBusy("Reading your lease and scoring clauses…");
    try {
      const lease = await analyzeLease(file);
      setCurrent(lease);
      await refreshList(lease.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function openLease(id) {
    setError("");
    setBusy("Opening saved analysis…");
    try {
      setCurrent(await fetchLease(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  async function onAsk(event) {
    event.preventDefault();
    if (!current || !question.trim()) return;
    const asked = question.trim();
    setQuestion("");
    setError("");
    setBusy("Looking that up in the lease…");
    const optimistic = {
      ...current,
      messages: [
        ...(current.messages || []),
        { id: "temp-user", role: "user", content: asked },
      ],
    };
    setCurrent(optimistic);
    try {
      const result = await askQuestion(current.id, asked);
      setCurrent((prev) => ({ ...prev, messages: result.messages }));
    } catch (err) {
      setError(err.message);
      setCurrent((prev) => ({
        ...prev,
        messages: (prev.messages || []).filter((m) => m.id !== "temp-user"),
      }));
    } finally {
      setBusy("");
    }
  }

  const clauses = useMemo(() => {
    const all = current?.analysis?.clauses || [];
    if (filter === "all") return all;
    return all.filter((clause) => clause.severity === filter);
  }, [current, filter]);

  const counts = useMemo(() => {
    const all = current?.analysis?.clauses || [];
    return {
      red: all.filter((c) => c.severity === "red").length,
      amber: all.filter((c) => c.severity === "amber").length,
      green: all.filter((c) => c.severity === "green").length,
    };
  }, [current]);

  return (
    <div className="app">
      <div className="banner">
        <strong>This is legal information, not legal advice.</strong>
        <span>LeaseLens explains language in your document. It is not a lawyer and does not replace one.</span>
      </div>

      <header className="topbar">
        <div className="brand">
          <div className="mark">L</div>
          <div>
            <h1>LeaseLens</h1>
            <p>Plain-English reads of commercial leases</p>
          </div>
        </div>
      </header>

      <main className="workspace">
        <section className="pane left">
          <label
            className={`upload ${dragging ? "dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              onFile(event.dataTransfer.files?.[0]);
            }}
          >
            <h2>Upload a lease PDF</h2>
            <p>We’ll extract the text, flag 15 risk areas, and keep a copy you can reopen.</p>
            <input
              id="lease-file"
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(event) => onFile(event.target.files?.[0])}
            />
            <span className="file-btn" role="button">
              Choose PDF
            </span>
          </label>

          {error ? <div className="error">{error}</div> : null}
          {busy ? (
            <p className="empty dots">
              {busy}
            </p>
          ) : null}

          {current ? (
            <>
              <div className="meta">
                <div>
                  <dt>Document</dt>
                  <dd>{current.filename}</dd>
                </div>
                <div>
                  <dt>Property</dt>
                  <dd>{current.analysis?.summary?.propertyAddress}</dd>
                </div>
                <div>
                  <dt>Parties</dt>
                  <dd>
                    {current.analysis?.summary?.landlord} / {current.analysis?.summary?.tenant}
                  </dd>
                </div>
              </div>

              <div className="terms">
                <h3>Key terms</h3>
                <div className="terms-grid">
                  <Term label="Monthly rent" value={current.analysis?.keyTerms?.monthlyRent} />
                  <Term label="Term length" value={current.analysis?.keyTerms?.termLength} />
                  <Term label="Escalation %" value={current.analysis?.keyTerms?.escalationPercent} />
                  <Term label="Security deposit" value={current.analysis?.keyTerms?.securityDeposit} />
                  <Term label="Renewal notice deadline" value={current.analysis?.keyTerms?.renewalNoticeDeadline} />
                </div>
              </div>

              {current.preview ? (
                <div className="preview">
                  <h3>Extracted text</h3>
                  <pre>{current.preview}</pre>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="saved">
            <h3>Saved leases</h3>
            {leases.length === 0 ? (
              <p className="empty">No analyses yet. Upload a PDF to start.</p>
            ) : (
              <ul className="lease-list">
                {leases.map((lease) => (
                  <li key={lease.id}>
                    <button
                      type="button"
                      className={current?.id === lease.id ? "active" : ""}
                      onClick={() => openLease(lease.id)}
                    >
                      <strong>{lease.title}</strong>
                      <span>
                        {formatDate(lease.createdAt)}
                        {lease.overallRisk?.label ? ` · ${lease.overallRisk.label} risk` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="pane right">
          {!current ? (
            <div className="splash">
              <h2 className="serif">See the risk before you sign.</h2>
              <p>
                Upload a commercial lease. LeaseLens classifies CAM, guarantees, relocation,
                renewal traps, and twelve other clauses — each in plain English, with a section and page cite.
              </p>
            </div>
          ) : (
            <>
              <div className="report-head">
                <div>
                  <h2>Lease health report</h2>
                  <p className="lede" style={{ padding: 0 }}>
                    {current.analysis?.summary?.title}
                  </p>
                </div>
                <div className={`risk-pill risk-${current.analysis?.overallRisk?.label}`}>
                  {current.analysis?.overallRisk?.label} risk
                </div>
              </div>
              <p className="lede">{current.analysis?.overallRisk?.summary}</p>
              <div className="filters">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={filter === item.id ? "on" : ""}
                    onClick={() => setFilter(item.id)}
                  >
                    {item.label}
                    {item.id !== "all" ? ` · ${counts[item.id]}` : ""}
                  </button>
                ))}
              </div>
              <div className="clauses">
                {clauses.map((clause) => (
                  <article key={clause.id} className="clause">
                    <div className="clause-top">
                      <strong>{clause.label}</strong>
                      <span className={`sev sev-${clause.severity}`}>{clause.severity}</span>
                    </div>
                    <p>{clause.explanation}</p>
                    <div className="cite">
                      § {clause.citation?.section} · p. {clause.citation?.page}
                    </div>
                  </article>
                ))}
              </div>

              <div className="chat">
                <div className="chat-head">
                  <h2>Ask this lease</h2>
                  <p>Answers cite a section and page. If it isn’t in the document, we’ll say so.</p>
                </div>
                <div className="messages">
                  {(current.messages || []).map((message) => (
                    <div key={message.id} className={`bubble ${message.role}`}>
                      <div>{message.content}</div>
                      {message.role === "assistant" && message.citations?.length ? (
                        <div className="cites">
                          {message.citations.map((cite, index) => (
                            <span key={`${cite.section}-${index}`} className="chip">
                              § {cite.section} · p. {cite.page}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <form className="ask" onSubmit={onAsk}>
                  <input
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="e.g. Who pays if the HVAC fails?"
                    disabled={Boolean(busy)}
                  />
                  <button className="primary" type="submit" disabled={Boolean(busy) || !question.trim()}>
                    Ask
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function Term({ label, value }) {
  return (
    <div className="term">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}
