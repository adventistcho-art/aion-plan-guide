# -*- coding: utf-8 -*-
"""Build compact IR 2025 result + SU-WINGS 2025/2026 budget index for the guide chatbot."""
from __future__ import annotations

import json
import re
from pathlib import Path

IR = Path(r"C:\Users\SYU\Documents\커서도전\IR_2025_사업결과보고서")
DATA = IR / "output" / "data"
OUT = Path(r"C:\Users\SYU\Documents\커서도전\AION_GUIDE")
GUIDE_KB = OUT / "chat-kb.json"
API_KB = OUT / "api" / "chat-kb.js"
IR_JS = OUT / "api" / "ir-index.js"

FY25 = "2025-03-01 ~ 2026-02-28"
FY26 = "2026-03-01 ~ 2027-02-28"


def load_budget():
    text = (DATA / "suwings_budget.js").read_text(encoding="utf-8")
    return json.loads(text[text.find("{") : text.rfind("}") + 1])


def won_int(v):
    try:
        return int(v or 0)
    except (TypeError, ValueError):
        return 0


def pack_dept(p):
    adj = exe = 0
    for a in p.get("accounts") or []:
        if str(a.get("inexp") or "").strip() != "지출":
            continue
        adj += won_int(a.get("adj"))
        exe += won_int(a.get("exe"))
    if adj == 0 and exe == 0:
        adj, exe = won_int(p.get("tot_adj")), won_int(p.get("tot_exe"))
    remain = adj - exe
    rate = round(exe / adj * 100, 2) if adj else None
    return adj, exe, remain, rate, str(p.get("dept") or "").strip()


def norm(s):
    t = re.sub(r"[\s·ㆍ\-\(\)\[\]\/\,\.\"\'“”‘’]", "", str(s or "").lower())
    t = re.sub(r"^\(혁신[0-9]\)", "", t)
    return t


def money(n):
    if n is None:
        return "없음"
    return f"{int(n):,}원"


def clip(s, n=420):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    s = s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    if s in ("", "<없음>"):
        return ""
    return s if len(s) <= n else s[: n - 1] + "…"


