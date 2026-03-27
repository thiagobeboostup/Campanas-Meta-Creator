from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum
from sqlalchemy.sql import func
from database import Base
import enum


class ProviderEnum(str, enum.Enum):
    meta = "meta"
    google = "google"


class TokenTypeEnum(str, enum.Enum):
    long_lived = "long_lived"
    oauth = "oauth"
    service_account = "service_account"


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(SAEnum(ProviderEnum), nullable=False)
    token_type = Column(SAEnum(TokenTypeEnum), nullable=False)
    access_token = Column(String, nullable=False)  # encrypted
    refresh_token = Column(String, nullable=True)  # encrypted
    expires_at = Column(DateTime, nullable=True)
    ad_account_id = Column(String, nullable=True)
    page_id = Column(String, nullable=True)  # Facebook Page ID for ad creatives
    business_id = Column(String, nullable=True)  # Business Portfolio ID
    business_name = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
