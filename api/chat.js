import kb from "./chat-kb.js";
import irKb from "./ir-index.js";

const STOPWORDS = new Set([
  "어떻게", "하나요", "인가요", "받나요", "받냐고", "뭐야", "좀",
  "해주세요", "해줘", "궁금", "해서", "하는", "된거야", "되나요",
  "어디", "어디서", "뭐임", "알려줘", "알려주세요", "좀요",
  "하면", "됨", "할때", "때", "것을", "것은", "있나", "있는지",
  "해야", "해야함", "하는법", "좀", "요", "그리고", "이번", "지금",
]);

const WEAK_TOKS = new Set([
  "사업", "설정", "하면", "내용", "계획", "작성", "하는", "있는",
  "대한", "위한", "통해", "관련", "부분", "이번", "지금", "그리고",
  "것을", "것은", "방법", "다음", "이후",
]);

const AION_MAP = [
  {
    intent: "password",
    user: /(비번|비밀번호|패스워드|암호|재설정\s*링크|잊으셨)/,
    sys: ["비밀번호", "재설정"],
  },
  {
    intent: "login",
    user: /(로그인|접속|사번|아이디)/,
    sys: ["로그인", "사번"],
  },
  {
    intent: "direction",
    user: /(방향|비전|성격\s*파악|성격파악|이방향|무엇을\s*할지|어떤\s*사업|사업\s*내용|명확화|명확히)/,
    sys: ["사업방향", "성격파악", "이방향으로확정", "개선", "결과보고서"],
  },
  {
    intent: "name",
    user: /(사업명|이름\s*정하|이름\s*짓)/,
    sys: ["사업명"],
  },
  {
    intent: "condition",
    user: /(조건|재원|원인행위|사업\s*대상|책임\s*부서|기간|시작일|종료일)/,
    sys: ["사업조건", "재원", "원인행위", "사업대상"],
  },
  {
    intent: "budget-scale",
    user: /(총예산|예산\s*규모|얼마\s*쓸|보수적|적극적)/,
    sys: ["예산규모", "천원", "전년도지출"],
  },
  {
    intent: "purpose",
    user: /(목적|왜\s*하나|달성하려는)/,
    sys: ["사업목적"],
  },
  {
    intent: "parent",
    user: /(부모사업|자녀사업|자식사업|중층)/,
    sys: ["부모사업", "자녀사업"],
  },
  {
    intent: "classify",
    user: /(분류|C1|C2|C3|C4|C5|누구를\s*위해)/,
    sys: ["사업분류", "C1"],
  },
  {
    intent: "wizard",
    user: /(위자드|단계|순서|초안)/,
    sys: ["위자드"],
  },
  {
    intent: "ir",
    user: /(2025|2026|결과보고서|집행|잔액|실적|얼마|부서별|신규\s*사업|작년|전년)/,
    sys: ["결과보고서", "집행", "2025", "2026"],
  },
];

const PREFER = {
  password: ["password", "login"],
  login: ["login", "access", "password"],
  direction: ["wizard-direction", "wizard", "parent-child", "system-terms"],
  name: ["wizard-name", "wizard"],
  condition: ["wizard-condition", "wizard"],
  "budget-scale": ["wizard-budget", "budget", "numbers"],
  purpose: ["wizard-purpose", "wizard", "step2-pdc"],
  parent: ["parent-child", "wizard"],
  classify: ["classify", "wizard"],
  wizard: ["wizard", "wizard-direction", "mode"],
  ir: ["ir-overview", "ir-result-2025", "ir-howto-plan"],
};

const CORE_IDS = [
  "system-terms",
  "wizard",
  "wizard-direction",
  "parent-child",
  "wizard-condition",
  "wizard-purpose",
  "numbers",
  "classify",
  "ir-howto-plan",
  "ir-overview",
];

const STRUCTURE_PROMPT = [
  "AION 화면 구조. 사용자가 일상어로 물으면 이 구조로 바꿔 이해합니다.",
  "1) 로그인·비밀번호 재설정 — 비번/암호/비밀번호라고 물었을 때만.",
  "2) 사업관리 → 새 사업 → 작성 방식(AI 위자드 / 직접 작성 / 기존 불러오기).",
  "3) 위자드: 부모사업 선택 → 「1. AI와 사업성격파악하기」(전년 결과보고서 연동, 사업 방향 검토, 확인 필요 칸은 「개선」, 맞으면 「이방향으로 확정」) → 사업명 → 사업 조건(재원·책임부서·기간·원인행위·대상) → 예산 규모(천원, 전년도 지출 기준) → 사업목적 → 사업계획 초안 생성 → 편집.",
  "4) 이후 Step2 상세·PDC → Step3 성과지표 → Step4 예산 세분 → 마지막 사업분류 C1~C5 → Step5 검토·제출 → 내부기안.",
  "「사업의 방향을 설정/정한다」는 비밀번호가 아니라 위자드 사업 방향 검토입니다. 「설정」이라는 말만으로 비밀번호를 답하지 마세요.",
  "지식에 없는 화면·금액·실적은 추측하지 않습니다.",
].join("\n");

