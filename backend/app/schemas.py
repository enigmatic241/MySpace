"""Pydantic models for WorkHub API request/response bodies."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, ConfigDict

ItemType = Literal["link", "note", "todo", "snippet"]


class SectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    icon: str = "📁"
    color: str = "#22d3ee"
    sort: int = 0


class SectionUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    icon: Optional[str] = None
    color: Optional[str] = None
    sort: Optional[int] = None


class SectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    icon: str
    color: str
    sort: int


class ItemCreate(BaseModel):
    type: ItemType
    title: str = Field(min_length=1, max_length=200)
    url: Optional[str] = None
    body: Optional[str] = None
    section_id: Optional[int] = None
    tags: list[str] = []
    due_date: Optional[str] = None
    done: bool = False
    pinned: bool = False
    is_md: bool = False
    sort: int = 0
    icon: Optional[str] = None


class ItemUpdate(BaseModel):
    type: Optional[ItemType] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    url: Optional[str] = None
    body: Optional[str] = None
    section_id: Optional[int] = None
    tags: Optional[list[str]] = None
    due_date: Optional[str] = None
    done: Optional[bool] = None
    pinned: Optional[bool] = None
    is_md: Optional[bool] = None
    sort: Optional[int] = None
    icon: Optional[str] = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    type: ItemType
    title: str
    url: Optional[str] = None
    body: Optional[str] = None
    section_id: Optional[int] = None
    tags: list[str] = []
    due_date: Optional[str] = None
    done: bool = False
    pinned: bool = False
    is_md: bool = False
    sort: int = 0
    icon: Optional[str] = None
    copy_count: int = 0
    last_copied_at: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ExportOut(BaseModel):
    """Full backup payload: schema version + all sections and items."""

    app: str = "workhub"
    schema_version: int
    exported_at: datetime
    sections: list[SectionOut]
    items: list[ItemOut]
