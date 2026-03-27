"""AI-powered creative analysis for recommending ad set placement."""
import base64
import json
import logging
import os
import subprocess
import tempfile
from typing import Optional
from pathlib import Path

import anthropic
from config import get_settings

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM_PROMPT = """You are a Meta Ads creative analyst. You analyze ad creatives (images, carousels, videos) and recommend which ad set they should be placed in based on the campaign strategy.

You will receive:
1. The creative content (image or video transcript + key frames)
2. The campaign strategy: how ad sets are organized (by angle, awareness level, audience, etc.)
3. A list of existing ad sets with their descriptions

Your job is to:
1. Describe what the creative communicates (message, tone, visual style, target audience)
2. Map it to the campaign strategy angles/levels
3. Recommend the BEST existing ad set, or suggest creating a new one
4. Explain your reasoning

OUTPUT FORMAT - Return ONLY valid JSON:
{
  "creative_analysis": {
    "message": "Brief description of the creative's message",
    "tone": "emotional/rational/humorous/urgent/etc",
    "target_audience": "Who this creative speaks to",
    "awareness_level": "cold/warm/hot",
    "angle": "The selling angle (pain point, benefit, social proof, etc.)"
  },
  "recommendation": {
    "action": "assign_existing" | "create_new",
    "adset_id": 123,
    "adset_name": "Name of recommended ad set",
    "confidence": 0.85,
    "reasoning": "Why this ad set is the best fit",
    "alternative_adset_id": null,
    "alternative_reasoning": null,
    "new_adset_suggestion": null
  }
}

If action is "create_new", include:
{
  "new_adset_suggestion": {
    "name": "Suggested name",
    "description": "Why a new ad set is needed",
    "angle": "The angle this new ad set would cover"
  }
}"""


async def analyze_creative(
    file_path: str,
    media_type: str,  # "image" or "video"
    campaign_strategy: str,  # Description of how the campaign is structured
    ad_sets: list[dict],  # List of existing ad sets with id, name, description
) -> dict:
    """Analyze a creative and recommend which ad set it belongs to."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Build context about existing ad sets
    adset_context = "EXISTING AD SETS:\n"
    for adset in ad_sets:
        adset_context += f"- ID: {adset['id']}, Name: {adset['name']}"
        if adset.get("description"):
            adset_context += f", Description: {adset['description']}"
        adset_context += "\n"

    user_content = []

    if media_type == "image":
        # Send image directly to Claude Vision
        image_data = _encode_image(file_path)
        ext = Path(file_path).suffix.lower()
        media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                       ".gif": "image/gif", ".webp": "image/webp"}
        user_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_types.get(ext, "image/jpeg"),
                "data": image_data,
            },
        })
        user_content.append({
            "type": "text",
            "text": f"Analyze this ad creative image.\n\nCAMPAIGN STRATEGY:\n{campaign_strategy}\n\n{adset_context}",
        })

    elif media_type == "video":
        # Extract key frames + transcribe audio
        transcript = await _transcribe_video(file_path)
        frames = await _extract_key_frames(file_path)

        # Add key frames as images
        for i, frame_path in enumerate(frames[:4]):  # Max 4 frames
            frame_data = _encode_image(frame_path)
            user_content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": "image/jpeg", "data": frame_data},
            })

        text = f"Analyze this video ad creative.\n\n"
        if transcript:
            text += f"VIDEO TRANSCRIPT:\n{transcript}\n\n"
        text += f"CAMPAIGN STRATEGY:\n{campaign_strategy}\n\n{adset_context}"
        user_content.append({"type": "text", "text": text})

        # Cleanup temp frames
        for f in frames:
            try:
                os.unlink(f)
            except OSError:
                pass

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        temperature=0,
        system=ANALYSIS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    response_text = response.content[0].text.strip()
    if "```json" in response_text:
        response_text = response_text.split("```json")[1].split("```")[0].strip()
    elif "```" in response_text:
        response_text = response_text.split("```")[1].split("```")[0].strip()

    return json.loads(response_text)


async def analyze_carousel(
    image_paths: list[str],
    campaign_strategy: str,
    ad_sets: list[dict],
) -> dict:
    """Analyze a carousel creative (multiple images)."""
    settings = get_settings()
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    adset_context = "EXISTING AD SETS:\n"
    for adset in ad_sets:
        adset_context += f"- ID: {adset['id']}, Name: {adset['name']}"
        if adset.get("description"):
            adset_context += f", Description: {adset['description']}"
        adset_context += "\n"

    user_content = []
    for path in image_paths:
        image_data = _encode_image(path)
        ext = Path(path).suffix.lower()
        media_types = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png"}
        user_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_types.get(ext, "image/jpeg"),
                "data": image_data,
            },
        })

    user_content.append({
        "type": "text",
        "text": (
            f"Analyze this carousel ad creative (the images above are the carousel slides, in order).\n\n"
            f"CAMPAIGN STRATEGY:\n{campaign_strategy}\n\n{adset_context}"
        ),
    })

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        temperature=0,
        system=ANALYSIS_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    response_text = response.content[0].text.strip()
    if "```json" in response_text:
        response_text = response_text.split("```json")[1].split("```")[0].strip()
    elif "```" in response_text:
        response_text = response_text.split("```")[1].split("```")[0].strip()

    return json.loads(response_text)


def _encode_image(file_path: str) -> str:
    """Encode an image file to base64."""
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


async def _transcribe_video(file_path: str) -> Optional[str]:
    """Transcribe video audio using whisper."""
    try:
        import whisper
        model = whisper.load_model("base")
        result = model.transcribe(file_path)
        return result.get("text", "")
    except Exception as e:
        logger.warning(f"Video transcription failed: {e}")
        return None


async def _extract_key_frames(file_path: str, num_frames: int = 4) -> list[str]:
    """Extract key frames from video using ffmpeg/moviepy."""
    frames = []
    try:
        from moviepy.editor import VideoFileClip
        clip = VideoFileClip(file_path)
        duration = clip.duration

        for i in range(num_frames):
            timestamp = (duration / (num_frames + 1)) * (i + 1)
            frame = clip.get_frame(timestamp)

            temp_path = tempfile.mktemp(suffix=".jpg")
            from PIL import Image
            img = Image.fromarray(frame)
            img.save(temp_path, "JPEG", quality=80)
            frames.append(temp_path)

        clip.close()
    except Exception as e:
        logger.warning(f"Frame extraction failed: {e}")

    return frames