function detectIntents(question) {
  const q = String(question || "");
  const intents = new Set();
  for (const row of AION_MAP) {
    if (row.user.test(q)) intents.add(row.intent);
  }
  if (
    /(어떻게|하면|화면|눌러|단계|순서|어디)/.test(q) &&
    !intents.has("ir") &&
    !intents.has("password")
  ) {
    intents.add("howto");
  }
  return intents;
}

function mappedSysTokens(question) {
  const q = String(question || "");
  const extra = [];
  for (const row of AION_MAP) {
    if (row.user.test(q)) extra.push(...row.sys);
  }
  return extra;
}

function expandWord(w) {
  const out = [w];
  if (w.startsWith("비번") || w.startsWith("패스워드") || w === "암호") out.push("비밀번호");
  if (w.startsWith("아이디")) out.push("사번");
  if (w.startsWith("방향")) out.push("사업방향", "성격파악", "이방향으로확정");
  if (w.startsWith("목적")) out.push("사업목적");
  if (w.startsWith("조건")) out.push("사업조건", "재원", "원인행위");
  if (w.includes("분류")) out.push("사업분류", "C1");
  return out;
}

function queryTokens(question) {
  const raw = String(question || "")
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+/)
    .filter(Boolean);
  const words = [];
  for (const w of raw.concat(mappedSysTokens(question))) {
    if (STOPWORDS.has(w) || WEAK_TOKS.has(w)) continue;
    for (const e of expandWord(w)) {
      if (!STOPWORDS.has(e) && !WEAK_TOKS.has(e)) words.push(e);
    }
  }
  const grams = [];
  for (const w of words) {
    if (w.length >= 2) {
      for (let i = 0; i <= w.length - 2; i++) {
        const g = w.slice(i, i + 2);
        if (!WEAK_TOKS.has(g) && !STOPWORDS.has(g)) grams.push(g);
      }
    }
  }
  return words.concat(grams);
}

function chunkAllowed(chunk, question, intents) {
  const id = chunk.id || "";
  const hasPw = intents.has("password");
  if (id === "password" && !hasPw) return false;
  if (id === "login" && !hasPw && !intents.has("login")) return false;
  if (id === "checklist" && (intents.has("direction") || intents.has("condition") || intents.has("purpose") || intents.has("name"))) {
    return false;
  }
  const uiIntent =
    intents.has("direction") ||
    intents.has("condition") ||
    intents.has("purpose") ||
    intents.has("name") ||
    intents.has("login") ||
    intents.has("password") ||
    intents.has("wizard") ||
    intents.has("howto");
  if ((id.startsWith("ir-item-") || id.startsWith("ir-")) && uiIntent && !intents.has("ir")) {
    return false;
  }
  return true;
}

function scoreChunk(chunk, qTokens, intents) {
  const hay = `${chunk.title} ${chunk.keywords || ""} ${chunk.answer || ""} ${chunk.text}`.toLowerCase();
  let score = 0;
  for (const tok of qTokens) {
    if (!tok || tok.length < 2) continue;
    if (hay.includes(tok)) {
      score += tok.length >= 4 ? 4 : 2;
      if ((chunk.title || "").toLowerCase().includes(tok)) score += 3;
      if ((chunk.keywords || "").toLowerCase().includes(tok)) score += 2;
    }
  }
  const irGeneric = new Set(["2025", "2026", "집행", "잔액", "실적", "예산", "결과보고서", "얼마", "원", "부서별", "신규"]);
  const hasSpecific = qTokens.some((t) => t.length >= 3 && !irGeneric.has(t) && !WEAK_TOKS.has(t));
  for (const intent of intents) {
    const ids = PREFER[intent] || [];
    if (!ids.includes(chunk.id)) continue;
    if (intent === "ir" && hasSpecific) {
      if (chunk.id === "ir-howto-plan") score += 8;
      continue;
    }
    score += 28;
  }
  return score;
}

function irSearchTokens(question) {
  const raw = String(question || "")
    .toLowerCase()
    .split(/[^0-9a-zA-Z가-힣]+/)
    .filter(Boolean);
  const skip = new Set([
    ...STOPWORDS,
    ...WEAK_TOKS,
    "방향",
    "방향을",
    "설정할",
    "위자드",
    "목적",
    "조건",
    "분류",
    "화면",
    "단계",
    "순서",
    "확정",
    "개선",
  ]);
  return raw.filter((w) => {
    if (w.length < 3) return false;
    if (skip.has(w) || STOPWORDS.has(w) || WEAK_TOKS.has(w)) return false;
    if (WEAK_TOKS.has(w.slice(0, 2))) return false;
    return true;
  });
}

