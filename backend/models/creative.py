from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class CreativeFormat(str, enum.Enum):
    square = "square"        # 1:1
    vertical = "vertical"    # 9:16
    horizontal = "horizontal"  # 16:9


class MediaType(str, enum.Enum):
    image = "image"
    video = "video"


class UploadStatus(str, enum.Enum):
    pending = "pending"
    downloaded = "downloaded"
    uploading = "uploading"
    uploaded = "uploaded"
    failed = "failed"


class Creative(Base):
    __tablename__ = "creatives"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    original_name = Column(String, nullable=False)
    base_name = Column(String, nullable=True)  # name without format suffix
    format = Column(SAEnum(CreativeFormat), nullable=True)
    aspect_ratio = Column(String, nullable=True)  # "1:1", "9:16", "16:9"
    media_type = Column(SAEnum(MediaType), nullable=True)
    local_path = Column(String, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    drive_file_id = Column(String, nullable=True)
    meta_image_hash = Column(String, nullable=True)
    meta_video_id = Column(String, nullable=True)
    upload_status = Column(SAEnum(UploadStatus), default=UploadStatus.pending)
    selected = Column(Boolean, default=True)  # User selection for campaign
    thumbnail_path = Column(String, nullable=True)  # Path to generated thumbnail
    adset_name = Column(String, nullable=True)  # AdSet assignment (from subfolder or name match)
    created_at = Column(DateTime, server_default=func.now())

    project = relationship("Project", back_populates="creatives")
