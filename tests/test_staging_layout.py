"""Staging visual-regression contracts for all primary PWA screens and Svitlo Office.
These checks are intentionally build-independent. Browser screenshots remain a
separate pre-release step on iPhone and desktop.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def text(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_all_primary_screens_get_layout_rules():
    html = text("index.html")
    css = text("style.css")
    for section in ("home", "detail", "updates", "settings"):
        assert f'id="{section}"' in html
    assert "STAGING / GLOBAL UI QUALITY PASS" in css
    for selector in (
        ".viewport{width:100%", ".status-footer{min-width:0",
        ".hour-grid{grid-template-columns:repeat(4,minmax(0,1fr))",
        "#updates .inbox-filters{touch-action:pan-x",
        "#settings .setting-line", ".share-preview-dialog{box-sizing:border-box",
        "@media(max-width:390px)", "@media(max-width:345px)",
    ):
        assert selector in css


def test_theme_covers_main_screens_and_dynamic_notices():
    theme = text("theme.css")
    assert "STAGING / APPLICATION-WIDE NIGHT FINISH" in theme
    for selector in (
        ".hour-cell.on", ".hour-cell.off", ".hour-cell.unknown",
        ".maintenance-inline-icon", ".maintenance-inline-countdown",
        ".inbox-context-actions", ".settings-card", ".sheet",
        ".share-preview-dialog", ".beta-consent-dialog",
        ".support-shell .conversation-bubble:not(.from-admin)",
        ".support-shell .conversation-bubble.from-admin",
    ):
        assert selector in theme


def test_office_navigation_avoids_repeated_snapshot_animations():
    tabs = text("admin-extra.js")
    motion = text("motion.js")
    office = text("admin-workstation-v3.css")
    assert "document.startViewTransition(apply)" not in tabs
    assert "if(marketing&&'MutationObserver'in window)" in motion
    assert "STAGING / OFFICE QUALITY PASS" in office
    assert "view-transition-name:none!important" in office
    assert "min-height:0!important" in office
    assert "max-width:100%" in office
    assert "max-width:1050px" in office
    assert "max-width:760px" in office
    assert "max-width:420px" in office


def test_core_customer_chat_keeps_sender_orientation():
    css = text("feedback.css")
    dark = text("theme.css")
    assert ".conversation-bubble:not(.from-admin){margin-left:auto" in css
    assert ".conversation-bubble.from-admin{margin-left:0;margin-right:auto" in css
    assert ".conversation-bubble:not(.from-admin)" in dark
    assert ".conversation-bubble.from-admin" in dark


def test_inbox_history_has_no_delete_all_read_action():
    markup = text("index.html")
    inbox = text("inbox-ui.js")
    database = text("notification-center.js")
    assert 'id="inboxClear"' not in markup
    assert "inboxClear" not in inbox
    assert "clearRead" not in database
    assert "oldest.slice" not in database
