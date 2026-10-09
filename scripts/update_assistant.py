import os
import re

def update_assistant():
    p = 'services/engine/strata_engine/assistant.py'
    with open(p, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Update _client / config
    content = content.replace('import anthropic', 'import google.generativeai as genai\n      import google.api_core.exceptions')
    content = content.replace('anthropic.APIError', 'google.api_core.exceptions.GoogleAPIError')
    
    content = re.sub(
        r'def _sdk_available\(\) -> bool:.*?return False',
        '''def _sdk_available() -> bool:
    try:
        importlib.import_module("google.generativeai")
        return True
    except ImportError:
        return False''',
        content,
        flags=re.DOTALL
    )

    content = re.sub(
        r'DEFAULT_MODEL = "claude-[^"]+"',
        'DEFAULT_MODEL = "gemini-1.5-pro"',
        content
    )
    
    # Actually just write a clean new llm_answer function
    new_llm_answer = '''
def llm_answer(messages: list[dict[str, str]], persona: str, page: str | None, reg: Registry) -> str:
    import google.generativeai as genai
    import google.api_core.exceptions
    
    genai.configure(api_key=_key())
    model_name = _model()
    
    from .app import sim_clock
    system = SYSTEM_TMPL.format(role=ROLE_LABELS.get(persona, persona), page=page or "unknown", as_of=sim_clock().date().isoformat())
    
    model = genai.GenerativeModel(model_name=model_name, system_instruction=system)
    
    sources = [system, *(m["content"] for m in messages if m["role"] == "user")]
    
    # Convert messages to Gemini format
    history = []
    for m in messages[:-1]:
        role = "user" if m["role"] == "user" else "model"
        history.append({"role": role, "parts": [m["content"]]})
        
    chat = model.start_chat(history=history)
    
    if not BUDGET.take():
        raise LLMUnavailable("hourly LLM call budget reached")
        
    try:
        last_msg = messages[-1]["content"] if messages else "Hello"
        resp = chat.send_message(last_msg)
    except google.api_core.exceptions.GoogleAPIError as exc:
        raise LLMUnavailable(type(exc).__name__) from None
        
    text = resp.text
    if not text:
        raise LLMUnavailable("empty reply")
        
    text = strip_unknown_citations(text, reg)
    text, dropped = guard_numbers(text, sources)
    if dropped:
        log.info("assistant: dropped %d unsupported sentence(s)", dropped)
    if not text.strip():
        raise LLMUnavailable("reply had no supported sentences")
    return text
'''

    content = re.sub(r'def llm_answer.*?def _normalise', new_llm_answer + '\n\n# ------------------------------------------------------------------ API\nclass ChatMsg(BaseModel):\n    role: str\n    content: str\n\nclass ChatIn(BaseModel):\n    messages: list[ChatMsg] = Field(default_factory=list)\n    persona: str = "operations_manager"\n    page: str | None = None\n\ndef _normalise', content, flags=re.DOTALL)
    
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)

update_assistant()

