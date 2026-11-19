"""Доступ к разделам документации: DocumentationPage."""
from __future__ import annotations

from sqlalchemy import select

from app.core.enums import Language
from app.models.documentation import DocumentationPage
from app.repositories.base import BaseRepository


class DocumentationRepository(BaseRepository[DocumentationPage]):
    model = DocumentationPage

    async def get_section(self, section_key: str, language: Language) -> DocumentationPage | None:
        stmt = select(DocumentationPage).where(
            DocumentationPage.section_key == section_key, DocumentationPage.language == language
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_sections(self, language: Language) -> list[DocumentationPage]:
        stmt = select(DocumentationPage).where(DocumentationPage.language == language)
        return list((await self.session.execute(stmt)).scalars())

    async def list_all_sections(self) -> list[DocumentationPage]:
        """Все разделы (для списка в админке) — берём RU-версии как канон,
        EN существует параллельно с тем же section_key."""
        stmt = select(DocumentationPage).where(DocumentationPage.language == Language.RU)
        return list((await self.session.execute(stmt)).scalars())

    async def delete_section(self, section_key: str) -> None:
        stmt = select(DocumentationPage).where(DocumentationPage.section_key == section_key)
        for row in (await self.session.execute(stmt)).scalars():
            await self.delete(row)

    async def upsert(
        self, section_key: str, language: Language, title: str, content: str, updated_by: int | None,
    ) -> DocumentationPage:
        page = await self.get_section(section_key, language)
        if page is None:
            page = DocumentationPage(
                section_key=section_key, language=language, title=title,
                content=content, updated_by=updated_by,
            )
            self.add(page)
        else:
            page.title = title
            page.content = content
            page.updated_by = updated_by
        return page
