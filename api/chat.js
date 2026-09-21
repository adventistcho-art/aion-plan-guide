import kb from "./chat-kb.js";

const STOPWORDS = new Set([
  "어떻게", "하나요", "인가요", "받나요", "받냐고", "뭐야", "좀",
  "해주세요", "해줘", "궁금", "해서", "하는", "된거야", "되나요",
  "어디", "어디서", "뭐임", "알려줘", "알려주세요", "좀요",
]);

function expandWord(w) {
  const out = [w];
  if (w.startsWith("비번") || w.startsWith("패스워드") || w === "암호") out.push("비밀번호");
  if (w.startsWith("아이디")) out.push("사번");
  return out;
}

function queryTokens(question) {
  const raw = String(question || "")
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+/)
    .filter(Boolean);
  const words = [];
  for (const w of raw) {
    if (STOPWORDS.has(w)) continue;
    for (const e of expandWord(w)) {
      if (!STOPWORDS.has(e)) words.push(e);
    }
  }
  const grams = [];
  for (const w of words) {
    if (w.length >= 2) {
      for (let i = 0; i <= w.length - 2; i++) grams.push(w.slice(i, i + 2));
    }
  }
  return words.concat(grams);
}

function scoreChunk(chunk, qTokens) {
  const hay = `${chunk.title} ${chunk.keywords || ""} ${chunk.answer || ""} ${chunk.text}`.toLowerCase();
  let score = 0;
  for (const tok of qTokens) {
    if (!tok || tok.length < 2) continue;
    if (hay.includes(tok)) {
      score += 2;
      if ((chunk.title || "").toLowerCase().includes(tok)) score += 3;
      if ((chunk.keywords || "").toLowerCase().includes(tok)) score += 2;
    }
  }
  return score;
}

function retrieve(question, limit) {
  const qTokens = queryTokens(question);
  const ranked = (kb.chunks || [])
    .map((c) => ({ chunk: c, score: scoreChunk(c, qTokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  if (ranked.length) return ranked.map((x) => x.chunk);
  return (kb.chunks || []).slice(0, 3);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function extractiveAnswer(chunks) {
  const c = chunks[0];
  if (!c) return "잘 모르겠습니다. 가이드의 해당 장을 봐 주세요.";
  if (c.answer) return c.answer;
  return `${c.text}\n\n더 자세한 화면 안내는 아래 가이드 바로가기를 봐 주세요.`;
}

function parseBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") return {};
  return body;
}

async function llmAnswer(question, history, chunks) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const context = chunks
    .map((c) => `- (${c.guideAnchor || ""}) ${c.title}: ${c.answer || c.text}`)
    .join("\n");
  const sys = [
    "당신은 삼육대학교 AION 사업계획 작성 가이드 도우미입니다.",
    "오직 아래 지식과 대화에 있는 사실만 사용해 한국어로 짧게 답합니다.",
    "사업계획 작성(로그인, 위자드, 부모·자녀, KPI, 예산, 분류, 제출, 내부기안)만 다룹니다.",
    "지식에 없으면 추측하지 말고, 잘 모르겠다고 한 뒤 가이드의 관련 장으로 안내합니다.",
    "금액 단위는 천원입니다. 제출은 승인이 아닙니다. AION은 SU-WINGS·그룹웨어를 대체하지 않습니다.",
    "답 끝에 필요하면 가이드 앵커를 한 줄로 적어 주세요. 예: 자세히: #step3",
    "",
    "지식:",
    context,
  ].join("\n");
  const messages = [{ role: "system", content: sys }];
  (history || []).slice(-8).forEach((m) => {
    if (m && (m.role === "user" || m.role === "assistant") && m.content) {
      messages.push({ role: m.role, content: String(m.content).slice(0, 2000) });
    }
  });
  messages.push({ role: "user", content: String(question).slice(0, 2000) });

  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, temperature: 0.2, messages }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`LLM ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = parseBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m && m.role === "user");
    const question = (lastUser && lastUser.content) || body.question || "";
    if (!String(question).trim()) {
      return res.status(400).json({ ok: false, error: "질문이 없습니다." });
    }

    const chunks = retrieve(question, 4);
    const history = messages.filter((m) => m !== lastUser);
    let answer = null;
    let mode = "extract";
    try {
      answer = await llmAnswer(question, history, chunks);
      if (answer) mode = "llm";
    } catch (e) {
      console.error(e);
    }
    if (!answer) answer = extractiveAnswer(chunks);

    return res.status(200).json({
      ok: true,
      answer,
      mode,
      sources: chunks.map((c) => ({
        id: c.id,
        title: c.title,
        guideAnchor: c.guideAnchor || "",
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "서버 오류가 났습니다. 잠시 후 다시 물어 주세요." });
  }
}
