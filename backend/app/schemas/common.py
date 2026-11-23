from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.ingestion.complaints import RC_STATUSES, SEVERITIES, STATUSES


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- auth / users
class LoginIn(BaseModel):
    # Plain string: sign-in only needs to match an existing account (deliverability checks would
    # reject internal domains such as *.local).
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class UserOut(ORM):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    theme: str
    table_density: str
    last_login_at: datetime | None
    created_at: datetime


class PreferencesIn(BaseModel):
    theme: Literal["light", "dark"] | None = None
    table_density: Literal["comfortable", "compact"] | None = None
    full_name: str | None = Field(None, min_length=2, max_length=200)


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)


class UserCreateIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=200)
    role: Literal["admin", "analyst"]
    password: str = Field(min_length=10, max_length=200)


class UserUpdateIn(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=200)
    role: Literal["admin", "analyst"] | None = None
    is_active: bool | None = None


# ---------------------------------------------------------------- complaints
class ComplaintBase(BaseModel):
    complaint_received_date: date
    event_date: date | None = None
    complaint_channel: str | None = Field(None, max_length=40)
    customer_id: str | None = Field(None, max_length=40)
    customer_name: str | None = Field(None, max_length=200)
    customer_segment: str | None = Field(None, max_length=60)
    customer_region: str | None = Field(None, max_length=60)
    product_id: str | None = Field(None, max_length=40)
    product_name: str = Field(min_length=2, max_length=200)
    food_family: str | None = Field(None, max_length=60)
    product_category: str | None = Field(None, max_length=60)
    batch_id: str | None = Field(None, max_length=40)
    shipment_id: str | None = Field(None, max_length=40)
    dispatch_date: date | None = None
    complaint_summary: str | None = Field(None, max_length=300)
    complaint_description: str = Field(min_length=10, max_length=5000)
    complaint_category: str | None = Field(None, max_length=80)
    defect_subcategory: str | None = Field(None, max_length=200)
    reported_units_affected: int | None = Field(None, ge=0, le=10_000_000)
    complaint_severity: Literal["Routine", "Major", "Critical"] | None = None
    food_safety_related_flag: bool | None = None
    health_impact_reported: bool | None = None
    complaint_status: Literal["Open", "Under investigation", "Awaiting customer information", "Closed"] = "Open"
    owner: str | None = Field(None, max_length=120)

    @field_validator("complaint_received_date")
    @classmethod
    def not_future(cls, v: date) -> date:
        if v > date.today():
            raise ValueError("Received date cannot be in the future")
        return v

    @field_validator("complaint_description")
    @classmethod
    def strip_desc(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Description must be at least 10 characters")
        return v


class ComplaintCreate(ComplaintBase):
    pass


class ComplaintUpdate(BaseModel):
    """Editable fields only. Source identifiers, provenance and recorded ML-training labels are not editable here."""
    complaint_status: Literal["Open", "Under investigation", "Awaiting customer information", "Closed"] | None = None
    complaint_severity: Literal["Routine", "Major", "Critical"] | None = None
    owner: str | None = Field(None, max_length=120)
    complaint_closed_date: date | None = None
    investigation_status: str | None = Field(None, max_length=40)
    root_cause_category: str | None = Field(None, max_length=120)
    root_cause_status: Literal["Confirmed", "Probable", "Hypothesis", "Unknown", "Not assessed"] | None = None
    batch_id: str | None = Field(None, max_length=40)
    change_reason: str = Field(min_length=3, max_length=500)


class ComplaintOut(ORM):
    id: int
    complaint_id: str
    source: str
    upload_id: int | None
    source_row_number: int | None
    is_synthetic: bool
    data_origin: str | None
    complaint_received_date: date
    event_date: date | None
    complaint_channel: str | None
    customer_id: str | None
    customer_name: str | None
    customer_segment: str | None
    customer_region: str | None
    product_id: str | None
    product_name: str
    food_family: str | None
    product_category: str | None
    batch_id: str | None
    shipment_id: str | None
    dispatch_date: date | None
    complaint_summary: str | None
    complaint_description: str
    complaint_category: str | None
    category_source: str | None
    defect_subcategory: str | None
    reported_units_affected: int | None
    complaint_severity: str | None
    severity_score: int | None
    food_safety_related_flag: bool | None
    health_impact_reported: bool | None
    investigation_id: str | None
    investigation_status: str | None
    root_cause_category: str | None
    root_cause_status: str | None
    root_cause_confidence: float | None
    root_cause_evidence: str | None
    capa_id: str | None
    prior_capa_id: str | None
    recurrence_after_prior_capa: bool | None
    capa_follow_up_days: float | None
    capa_effectiveness_status: str | None
    haccp_control_id: str | None
    haccp_process_step: str | None
    potential_haccp_gap_flag: bool | None
    complaint_status: str
    complaint_closed_date: date | None
    owner: str | None
    created_at: datetime
    updated_at: datetime


class ComplaintListItem(ORM):
    id: int
    complaint_id: str
    complaint_received_date: date
    product_name: str
    batch_id: str | None
    complaint_category: str | None
    category_source: str | None
    complaint_severity: str | None
    complaint_status: str
    owner: str | None
    complaint_summary: str | None
    is_synthetic: bool
    complaint_closed_date: date | None


# ---------------------------------------------------------------- ML
class AnalyzeTextIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    complaint_category: str | None = Field(None, max_length=80)
    food_family: str | None = Field(None, max_length=60)


class ReviewIn(BaseModel):
    action: Literal["confirmed", "rejected", "corrected"]
    corrected_label: str | None = Field(None, max_length=200)
    reason: str | None = Field(None, max_length=1000)


class BatchRiskIn(BaseModel):
    batch_id: str | None = Field(None, max_length=40)
    product_name: str | None = Field(None, max_length=200)
    production_date: date
    dispatch_date: date
    incoming_material_quality_score: float = Field(ge=0, le=100)
    process_deviation_count: int = Field(ge=0, le=1000)
    final_inspection_pass_rate_pct: float = Field(ge=0, le=100)
    remaining_shelf_life_days_at_dispatch: float = Field(ge=0, le=3650)
    shelf_life_days: float = Field(gt=0, le=3650)
    storage_hours_before_dispatch: float = Field(ge=0, le=10000)
    prior_product_complaints_90d: int = Field(ge=0, le=100000)
    prior_food_family_complaints_90d: int = Field(ge=0, le=100000)
    prior_customer_complaints_90d: int = Field(ge=0, le=100000)
    production_quantity_tonnes: float = Field(gt=0, le=100000)
    target_storage_temp_min_c: float = Field(ge=-40, le=60)
    target_storage_temp_max_c: float = Field(ge=-40, le=60)
    food_family: str = Field(max_length=60)
    product_category: str = Field(max_length=60)
    storage_profile: str = Field(max_length=40)
    plant_id: str = Field(max_length=40)
    production_line: str = Field(max_length=40)
    microbiological_test_status: str = Field(max_length=40)
    packaging_integrity_status: str = Field(max_length=20)
    weight_check_status: str = Field(max_length=20)
    vehicle_pre_cool_check: str = Field(max_length=20)
    destination_customer_segment: str = Field(max_length=60)
    destination_region: str = Field(max_length=60)
    production_shift: str = Field(max_length=20)
    batch_release_precheck: str = Field(max_length=60)

    @field_validator("dispatch_date")
    @classmethod
    def dispatch_after(cls, v, info):
        p = info.data.get("production_date")
        if p and v < p:
            raise ValueError("Dispatch date cannot be before production date")
        return v


# ---------------------------------------------------------------- demo bookings
TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]


class DemoBookingIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    organisation: str = Field(min_length=2, max_length=160)
    job_role: str | None = Field(None, max_length=120)
    email: EmailStr
    phone: str | None = Field(None, max_length=40, pattern=r"^[0-9+()\-\s]{6,40}$")
    preferred_date: date
    time_slot: Literal["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]
    timezone: str = Field(min_length=2, max_length=60)
    purpose: str = Field(min_length=20, max_length=1000)
    consent: bool
    website: str | None = Field(None, max_length=200, description="Honeypot - must be empty")

    @field_validator("preferred_date")
    @classmethod
    def future_weekday(cls, v: date) -> date:
        if v <= date.today():
            raise ValueError("Choose a date after today")
        if v.weekday() >= 5:
            raise ValueError("Demonstrations are scheduled on weekdays only")
        if (v - date.today()).days > 180:
            raise ValueError("Choose a date within the next 6 months")
        return v

    @field_validator("consent")
    @classmethod
    def must_consent(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Consent is required to process your request")
        return v


class DemoBookingOut(ORM):
    id: int
    reference: str
    full_name: str
    organisation: str
    job_role: str | None
    email: str
    phone: str | None
    preferred_date: date
    time_slot: str
    timezone: str
    purpose: str
    status: str
    internal_notes: str | None
    notification_status: str | None
    created_at: datetime
    updated_at: datetime


class DemoBookingUpdate(BaseModel):
    status: Literal["new", "contacted", "scheduled", "completed", "cancelled"] | None = None
    internal_notes: str | None = Field(None, max_length=4000)


class UploadValidateIn(BaseModel):
    sheet_name: str | None = None
    mapping: dict[str, str | None]


class UploadOut(ORM):
    id: int
    reference: str
    original_filename: str
    sha256: str
    size_bytes: int
    file_type: str
    sheet_name: str | None
    status: str
    rows_total: int
    rows_valid: int
    rows_inserted: int
    rows_duplicate: int
    rows_failed: int
    is_synthetic_source: bool
    created_at: datetime
    created_by_id: int | None


VALID_ENUMS = {"severity": SEVERITIES, "status": STATUSES, "root_cause_status": RC_STATUSES}
