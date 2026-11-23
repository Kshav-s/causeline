"""Relational schema. Source identifiers are preserved; optional relationships use nullable FKs.

Provenance vocabulary used across tables (see docs/DATABASE_SCHEMA.md):
  recorded           - value came from a source record (import / manual entry)
  human_verified     - a user confirmed or corrected a model output
  model_prediction   - live output of a registered model version
  historical_output  - pre-computed output shipped with the ML package
  rule_based         - deterministic calculation in CauseLine
"""
from datetime import date, datetime, timezone

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.session import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# ---------------------------------------------------------------- users
class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="analyst")  # admin | analyst
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    theme: Mapped[str] = mapped_column(String(10), default="light")
    table_density: Mapped[str] = mapped_column(String(12), default="comfortable")
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------- uploads
class Upload(TimestampMixin, Base):
    __tablename__ = "uploads"
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(30), unique=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))  # immutable copy of the original file
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer)
    file_type: Mapped[str] = mapped_column(String(10))
    sheet_name: Mapped[str | None] = mapped_column(String(120))
    column_mapping: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded|validated|imported|failed|cancelled
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_valid: Mapped[int] = mapped_column(Integer, default=0)
    rows_inserted: Mapped[int] = mapped_column(Integer, default=0)
    rows_duplicate: Mapped[int] = mapped_column(Integer, default=0)
    rows_failed: Mapped[int] = mapped_column(Integer, default=0)
    validation_summary: Mapped[dict | None] = mapped_column(JSON)
    is_synthetic_source: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


# ---------------------------------------------------------------- complaints
class Complaint(TimestampMixin, Base):
    __tablename__ = "complaints"
    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)  # source identifier
    source: Mapped[str] = mapped_column(String(20), default="import")  # import | manual
    upload_id: Mapped[int | None] = mapped_column(ForeignKey("uploads.id"), index=True)
    source_row_number: Mapped[int | None] = mapped_column(Integer)
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    data_origin: Mapped[str | None] = mapped_column(String(60))

    complaint_received_date: Mapped[date] = mapped_column(Date, index=True)
    event_date: Mapped[date | None] = mapped_column(Date)
    complaint_channel: Mapped[str | None] = mapped_column(String(40))
    customer_id: Mapped[str | None] = mapped_column(String(40), index=True)
    customer_name: Mapped[str | None] = mapped_column(String(200))
    customer_segment: Mapped[str | None] = mapped_column(String(60))
    customer_region: Mapped[str | None] = mapped_column(String(60))
    product_id: Mapped[str | None] = mapped_column(String(40), index=True)
    product_name: Mapped[str] = mapped_column(String(200), index=True)
    food_family: Mapped[str | None] = mapped_column(String(60), index=True)
    product_category: Mapped[str | None] = mapped_column(String(60))
    batch_id: Mapped[str | None] = mapped_column(String(40), index=True)
    shipment_id: Mapped[str | None] = mapped_column(String(40))
    dispatch_date: Mapped[date | None] = mapped_column(Date)

    complaint_summary: Mapped[str | None] = mapped_column(String(300))
    complaint_description: Mapped[str] = mapped_column(Text)
    complaint_category: Mapped[str | None] = mapped_column(String(80), index=True)
    category_source: Mapped[str | None] = mapped_column(String(20))  # recorded | human_verified
    defect_subcategory: Mapped[str | None] = mapped_column(String(200))
    reported_units_affected: Mapped[int | None] = mapped_column(Integer)
    complaint_severity: Mapped[str | None] = mapped_column(String(20), index=True)  # Routine|Major|Critical
    severity_score: Mapped[int | None] = mapped_column(Integer)
    food_safety_related_flag: Mapped[bool | None] = mapped_column(Boolean)
    health_impact_reported: Mapped[bool | None] = mapped_column(Boolean)

    investigation_id: Mapped[str | None] = mapped_column(String(40))
    investigation_status: Mapped[str | None] = mapped_column(String(40))
    root_cause_category: Mapped[str | None] = mapped_column(String(120), index=True)
    root_cause_status: Mapped[str | None] = mapped_column(String(30))  # Confirmed|Probable|Hypothesis|Unknown|Not assessed
    root_cause_confidence: Mapped[float | None] = mapped_column(Float)
    root_cause_evidence: Mapped[str | None] = mapped_column(String(200))

    capa_id: Mapped[str | None] = mapped_column(String(40), index=True)
    prior_capa_id: Mapped[str | None] = mapped_column(String(40), index=True)
    recurrence_after_prior_capa: Mapped[bool | None] = mapped_column(Boolean)
    capa_follow_up_days: Mapped[float | None] = mapped_column(Float)
    capa_effectiveness_status: Mapped[str | None] = mapped_column(String(80))

    haccp_control_id: Mapped[str | None] = mapped_column(String(40))
    haccp_process_step: Mapped[str | None] = mapped_column(String(80))
    potential_haccp_gap_flag: Mapped[bool | None] = mapped_column(Boolean)

    complaint_status: Mapped[str] = mapped_column(String(40), default="Open", index=True)
    complaint_closed_date: Mapped[date | None] = mapped_column(Date)
    owner: Mapped[str | None] = mapped_column(String(120))

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    extra: Mapped[dict | None] = mapped_column(JSON)  # unmapped source columns, preserved verbatim

    # Public submission (source = "public"). Personal data is never returned by public list endpoints.
    submitter_name: Mapped[str | None] = mapped_column(String(120))
    submitter_organisation: Mapped[str | None] = mapped_column(String(160))
    submitter_email: Mapped[str | None] = mapped_column(String(255))
    additional_info: Mapped[str | None] = mapped_column(Text)
    access_key_hash: Mapped[str | None] = mapped_column(String(64))  # sha256 of the submitter's private key; key itself never stored
    # sha256 of the form's one-time submission token: a repeated submission of the same form is rejected (idempotency)
    submission_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)
    analysis_status: Mapped[str | None] = mapped_column(String(20), index=True)  # pending | completed | partial | failed
    analysis_attempts: Mapped[int | None] = mapped_column(Integer, default=0)
    last_analysis_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Confirmed root cause recorded by an investigator (separate from any model suggestion)
    root_cause_confirmed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    root_cause_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_complaints_status_date", "complaint_status", "complaint_received_date"),)


