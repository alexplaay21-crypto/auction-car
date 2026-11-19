"""Разделы документации (как играть, контейнеры, аукцион, гараж, редкости,
VIP, рефералы, BP, магазин, правила и т.д.) — редактируются админом,
показываются при первом запуске и в Настройках → Документация."""
from __future__ import annotations

from sqlalchemy import BigInteger, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.enums import Language
from app.database.base import Base, TimestampMixin


class DocumentationPage(Base, TimestampMixin):
    __tablename__ = "documentation_pages"
    __table_args__ = (
        UniqueConstraint("section_key", "language", name="uq_documentation_section_lang"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    section_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    language: Mapped[Language] = mapped_column(nullable=False)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    updated_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
