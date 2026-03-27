"""Google Drive service for downloading creative assets."""
import os
import io
import logging
import subprocess
from pathlib import Path
from typing import Optional
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from PIL import Image

from config import get_settings
from utils.constants import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, FORMAT_PATTERNS
from utils.validators import extract_drive_folder_id

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


class GoogleDriveService:
    def __init__(self, credentials: Optional[Credentials] = None):
        settings = get_settings()
        if credentials:
            self.creds = credentials
        elif settings.google_service_account_file:
            self.creds = service_account.Credentials.from_service_account_file(
                settings.google_service_account_file, scopes=SCOPES
            )
        else:
            raise ValueError("No Google credentials configured")
        self.service = build("drive", "v3", credentials=self.creds)

    def list_files(self, folder_id: str) -> list[dict]:
        """List all files in a Drive folder recursively."""
        all_files = []
        self._list_recursive(folder_id, all_files, "")
        return all_files

    def _list_recursive(self, folder_id: str, results: list, parent_path: str):
        page_token = None
        while True:
            response = self.service.files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields="nextPageToken, files(id, name, mimeType, size)",
                pageToken=page_token,
                pageSize=100,
            ).execute()

            for file in response.get("files", []):
                file["parent_path"] = parent_path
                if file["mimeType"] == "application/vnd.google-apps.folder":
                    # Recurse into subfolders
                    subfolder_path = os.path.join(parent_path, file["name"])
                    self._list_recursive(file["id"], results, subfolder_path)
                else:
                    results.append(file)

            page_token = response.get("nextPageToken")
            if not page_token:
                break

    def download_file(self, file_id: str, destination: str) -> str:
        """Download a file from Drive to local path."""
        os.makedirs(os.path.dirname(destination), exist_ok=True)
        request = self.service.files().get_media(fileId=file_id)
        with open(destination, "wb") as f:
            downloader = MediaIoBaseDownload(f, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
        logger.info(f"Downloaded {file_id} -> {destination}")
        return destination

    def download_folder(self, folder_url: str, project_id: int) -> list[dict]:
        """Download all creatives from a Drive folder."""
        settings = get_settings()
        folder_id = extract_drive_folder_id(folder_url)
        storage_dir = os.path.join(settings.storage_path, str(project_id))
        os.makedirs(storage_dir, exist_ok=True)

        files = self.list_files(folder_id)
        downloaded = []
        thumbnails_dir = os.path.join(storage_dir, "thumbnails")
        os.makedirs(thumbnails_dir, exist_ok=True)

        for file_info in files:
            name = file_info["name"]
            ext = Path(name).suffix.lower()

            # Only download image and video files
            if ext not in IMAGE_EXTENSIONS and ext not in VIDEO_EXTENSIONS:
                continue

            dest_path = os.path.join(storage_dir, name)
            self.download_file(file_info["id"], dest_path)

            # Generate thumbnail
            thumb_name = Path(name).stem + "_thumb.jpg"
            thumb_path = os.path.join(thumbnails_dir, thumb_name)
            self.generate_thumbnail(dest_path, thumb_path)

            creative_info = {
                "original_name": name,
                "base_name": self._extract_base_name(name),
                "format": self._detect_format(name, file_info.get("parent_path", "")),
                "media_type": "image" if ext in IMAGE_EXTENSIONS else "video",
                "local_path": dest_path,
                "file_size_bytes": int(file_info.get("size", 0)),
                "drive_file_id": file_info["id"],
                "thumbnail_path": thumb_path,
            }

            # If format not detected from name, try from image dimensions
            if not creative_info["format"] and ext in IMAGE_EXTENSIONS:
                creative_info["format"] = self._detect_format_from_dimensions(dest_path)

            downloaded.append(creative_info)

        return downloaded

    def list_files_with_structure(self, folder_id: str) -> dict:
        """Detect if the Drive folder uses subfolders or flat structure and return files accordingly."""
        page_token = None
        top_level_items = []
        while True:
            response = self.service.files().list(
                q=f"'{folder_id}' in parents and trashed=false",
                fields="nextPageToken, files(id, name, mimeType, size)",
                pageToken=page_token,
                pageSize=100,
            ).execute()
            top_level_items.extend(response.get("files", []))
            page_token = response.get("nextPageToken")
            if not page_token:
                break

        has_subfolders = any(
            item["mimeType"] == "application/vnd.google-apps.folder"
            for item in top_level_items
        )

        if has_subfolders:
            subfolders: dict[str, list[dict]] = {}
            for item in top_level_items:
                if item["mimeType"] == "application/vnd.google-apps.folder":
                    subfolder_name = item["name"]
                    subfolder_files = []
                    sub_page_token = None
                    while True:
                        sub_response = self.service.files().list(
                            q=f"'{item['id']}' in parents and trashed=false",
                            fields="nextPageToken, files(id, name, mimeType, size)",
                            pageToken=sub_page_token,
                            pageSize=100,
                        ).execute()
                        for f in sub_response.get("files", []):
                            subfolder_files.append({
                                "id": f["id"],
                                "name": f["name"],
                                "mimeType": f["mimeType"],
                                "size": f.get("size"),
                                "parent_folder_name": subfolder_name,
                            })
                        sub_page_token = sub_response.get("nextPageToken")
                        if not sub_page_token:
                            break
                    subfolders[subfolder_name] = subfolder_files
            return {"mode": "subfolder", "subfolders": subfolders}
        else:
            files = [
                {
                    "id": item["id"],
                    "name": item["name"],
                    "mimeType": item["mimeType"],
                    "size": item.get("size"),
                }
                for item in top_level_items
            ]
            return {"mode": "flat", "files": files}

    def generate_thumbnail(self, file_path: str, dest_path: str, size: int = 200) -> str:
        """Create a thumbnail for an image or video file."""
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        ext = Path(file_path).suffix.lower()

        if ext in IMAGE_EXTENSIONS:
            with Image.open(file_path) as img:
                img.thumbnail((size, size))
                img = img.convert("RGB")
                img.save(dest_path, "JPEG")
        elif ext in VIDEO_EXTENSIONS:
            try:
                subprocess.run(
                    [
                        "ffmpeg", "-i", file_path,
                        "-vframes", "1",
                        "-vf", f"scale={size}:-1",
                        "-y", dest_path,
                    ],
                    check=True,
                    capture_output=True,
                )
            except (subprocess.CalledProcessError, FileNotFoundError):
                logger.warning(f"ffmpeg failed for {file_path}, creating placeholder thumbnail")
                placeholder = Image.new("RGB", (size, size), color=(128, 128, 128))
                placeholder.save(dest_path, "JPEG")

        return dest_path

    @staticmethod
    def _extract_base_name(filename: str) -> str:
        """Extract base name by removing format suffixes and extension."""
        stem = Path(filename).stem
        for patterns in FORMAT_PATTERNS.values():
            for pattern in patterns:
                if stem.lower().endswith(pattern):
                    return stem[: -len(pattern)]
        return stem

    @staticmethod
    def _detect_format(filename: str, parent_path: str) -> Optional[str]:
        """Detect creative format from filename or parent folder."""
        lower_name = filename.lower()
        lower_path = parent_path.lower()

        for format_name, patterns in FORMAT_PATTERNS.items():
            for pattern in patterns:
                if pattern in lower_name or pattern.strip("_") in lower_path:
                    return format_name
        return None

    @staticmethod
    def _detect_format_from_dimensions(file_path: str) -> Optional[str]:
        """Detect format from actual image dimensions."""
        try:
            with Image.open(file_path) as img:
                width, height = img.size
                ratio = width / height
                if 0.9 <= ratio <= 1.1:
                    return "square"
                elif ratio < 0.7:
                    return "vertical"
                elif ratio > 1.4:
                    return "horizontal"
        except Exception:
            pass
        return None