class ComplaintAttachment(Base):
    """Supporting photographs. Files live in private storage (never in a DB text column, never in a public web root)."""
    __tablename__ = "complaint_attachments"
    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_pk: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    stored_name: Mapped[str] = mapped_column(String(80), unique=True)  # random name on disk
    original_filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # C7: stored_name is the metadata-stripped display copy; the untouched original is retained in restricted storage
    sanitized: Mapped[bool | None] = mapped_column(Boolean)
    metadata_removed: Mapped[dict | None] = mapped_column(JSON)  # what was found and removed (e.g. {"gps": true, "exif_tags": 14})
    original_stored_name: Mapped[str | None] = mapped_column(String(80))
    original_sha256: Mapped[str | None] = mapped_column(String(64))
    original_size_bytes: Mapped[int | None] = mapped_column(Integer)


class InvestigationNote(Base):
    __tablename__ = "investigation_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_pk: Mapped[int] = mapped_column(ForeignKey("complaints.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


# ---------------------------------------------------------------- ML
class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    model_key: Mapped[str] = mapped_column(String(40), index=True)
    version: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(120))
    purpose: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(20))  # ml | rule | retrieval
    artifact_paths: Mapped[list] = mapped_column(JSON, default=list)
    artifact_sha256: Mapped[dict] = mapped_column(JSON, default=dict)
    input_schema: Mapped[dict] = mapped_column(JSON, default=dict)
    output_schema: Mapped[dict] = mapped_column(JSON, default=dict)
    preprocessing_version: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20))  # ready | degraded | blocked
    status_reason: Mapped[str | None] = mapped_column(Text)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    limitations: Mapped[list] = mapped_column(JSON, default=list)
    confidence_supported: Mapped[bool] = mapped_column(Boolean, default=False)
    low_confidence_threshold: Mapped[float | None] = mapped_column(Float)
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (UniqueConstraint("model_key", "version"),)


class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # PRD-000001
    run_id: Mapped[str] = mapped_column(String(36), index=True)  # groups the models run in one analysis
    model_version_id: Mapped[int] = mapped_column(ForeignKey("model_versions.id"), index=True)
    complaint_pk: Mapped[int | None] = mapped_column(ForeignKey("complaints.id", ondelete="SET NULL"), index=True)
    subject_type: Mapped[str] = mapped_column(String(20), default="complaint")  # complaint | text | batch
    input_payload: Mapped[dict] = mapped_column(JSON)
    output_payload: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(20))  # completed | insufficient_data | error
    top_label: Mapped[str | None] = mapped_column(String(200))
    top_score: Mapped[float | None] = mapped_column(Float)
    low_confidence: Mapped[bool] = mapped_column(Boolean, default=False)
    message: Mapped[str | None] = mapped_column(Text)
    review_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|confirmed|rejected|corrected|not_applicable
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    model_version: Mapped[ModelVersion] = relationship(lazy="joined")
    reviews: Mapped[list["PredictionReview"]] = relationship(back_populates="prediction", order_by="PredictionReview.created_at")


