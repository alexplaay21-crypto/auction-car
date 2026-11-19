"""Базовая иерархия исключений приложения.

Все ошибки, которые должны быть показаны пользователю понятным сообщением,
наследуются от AppError и перехватываются в middlewares/errors.py.
"""
from __future__ import annotations


class AppError(Exception):
    """Базовая ошибка приложения с пользовательским сообщением."""

    def __init__(self, message: str = "Произошла ошибка. Попробуйте позже."):
        self.message = message
        super().__init__(message)


class NotConfiguredError(AppError):
    """Бот не сконфигурирован (нет .env / обязательных параметров)."""


class InsufficientFundsError(AppError):
    pass


class NotFoundError(AppError):
    pass


class PermissionDeniedError(AppError):
    pass


class ConcurrencyError(AppError):
    """Повторная/конкурентная операция, которую нужно безопасно отклонить."""
