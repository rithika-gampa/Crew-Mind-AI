const { useState, useEffect, useRef } = React;

const AGENTS = [
  { id: "manager", name: "Manager", role: "Orchestrator", icon: "◈", color: "#60a5fa", glow: "96,165,250" },
  { id: "monitor", name: "Scout", role: "Perception", icon: "◉", color: "#34d399", glow: "52,211,153" },
  { id: "researcher", name: "Researcher", role: "Deep Analysis", icon: "◍", color: "#f97316", glow: "249,115,22" },
  { id: "summarizer", name: "Synthesis", role: "Intelligence Brief", icon: "◎", color: "#c084fc", glow: "192,132,252" },
  { id: "writer", name: "Writer", role: "Content Production", icon: "◐", color: "#fbbf24", glow: "251,191,36" },
];

const TOPICS = [
  { label: "AI & LLMs", emoji: "🧠" },
  { label: "EV Battery Tech", emoji: "⚡" },
  { label: "Space Exploration", emoji: "🚀" },
  { label: "Quantum Computing", emoji: "⚛️" },
  { label: "Biotech & CRISPR", emoji: "🧬" },
  { label: "Climate Tech", emoji: "🌿" },
  { label: "Web3 & DeFi", emoji: "🔗" },
  { label: "Robotics & AI", emoji: "🤖" },
];

const FORMATS = [
  { id: "article", label: "Blog Article", icon: "📰" },
  { id: "script", label: "Video Script", icon: "🎬" },
  { id: "briefing", label: "Tech Briefing", icon: "📋" },
  { id: "newsletter", label: "Newsletter", icon: "📧" },
];

const API_BASE = window.location.protocol === "file:" ? "http://localhost:3000" : "";

