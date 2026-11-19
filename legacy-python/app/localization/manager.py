"""Менеджер локализации.

RU и EN тексты — плоские словари TEXTS[key] -> строка (может содержать
{placeholders} для .format()) в app/localization/ru.py и en.py. Ключи в
обоих словарях должны совпадать по смыслу и составу — согласованность
проверяется LocalizationManager.missing_keys() (используется в tests/ на
этапе Tests), а не в рантайме, чтобы не тормозить старт бота.

Не писать русский/английский текст непосредственно в handlers — только
через t()/loc.get()."""
from __future__ import annotations

from app.core.enums import Language
from app.localization import en as en_texts
from app.localization import ru as ru_texts

_CATALOGS: dict[Language, dict[str, str]] = {
    Language.RU: ru_texts.TEXTS,
    Language.EN: en_texts.TEXTS,
}


class LocalizationManager:
    def __init__(self, default: Language = Language.RU) -> None:
        self.default = default

    def get(self, key: str, language: Language | None = None, **kwargs: object) -> str:
        lang = language or self.default
        catalog = _CATALOGS.get(lang, _CATALOGS[self.default])
        template = catalog.get(key)
        if template is None:
            # Отсутствующий ключ не должен ронять бота: откатываемся на
            # дефолтный язык, затем на сам ключ (чтобы пробел был заметен).
            template = _CATALOGS[self.default].get(key, key)
        if not kwargs:
            return template
        try:
            return template.format(**kwargs)
        except (KeyError, IndexError):
            return template

    def missing_keys(self) -> dict[Language, set[str]]:
        """Ключи, отсутствующие в одном каталоге, но присутствующие в другом."""
        all_keys = set(ru_texts.TEXTS) | set(en_texts.TEXTS)
        return {lang: all_keys - set(catalog) for lang, catalog in _CATALOGS.items()}


loc = LocalizationManager(default=Language.RU)


def t(key: str, language: Language | None = None, **kwargs: object) -> str:
    """Короткий шорткат: from app.localization.manager import t"""
    return loc.get(key, language, **kwargs)
