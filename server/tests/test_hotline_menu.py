import re

import pytest

from app.agents import hotline_menu
from app.agents.hotline_menu import MENU, MENU_AGAIN, TELL_ME, HotlineMenu, MenuReading, menu

RULES = HotlineMenu(use_default_llm=False)


class FakeLLM:
    def __init__(self, choice):
        self.choice, self.calls = choice, []

    def structured(self, **kw):
        self.calls.append(kw)
        return None if self.choice is None else MenuReading(choice=self.choice)


class BrokenLLM:
    def structured(self, **kw):
        raise RuntimeError("model unreachable")


@pytest.mark.parametrize(
    "said",
    [
        "status",
        "I want to know the status of my case",
        "আমার মামলার অবস্থা জানতে চাই",
        "আগের মামলার খবর কী",
        "my tracking number is 4821 0937",
        "৪৮২১ ০৯৩৭",
        "what's the progress of my land case",  # names a problem, but asks about it
        "hear the progress of a case I already filed",
        "আগে করা মামলার অগ্রগতি জানতে চাই",
        "What about my case?",
        "আমার মামলার কী হলো?",
        "the second one",
        "দুই",
    ],
)
def test_asking_about_a_case_filed_before(said):
    assert RULES.choose(said) == "status"


@pytest.mark.parametrize(
    "said",
    [
        "new case",
        "I want to file a new case",
        "নতুন মামলা",
        "মামলা করতে চাই",
        "first one",
        "নতুন মামলা করতে চাই",
        "এক",
    ],
)
def test_asking_to_file_a_new_case(said):
    assert RULES.choose(said) == "new"


@pytest.mark.parametrize(
    "said",
    [
        "I want to file a case, my husband beats me every night",
        "My landlord took my land and will not give it back",
        "My neighbour's husband beats her and she has visible injuries",
        "He is beating me right now, help me now",
        "He locked me in the room",
        "আমাকে ঘরে আটকে রেখেছে",
        "আমার স্বামী আমাকে মারধর করে",
        "আমার জমি দখল করে নিয়েছে",
        "I want to file a case about my land",
        "I was raped",
        "I need help",
        # "অবস্থায়" is a caller in a bad state, not a request for a case's status.
        "আমি খুব খারাপ অবস্থায় আছি",
        # Numbers in everyday speech are not a choice of option.
        "I have two children and my husband left us",
        "one day my husband took all my gold and threw me out",
    ],
)
def test_a_caller_who_starts_telling_what_happened_is_heard(said):
    assert RULES.choose(said) == "story"


@pytest.mark.parametrize(
    "said",
    [
        "status? he is beating me right now",
        "মামলার অবস্থা জানতে চাই, স্বামী এখন মারছে",
        "my tracking number is 4821 0937, he locked me in",
    ],
)
def test_danger_is_heard_first_even_beside_a_status_request(said):
    llm = FakeLLM("status")
    assert HotlineMenu(llm=llm).choose(said) == "story"
    assert llm.calls == []


@pytest.mark.parametrize("said", ["hello?", "হ্যালো, শুনছেন?", "", "   ", "hmm", "মামলা"])
def test_no_answer_yet_is_asked_again_without_the_model(said):
    llm = FakeLLM("status")
    assert HotlineMenu(llm=llm).choose(said) == "unclear"
    assert llm.calls == []


def test_the_words_the_menu_asks_for_are_understood():
    for lang in ("en", "bn"):
        new_case, status = re.findall(r"'([^']+)'", MENU_AGAIN[lang])
        assert RULES.choose(new_case, lang) == "new"
        assert RULES.choose(status, lang) == "status"


def test_the_model_reads_only_short_answers_the_rules_cannot_place():
    assert RULES.choose("I want to know something", "en") == "unclear"

    llm = FakeLLM("status")
    reader = HotlineMenu(llm=llm)
    assert reader.choose("I want to know something", "en") == "status"
    call = llm.calls[0]
    assert call["schema"] is MenuReading
    assert MENU["en"] in call["system"] and "never 'status'" in call["system"]
    assert "I want to know something" in call["content"]
    # Bangla callers: the model is told the question as they heard it.
    reader.choose("কিছু একটা জানতে চাই", "bn")
    assert MENU["bn"] in llm.calls[1]["system"]

    for ruled in ("status", "new case", "My landlord took my land and will not give it back"):
        reader.choose(ruled, "en")
    assert len(llm.calls) == 2

    assert HotlineMenu(llm=FakeLLM("story")).choose("my husband", "en") == "story"
    assert HotlineMenu(llm=FakeLLM(None)).choose("I want to know something", "en") == "unclear"
    assert HotlineMenu(llm=BrokenLLM()).choose("I want to know something", "en") == "unclear"


def test_speech_to_text_spellings_of_bangla_letters_are_read_alike():
    # "য়" as one code point (U+09DF): the term tables write it as য + ়.
    assert RULES.choose("আমি ভয় পাচ্ছি") == "story"
    assert RULES.choose("দ্বিতীয়") == "status"


def test_one_shared_menu(monkeypatch):
    monkeypatch.setattr(hotline_menu, "_menu", None)
    assert isinstance(menu(), HotlineMenu)
    assert menu() is menu()


def test_texts_offer_both_options_and_keep_bangla_in_bangla():
    for text in (MENU, MENU_AGAIN, TELL_ME):
        assert set(text) == {"en", "bn"}
        assert not re.search(r"[A-Za-z]", text["bn"])
    assert "new case" in MENU["en"] and "progress" in MENU["en"]
    assert "নতুন মামলা" in MENU["bn"] and "অগ্রগতি" in MENU["bn"]
