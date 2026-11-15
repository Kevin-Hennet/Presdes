from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

Language = Literal["en", "es", "hi", "fr", "pt", "zh", "ar"]
SourceLanguage = Literal["en", "es", "hi", "fr", "pt", "zh", "ar", "und"]


def normalize_spacing(text: str) -> str:
    return " ".join(text.split())


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class ScanOptions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: Language = "en"


class PrintedSection(StrictModel):
    state: Literal["found", "unclear", "not_found"]
    excerpts: list[str]

    @model_validator(mode="after")
    def check_excerpts(self) -> "PrintedSection":
        if any(not text.strip() for text in self.excerpts):
            raise ValueError("Empty excerpt")
        if self.state == "found" and not self.excerpts:
            raise ValueError("Found sections require an excerpt")
        if self.state == "not_found" and self.excerpts:
            raise ValueError("Missing sections cannot contain excerpts")
        return self


class Explanations(StrictModel):
    simple: str
    detailed: str

    @model_validator(mode="after")
    def check_text(self) -> "Explanations":
        if not self.simple.strip() or not self.detailed.strip():
            raise ValueError("Both explanations require text")
        return self


class LabelAnalysis(StrictModel):
    readability: Literal["readable", "partial", "unreadable", "not_medication_label"]
    source_language: SourceLanguage
    extracted_text: str
    medication: PrintedSection
    directions: PrintedSection
    warnings: PrintedSection
    printed_dates: PrintedSection
    explanations: Explanations | None
    uncertainties: list[str]
    pharmacist_questions: list[str]

    @model_validator(mode="after")
    def check_consistency(self) -> "LabelAnalysis":
        transcript = normalize_spacing(self.extracted_text)
        sections = (self.medication, self.directions, self.warnings, self.printed_dates)
        usable = self.readability in {"readable", "partial"}
        if usable != bool(transcript):
            raise ValueError("Readability and transcript disagree")

        # This checks consistency within the model output, not accuracy against the photo.
        for section in sections:
            if any(normalize_spacing(text) not in transcript for text in section.excerpts):
                raise ValueError("Excerpt missing from extracted text")
        if any(not text.strip() for text in self.uncertainties + self.pharmacist_questions):
            raise ValueError("Empty uncertainty or question")
        if not usable and (self.explanations is not None or self.pharmacist_questions):
            raise ValueError("Unreadable or unrelated images cannot yield explanations")
        if self.readability == "partial" and not self.uncertainties:
            raise ValueError("Partially readable labels require uncertainty details")
        return self


class ScanResult(LabelAnalysis):
    id: UUID
    created_at: datetime
    explanation_language: Language


class LabelMatch(BaseModel):
    name: str
    manufacturer: str | None
    source_url: str


class ReferenceResults(BaseModel):
    matches: list[LabelMatch]