function shouldSearchIr(question, intents) {
  if (intents.has("password") || intents.has("login")) return false;
  if (intents.has("ir")) return true;
  return irSearchTokens(question).length > 0;
}

function searchIr(question, limit) {
  const qTokens = queryTokens(question);
  const hits = [];
  for (const it of irKb.items || []) {
    const score = scoreIr(it, qTokens);
    if (score > 0) hits.push({ item: it, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => ({ chunk: irToChunk(h.item), score: h.score }));
}

function retrieve(question, limit) {
  const intents = detectIntents(question);
  const qTokens = queryTokens(question);
  const ranked = [];
  for (const c of kb.chunks || []) {
    if (!chunkAllowed(c, question, intents)) continue;
    const score = scoreChunk(c, qTokens, intents);
    if (score > 0) ranked.push({ chunk: c, score });
  }
  const skipIrRetrieve = !shouldSearchIr(question, intents);
  if (!skipIrRetrieve) {
    for (const hit of searchIr(question, 8)) ranked.push(hit);
  }
  ranked.sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const x of ranked) {
    const id = x.chunk.id;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(x.chunk);
    if (out.length >= limit) break;
  }
  if (out.length) return out;
  return (kb.chunks || []).filter((c) => c.id === "system-terms" || c.id === "wizard").slice(0, 3);
}

function chunkById(id) {
  return (kb.chunks || []).find((c) => c.id === id);
}

function packContext(question) {
  const intents = detectIntents(question);
  const packed = [];
  const seen = new Set();
  const add = (chunk) => {
    if (!chunk || seen.has(chunk.id)) return;
    seen.add(chunk.id);
    packed.push(chunk);
  };
  const skipIrCore = intents.has("password") || intents.has("login");
  for (const id of CORE_IDS) {
    if (skipIrCore && String(id).startsWith("ir-")) continue;
    add(chunkById(id));
  }
  for (const chunk of retrieve(question, 8)) add(chunk);
  if (shouldSearchIr(question, intents)) {
    for (const hit of searchIr(question, 6)) add(hit.chunk);
  }
  return packed.slice(0, 16);
}

function won(n) {
  if (n == null || n === "") return "없음";
  return Number(n).toLocaleString("ko-KR") + "원";
}

function irToChunk(item) {
  const lines = [
    `${item.dept} · ${item.name}`,
    item.code25
      ? `2025(${item.code25}) 예산 ${won(item.adj25)} / 집행 ${won(item.exe25)} (${item.rate25 ?? "-"}%) / 잔액 ${won(item.remain25)}`
      : "2025 예산 없음",
    item.code26
      ? `2026(${item.code26}) 예산 ${won(item.adj26)} / 집행 ${won(item.exe26)} 현재 (${item.rate26 ?? "-"}%) / 잔액 ${won(item.remain26)}`
      : "2026 예산 없음",
  ];
  if (item.filled && item.summary) lines.push(`2025 결과보고서: ${item.summary}`);
  else lines.push("2025 결과보고서 본문은 없습니다. 없는 내용은 추측하지 않습니다.");
  lines.push("금액은 원입니다. AION 입력은 천원(÷1,000). 2026 집행·잔액은 현재 기준입니다.");
  const text = lines.join("\n");
  return {
    id: "ir-item-" + (item.code26 || item.code25 || item.irCd || item.name),
    title: `${item.dept} ${item.name}`,
    keywords: `${item.dept} ${item.name} ${item.irName || ""} 2025 2026 예산 집행 실적 결과보고서`,
    answer: text,
    text,
    guideAnchor: "#step4",
  };
}

function scoreIr(item, qTokens) {
  const hay = `${item.name} ${item.dept} ${item.irName || ""} ${item.summary || ""} ${item.code25 || ""} ${item.code26 || ""}`.toLowerCase();
  let score = 0;
  for (const tok of qTokens) {
    if (!tok || tok.length < 2) continue;
    if (WEAK_TOKS.has(tok)) continue;
    if (hay.includes(tok)) {
      score += 2;
      if ((item.name || "").toLowerCase().includes(tok)) score += 5;
      if ((item.dept || "").toLowerCase().includes(tok)) score += 4;
    }
  }
  if (score > 0) {
    if (item.filled && item.summary) score += 3;
    if (item.adj26) score += 2;
  }
  return score;
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

function llmText(data) {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return null;
  const from = (value) => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) {
      return value
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object") return part.text || part.content || "";
          return "";
        })
        .join("")
        .trim();
    }
    return "";
  };
  return from(msg.content) || from(msg.reasoning_content) || null;
}

