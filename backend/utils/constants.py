# Meta API Objective mapping (ODAX)
OBJECTIVE_MAP = {
    "sales": "OUTCOME_SALES",
    "conversions": "OUTCOME_SALES",
    "traffic": "OUTCOME_TRAFFIC",
    "leads": "OUTCOME_LEADS",
    "lead_gen": "OUTCOME_LEADS",
    "awareness": "OUTCOME_AWARENESS",
    "reach": "OUTCOME_AWARENESS",
    "engagement": "OUTCOME_ENGAGEMENT",
    "app_promotion": "OUTCOME_APP_PROMOTION",
}

# Optimization goals per objective
OPTIMIZATION_GOALS = {
    "OUTCOME_SALES": [
        "OFFSITE_CONVERSIONS", "VALUE", "LINK_CLICKS", "LANDING_PAGE_VIEWS",
        "IMPRESSIONS", "REACH",
    ],
    "OUTCOME_TRAFFIC": [
        "LINK_CLICKS", "LANDING_PAGE_VIEWS", "IMPRESSIONS", "REACH",
        "OFFSITE_CONVERSIONS",
    ],
    "OUTCOME_LEADS": [
        "LEAD_GENERATION", "OFFSITE_CONVERSIONS", "LINK_CLICKS",
        "LANDING_PAGE_VIEWS", "QUALITY_LEAD",
    ],
    "OUTCOME_AWARENESS": [
        "REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY",
    ],
    "OUTCOME_ENGAGEMENT": [
        "POST_ENGAGEMENT", "THRUPLAY", "LINK_CLICKS", "IMPRESSIONS",
    ],
}

# CTA options
CTA_OPTIONS = [
    "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "BOOK_NOW", "CONTACT_US",
    "DOWNLOAD", "GET_OFFER", "GET_QUOTE", "SUBSCRIBE", "APPLY_NOW",
    "BUY_NOW", "GET_STARTED", "ORDER_NOW", "SEND_MESSAGE",
    "WATCH_MORE", "SEE_MENU", "REQUEST_TIME",
]

# Placement to creative format mapping
# preferred = ideal format, fallback = if preferred is missing
PLACEMENT_FORMAT_MAP = {
    # Facebook
    "facebook_feed": {"preferred": "square", "fallback": "horizontal"},
    "facebook_stories": {"preferred": "vertical", "fallback": "square"},
    "facebook_reels": {"preferred": "vertical", "fallback": None},
    "facebook_right_column": {"preferred": "horizontal", "fallback": "square"},
    "facebook_in_stream_video": {"preferred": "horizontal", "fallback": "square"},
    "facebook_marketplace": {"preferred": "square", "fallback": "horizontal"},
    "facebook_search": {"preferred": "square", "fallback": "horizontal"},
    "facebook_video_feeds": {"preferred": "square", "fallback": "horizontal"},
    # Instagram
    "instagram_feed": {"preferred": "square", "fallback": "vertical"},
    "instagram_stories": {"preferred": "vertical", "fallback": None},
    "instagram_reels": {"preferred": "vertical", "fallback": None},
    "instagram_explore": {"preferred": "square", "fallback": "vertical"},
    "instagram_explore_reels": {"preferred": "vertical", "fallback": None},
    "instagram_profile_feed": {"preferred": "square", "fallback": "vertical"},
    # Audience Network
    "audience_network_native": {"preferred": "horizontal", "fallback": "square"},
    "audience_network_rewarded_video": {"preferred": "vertical", "fallback": "square"},
    # Messenger
    "messenger_inbox": {"preferred": "square", "fallback": "horizontal"},
    "messenger_stories": {"preferred": "vertical", "fallback": None},
}

# Meta API placement keys for ad set targeting
META_PLACEMENT_POSITIONS = {
    "facebook": {
        "feed": "feed",
        "stories": "story",
        "reels": "facebook_reels",
        "right_column": "right_hand_column",
        "in_stream_video": "instream_video",
        "marketplace": "marketplace",
        "search": "search",
        "video_feeds": "video_feeds",
    },
    "instagram": {
        "feed": "stream",
        "stories": "story",
        "reels": "reels",
        "explore": "explore",
        "explore_reels": "explore_reels",
        "profile_feed": "profile_feed",
    },
    "audience_network": {
        "native": "classic",
        "rewarded_video": "rewarded_video",
    },
    "messenger": {
        "inbox": "messenger_home",
        "stories": "story",
    },
}

# Creative format to aspect ratio
FORMAT_ASPECT_RATIO = {
    "square": "1:1",
    "vertical": "9:16",
    "horizontal": "16:9",
}

# File extensions by media type
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

# Format detection patterns in filenames
FORMAT_PATTERNS = {
    "square": ["_square", "_1x1", "_1-1", "_cuadrado", "_sq"],
    "vertical": ["_vertical", "_9x16", "_9-16", "_vert", "_story", "_reel"],
    "horizontal": ["_horizontal", "_16x9", "_16-9", "_horiz", "_land", "_landscape"],
}
