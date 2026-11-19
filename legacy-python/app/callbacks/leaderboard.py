from aiogram.filters.callback_data import CallbackData


class LeaderboardCallback(CallbackData, prefix="lb"):
    kind: str  # "rich" | "racers" | "profit"
