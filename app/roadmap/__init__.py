"""Read-only repository model for the Roadmap application."""

from .loader import Entity, RoadmapIndex, load_repository

__all__ = ["Entity", "RoadmapIndex", "load_repository"]
