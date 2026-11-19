from __future__ import annotations

from app.services.referrals.service import build_deep_link_payload, parse_inviter_id


def test_payload_roundtrip():
    assert parse_inviter_id(build_deep_link_payload(123456789)) == 123456789


def test_invalid_payloads():
    for bad in (None, "", "abc", "ref_", "ref_x1"):
        assert parse_inviter_id(bad) is None
