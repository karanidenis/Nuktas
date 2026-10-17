"""The Python sign catalogue and the JS SATS source must never drift.

`agent/src/nuktas_agent/sats_signs.json` is generated from
`mcp-server/src/sats.js`. If someone edits the SATS catalogue in one place, this
test fails until the other is regenerated, so the prompt the model sees always
matches the codes the scorer actually understands.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from nuktas_agent.protocol import load_signs

REPO_ROOT = Path(os.environ.get("NUKTAS_REPO_ROOT", Path(__file__).resolve().parents[2]))
SATS_JS = REPO_ROOT / "mcp-server" / "src" / "sats.js"


def _js_catalogue() -> list[dict]:
    node = shutil.which("node")
    if not node:
        pytest.skip("node is not installed")
    script = (
        "const s=require(process.argv[1]);"
        "console.log(JSON.stringify(Object.entries(s.SIGN_CATALOG)"
        ".map(([code,v])=>({code,colour:v.colour,label:v.label,ref:v.ref}))));"
    )
    out = subprocess.check_output([node, "-e", script, str(SATS_JS)], text=True)
    return json.loads(out)


def test_catalogue_matches_js_source():
    py = [{k: s[k] for k in ("code", "colour", "label", "ref")} for s in load_signs()]
    js = _js_catalogue()
    assert py == js, "sats_signs.json is out of date — regenerate it from sats.js"


def test_every_sign_has_a_colour_and_a_reference():
    for sign in load_signs():
        assert sign["colour"] in {"red", "orange", "yellow", "green"}
        assert sign["ref"], f"{sign['code']} has no source reference"
        assert sign["label"]
