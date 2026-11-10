import pytest

from nuktas_agent.config import load_settings


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on"])
def test_disable_thinking_truthy_values(monkeypatch, value):
    monkeypatch.setenv("LLM_DISABLE_THINKING", value)

    assert load_settings().disable_thinking is True


def test_disable_thinking_false_value(monkeypatch):
    monkeypatch.setenv("LLM_DISABLE_THINKING", "false")

    assert load_settings().disable_thinking is False
