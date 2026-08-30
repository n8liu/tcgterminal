from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Set(Base):
    __tablename__ = "sets"
    __table_args__ = (Index("ix_sets_name", "name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    series: Mapped[str | None] = mapped_column(String(255))
    printed_total: Mapped[int | None] = mapped_column(Integer)
    release_date: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    cards: Mapped[list["Card"]] = relationship(back_populates="set")


class Card(Base):
    __tablename__ = "cards"
    __table_args__ = (Index("ix_cards_name", "name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    set_id: Mapped[str] = mapped_column(ForeignKey("sets.id"), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(32), nullable=False)
    printed_total: Mapped[int | None] = mapped_column(Integer)
    rarity: Mapped[str | None] = mapped_column(String(128))
    image_url: Mapped[str | None] = mapped_column(String(1024))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    set: Mapped[Set] = relationship(back_populates="cards")
