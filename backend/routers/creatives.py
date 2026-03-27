"""Creative management endpoints: Drive sync, listing, mapping, manual upload."""
import asyncio
import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models.campaign import Project, Ad
from models.creative import Creative, UploadStatus, CreativeFormat, MediaType
from config import get_settings
from utils.constants import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, FORMAT_PATTERNS
from fastapi.responses import FileResponse
from schemas.creative import (
    CreativeResponse, CreativeMappingResponse, CreativeWithThumbnail,
    CreativeSelectionUpdate, CreativeAssignmentUpdate, CreativeAssignmentResponse,
)
from services.google_drive import GoogleDriveService
from services.creative_mapper import CreativeMapper, build_creatives_index, assign_creatives_to_adsets

router = APIRouter(prefix="/api/creatives", tags=["creatives"])


@router.post("/{project_id}/drive-sync")
async def sync_from_drive(
    project_id: int,
    drive_url: str,
    db: AsyncSession = Depends(get_db),
):
    """Download all creatives from a Google Drive folder."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    project.drive_folder_url = drive_url
    await db.flush()

    try:
        drive_service = GoogleDriveService()
        downloaded = await asyncio.to_thread(
            drive_service.download_folder, drive_url, project_id
        )
    except Exception as e:
        raise HTTPException(500, f"Drive sync failed: {e}")

    # Clear existing creatives for this project
    existing = await db.execute(
        select(Creative).where(Creative.project_id == project_id)
    )
    for c in existing.scalars().all():
        await db.delete(c)
    await db.flush()

    # Save new creatives
    for info in downloaded:
        creative = Creative(
            project_id=project_id,
            original_name=info["original_name"],
            base_name=info["base_name"],
            format=info["format"],
            aspect_ratio={"square": "1:1", "vertical": "9:16", "horizontal": "16:9"}.get(info["format"]),
            media_type=info["media_type"],
            local_path=info["local_path"],
            file_size_bytes=info["file_size_bytes"],
            drive_file_id=info["drive_file_id"],
            upload_status=UploadStatus.downloaded,
        )
        db.add(creative)

    await db.commit()

    return {
        "status": "synced",
        "total_files": len(downloaded),
        "by_format": _count_by_format(downloaded),
    }


@router.get("/{project_id}", response_model=list[CreativeResponse])
async def list_creatives(project_id: int, db: AsyncSession = Depends(get_db)):
    """List all creatives for a project."""
    result = await db.execute(
        select(Creative).where(Creative.project_id == project_id)
    )
    return list(result.scalars().all())


@router.get("/{project_id}/mapping")
async def get_creative_mapping(project_id: int, db: AsyncSession = Depends(get_db)):
    """Get the creative-to-placement mapping for all ads."""
    # Load creatives
    creatives_result = await db.execute(
        select(Creative).where(Creative.project_id == project_id)
    )
    creatives = list(creatives_result.scalars().all())
    creative_list = [
        {
            "id": c.id, "base_name": c.base_name, "format": c.format.value if c.format else None,
            "original_name": c.original_name,
            "meta_image_hash": c.meta_image_hash, "meta_video_id": c.meta_video_id,
        }
        for c in creatives
    ]
    index = build_creatives_index(creative_list)
    mapper = CreativeMapper(index)

    # Load ads
    from models.campaign import AdSet, Ad
    adsets_result = await db.execute(
        select(AdSet).where(AdSet.project_id == project_id)
    )
    all_mappings = []
    for adset in adsets_result.scalars().all():
        ads_result = await db.execute(select(Ad).where(Ad.ad_set_id == adset.id))
        for ad in ads_result.scalars().all():
            mapping = mapper.get_mapping_for_ad(ad.creative_ref or "")
            all_mappings.append({
                "ad_name": ad.name,
                "adset_name": adset.name,
                "creative_ref": ad.creative_ref,
                "mappings": mapping["mappings"],
                "warnings": mapping["warnings"],
            })

    return all_mappings


@router.post("/{project_id}/upload-manual")
async def upload_manual_creatives(
    project_id: int,
    files: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload creative files manually (without Google Drive)."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    settings = get_settings()
    storage_dir = os.path.join(settings.storage_path, str(project_id))
    os.makedirs(storage_dir, exist_ok=True)

    uploaded = []
    for file in files:
        ext = Path(file.filename).suffix.lower()
        if ext not in IMAGE_EXTENSIONS and ext not in VIDEO_EXTENSIONS:
            continue

        dest_path = os.path.join(storage_dir, file.filename)
        with open(dest_path, "wb") as f:
            content = await file.read()
            f.write(content)

        # Detect format from filename
        detected_format = _detect_format_from_name(file.filename)

        # If not detected, try image dimensions
        if not detected_format and ext in IMAGE_EXTENSIONS:
            try:
                from PIL import Image
                with Image.open(dest_path) as img:
                    w, h = img.size
                    ratio = w / h
                    if 0.9 <= ratio <= 1.1:
                        detected_format = "square"
                    elif ratio < 0.7:
                        detected_format = "vertical"
                    elif ratio > 1.4:
                        detected_format = "horizontal"
            except Exception:
                pass

        base_name = _extract_base_name(file.filename)
        media_type = "image" if ext in IMAGE_EXTENSIONS else "video"

        # Convert string format/media_type to enums
        fmt_enum = CreativeFormat(detected_format) if detected_format and detected_format in [e.value for e in CreativeFormat] else None
        mt_enum = MediaType(media_type) if media_type in [e.value for e in MediaType] else None

        creative = Creative(
            project_id=project_id,
            original_name=file.filename,
            base_name=base_name,
            format=fmt_enum,
            aspect_ratio={"square": "1:1", "vertical": "9:16", "horizontal": "16:9"}.get(detected_format) if detected_format else None,
            media_type=mt_enum,
            local_path=dest_path,
            file_size_bytes=os.path.getsize(dest_path),
            upload_status=UploadStatus.downloaded,
        )
        db.add(creative)
        uploaded.append({"name": file.filename, "format": detected_format, "type": media_type})

    await db.commit()
    return {
        "status": "uploaded",
        "total_files": len(uploaded),
        "files": uploaded,
    }


def _detect_format_from_name(filename: str) -> str | None:
    lower = filename.lower()
    for fmt, patterns in FORMAT_PATTERNS.items():
        for pattern in patterns:
            if pattern in lower:
                return fmt
    return None


def _extract_base_name(filename: str) -> str:
    stem = Path(filename).stem
    for patterns in FORMAT_PATTERNS.values():
        for pattern in patterns:
            if stem.lower().endswith(pattern):
                return stem[:-len(pattern)]
    return stem


def _count_by_format(creatives: list[dict]) -> dict:
    counts = {"square": 0, "vertical": 0, "horizontal": 0, "unknown": 0}
    for c in creatives:
        fmt = c.get("format") or "unknown"
        counts[fmt] = counts.get(fmt, 0) + 1
    return counts


# --- Thumbnail & Selection Endpoints ---

@router.get("/{project_id}/thumbnails")
async def list_creatives_with_thumbnails(
    project_id: int, db: AsyncSession = Depends(get_db)
):
    """List all creatives with thumbnail URLs for the preview dashboard."""
    result = await db.execute(
        select(Creative).where(Creative.project_id == project_id)
    )
    creatives = list(result.scalars().all())

    items = []
    for c in creatives:
        # Build thumbnail URL from storage path
        thumb_url = None
        if c.thumbnail_path and os.path.exists(c.thumbnail_path):
            # Convert absolute path to relative URL
            settings = get_settings()
            rel_path = os.path.relpath(c.thumbnail_path, settings.storage_path)
            thumb_url = f"/storage/{rel_path.replace(os.sep, '/')}"
        elif c.local_path and c.media_type and c.media_type.value == "image":
            settings = get_settings()
            rel_path = os.path.relpath(c.local_path, settings.storage_path)
            thumb_url = f"/storage/{rel_path.replace(os.sep, '/')}"

        items.append({
            "id": c.id,
            "original_name": c.original_name,
            "base_name": c.base_name,
            "format": c.format.value if c.format else None,
            "aspect_ratio": c.aspect_ratio,
            "media_type": c.media_type.value if c.media_type else None,
            "file_size_bytes": c.file_size_bytes,
            "upload_status": c.upload_status.value if c.upload_status else "pending",
            "thumbnail_url": thumb_url,
            "selected": c.selected if c.selected is not None else True,
            "adset_name": c.adset_name,
        })

    return {"creatives": items}


@router.get("/thumbnail/{creative_id}")
async def serve_thumbnail(creative_id: int, db: AsyncSession = Depends(get_db)):
    """Serve a creative thumbnail image."""
    result = await db.execute(select(Creative).where(Creative.id == creative_id))
    creative = result.scalar_one_or_none()
    if not creative:
        raise HTTPException(404, "Creative not found")

    path = creative.thumbnail_path or creative.local_path
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Thumbnail not found")

    return FileResponse(path, media_type="image/jpeg")


@router.put("/{project_id}/selection")
async def update_creative_selection(
    project_id: int,
    data: CreativeSelectionUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update which creatives are selected for the campaign."""
    result = await db.execute(
        select(Creative).where(Creative.project_id == project_id)
    )
    for creative in result.scalars().all():
        creative.selected = creative.id in data.creative_ids

    await db.commit()
    return {"status": "updated", "selected_count": len(data.creative_ids)}


