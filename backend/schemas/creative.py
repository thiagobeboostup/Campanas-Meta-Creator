from pydantic import BaseModel
from typing import Optional, List, Dict


class CreativeResponse(BaseModel):
    id: int
    original_name: str
    base_name: Optional[str] = None
    format: Optional[str] = None
    aspect_ratio: Optional[str] = None
    media_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    upload_status: str
    meta_image_hash: Optional[str] = None
    meta_video_id: Optional[str] = None

    model_config = {"from_attributes": True}


class CreativeWithThumbnail(CreativeResponse):
    thumbnail_url: Optional[str] = None
    selected: bool = True
    adset_name: Optional[str] = None


class CreativeSelectionUpdate(BaseModel):
    creative_ids: List[int]


class CreativeAssignmentUpdate(BaseModel):
    """Manual override: {creative_id: adset_name}"""
    assignments: Dict[int, str]


class CreativeAssignmentResponse(BaseModel):
    mode: str  # "subfolder" or "flat"
    assignments: Dict[str, List[CreativeWithThumbnail]]  # adset_name -> creatives


class CreativeMappingEntry(BaseModel):
    placement: str
    creative_id: int
    creative_name: str
    format: str
    fallback: bool = False


class CreativeMappingResponse(BaseModel):
    ad_name: str
    creative_ref: str
    mappings: List[CreativeMappingEntry] = []
    warnings: List[str] = []