class PredictionReview(Base):
    __tablename__ = "prediction_reviews"
    id: Mapped[int] = mapped_column(primary_key=True)
    prediction_id: Mapped[int] = mapped_column(ForeignKey("predictions.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(20))  # confirmed | rejected | corrected
    corrected_label: Mapped[str | None] = mapped_column(String(200))
    reason: Mapped[str | None] = mapped_column(Text)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    prediction: Mapped[Prediction] = relationship(back_populates="reviews")


# Pre-computed outputs shipped in ml_predictive_analytics/outputs (historical model output, not live)
class HistoricalRootCauseHypothesis(Base):
    __tablename__ = "historical_root_cause_hypotheses"
    id: Mapped[int] = mapped_column(primary_key=True)
    complaint_id: Mapped[str] = mapped_column(String(40), index=True)  # source id (soft link)
    complaint_pk: Mapped[int | None] = mapped_column(ForeignKey("complaints.id", ondelete="SET NULL"), index=True)
    hypotheses: Mapped[list] = mapped_column(JSON)  # [{cause, probability}] x3
    source_file: Mapped[str] = mapped_column(String(200))
    model_version_id: Mapped[int | None] = mapped_column(ForeignKey("model_versions.id"))


class HistoricalBatchRiskScore(Base):
    __tablename__ = "historical_batch_risk_scores"
    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(40), index=True)
    product_id: Mapped[str | None] = mapped_column(String(40), index=True)
    product_name: Mapped[str | None] = mapped_column(String(200))
    production_date: Mapped[date | None] = mapped_column(Date)
    model_split: Mapped[str | None] = mapped_column(String(20))
    risk_score: Mapped[float] = mapped_column(Float)
    risk_tier: Mapped[str] = mapped_column(String(10), index=True)
    actual_complaint_30d: Mapped[bool | None] = mapped_column(Boolean)  # recorded outcome
    top_risk_drivers: Mapped[str | None] = mapped_column(Text)
    recommended_action: Mapped[str | None] = mapped_column(Text)
    source_file: Mapped[str] = mapped_column(String(200))


class CapaWatchlistEntry(Base):
    """open_capas_watchlist.csv - CAPA status as recorded in the (unsupplied) CAPA history table."""
    __tablename__ = "capa_watchlist"
    id: Mapped[int] = mapped_column(primary_key=True)
    capa_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    capa_status: Mapped[str | None] = mapped_column(String(60))
    root_cause_category: Mapped[str | None] = mapped_column(String(120))
    root_cause_status: Mapped[str | None] = mapped_column(String(30))
    historical_ineffective_rate_for_root_cause: Mapped[float | None] = mapped_column(Float)
    source_file: Mapped[str] = mapped_column(String(200))


# ---------------------------------------------------------------- operations
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    entity_type: Mapped[str | None] = mapped_column(String(40))
    entity_id: Mapped[str | None] = mapped_column(String(60))
    details: Mapped[dict | None] = mapped_column(JSON)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    audience_role: Mapped[str | None] = mapped_column(String(20))  # set when broadcast to a role
    kind: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))
    read_by: Mapped[list] = mapped_column(JSON, default=list)  # user ids that have read a broadcast
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class DemoBooking(TimestampMixin, Base):
    __tablename__ = "demo_bookings"
    id: Mapped[int] = mapped_column(primary_key=True)
    reference: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    organisation: Mapped[str] = mapped_column(String(160))
    job_role: Mapped[str | None] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(40))
    preferred_date: Mapped[date] = mapped_column(Date)
    time_slot: Mapped[str] = mapped_column(String(20))
    timezone: Mapped[str] = mapped_column(String(60))
    purpose: Mapped[str] = mapped_column(Text)
    consent: Mapped[bool] = mapped_column(Boolean)
    status: Mapped[str] = mapped_column(String(20), default="new")  # new|contacted|scheduled|completed|cancelled
    internal_notes: Mapped[str | None] = mapped_column(Text)
    notification_status: Mapped[str | None] = mapped_column(String(120))
    ip_address: Mapped[str | None] = mapped_column(String(64))
