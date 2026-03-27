from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class DeployStep(str, enum.Enum):
    creative_upload = "creative_upload"
    campaign = "campaign"
    adset = "adset"
    ad_creative = "ad_creative"
    ad = "ad"


class DeployStatus(str, enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"
    rolled_back = "rolled_back"


class DeployLog(Base):
    __tablename__ = "deploy_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    step = Column(SAEnum(DeployStep), nullable=False)
    entity_name = Column(String, nullable=True)
    meta_id = Column(String, nullable=True)
    status = Column(SAEnum(DeployStatus), default=DeployStatus.pending)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="deploy_logs")
