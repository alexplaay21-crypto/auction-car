from aiogram.filters.callback_data import CallbackData


class SkillCallback(CallbackData, prefix="skill"):
    action: str  # "up" | "confirm" | "cancel"
    skill_id: int