def main():
    budget = load_budget()
    summaries = json.loads((DATA / "2025_result_summaries.json").read_text(encoding="utf-8"))["items"]
    busi = json.loads((DATA / "2025_busi_results.json").read_text(encoding="utf-8"))
    new2026 = json.loads((DATA / "2025_2026_code_map.json").read_text(encoding="utf-8")).get("new2026") or []

    recs = []
    tot = {
        "2025": {"adj": 0, "exe": 0, "biz": 0, "pairs": 0},
        "2026": {"adj": 0, "exe": 0, "biz": 0, "pairs": 0},
    }
    dept_tot = {}

    for code, obj in budget.items():
        year = "2026" if str(code).startswith("2026") else "2025"
        name = str(obj.get("name") or "").strip()
        by_dept = obj.get("byDept") or {}
        if by_dept:
            tot[year]["biz"] += 1
        for dept_cd, p in by_dept.items():
            adj, exe, remain, rate, dept_nm = pack_dept(p)
            tot[year]["adj"] += adj
            tot[year]["exe"] += exe
            tot[year]["pairs"] += 1
            dkey = (dept_cd, dept_nm or dept_cd)
            ds = dept_tot.setdefault(dkey, {"2025": {"adj": 0, "exe": 0}, "2026": {"adj": 0, "exe": 0}})
            ds[year]["adj"] += adj
            ds[year]["exe"] += exe
            recs.append(
                {
                    "code": str(code),
                    "year": year,
                    "name": name,
                    "deptCd": str(dept_cd).zfill(5),
                    "dept": dept_nm,
                    "adj": adj,
                    "exe": exe,
                    "remain": remain,
                    "rate": rate,
                    "key": (norm(name), str(dept_cd).zfill(5)),
                    "nkey": norm(name),
                }
            )

    recs25 = [r for r in recs if r["year"] == "2025"]
    recs26 = [r for r in recs if r["year"] == "2026"]
    idx25 = {}
    for r in recs25:
        idx25.setdefault(r["key"], []).append(r)
        idx25.setdefault(("n", r["nkey"]), []).append(r)

    used25 = set()
    pairs = []
    for r26 in recs26:
        hit = (idx25.get(r26["key"]) or [None])[0]
        if not hit:
            same = idx25.get(("n", r26["nkey"])) or []
            hit = next((x for x in same if x["code"] not in used25), None)
        if hit:
            used25.add(hit["code"] + "|" + hit["deptCd"])
        pairs.append((hit, r26))

    leftover25 = [
        r
        for r in recs25
        if (r["code"] + "|" + r["deptCd"]) not in used25 and (r["adj"] or r["exe"])
    ]

    ir_by_code = {}
    ir_by_dept_name = {}
    ir_meta = {}
    for item in busi.get("items") or []:
        meta = item.get("meta") or {}
        ir_cd = str(meta.get("cd") or "")
        dept_cd = str(meta.get("deptCd") or "").zfill(5)
        nm = str(meta.get("nm") or "").strip()
        dept = str(meta.get("deptName") or "").strip()
        prog = str(meta.get("progCd") or "").strip()
        rec = {
            "irCd": ir_cd,
            "deptCd": dept_cd,
            "dept": dept,
            "name": nm,
            "progCd": prog,
            "filled": bool(item.get("filled")),
        }
        raw = summaries.get("p-" + ir_cd) or ""
        rec["raw"] = clip(raw, 700)
        ir_meta[ir_cd] = rec
        if prog:
            ir_by_code.setdefault(prog, []).append(rec)
        ir_by_dept_name.setdefault((dept_cd, norm(nm)), []).append(rec)
        ir_by_dept_name.setdefault((dept_cd, "any"), []).append(rec)

    def attach_ir(name, dept_cd, code25=""):
        if code25 and ir_by_code.get(code25):
            hits = [x for x in ir_by_code[code25] if x["deptCd"] == dept_cd] or ir_by_code[code25]
            return hits[0]
        hits = ir_by_dept_name.get((dept_cd, norm(name))) or []
        if hits:
            return hits[0]
        for ir in ir_by_dept_name.get((dept_cd, "any"), []):
            a, b = norm(name), norm(ir["name"])
            if a and b and (a in b or b in a):
                return ir
        return None

    items = []

    def add_item(r25, r26):
        base = r26 or r25
        ir = attach_ir(base["name"], base["deptCd"], r25["code"] if r25 else "")
        if not ir and r25:
            ir = attach_ir(r25["name"], r25["deptCd"], r25["code"])
        raw = (ir or {}).get("raw") or ""
        items.append(
            {
                "name": base["name"],
                "dept": base["dept"],
                "deptCd": base["deptCd"],
                "code25": r25["code"] if r25 else "",
                "code26": r26["code"] if r26 else "",
                "adj25": r25["adj"] if r25 else None,
                "exe25": r25["exe"] if r25 else None,
                "remain25": r25["remain"] if r25 else None,
                "rate25": r25["rate"] if r25 else None,
                "adj26": r26["adj"] if r26 else None,
                "exe26": r26["exe"] if r26 else None,
                "remain26": r26["remain"] if r26 else None,
                "rate26": r26["rate"] if r26 else None,
                "irCd": (ir or {}).get("irCd") or "",
                "filled": bool((ir or {}).get("filled")),
                "irName": (ir or {}).get("name") or "",
                "summary": raw,
            }
        )

    for r25, r26 in pairs:
        if (r26 and (r26["adj"] or r26["exe"])) or (r25 and (r25["adj"] or r25["exe"])):
            add_item(r25, r26)
    for r25 in leftover25:
        add_item(r25, None)

    # drop empty-name noise
    items = [x for x in items if x["name"] and x["name"] not in ("없음", "없음7", "없음8", "없음9")]

    top26 = sorted(items, key=lambda x: x["adj26"] or 0, reverse=True)[:12]
    top_depts = sorted(
        (
            {
                "deptCd": k[0],
                "dept": k[1],
                "adj25": v["2025"]["adj"],
                "exe25": v["2025"]["exe"],
                "adj26": v["2026"]["adj"],
                "exe26": v["2026"]["exe"],
            }
            for k, v in dept_tot.items()
        ),
        key=lambda x: x["adj26"] or 0,
        reverse=True,
    )[:12]

    filled_n = sum(1 for x in items if x["filled"])
    overview = {
        "fy25": FY25,
        "fy26": FY26,
        "unit": "원. AION 입력은 천원(예: 3,300,000원 → 3,300).",
        "biz2025": tot["2025"]["biz"],
        "biz2026": tot["2026"]["biz"],
        "adj2025": tot["2025"]["adj"],
        "exe2025": tot["2025"]["exe"],
        "remain2025": tot["2025"]["adj"] - tot["2025"]["exe"],
        "rate2025": round(tot["2025"]["exe"] / tot["2025"]["adj"] * 100, 2) if tot["2025"]["adj"] else None,
        "adj2026": tot["2026"]["adj"],
        "exe2026": tot["2026"]["exe"],
        "remain2026": tot["2026"]["adj"] - tot["2026"]["exe"],
        "rate2026": round(tot["2026"]["exe"] / tot["2026"]["adj"] * 100, 2) if tot["2026"]["adj"] else None,
        "irCount": busi.get("count"),
        "irFilled": busi.get("filled"),
        "paired": len(items),
        "filledPaired": filled_n,
        "new2026": [{"code": n["code"], "name": n["name"]} for n in new2026 if n.get("name") and not str(n["name"]).startswith("없음")],
        "top2026": [
            {
                "name": x["name"],
                "dept": x["dept"],
                "adj26": x["adj26"],
                "adj25": x["adj25"],
            }
            for x in top26
        ],
        "topDepts": top_depts,
        "note": "금액은 SU-WINGS 교비 지출 합계. 2026 집행·잔액은 회계 진행 중이라 현재 기준. 2025 결과보고서는 IR 작성분.",
    }

    payload = {"updated": "2026-09-21", "overview": overview, "items": items}
    IR_JS.write_text("export default " + json.dumps(payload, ensure_ascii=False) + ";\n", encoding="utf-8")

    def dept_lines(rows):
        lines = []
        for d in rows:
            lines.append(
                f"{d['dept']}({d['deptCd']}): 2025 예산 {money(d['adj25'])} 집행 {money(d['exe25'])} / 2026 예산 {money(d['adj26'])} 집행 {money(d['exe26'])}(현재)"
            )
        return " / ".join(lines)

    new_names = ", ".join(f"{n['name']}({n['code']})" for n in overview["new2026"][:20])
    top_biz = " / ".join(
        f"{x['dept']} {x['name']} 2026 {money(x['adj26'])} (2025 {money(x['adj25'])})"
        for x in overview["top2026"][:8]
    )

    extra_chunks = [
        {
            "id": "ir-overview",
            "title": "2025·2026 대학 예산·집행 한눈에",
            "guideAnchor": "#step4",
            "keywords": "2025 2026 예산 총액 집행 잔액 SU-WINGS 교비 전체 대학 실적 전년도",
            "answer": (
                f"SU-WINGS 교비 지출 기준입니다. 2025 회계기간 {FY25}, 사업 {overview['biz2025']}건, "
                f"조정예산 {money(overview['adj2025'])}, 집행 {money(overview['exe2025'])} "
                f"({overview['rate2025']}%), 잔액 {money(overview['remain2025'])}. "
                f"2026 회계기간 {FY26}, 사업 {overview['biz2026']}건, "
                f"조정예산 {money(overview['adj2026'])}, 집행 {money(overview['exe2026'])} "
                f"(현재 {overview['rate2026']}%), 잔액 {money(overview['remain2026'])}. "
                "2026 숫자는 아직 회계가 끝나지 않아 ‘현재’입니다. AION에 넣을 때는 원÷1,000으로 천원 입력입니다."
            ),
            "text": (
                "전년도 실적과 올해 예산은 SU-WINGS 숫자를 기준으로 맞춥니다. "
                "자녀 합계=부모사업 예산, 단위는 천원입니다."
            ),
        },
        {
            "id": "ir-result-2025",
            "title": "2025 사업결과보고서 작성 현황",
            "guideAnchor": "#wizard-next",
            "keywords": "2025 결과보고서 실적 IR 전년 내용 올해 변화 작성 건수 위자드 참고자료",
            "answer": (
                f"2025 사업결과보고서는 IR 기준 {overview['irCount']}건 중 {overview['irFilled']}건에 본문이 있습니다. "
                f"챗봇이 예산과 짝지은 건은 {overview['paired']}건, 그중 결과보고서가 있는 건 {overview['filledPaired']}건입니다. "
                "위자드에서 전년 실적을 물을 때는 성격·대상·전년 내용·올해 변화(취약·개선)를 결과보고서에서 가져오고, 없으면 추측하지 않습니다. "
                "예: IR센터 「핵심역량 기반 교양교육 운영」은 신입생 972명(73.0%)·재학생 1,026명(20.6%) 진단, "
                "2025 예산 3,300,000원·집행 3,299,950원, 2026 예산 6,420,000원입니다."
            ),
            "text": "2026 계획을 쓸 때 2025 결과보고서의 취약·개선을 환류로 반영합니다. 없는 칸은 비워 둡니다.",
        },
        {
            "id": "ir-dept-budget",
            "title": "부서별 2025·2026 예산(상위)",
            "guideAnchor": "#step4",
            "keywords": "부서별 예산 IR센터 기획처 교무 학생 2025 2026 집행",
            "answer": "부서 합계(교비 지출, 원): " + dept_lines(overview["topDepts"]),
            "text": "특정 부서·사업명은 질문하면 해당 사업의 2025/2026 예산·집행·결과보고서 요약을 찾아 줍니다.",
        },
        {
            "id": "ir-top-biz",
            "title": "2026 예산 규모가 큰 사업",
            "guideAnchor": "#step4",
            "keywords": "큰 사업 예산 많은 사업 2026 조정예산 규모",
            "answer": "2026 조정예산 상위 사업: " + top_biz,
            "text": "금액은 원 단위입니다. AION 입력은 천원입니다.",
        },
        {
            "id": "ir-new-2026",
            "title": "2026 신규 사업",
            "guideAnchor": "#dashboard",
            "keywords": "2026 신규 사업 새로 생긴 혁신3 개교 120주년",
            "answer": (
                f"2025에 짝이 없는 2026 신규 사업은 {len(overview['new2026'])}건입니다. 앞부분: {new_names}. "
                "신규는 전년도 결과보고서가 없을 수 있고, 예산만 2026에 있습니다."
            ),
            "text": "신규 사업은 기존 불러오기 대신 AI 위자드나 직접 작성으로 시작합니다.",
        },
        {
            "id": "ir-howto-plan",
            "title": "전년도 실적·예산을 2026 계획에 쓰는 법",
            "guideAnchor": "#mode",
            "keywords": "전년도 실적 참고 기존 불러오기 연차사업 환류 취약 개선 예산 맞추기",
            "answer": (
                "연차사업이면 작성 방식에서 「기존 사업 불러오기」가 유리합니다. "
                "위자드 참고자료의 연결된 승인 결과보고서에서 2025 성격·대상·내용·올해 변화와 "
                "2025/2026 예산액·집행액·잔액을 같이 봅니다. 2025 집행이 남아 있으면 사유를 적고, "
                "2026 예산은 부모사업 SU-WINGS 금액과 같게 맞춥니다. 단위는 천원입니다."
            ),
            "text": "결과보고서가 없으면 예산만 보고, 성격·대상은 비워 두거나 담당자가 직접 씁니다. 추측하지 않습니다.",
        },
    ]

    kb = json.loads(GUIDE_KB.read_text(encoding="utf-8"))
    kb["updated"] = "2026-09-21"
    kb["scope"] = (
        "AION 사업계획 작성(로그인~내부기안). 2025 결과보고서·2025/2026 SU-WINGS 예산을 참고 지식으로 포함. "
        "전자문서·일정·관리자 메뉴는 다루지 않음."
    )
    existing = [c for c in kb["chunks"] if not str(c.get("id") or "").startswith("ir-")]
    kb["chunks"] = existing + extra_chunks
    GUIDE_KB.write_text(json.dumps(kb, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    API_KB.write_text("export default " + json.dumps(kb, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "items": len(items),
                "filledPaired": filled_n,
                "adj2025": overview["adj2025"],
                "exe2025": overview["exe2025"],
                "adj2026": overview["adj2026"],
                "exe2026": overview["exe2026"],
                "irjs_kb": IR_JS.stat().st_size,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