function llmBases(model) {
  const primary = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const bases = [primary];
  if (/glm/i.test(model) || /z\.ai|bigmodel/i.test(primary)) {
    for (const extra of ["https://api.z.ai/api/paas/v4", "https://open.bigmodel.cn/api/paas/v4"]) {
      if (!bases.includes(extra)) bases.push(extra);
    }
  }
  return bases;
}

function clip(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function postLlm(base, payload, key) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const raw = await resp.text();
    return { ok: resp.ok, status: resp.status, raw };
  } catch (err) {
    return { ok: false, status: 0, raw: err.message || "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

function llmModels(primary) {
  const list = [primary].filter(Boolean);
  if (/glm/i.test(primary)) {
    for (const extra of ["glm-4.5-flash", "glm-4-flash", "glm-4.5-air"]) {
      if (!list.includes(extra)) list.push(extra);
    }
  }
  return list;
}

async function llmAnswer(question, history, chunks) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { text: null, error: "no-key" };
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const context = chunks
    .map((c) => `- (${c.guideAnchor || ""}) ${c.title}: ${clip(c.answer || c.text, 900)}`)
    .join("\n");
  const sys = [
    "당신은 삼육대학교 AION 사업계획 작성 가이드 도우미입니다.",
    "단어 일치로 FAQ를 골라 붙이지 마세요. 사용자 글의 뜻을 먼저 해석하고, 아래 지식을 폭넓게 연결해 답하세요.",
    "순서: 1) 이 질문이 AION의 어느 화면·단계인지 파악 2) 관련 화면 절차를 설명 3) 전년 결과보고서·2025/2026 예산이 있으면 그 내용도 이어서 설명.",
    STRUCTURE_PROMPT,
    "사업계획 작성과 2025 결과보고서·2025/2026 SU-WINGS 예산 참고만 다룹니다.",
    "지식에 없으면 추측하지 말고, 잘 모르겠다고 한 뒤 가이드의 관련 장으로 안내합니다.",
    "지식에 있는 금액은 원 단위입니다. AION 입력은 천원입니다. 2026 집행은 현재 기준입니다.",
    "제출은 승인이 아닙니다. AION은 SU-WINGS·그룹웨어를 대체하지 않습니다.",
    "답은 한국어로, 필요한 절차와 근거만 짧게. 끝에 가이드 앵커 한 줄. 예: 자세히: #wizard-next",
    "",
    "지식:",
    context,
  ].join("\n");
  const messages = [{ role: "system", content: sys }];
  (history || []).slice(-6).forEach((m) => {
    if (m && (m.role === "user" || m.role === "assistant") && m.content) {
      messages.push({ role: m.role, content: String(m.content).slice(0, 1500) });
    }
  });
  messages.push({
    role: "user",
    content: `질문: ${String(question).slice(0, 2000)}\n\n이 질문의 맥락을 AION 화면 구조로 해석한 다음, 관련 지식(화면 절차·전년 실적·예산)을 연결해 답하세요.`,
  });

  const bases = llmBases(model);
  const models = llmModels(model).slice(0, 3);
  const tries = [];
  for (const m of models) tries.push({ base: bases[0], model: m });
  if (bases[1]) tries.push({ base: bases[1], model });

  let lastErr = "";
  for (const trySpec of tries.slice(0, 3)) {
    const payload = {
      model: trySpec.model,
      temperature: 0.2,
      max_tokens: 900,
      messages,
    };
    if (/glm/i.test(trySpec.model)) payload.thinking = { type: "disabled" };
    const resp = await postLlm(trySpec.base, payload, key);
    if (!resp.ok) {
      lastErr = `LLM ${resp.status}: ${String(resp.raw).slice(0, 180)}`;
      continue;
    }
    let data = {};
    try {
      data = JSON.parse(resp.raw);
    } catch {
      lastErr = "LLM JSON parse failed";
      continue;
    }
    const text = llmText(data);
    if (text) return { text, error: null };
    lastErr = "LLM empty content";
  }
  return { text: null, error: lastErr || "LLM failed" };
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

    const chunks = retrieve(question, 6);
    const llmChunks = packContext(question);
    const history = messages.filter((m) => m !== lastUser);
    let answer = null;
    let mode = "extract";
    let aiError = null;
    try {
      const llm = await llmAnswer(question, history, llmChunks);
      aiError = llm.error || null;
      if (llm.text) {
        answer = llm.text;
        mode = "llm";
      }
    } catch (e) {
      aiError = e.message || "LLM failed";
      console.error(e);
    }
    if (!answer) answer = extractiveAnswer(chunks);

    const shown = mode === "llm" ? llmChunks.slice(0, 6) : chunks;
    return res.status(200).json({
      ok: true,
      answer,
      mode,
      aiError,
      sources: shown.map((c) => ({
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

export { retrieve, detectIntents, packContext };
