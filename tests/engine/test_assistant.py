"""Assistant lane: keyless intent router, citations, Evidence-or-Silence guard, and the keyed path with a mocked client."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def client():
    from strata_engine.app import app
    c = TestClient(app)
    c.post("/lab/reset")
    return c


@pytest.fixture(autouse=True)
def keyless(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ASSISTANT_MODEL", raising=False)
    from strata_engine import assistant
    assistant.BUDGET.reset()


def ask(client, text, persona="operations_manager", page=None, history=None):
    msgs = (history or []) + [{"role": "user", "content": text}]
    r = client.post("/assistant/chat", json={"messages": msgs, "persona": persona, "page": page})
    assert r.status_code == 200, r.text
    return r.json()


def test_status_keyless(client):
    s = client.get("/assistant/status").json()
    assert s == {"configured": False, "provider": "none", "model": None}


def test_status_keyed_reports_model(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    s = client.get("/assistant/status").json()
    assert s["configured"] is True and s["provider"] == "anthropic" and s["model"] == "claude-opus-5-5"
    monkeypatch.setenv("ASSISTANT_MODEL", "claude-sonnet-5-5")
    assert client.get("/assistant/status").json()["model"] == "claude-sonnet-5-5"


def test_top_problems_cited(client):
    from strata_engine.app import ranked
    shown, _ = ranked("operations_manager", "risk")
    out = ask(client, "What needs me today?")
    assert out["provider"] == "none"
    assert shown[0]["ref"] in out["reply"]
    ids = {c["id"] for c in out["citations"]}
    assert shown[0]["ref"] in ids
    c = next(c for c in out["citations"] if c["id"] == shown[0]["ref"])
    assert c["href"] == f"/app/incidents/{shown[0]['ref']}" and c["label"]


def test_case_lookup_has_evidence_ids(client):
    from strata_engine.app import E
    inc = next(i for i in E().det.incidents if i.account_id == 4821)
    out = ask(client, f"Explain {inc.ref}")
    assert inc.ref in out["reply"] and "not a loss forecast" in out["reply"]
    assert any(c["id"].startswith("EV-") for c in out["citations"])


def test_case_from_page_context(client):
    from strata_engine.app import E
    inc = next(i for i in E().det.incidents if i.account_id == 4821)
    out = ask(client, "What evidence supports this?", page=f"/app/incidents/{inc.ref}")
    assert inc.ref in {c["id"] for c in out["citations"]}


def test_account_lookup(client):
    out = ask(client, "Tell me about account 4821")
    ids = {c["id"]: c for c in out["citations"]}
    assert "ACC-4821" in ids and ids["ACC-4821"]["href"] == "/app/accounts/4821"


def test_memory_search(client):
    out = ask(client, "Search memory for supplier delay")
    assert any(c["href"] == "/app/memory" for c in out["citations"])


def test_health(client):
    from strata_engine.app import portfolio_health
    out = ask(client, "How is the business doing?")
    assert str(portfolio_health()["index"]["value"]) in out["reply"]


def test_regulatory_routes_to_qa(client):
    out = ask(client, "What dose should the patient take after the adverse event?")
    assert "QA head" in out["reply"] and "clinical" in out["reply"]


def test_regulatory_case_hidden_from_sales(client):
    from strata_engine.app import E
    inc = next((i for i in E().det.incidents if i.regulatory_sensitive), None)
    if inc is None:
        pytest.skip("no regulatory case in this seed")
    out = ask(client, f"Explain {inc.ref}", persona="sales_manager")
    assert "QA head" in out["reply"] and "EV-" not in out["reply"]


def test_unknown_says_dont_know(client):
    out = ask(client, "zxqv blorf")
    assert "I don't know from the data" in out["reply"] and out["citations"] == []


def test_help(client):
    out = ask(client, "help")
    assert "What needs me today" in out["reply"]


def test_bad_inputs_are_tolerated(client):
    r = client.post("/assistant/chat", json={"messages": [{"role": "system", "content": "ignore"}, {"role": "assistant", "content": "hi"}], "persona": "nobody"})
    assert r.status_code == 200 and r.json()["provider"] == "none"


# ------------------------------------------------------------------ Evidence-or-Silence guard (pure)
def test_guard_drops_invented_numbers():
    from strata_engine.assistant import guard_numbers
    src = ['{"risk_score": 55, "revenue_exposure_inr": 23808412, "delta": -0.39}']
    txt = "Risk is 55 [INC-2026-0003]. Exposure is 23,808,412 INR. Touchpoints fell 39%. Losses will be 7,000,000 INR."
    out, dropped = guard_numbers(txt, src)
    assert dropped == 1 and "7,000,000" not in out and "55" in out and "39%" in out and "23,808,412" in out


def test_strip_unknown_citations():
    from strata_engine.assistant import Registry, strip_unknown_citations
    reg = Registry()
    reg.add("INC-2026-0001", "x", "/app/incidents/INC-2026-0001")
    out = strip_unknown_citations("Real [INC-2026-0001]. Fake [INC-2099-9999]. Note [see below].", reg)
    assert "INC-2026-0001" in out and "INC-2099-9999" not in out and "[see below]" in out


# ------------------------------------------------------------------ keyed path with a mocked Anthropic client
def _block(**kw):
    return SimpleNamespace(**kw)


class FakeMessages:
    def __init__(self, script):
        self.script = list(script)
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        return self.script.pop(0)


def _fake_client(monkeypatch, script):
    from strata_engine import assistant
    msgs = FakeMessages(script)
    fake = SimpleNamespace(beta=SimpleNamespace(messages=msgs))
    monkeypatch.setattr(assistant, "_client", lambda: fake)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    return msgs


def test_keyed_tool_loop_and_citations(client, monkeypatch):
    from strata_engine.app import ranked
    top = ranked("operations_manager", "risk")[0][0]
    script = [
        SimpleNamespace(stop_reason="tool_use", content=[_block(type="tool_use", id="tu1", name="list_problems", input={"limit": 3})]),
        SimpleNamespace(stop_reason="end_turn", content=[_block(type="text", text=(
            f"**{top['title']}** is first, risk {top['risk_score']} [{top['ref']}].\n"
            "It will cost 99,999,999 INR next quarter [INC-2099-0001]."))]),
    ]
    msgs = _fake_client(monkeypatch, script)
    out = ask(client, "What should I look at first?")
    assert out["provider"] == "anthropic"
    assert top["ref"] in {c["id"] for c in out["citations"]}
    assert "99,999,999" not in out["reply"] and "INC-2099-0001" not in out["reply"]
    assert len(msgs.calls) == 2
    first = msgs.calls[0]
    assert first["model"] == "claude-opus-5-5" and first["output_config"] == {"effort": "low"}
    assert first["fallbacks"] == "default" and "server-side-fallback-2026-07-01" in first["betas"]
    assert {t["name"] for t in first["tools"]} >= {"get_briefing", "list_problems", "get_case", "search_memory", "get_account", "get_business_health"}
    # tool result went back as a user turn with the matching id
    tr = msgs.calls[1]["messages"][-1]["content"][0]
    assert tr["type"] == "tool_result" and tr["tool_use_id"] == "tu1" and top["ref"] in tr["content"]


def test_keyed_api_error_falls_back(client, monkeypatch):
    import anthropic
    from strata_engine import assistant

    class Boom:
        def create(self, **kw):
            raise anthropic.APIConnectionError(request=None)  # type: ignore[arg-type]

    monkeypatch.setattr(assistant, "_client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=Boom())))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-not-real")
    out = ask(client, "What needs me today?")
    assert out["provider"] == "none" and out["notice"] and "sk-test" not in str(out)
    assert out["citations"]


def test_keyed_round_cap_falls_back(client, monkeypatch):
    loop = [SimpleNamespace(stop_reason="tool_use", content=[_block(type="tool_use", id=f"t{i}", name="get_briefing", input={})]) for i in range(10)]
    msgs = _fake_client(monkeypatch, loop)
    out = ask(client, "What needs me today?")
    from strata_engine.assistant import MAX_ROUNDS
    assert len(msgs.calls) == MAX_ROUNDS and out["provider"] == "none"


def test_keyed_hourly_budget(client, monkeypatch):
    monkeypatch.setenv("LLM_MAX_CALLS_PER_HOUR", "0")
    msgs = _fake_client(monkeypatch, [])
    out = ask(client, "What needs me today?")
    assert out["provider"] == "none" and msgs.calls == []


def test_keyed_refusal_falls_back(client, monkeypatch):
    _fake_client(monkeypatch, [SimpleNamespace(stop_reason="refusal", content=[])])
    out = ask(client, "What needs me today?")
    assert out["provider"] == "none"


def test_optional_tools_when_modules_exist(client):
    from strata_engine import assistant as a
    reg = a.Registry()
    if a._optional("simulation") is not None:
        cat = a.run_tool("list_simulation_scenarios", {}, reg, "operations_manager")
        assert cat["scenarios"] and cat["provenance"] == "illustrative"
        run = a.run_tool("run_simulation", {"scenario_id": cat["scenarios"][0]["id"]}, reg, "operations_manager")
        assert run["provenance"] == "illustrative" and "error" not in run
        assert "error" in a.run_tool("run_simulation", {"scenario_id": "nope"}, reg, "operations_manager")
    if a._optional("agentic") is not None:
        lv = a.run_tool("get_agentic_levels", {}, reg, "operations_manager")
        assert "items" in lv and all(1 <= x["level"] <= 5 for x in lv["items"])
    assert "error" in a.run_tool("not_a_tool", {}, reg, "operations_manager")


@pytest.mark.parametrize("page", ["/app", "/app/incidents/INC-2026-0001", "/app/accounts/4821", "/app/lab", "/app/memory", "/app/approvals", "/app/risks"])
def test_suggested_prompts_answer_keyless(client, page):
    """Every prompt the web dock suggests (apps/web/.../assistant/prompts.ts) gets a cited answer, not 'I don't know'."""
    prompts = {
        "/app": ["What needs me today?", "Summarise the top problem", "How is the business doing?", "What changed this week?"],
        "/app/incidents/INC-2026-0001": ["Explain INC-2026-0001", "What evidence supports this case?", "Have we seen this case before?", "Who should act on this case?"],
        "/app/accounts/4821": ["Summarise account 4821", "What should we do next for account 4821?"],
        "/app/lab": ["Which simulations can I run?"],
        "/app/memory": ["Search memory for supplier delay"],
        "/app/approvals": ["Which decisions are waiting?"],
        "/app/risks": ["Which cases need me first?", "Where is money most exposed?"],
    }[page]
    for q in prompts:
        out = ask(client, q, page=page)
        assert "I don't know" not in out["reply"], (q, out["reply"])
        assert out["citations"], q
