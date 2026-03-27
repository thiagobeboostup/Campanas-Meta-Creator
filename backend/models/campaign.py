from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class ProjectStatus(str, enum.Enum):
    draft = "draft"
    parsed = "parsed"
    previewed = "previewed"
    deploying = "deploying"
    deployed = "deployed"
    failed = "failed"


class BudgetType(str, enum.Enum):
    cbo = "CBO"
    abo = "ABO"


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    status = Column(SAEnum(ProjectStatus), default=ProjectStatus.draft)
    campaign_objective = Column(String, nullable=True)
    budget_type = Column(SAEnum(BudgetType), default=BudgetType.cbo)
    daily_budget = Column(Float, nullable=True)
    lifetime_budget = Column(Float, nullable=True)
    ad_account_id = Column(String, nullable=True)
    business_id = Column(String, nullable=True)  # Business Portfolio ID
    mode = Column(String, default="create")  # "create" or "modify"
    meta_source_campaign_id = Column(String, nullable=True)  # For modify mode
    drive_folder_url = Column(String, nullable=True)
    raw_document_text = Column(Text, nullable=True)
    parsed_structure_json = Column(Text, nullable=True)
    naming_template = Column(Text, nullable=True)
    meta_campaign_id = Column(String, nullable=True)
    destination_url = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    ad_sets = relationship("AdSet", back_populates="project", cascade="all, delete-orphan")
    creatives = relationship("Creative", back_populates="project", cascade="all, delete-orphan")
    deploy_logs = relationship("DeployLog", back_populates="project", cascade="all, delete-orphan")


class AdSet(Base):
    __tablename__ = "ad_sets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    name = Column(String, nullable=False)
    generated_name = Column(String, nullable=True)
    targeting_json = Column(Text, nullable=True)
    placements_json = Column(Text, nullable=True)
    budget = Column(Float, nullable=True)  # for ABO
    bid_strategy = Column(String, default="LOWEST_COST_WITHOUT_CAP")
    optimization_goal = Column(String, default="OFFSITE_CONVERSIONS")
    meta_adset_id = Column(String, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="ad_sets")
    ads = relationship("Ad", back_populates="ad_set", cascade="all, delete-orphan")


class Ad(Base):
    __tablename__ = "ads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ad_set_id = Column(Integer, ForeignKey("ad_sets.id"), nullable=False)
    name = Column(String, nullable=False)
    generated_name = Column(String, nullable=True)
    creative_ref = Column(String, nullable=True)
    creative_mapping_json = Column(Text, nullable=True)
    headline = Column(String, nullable=True)
    primary_text = Column(Text, nullable=True)
    description = Column(String, nullable=True)
    cta = Column(String, default="SHOP_NOW")
    url = Column(String, nullable=True)
    url_tags = Column(String, nullable=True)
    meta_ad_id = Column(String, nullable=True)
    meta_creative_id = Column(String, nullable=True)
    status = Column(String, default="pending")
    created_at = Column(DateTime, server_default=func.now())

    ad_set = relationship("AdSet", back_populates="ads")
