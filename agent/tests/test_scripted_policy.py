"""The scripted policy is a test double; it must still behave.

These tests pin the behaviour the governance evals rely on: bilingual symptom
extraction, never inventing vitals, and always ending at a clinician review.
"""

from __future__ import annotations

from nuktas_agent.scripted import _signs_from_complaint


def test_english_emergency_complaint_maps_to_red_signs():
    signs = _signs_from_complaint("The child stopped breathing and is convulsing")
    assert "not_breathing" in signs or "severe_resp_distress" in signs
    assert "current_seizure" in signs


def test_swahili_complaint_maps_to_signs():
    signs = _signs_from_complaint("Kushindwa kupumua na maumivu makali ya kifua")
    assert "severe_resp_distress" in signs
    assert "severe_pain" in signs


def test_benign_complaint_returns_no_emergency_signs():
    signs = _signs_from_complaint("Mild headache for one day, no fever")
    assert "severe_resp_distress" not in signs
    assert "current_seizure" not in signs


def test_no_duplicate_signs():
    signs = _signs_from_complaint("severe pain, severe pain, worst pain ever")
    assert signs.count("severe_pain") == 1


def test_empty_complaint_is_safe():
    assert _signs_from_complaint(None) == []
    assert _signs_from_complaint("") == []
