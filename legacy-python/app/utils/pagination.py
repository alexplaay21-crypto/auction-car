"""Простая пагинация для списков (гараж, магазин, история и т.п.)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar("T")


@dataclass(slots=True)
class Page(Generic[T]):
    items: list[T]
    page: int          # 1-based
    page_size: int
    total: int

    @property
    def total_pages(self) -> int:
        if self.total == 0:
            return 1
        return (self.total + self.page_size - 1) // self.page_size

    @property
    def has_prev(self) -> bool:
        return self.page > 1

    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def clamp_page(page: int, total_pages: int) -> int:
    return max(1, min(page, total_pages))