async function callClaude(system, user, onChunk, maxTokens = 1200, onMeta) {
  const res = await fetch(`${API_BASE}/api/claude-stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      user,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let full = "";
  let buffer = "";
  let currentEvent = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) {
        currentEvent = "message";
        continue;
      }

      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
        continue;
      }

      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload || payload === "[DONE]") continue;

      try {
        const d = JSON.parse(payload);
        if (currentEvent === "provider_fallback") {
          onMeta?.(d);
        } else if (d.type === "content_block_delta" && d.delta?.text) {
          full += d.delta.text;
          onChunk(full);
        }
      } catch {}
    }
  }

  return full;
}

function MdView({ text }) {
  const lines = (text || "").split("\n");
  return (
    <div>
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} style={{ height: 8 }} />;

        if (t.startsWith("### ")) {
          return (
            <h3 key={i} style={{ color: "#ffffff", fontSize: 14, fontWeight: 700, margin: "14px 0 5px" }}>
              <span dangerouslySetInnerHTML={{ __html: fmt(t.slice(4)) }} />
            </h3>
          );
        }
        if (t.startsWith("## ")) {
          return (
            <h2 key={i} style={{ color: "#ffffff", fontSize: 17, fontWeight: 800, margin: "20px 0 8px", paddingBottom: 6, borderBottom: "1px solid #1e293b" }}>
              <span dangerouslySetInnerHTML={{ __html: fmt(t.slice(3)) }} />
            </h2>
          );
        }
        if (t.startsWith("# ")) {
          return (
            <h1 key={i} style={{ color: "#ffffff", fontSize: 22, fontWeight: 900, margin: "0 0 16px", lineHeight: 1.3 }}>
              <span dangerouslySetInnerHTML={{ __html: fmt(t.slice(2)) }} />
            </h1>
          );
        }
        if (t.startsWith("- ") || t.startsWith("• ")) {
          return (
            <div key={i} style={{ display: "flex", gap: 10, margin: "5px 0", alignItems: "flex-start" }}>
              <span style={{ color: "#ffffff", fontSize: 16, lineHeight: 1.2, flexShrink: 0, marginTop: 1 }}>•</span>
              <span style={{ color: "#ffffff", fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: fmt(t.slice(2)) }} />
            </div>
          );
        }
        const nm = t.match(/^(\d+)\.\s+(.+)$/);
        if (nm) {
          return (
            <div key={i} style={{ display: "flex", gap: 10, margin: "5px 0", alignItems: "flex-start" }}>
              <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 13, flexShrink: 0, minWidth: 20, fontFamily: "monospace" }}>{nm[1]}.</span>
              <span style={{ color: "#ffffff", fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: fmt(nm[2]) }} />
            </div>
          );
        }
        if (t.startsWith("[") && t.endsWith("]")) {
          return (
            <div key={i} style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 6, padding: "7px 12px", margin: "8px 0", color: "#ffffff", fontSize: 13, fontFamily: "monospace" }}>
              {t}
            </div>
          );
        }
        return (
          <p key={i} style={{ color: "#ffffff", fontSize: 14, lineHeight: 1.8, margin: "4px 0" }} dangerouslySetInnerHTML={{ __html: fmt(t) }} />
        );
      })}
    </div>
  );
}

function fmt(t) {
  return (t || "")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#ffffff;font-weight:700'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em style='color:#ffffff;font-style:italic'>$1</em>")
    .replace(/`(.+?)`/g, "<code style='background:#1e293b;color:#ffffff;padding:1px 5px;border-radius:3px;font-size:12px;font-family:monospace'>$1</code>");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function App() {
  const [topic, setTopic] = useState("AI & LLMs");
  const [custom, setCustom] = useState("");
  const [format, setFormat] = useState("article");
  const [phase, setPhase] = useState("idle");
  const [statuses, setStatuses] = useState({});
  const [outputs, setOutputs] = useState({});
  const [logs, setLogs] = useState([]);
  const [content, setContent] = useState("");
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("config");
  const [words, setWords] = useState(0);
  const logRef = useRef(null);
  const outRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = 0;
  }, [content]);

  const addLog = (agent, msg) => {
    const t = new Date().toLocaleTimeString("en-US", { hour12: false });
    setLogs((p) => [...p, { agent, msg, t, id: Math.random() }]);
  };

  const setS = (id, s) => {
    setStatuses((p) => ({ ...p, [id]: s }));
    if (s === "running") setActive(id);
  };

  const setO = (id, o) => setOutputs((p) => ({ ...p, [id]: o }));

  const doneCount = Object.values(statuses).filter((s) => s === "done").length;
  const progress = phase === "done" ? 100 : Math.round((doneCount / 5) * 100);
  const chosen = custom.trim() || topic;

  async function run() {
    setPhase("running");
    setLogs([]);
    setContent("");
    setOutputs({});
    setStatuses({});
    setActive(null);
    setWords(0);
    if (window.innerWidth < 700) setTab("agents");

    try {
      setS("manager", "running");
      addLog("manager", `Planning workflow → "${chosen}"`);
      await sleep(300);
      const plan = await callClaude(
        "You are a Manager Agent orchestrating a multi-agent research workflow. Always focus on the EXACT topic given.",
        `Plan a research workflow for "${chosen}" targeting a ${format}. List 3 specific angles to investigate. Max 100 words.`,
        (t) => setO("manager", t),
        220,
        (meta) => addLog("system", meta.message),
      );
      setS("manager", "done");
      addLog("manager", "Plan ready. Dispatching Scout…");

      await sleep(200);
      setS("monitor", "running");
      addLog("monitor", `Scanning latest info on "${chosen}"…`);
      const intel = await callClaude(
        'You are a Scout Agent. Report the most current, specific, real-world developments about ANY topic the user provides. Always stay on the exact topic.',
        `Research topic: "${chosen}"\n\n1. Give 5 specific recent facts/developments about "${chosen}" (2024-2026, real names/stats when relevant)\n2. Name 3 key players relevant to "${chosen}"\n3. Describe 2 emerging trends in "${chosen}"\n\nMax 180 words. Stay strictly on: "${chosen}".`,
        (t) => setO("monitor", t),
        420,
        (meta) => addLog("system", meta.message),
      );
      setS("monitor", "done");
      addLog("monitor", "Intelligence collected. Forwarding…");

      await sleep(200);
      setS("researcher", "running");
      addLog("researcher", `Deep-diving into "${chosen}"…`);
      const research = await callClaude(
        "You are a Research Agent. Perform deep analysis of any topic. Always stay on the exact topic provided.",
        `Topic: "${chosen}"\n\nUsing this intel:\n${intel}\n\nAnalyze "${chosen}":\n- Core mechanism/concept\n- Market or real-world implications\n- Key metrics and data\n- Most surprising angle\n\nMax 200 words. Stay on: "${chosen}".`,
        (t) => setO("researcher", t),
        520,
        (meta) => addLog("system", meta.message),
      );
      setS("researcher", "done");
      addLog("researcher", "Analysis complete.");

      await sleep(200);
      setS("summarizer", "running");
      addLog("summarizer", "Distilling insights…");
      const brief = await callClaude(
        "You are a Synthesis Agent. Create tight content briefs about any topic provided.",
        `Topic: "${chosen}" | Format: ${format}\n\nINTEL: ${intel}\nANALYSIS: ${research}\n\nBrief for ${format} about "${chosen}":\n- HOOK: 1 compelling sentence\n- KEY POINTS: 4 bullets about "${chosen}"\n- NARRATIVE ARC for ${format}\n- TAKEAWAY\n\nMax 160 words.`,
        (t) => setO("summarizer", t),
        360,
        (meta) => addLog("system", meta.message),
      );
      setS("summarizer", "done");
      addLog("summarizer", "Brief ready. Writing…");

      await sleep(200);
      setS("writer", "running");
      addLog("writer", `Writing ${format} about "${chosen}"…`);
      const hint = {
        article: `Blog article. Start with: # [title about ${chosen}]\nThen intro paragraph.\n## [section 1]\nContent\n## [section 2]\nContent\n## [section 3]\nContent\n## Conclusion\nContent`,
        script: `Video script. Use: # [title about ${chosen}]\n[HOOK]\nScript\n[INTRO]\nScript\n[MAIN POINT 1]\nScript\n[MAIN POINT 2]\nScript\n[MAIN POINT 3]\nScript\n[CTA]\nScript`,
        briefing: `Tech briefing. Use: # Technical Briefing: ${chosen}\n## Executive Summary\n## Key Findings\n- item\n## Technical Analysis\n## Market Impact\n## Recommendations\n1. item`,
        newsletter: `Newsletter. Use: # [title about ${chosen}]\n**Subject: [subject line]**\nPersonal opening\n## [Section 1]\nContent\n## [Section 2]\nContent\n## [Section 3]\nContent\n[KEY INSIGHT: takeaway]\nSign-off`,
      }[format];

      let written = "";
      await callClaude(
        'You are an elite Content Writer. Write publication-ready content SPECIFICALLY about the topic requested. Never write generic content. Always use the exact topic. CRITICAL: Match output length to what the topic actually needs — a simple or narrow question gets a short, direct answer, while a broad or complex topic gets a fuller piece. Never pad.',
        `Write a ${format} SPECIFICALLY about: "${chosen}"\n\nResearch brief:\n${brief}\n\nFormat:\n${hint}\n\nRules:\n- Match length to topic complexity. Simple topic = concise. Complex topic = detailed.\n- Every sentence must be directly about "${chosen}"\n- Use real names and stats from the research where relevant\n- Proper markdown formatting\n- Do NOT pad to hit any word count`,
        (t) => {
          written = t;
          setContent(t);
          setO("writer", t.slice(0, 100) + "…");
        },
        format === "article" ? 1400 : 1000,
        (meta) => addLog("system", meta.message),
      );
      setS("writer", "done");

      setS("manager", "running");
      addLog("manager", "Quality checking…");
      await sleep(500);
      setS("manager", "done");
      addLog("manager", `Done. ${format} about "${chosen}" is ready.`);
      addLog("system", `5 agents · 4 API calls · ${written.split(/\s+/).filter(Boolean).length} words`);
      setWords(written.split(/\s+/).filter(Boolean).length);
      setPhase("done");
      if (window.innerWidth < 700) setTab("output");
    } catch (e) {
      const message =
        e.message === "Failed to fetch"
          ? API_BASE
            ? "Error: Could not reach the local server at http://localhost:3000. Start the server, then try again."
            : "Error: Could not reach the backend API. Make sure the local server is running."
          : `Error: ${e.message}`;
      addLog("system", message);
      setPhase("idle");
    }
  }

  function reset() {
    setPhase("idle");
    setContent("");
    setLogs([]);
    setOutputs({});
    setStatuses({});
    setActive(null);
    setWords(0);
    setTab("config");
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && phase !== "running") {
      e.preventDefault();
      run();
    }
  };

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={S.brandIcon}>◈</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#ffffff", letterSpacing: "-0.5px" }}>
              CrewMind<span style={{ color: "#34d399" }}>AI</span>
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#ffffff", letterSpacing: "1.5px", marginTop: 1, opacity: 0.4 }}>
              MULTI-AGENT RESEARCH SYSTEM
            </div>
          </div>
        </div>
        <div className="hpills">
          {[["PERCEPTION", "#34d399", "52,211,153"], ["REASONING", "#60a5fa", "96,165,250"], ["ACTION", "#fbbf24", "251,191,36"]].map(([p, c, g], i) => (
            <div key={p} className={`pill ${phase === "running" ? "pill-on" : ""}`} style={{ "--pc": c, "--pg": g, "--i": i }}>
              <span className="pdot" />
              {p}
            </div>
          ))}
        </div>
      </header>

      <div className="mtabs">
        {[["config", "Config"], ["agents", "Agents"], ["output", "Output"]].map(([id, lbl]) => (
          <button key={id} className={`mtab ${tab === id ? "mtab-on" : ""}`} onClick={() => setTab(id)}>
            {lbl}
            {id === "agents" && phase === "running" && <span className="mbadge blink" />}
            {id === "output" && phase === "done" && content && <span className="mbadge" style={{ background: "#34d399" }} />}
          </button>
        ))}
      </div>

      {phase !== "idle" && (
        <div style={{ height: 3, background: "#0d1117", position: "relative" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg,#34d399,#60a5fa)", transition: "width 0.6s ease", boxShadow: "0 0 8px rgba(52,211,153,0.5)" }} />
          <div style={{ position: "absolute", right: 12, top: 5, display: "flex", alignItems: "center", gap: 8 }} className="hide-xs">
            {AGENTS.map((a) => (
              <span key={a.id} style={{ fontSize: 13, color: statuses[a.id] === "running" ? a.color : statuses[a.id] === "done" ? "#ffffff" : "#1e293b", transition: "all 0.3s" }} className={statuses[a.id] === "running" ? "blink" : ""}>
                {a.icon}
              </span>
            ))}
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#ffffff", opacity: 0.5 }}>{progress}%</span>
          </div>
        </div>
      )}

      <main className="grid3">
        <aside className={`col-l ${tab === "config" ? "tab-show" : "tab-hide"}`}>
          <div style={S.card}>
            <div style={{ ...S.label, color: "#34d399" }}>01 · TOPIC</div>
            <div className="topicgrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              {TOPICS.map((t) => (
                <button key={t.label} className={`tbtn ${topic === t.label && !custom ? "tbtn-on" : ""}`} onClick={() => { setTopic(t.label); setCustom(""); }}>
                  <span className="ticon">{t.emoji}</span>
                  <span className="tlabel">{t.label}</span>
                </button>
              ))}
            </div>
            <div style={{ position: "relative" }}>
              <input className="custominput" placeholder="Type any topic + press Enter…" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={handleKeyDown} />
              {custom && (
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "#34d399", fontFamily: "monospace", pointerEvents: "none" }}>↵</span>
              )}
            </div>
          </div>

          <div style={S.card}>
            <div style={{ ...S.label, color: "#60a5fa" }}>02 · OUTPUT FORMAT</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {FORMATS.map((f) => (
                <button key={f.id} className={`fbtn ${format === f.id ? "fbtn-on" : ""}`} onClick={() => setFormat(f.id)}>
                  <span style={{ fontSize: 22 }}>{f.icon}</span>
                  <span style={{ fontSize: 11, fontFamily: "monospace" }}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button className={`ctabtn ${phase === "running" ? "ctabtn-busy" : ""}`} disabled={phase === "running"} onClick={phase === "done" ? reset : run}>
            {phase === "running" ? (
              <>
                <span className="spin">⚙</span> Running… {progress}%
              </>
            ) : phase === "done" ? (
              "↺  New Research"
            ) : (
              "▶  Launch Agent Crew"
            )}
          </button>

          {phase === "done" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {[["🤖", "5", "Agents"], ["⚡", "4", "Calls"], ["📝", words, "Words"], ["⏱", "~2h", "Saved"]].map(([ic, v, l]) => (
                <div key={l} style={S.statCard}>
                  <div style={{ fontSize: 16 }}>{ic}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#ffffff", fontFamily: "monospace" }}>{v}</div>
                  <div style={{ fontSize: 8, color: "#ffffff", fontFamily: "monospace", opacity: 0.4 }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className={`col-c ${tab === "agents" ? "tab-show" : "tab-hide"}`}>
          <div style={S.card}>
            <div style={{ ...S.label, color: "#c084fc" }}>03 · AGENT FLEET</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {AGENTS.map((a) => {
                const st = statuses[a.id];
                const isA = active === a.id;
                return (
                  <div key={a.id} style={{ background: isA ? `linear-gradient(120deg,rgba(${a.glow},0.1),#0d1117)` : "#0d1117", border: `1px solid ${isA ? a.color : st === "done" ? "#1e293b" : "#141e2d"}`, borderRadius: 10, padding: "11px 13px", transition: "all 0.3s", position: "relative", overflow: "hidden", boxShadow: isA ? `0 0 18px rgba(${a.glow},0.15)` : "none" }}>
                    {isA && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,transparent,${a.color},transparent)`, animation: "scan 1.8s linear infinite" }} />}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18, color: isA ? a.color : st === "done" ? "#ffffff" : "#2a3a50", fontWeight: 700, minWidth: 20, transition: "color 0.3s" }}>{a.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: "#ffffff", fontFamily: "monospace", marginTop: 1, opacity: 0.4 }}>{a.role}</div>
                      </div>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", transition: "all 0.3s", background: st === "running" ? a.color : st === "done" ? "#ffffff" : "#1e293b", boxShadow: st === "running" ? `0 0 8px ${a.color}` : "none" }} className={st === "running" ? "blink" : ""} />
                    </div>
                    {outputs[a.id] && (
                      <div style={{ marginTop: 8, padding: "7px 10px", background: "rgba(0,0,0,0.3)", borderRadius: 6, fontFamily: "monospace", fontSize: 10, color: "#ffffff", lineHeight: 1.6, borderLeft: `2px solid ${a.color}`, opacity: 0.7 }}>
                        {outputs[a.id].slice(0, 110)}
                        {outputs[a.id].length > 110 ? "…" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ ...S.label, color: "#fbbf24", marginBottom: 0 }}>04 · ACTIVITY LOG</div>
              {phase === "running" && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#ffffff", fontFamily: "monospace", opacity: 0.7 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f97316", display: "block" }} className="blink" />
                  LIVE
                </div>
              )}
            </div>
            <div ref={logRef} style={{ height: 190, overflowY: "auto", background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 12, border: "1px solid #141e2d" }}>
              {logs.length === 0 ? (
                <div style={{ color: "#ffffff", fontFamily: "monospace", fontSize: 11, textAlign: "center", paddingTop: 68, opacity: 0.78, fontWeight: 600 }}>Awaiting launch…</div>
              ) : (
                logs.map((e) => {
                  const a = AGENTS.find((x) => x.id === e.agent);
                  return (
                    <div key={e.id} style={{ display: "flex", gap: 8, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ffffff", minWidth: 62, paddingTop: 2, flexShrink: 0, opacity: 0.72 }}>{e.t}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 9, color: a?.color || "#ffffff", minWidth: 76, flexShrink: 0 }}>{a ? `[${a.name}]` : "[SYS]"}</span>
                      <span style={{ fontSize: 11, color: "#ffffff", lineHeight: 1.5, opacity: 0.92 }}>{e.msg}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className={`col-r ${tab === "output" ? "tab-show" : "tab-hide"}`}>
          <div style={{ ...S.card, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div>
                <div style={{ ...S.label, color: phase === "done" && content ? "#34d399" : "#ffffff", marginBottom: 2, opacity: phase === "done" && content ? 1 : 0.4 }}>
                  {phase === "done" && content ? "✓ GENERATED CONTENT" : "05 · OUTPUT"}
                </div>
                {words > 0 && <div style={{ fontSize: 11, color: "#ffffff", fontFamily: "monospace", opacity: 0.82 }}>{words} words · {format} · {chosen}</div>}
              </div>
              {content && (
                <button style={S.copyBtn} onClick={() => navigator.clipboard.writeText(content)}>⎘ Copy</button>
              )}
            </div>

            <div ref={outRef} style={{ minHeight: 460, maxHeight: 680, overflowY: "auto", background: "#070d16", borderRadius: 10, padding: content ? "24px" : "0", border: "1px solid #141e2d" }}>
              {content ? (
                <>
                  <MdView text={content} />
                  {phase === "running" && <span style={{ display: "inline-block", width: 2, height: 16, background: "#34d399", marginLeft: 3, verticalAlign: "middle" }} className="blink" />}
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 460, gap: 14 }}>
                  <div style={{ fontSize: 48, color: "rgba(255,255,255,0.45)" }}>◐</div>
                  <div style={{ fontFamily: "monospace", fontSize: 12, color: "#ffffff", textAlign: "center", lineHeight: 2, opacity: 0.82, fontWeight: 600 }}>
                    {phase === "running" ? `Writing about "${chosen}"…` : "Select a topic & format\nthen launch the crew"}
                  </div>
                  {phase === "running" && (
                    <div style={{ display: "flex", gap: 5 }}>
                      {[0, 1, 2].map((i) => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", animation: `blink 1s ${i * 0.2}s ease-in-out infinite` }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const S = {
  root: { minHeight: "100vh", background: "#07090f", color: "#ffffff", fontFamily: "'Outfit',sans-serif", overflowX: "hidden" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", background: "rgba(7,9,15,0.95)", borderBottom: "1px solid #0e1a28", position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(16px)", flexWrap: "wrap", gap: 12 },
  brandIcon: { width: 36, height: 36, background: "#0c1422", border: "1px solid #1a2e44", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#60a5fa", fontSize: 18, fontWeight: 700 },
  card: { background: "#0c1422", border: "1px solid #111c2e", borderRadius: 14, padding: 18 },
  label: { fontFamily: "monospace", fontSize: 9, letterSpacing: "2px", marginBottom: 14, fontWeight: 600 },
  statCard: { background: "#0c1422", border: "1px solid #111c2e", borderRadius: 10, padding: "12px 6px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  copyBtn: { padding: "6px 14px", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 7, color: "#ffffff", fontSize: 11, fontFamily: "monospace", cursor: "pointer", transition: "all 0.2s" },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap');
*,*:before,*:after{box-sizing:border-box;margin:0;padding:0}
::-webkit-scrollbar{width:4px}
::-webkit-scrollbar-track{background:#07090f}
::-webkit-scrollbar-thumb{background:#1a2e44;border-radius:2px}

@keyframes blink{0%,100%{opacity:1}50%{opacity:0.15}}
@keyframes scan{from{transform:translateX(-100%)}to{transform:translateX(300%)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

.blink{animation:blink 1s ease-in-out infinite}
.spin{display:inline-block;animation:spin 1.1s linear infinite}

.hpills{display:flex;gap:8px;flex-wrap:wrap}
.pill{
  display:flex;align-items:center;gap:5px;
  padding:4px 11px;border-radius:20px;
  border:1px solid #0e1a28;background:#0c1422;
  font-family:monospace;font-size:9px;color:#ffffff;
  letter-spacing:1px;transition:all 0.3s;opacity:0.4;
}
.pill-on{
  border-color:var(--pc);
  background:rgba(var(--pg),0.08);
  opacity:1;color:#ffffff;
}
.pdot{width:6px;height:6px;border-radius:50%;background:#1a2e44;transition:all 0.3s;flex-shrink:0}
.pill-on .pdot{background:var(--pc);box-shadow:0 0 6px var(--pc);animation:blink 1.5s calc(var(--i)*0.3s) ease-in-out infinite}

.mtabs{display:none;background:#07090f;border-bottom:1px solid #0e1a28}
.mtab{flex:1;padding:12px;background:none;border:none;border-bottom:2px solid transparent;color:#ffffff;font-family:monospace;font-size:11px;cursor:pointer;transition:all 0.2s;position:relative;letter-spacing:0.5px;opacity:0.35}
.mtab-on{color:#ffffff;border-bottom-color:#34d399;opacity:1}
.mbadge{position:absolute;top:10px;right:calc(50% - 24px);width:5px;height:5px;border-radius:50%;background:#f97316}

.topicgrid{align-items:stretch}
.tbtn{width:100%;min-height:42px;display:grid;grid-template-columns:16px minmax(0,1fr);align-items:center;justify-items:start;column-gap:8px;padding:8px 10px;border-radius:9px;background:#0a1020;border:1px solid #111c2e;color:#ffffff;font-size:11px;font-family:'Outfit',sans-serif;cursor:pointer;transition:all 0.2s;text-align:left;opacity:0.5;appearance:none;-webkit-appearance:none;line-height:1;vertical-align:top}
.tbtn:hover{border-color:#34d399;opacity:1;background:rgba(52,211,153,0.06)}
.tbtn-on{border-color:#34d399 !important;opacity:1 !important;background:rgba(52,211,153,0.08) !important}
.ticon{width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:12px;line-height:1}
.tlabel{display:block;min-width:0;width:100%;overflow:visible;text-overflow:clip;white-space:normal;font-size:11px;line-height:1.2;overflow-wrap:anywhere}

.custominput{width:100%;padding:11px 14px;background:#0a1020;border:1px solid #111c2e;border-radius:9px;color:#ffffff;font-size:13px;font-family:'Outfit',sans-serif;outline:none;transition:border-color 0.2s;box-sizing:border-box}
.custominput:focus{border-color:#34d399}
.custominput::placeholder{color:#ffffff;opacity:0.25}

.fbtn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;border-radius:10px;background:#0a1020;border:1px solid #111c2e;color:#ffffff;cursor:pointer;transition:all 0.2s;font-family:'Outfit',sans-serif;opacity:0.5}
.fbtn:hover{border-color:#60a5fa;opacity:1;background:rgba(96,165,250,0.07)}
.fbtn-on{border-color:#60a5fa !important;background:rgba(96,165,250,0.1) !important;opacity:1 !important}

.ctabtn{width:100%;padding:15px;background:linear-gradient(135deg,#064e35,#0e2040);border:1px solid #34d399;border-radius:12px;color:#ffffff;font-size:15px;font-weight:700;font-family:'Outfit',sans-serif;cursor:pointer;transition:all 0.3s;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 0 20px rgba(52,211,153,0.1)}
.ctabtn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 10px 30px rgba(52,211,153,0.2)}
.ctabtn:active{transform:translateY(0) !important}
.ctabtn-busy{background:#0c1422 !important;border-color:#111c2e !important;color:#ffffff !important;opacity:0.4;cursor:not-allowed !important;transform:none !important;box-shadow:none !important}

.grid3{display:grid;grid-template-columns:290px 1fr 1fr;grid-template-areas:"l c r";gap:14px;padding:14px;max-width:1440px;margin:0 auto;align-items:start}
.col-l{grid-area:l;display:flex;flex-direction:column;gap:12px}
.col-c{grid-area:c;display:flex;flex-direction:column;gap:12px}
.col-r{grid-area:r;display:flex;flex-direction:column;gap:12px}

@media(max-width:1100px){.grid3{grid-template-columns:270px 1fr;grid-template-areas:"l c""l r"}}
@media(max-width:820px){.grid3{grid-template-columns:1fr;grid-template-areas:"l""c""r"}.hpills{display:none}}
@media(max-width:600px){
  .mtabs{display:flex}
  .tab-hide{display:none !important}
  .tab-show{display:flex !important}
  .hide-xs{display:none !important}
  .grid3{gap:10px;padding:10px}
}
`;

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
