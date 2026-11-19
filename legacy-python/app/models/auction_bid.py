from __future__ import annotations

from sqlalchemy import BigInteger, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base, TimestampMixin


class AuctionBid(Base, TimestampMixin):
    __tablename__ = "auction_bids"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    auction_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("auctions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[int] = mapped_column(BigInteger, nullable=False)
