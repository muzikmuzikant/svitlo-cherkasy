"""Regression checks for beta support conversations, inbox retention and theme coverage.
Static assertions catch accidental UI regressions without a browser or API secrets.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def source(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_customer_messages_are_on_the_right():
    css = source("feedback.css")
    assert ".conversation-bubble:not(.from-admin){margin-left:auto" in css
    assert ".conversation-bubble.from-admin{margin-left:0;margin-right:auto" in css


def test_inbox_has_one_mark_all_action_and_no_clear_control():
    markup = source("index.html")
    js = source("inbox-ui.js")
    store = source("notification-center.js")
    assert 'id="inboxMarkAll"' in markup
    assert markup.count('id="inboxMarkAll"') == 1
    assert 'id="inboxMarkAll" type="button" disabled>Прочитати всі</button>' in markup
    assert 'id="inboxClear"' not in markup
    assert "inboxClear" not in js
    assert "clearRead" not in store
    assert "oldest.slice" not in store


def test_customer_ticket_view_has_simple_composer():
    markup = source("feedback.html")
    assert 'placeholder="Повідомлення"' in markup
    assert 'id="closeConversation"' in markup
    # Recovering a case is optional and collapsed: it must not crowd the chat.
    assert '<details class="support-import" id="recoverTicket">' in markup
    assert 'id="lookupToken"' in markup
    assert '<details class="support-import" id="recoverTicket" open' not in markup
    assert "код із квитанції" not in markup.lower()
    assert 'id="conversationMessages"' in markup
    assert "is-reading" in source("feedback.js")


def test_support_local_notification_and_admin_refresh_are_deduped():
    support = source("support-inbox.js")
    admin = source("admin.js")
    assert "registration.showNotification" in support
    assert "Notification.permission!=='granted'" in support
    assert "localNotify(events)" in support
    assert "if(fingerprint===lastTicketsFingerprint)" in admin
    assert "ticketsReloading" in admin


def test_all_embedded_pages_have_dark_theme_rules():
    theme = source("theme.css")
    pages = [
        ("help.html", "svitlo-help-page"),
        ("about.html", "svitlo-about-page"),
        ("privacy.html", "svitlo-privacy-page"),
        ("terms.html", "svitlo-terms-page"),
        ("advertising.html", "svitlo-advertising-page"),
        ("ad-detail.html", "svitlo-ad-detail-page"),
        ("support-project.html", "svitlo-support-project-page"),
    ]
    for page, body_class in pages:
        assert f'class="{body_class}"' in source(page)
        assert body_class in theme
        assert 'href="./theme.css"' in source(page)
