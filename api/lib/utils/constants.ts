// Meta API Objective mapping (ODAX)
export const OBJECTIVE_MAP: Record<string, string> = {
  sales: "OUTCOME_SALES",
  conversions: "OUTCOME_SALES",
  traffic: "OUTCOME_TRAFFIC",
  leads: "OUTCOME_LEADS",
  lead_gen: "OUTCOME_LEADS",
  awareness: "OUTCOME_AWARENESS",
  reach: "OUTCOME_AWARENESS",
  engagement: "OUTCOME_ENGAGEMENT",
  app_promotion: "OUTCOME_APP_PROMOTION",
};

// Optimization goals per objective
export const OPTIMIZATION_GOALS: Record<string, string[]> = {
  OUTCOME_SALES: [
    "OFFSITE_CONVERSIONS",
    "VALUE",
    "LINK_CLICKS",
    "LANDING_PAGE_VIEWS",
    "IMPRESSIONS",
    "REACH",
  ],
  OUTCOME_TRAFFIC: [
    "LINK_CLICKS",
    "LANDING_PAGE_VIEWS",
    "IMPRESSIONS",
    "REACH",
    "OFFSITE_CONVERSIONS",
  ],
  OUTCOME_LEADS: [
    "LEAD_GENERATION",
    "OFFSITE_CONVERSIONS",
    "LINK_CLICKS",
    "LANDING_PAGE_VIEWS",
    "QUALITY_LEAD",
  ],
  OUTCOME_AWARENESS: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT", "THRUPLAY"],
  OUTCOME_ENGAGEMENT: [
    "POST_ENGAGEMENT",
    "THRUPLAY",
    "LINK_CLICKS",
    "IMPRESSIONS",
  ],
};

// CTA options
export const CTA_OPTIONS: string[] = [
  "SHOP_NOW",
  "LEARN_MORE",
  "SIGN_UP",
  "BOOK_NOW",
  "CONTACT_US",
  "DOWNLOAD",
  "GET_OFFER",
  "GET_QUOTE",
  "SUBSCRIBE",
  "APPLY_NOW",
  "BUY_NOW",
  "GET_STARTED",
  "ORDER_NOW",
  "SEND_MESSAGE",
  "WATCH_MORE",
  "SEE_MENU",
  "REQUEST_TIME",
];

// Placement to creative format mapping
// preferred = ideal format, fallback = if preferred is missing
export const PLACEMENT_FORMAT_MAP: Record<
  string,
  { preferred: string; fallback: string | null }
> = {
  // Facebook
  facebook_feed: { preferred: "square", fallback: "horizontal" },
  facebook_stories: { preferred: "vertical", fallback: "square" },
  facebook_reels: { preferred: "vertical", fallback: null },
  facebook_right_column: { preferred: "horizontal", fallback: "square" },
  facebook_in_stream_video: { preferred: "horizontal", fallback: "square" },
  facebook_marketplace: { preferred: "square", fallback: "horizontal" },
  facebook_search: { preferred: "square", fallback: "horizontal" },
  facebook_video_feeds: { preferred: "square", fallback: "horizontal" },
  // Instagram
  instagram_feed: { preferred: "square", fallback: "vertical" },
  instagram_stories: { preferred: "vertical", fallback: null },
  instagram_reels: { preferred: "vertical", fallback: null },
  instagram_explore: { preferred: "square", fallback: "vertical" },
  instagram_explore_reels: { preferred: "vertical", fallback: null },
  instagram_profile_feed: { preferred: "square", fallback: "vertical" },
  // Audience Network
  audience_network_native: { preferred: "horizontal", fallback: "square" },
  audience_network_rewarded_video: {
    preferred: "vertical",
    fallback: "square",
  },
  // Messenger
  messenger_inbox: { preferred: "square", fallback: "horizontal" },
  messenger_stories: { preferred: "vertical", fallback: null },
};

// Meta API placement keys for ad set targeting
export const META_PLACEMENT_POSITIONS: Record<
  string,
  Record<string, string>
> = {
  facebook: {
    feed: "feed",
    stories: "story",
    reels: "facebook_reels",
    right_column: "right_hand_column",
    in_stream_video: "instream_video",
    marketplace: "marketplace",
    search: "search",
    video_feeds: "video_feeds",
  },
  instagram: {
    feed: "stream",
    stories: "story",
    reels: "reels",
    explore: "explore",
    explore_reels: "explore_reels",
    profile_feed: "profile_feed",
  },
  audience_network: {
    native: "classic",
    rewarded_video: "rewarded_video",
  },
  messenger: {
    inbox: "messenger_home",
    stories: "story",
  },
};

// Creative format to aspect ratio
export const FORMAT_ASPECT_RATIO: Record<string, string> = {
  square: "1:1",
  vertical: "9:16",
  horizontal: "16:9",
};

// File extensions by media type
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
]);

export const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".webm",
  ".m4v",
]);

// Format detection patterns in filenames
export const FORMAT_PATTERNS: Record<string, string[]> = {
  square: ["_square", "_1x1", "_1-1", "_cuadrado", "_sq"],
  vertical: ["_vertical", "_9x16", "_9-16", "_vert", "_story", "_reel"],
  horizontal: [
    "_horizontal",
    "_16x9",
    "_16-9",
    "_horiz",
    "_land",
    "_landscape",
  ],
};