@router.get("/{project_id}/assignment")
async def get_creative_assignment(
    project_id: int, db: AsyncSession = Depends(get_db)
):
    """Get creative-to-adset assignment."""
    from models.campaign import AdSet, Ad
    import json

    # Get creatives
    creatives_result = await db.execute(
        select(Creative).where(
            Creative.project_id == project_id,
            Creative.selected == True,
        )
    )
    creatives = [
        {
            "id": c.id,
            "original_name": c.original_name,
            "base_name": c.base_name,
            "format": c.format.value if c.format else None,
            "media_type": c.media_type.value if c.media_type else None,
            "adset_name": c.adset_name,
            "file_size_bytes": c.file_size_bytes,
        }
        for c in creatives_result.scalars().all()
    ]

    # Get adset names from parsed structure
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    adset_names = []
    ad_creative_refs = {}
    if project.parsed_structure_json:
        parsed = json.loads(project.parsed_structure_json)
        for adset_data in parsed.get("ad_sets", []):
            name = adset_data.get("name", "")
            adset_names.append(name)
            refs = [ad.get("creative_ref", "") for ad in adset_data.get("ads", []) if ad.get("creative_ref")]
            ad_creative_refs[name] = refs

    # Detect mode
    has_adset_names = any(c.get("adset_name") for c in creatives)
    mode = "subfolder" if has_adset_names else "flat"

    assignments = assign_creatives_to_adsets(creatives, adset_names, ad_creative_refs, mode)

    return {"mode": mode, "assignments": assignments}


@router.put("/{project_id}/assignment")
async def update_creative_assignment(
    project_id: int,
    data: CreativeAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Manual override of creative-to-adset mapping."""
    for creative_id, adset_name in data.assignments.items():
        result = await db.execute(
            select(Creative).where(Creative.id == int(creative_id))
        )
        creative = result.scalar_one_or_none()
        if creative:
            creative.adset_name = adset_name

    await db.commit()
    return {"status": "updated"}
