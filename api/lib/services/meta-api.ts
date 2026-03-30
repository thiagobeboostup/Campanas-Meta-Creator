/**
 * Meta Marketing API wrapper using native fetch (no Facebook SDK).
 * All methods call the Facebook Graph API v21.0 directly.
 */

const BASE_URL = "https://graph.facebook.com/v21.0";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 45000]; // milliseconds

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class MetaApiService {
  private accessToken: string;
  private pageId: string;

  constructor(accessToken: string, pageId?: string) {
    this.accessToken = accessToken;
    this.pageId = pageId ?? "";
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private async request<T = Record<string, unknown>>(
    path: string,
    options: {
      method?: string;
      params?: Record<string, string>;
      body?: Record<string, unknown> | FormData;
    } = {},
  ): Promise<T> {
    const { method = "GET", params, body } = options;

    let url = `${BASE_URL}${path}`;
    const queryParams = new URLSearchParams({
      access_token: this.accessToken,
      ...(params ?? {}),
    });

    if (method === "GET" || method === "DELETE") {
      url = `${url}?${queryParams.toString()}`;
    }

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const fetchOptions: RequestInit = { method };

      if (method === "POST" && body) {
        if (body instanceof FormData) {
          // FormData already includes the access_token appended by caller
          fetchOptions.body = body;
        } else {
          fetchOptions.headers = { "Content-Type": "application/json" };
          fetchOptions.body = JSON.stringify({
            access_token: this.accessToken,
            ...body,
          });
        }
      }

      const response = await fetch(url, fetchOptions);
      const data = (await response.json()) as T & { error?: MetaApiError };

      if (data.error) {
        // Rate limit (error code 17) - retry with backoff
        if (data.error.code === 17 && attempt < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[attempt];
          console.warn(
            `Rate limit hit, retrying in ${delay / 1000}s (attempt ${attempt + 1})`,
          );
          await sleep(delay);
          continue;
        }
        throw new Error(
          `Meta API Error [${data.error.code}]: ${data.error.message}`,
        );
      }

      return data;
    }

    throw new Error("Max retries exceeded for Meta API request");
  }

  private ensureActPrefix(accountId: string): string {
    return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
  }

  // ── Token & account discovery ─────────────────────────────────────────────

  async validateToken(): Promise<{ id: string; name: string }> {
    return this.request<{ id: string; name: string }>("/me", {
      params: { fields: "id,name" },
    });
  }

  async getPages(): Promise<
    Array<{ id: string; name: string; access_token: string }>
  > {
    const data = await this.request<{
      data: Array<{ id: string; name: string; access_token: string }>;
    }>("/me/accounts", {
      params: { fields: "id,name,access_token", limit: "100" },
    });
    return data.data ?? [];
  }

  async getBusinesses(): Promise<Array<{ id: string; name: string }>> {
    const data = await this.request<{
      data: Array<{ id: string; name: string }>;
    }>("/me/businesses", {
      params: { fields: "id,name", limit: "100" },
    });
    return data.data ?? [];
  }

  async getBusinessAdAccounts(
    businessId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      account_status: number;
      currency: string;
      timezone_name: string;
    }>
  > {
    const data = await this.request<{
      data: Array<{
        id: string;
        name: string;
        account_status: number;
        currency: string;
        timezone_name: string;
      }>;
    }>(`/${businessId}/owned_ad_accounts`, {
      params: {
        fields: "id,name,account_status,currency,timezone_name",
        limit: "100",
      },
    });
    return data.data ?? [];
  }

  async getAdAccounts(): Promise<
    Array<{
      id: string;
      name: string;
      account_status: number;
      currency: string;
      timezone_name: string;
    }>
  > {
    const data = await this.request<{
      data: Array<{
        id: string;
        name: string;
        account_status: number;
        currency: string;
        timezone_name: string;
      }>;
    }>("/me/adaccounts", {
      params: {
        fields: "id,name,account_status,currency,timezone_name",
        limit: "100",
      },
    });
    return data.data ?? [];
  }

  async getCampaigns(
    adAccountId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      status: string;
      objective: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>
  > {
    const accountId = this.ensureActPrefix(adAccountId);
    const data = await this.request<{
      data: Array<{
        id: string;
        name: string;
        status: string;
        objective: string;
        daily_budget?: string;
        lifetime_budget?: string;
      }>;
    }>(`/${accountId}/campaigns`, {
      params: {
        fields: "id,name,status,objective,daily_budget,lifetime_budget",
        limit: "500",
      },
    });
    return data.data ?? [];
  }

  async getCampaignStructure(
    campaignId: string,
  ): Promise<{
    campaign: Record<string, unknown>;
    ad_sets: Array<Record<string, unknown>>;
  }> {
    // Fetch campaign details
    const campaignData = await this.request<Record<string, unknown>>(
      `/${campaignId}`,
      {
        params: {
          fields: "id,name,status,objective,daily_budget,lifetime_budget",
        },
      },
    );

    // Fetch ad sets
    const adSetsResp = await this.request<{
      data: Array<Record<string, unknown>>;
    }>(`/${campaignId}/adsets`, {
      params: {
        fields:
          "id,name,status,targeting,optimization_goal,bid_strategy,daily_budget",
      },
    });
    const adSetsData = adSetsResp.data ?? [];

    // Fetch ads for each ad set concurrently
    const adsResults = await Promise.all(
      adSetsData.map(async (adset) => {
        const adsResp = await this.request<{
          data: Array<Record<string, unknown>>;
        }>(`/${adset.id}/ads`, {
          params: {
            fields:
              "id,name,status,creative{id,name,effective_object_story_spec,url_tags}",
          },
        });
        return adsResp.data ?? [];
      }),
    );

    // Combine ad sets with their ads
    const adSetsWithAds = adSetsData.map((adset, i) => ({
      ...adset,
      ads: adsResults[i],
    }));

    return {
      campaign: campaignData,
      ad_sets: adSetsWithAds,
    };
  }

  // ── Creation methods ──────────────────────────────────────────────────────

  async createCampaign(
    accountId: string,
    name: string,
    objective: string,
    budgetType: string = "CBO",
    dailyBudget?: number,
    lifetimeBudget?: number,
  ): Promise<string> {
    const actAccountId = this.ensureActPrefix(accountId);
    const body: Record<string, unknown> = {
      name,
      objective,
      status: "PAUSED",
      special_ad_categories: [],
    };

    if (budgetType === "CBO") {
      body.campaign_budget_optimization = true;
      if (dailyBudget) {
        body.daily_budget = Math.round(dailyBudget * 100); // cents
      } else if (lifetimeBudget) {
        body.lifetime_budget = Math.round(lifetimeBudget * 100);
      }
    }

    const result = await this.request<{ id: string }>(
      `/${actAccountId}/campaigns`,
      { method: "POST", body },
    );
    console.log(`Created campaign ${name} -> ${result.id}`);
    return result.id;
  }

  async createAdSet(
    accountId: string,
    campaignId: string,
    name: string,
    optimizationGoal: string,
    targeting: Record<string, unknown>,
    bidStrategy: string = "LOWEST_COST_WITHOUT_CAP",
    dailyBudget?: number,
    placements?: Record<string, string[]> | string | null,
  ): Promise<string> {
    const actAccountId = this.ensureActPrefix(accountId);
    const targetingCopy = { ...targeting };

    const body: Record<string, unknown> = {
      name,
      campaign_id: campaignId,
      optimization_goal: optimizationGoal,
      billing_event: "IMPRESSIONS",
      bid_strategy: bidStrategy,
      targeting: targetingCopy,
      status: "PAUSED",
    };

    if (dailyBudget) {
      body.daily_budget = Math.round(dailyBudget * 100);
    }

    // Handle placements
    if (placements && placements !== "automatic" && typeof placements === "object") {
      const META_PLACEMENT_POSITIONS: Record<string, Record<string, string>> = {
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

      const publisherPlatforms: string[] = [];
      const positions: Record<string, string[]> = {};

      for (const [platform, placementList] of Object.entries(placements)) {
        publisherPlatforms.push(platform);
        const platformPositions = META_PLACEMENT_POSITIONS[platform] ?? {};
        const mapped = placementList
          .filter((p) => p in platformPositions)
          .map((p) => platformPositions[p]);
        if (mapped.length > 0) {
          positions[`${platform}_positions`] = mapped;
        }
      }

      (targetingCopy as Record<string, unknown>).publisher_platforms =
        publisherPlatforms;
      Object.assign(targetingCopy, positions);
    }

    const result = await this.request<{ id: string }>(
      `/${actAccountId}/adsets`,
      { method: "POST", body },
    );
    console.log(`Created ad set ${name} -> ${result.id}`);
    return result.id;
  }

  async uploadImage(accountId: string, filePath: string): Promise<string> {
    const actAccountId = this.ensureActPrefix(accountId);
    const fs = await import("node:fs");
    const path = await import("node:path");

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append("access_token", this.accessToken);
    formData.append(
      "filename",
      new Blob([fileBuffer], { type: "application/octet-stream" }),
      fileName,
    );

    const response = await fetch(
      `${BASE_URL}/${actAccountId}/adimages`,
      { method: "POST", body: formData },
    );
    const data = (await response.json()) as {
      images?: Record<string, { hash: string }>;
      error?: MetaApiError;
    };

    if (data.error) {
      throw new Error(
        `Meta API Error [${data.error.code}]: ${data.error.message}`,
      );
    }

    // The response nests the hash under the filename key
    const images = data.images ?? {};
    const imageInfo = Object.values(images)[0];
    if (!imageInfo?.hash) {
      throw new Error("Failed to get image hash from upload response");
    }

    console.log(`Uploaded image ${filePath} -> hash ${imageInfo.hash}`);
    return imageInfo.hash;
  }

  async uploadVideo(accountId: string, filePath: string): Promise<string> {
    const actAccountId = this.ensureActPrefix(accountId);
    const fs = await import("node:fs");
    const path = await import("node:path");

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append("access_token", this.accessToken);
    formData.append(
      "source",
      new Blob([fileBuffer], { type: "video/mp4" }),
      fileName,
    );

    const response = await fetch(
      `${BASE_URL}/${actAccountId}/advideos`,
      { method: "POST", body: formData },
    );
    const data = (await response.json()) as {
      id?: string;
      error?: MetaApiError;
    };

    if (data.error) {
      throw new Error(
        `Meta API Error [${data.error.code}]: ${data.error.message}`,
      );
    }

    const videoId = data.id;
    if (!videoId) {
      throw new Error("Failed to get video ID from upload response");
    }

    console.log(
      `Uploaded video ${filePath} -> ${videoId}, waiting for processing...`,
    );

    // Poll until ready (max 10 minutes, check every 5s)
    for (let i = 0; i < 120; i++) {
      await sleep(5000);

      const statusResp = await this.request<{
        status: { video_status: string };
      }>(`/${videoId}`, { params: { fields: "status" } });

      const videoStatus = statusResp.status?.video_status;
      if (videoStatus === "ready") {
        console.log(`Video ${videoId} is ready`);
        return videoId;
      }
      if (videoStatus === "error") {
        throw new Error(
          `Video processing failed: ${JSON.stringify(statusResp.status)}`,
        );
      }
    }

    throw new Error(
      `Video ${videoId} processing timed out after 10 minutes`,
    );
  }

  async createAdCreative(
    accountId: string,
    name: string,
    options: {
      imageHash?: string;
      videoId?: string;
      headline?: string;
      primaryText?: string;
      description?: string;
      cta?: string;
      url?: string;
      urlTags?: string;
      assetCustomization?: Array<Record<string, unknown>>;
    },
  ): Promise<string> {
    const actAccountId = this.ensureActPrefix(accountId);
    const {
      imageHash,
      videoId,
      headline = "",
      primaryText = "",
      description = "",
      cta = "SHOP_NOW",
      url = "",
      urlTags,
      assetCustomization,
    } = options;

    if (!this.pageId) {
      throw new Error(
        "page_id is required to create ad creatives. Set it in Auth settings.",
      );
    }

    let objectStorySpec: Record<string, unknown>;

    if (videoId) {
      objectStorySpec = {
        page_id: this.pageId,
        video_data: {
          video_id: videoId,
          message: primaryText,
          title: headline,
          link_description: description,
          call_to_action: { type: cta, value: { link: url } },
        },
      };
    } else {
      objectStorySpec = {
        page_id: this.pageId,
        link_data: {
          message: primaryText,
          link: url,
          name: headline,
          description,
          call_to_action: { type: cta, value: { link: url } },
          ...(imageHash ? { image_hash: imageHash } : {}),
        },
      };
    }

    const body: Record<string, unknown> = {
      name,
      object_story_spec: objectStorySpec,
    };

    if (urlTags) {
      body.url_tags = urlTags;
    }

    // Placement Asset Customization for multi-format creatives
    if (assetCustomization && assetCustomization.length > 0) {
      body.asset_feed_spec = {
        images: [],
        videos: [],
        bodies: primaryText ? [{ text: primaryText }] : [],
        titles: headline ? [{ text: headline }] : [],
        descriptions: description ? [{ text: description }] : [],
        call_to_action_types: [cta],
        link_urls: url ? [{ website_url: url }] : [],
        asset_customization_rules: assetCustomization,
      };
      delete body.object_story_spec;
    }

    const result = await this.request<{ id: string }>(
      `/${actAccountId}/adcreatives`,
      { method: "POST", body },
    );
    console.log(`Created ad creative ${name} -> ${result.id}`);
    return result.id;
  }

  async createAd(
    accountId: string,
    name: string,
    adsetId: string,
    creativeId: string,
  ): Promise<string> {
    const actAccountId = this.ensureActPrefix(accountId);
    const body = {
      name,
      adset_id: adsetId,
      creative: { creative_id: creativeId },
      status: "PAUSED",
    };

    const result = await this.request<{ id: string }>(
      `/${actAccountId}/ads`,
      { method: "POST", body },
    );
    console.log(`Created ad ${name} -> ${result.id}`);
    return result.id;
  }

  // ── Management methods (post-deploy) ──────────────────────────────────────

  async updateBudget(
    campaignId: string,
    dailyBudget?: number,
    lifetimeBudget?: number,
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (dailyBudget != null) {
      body.daily_budget = Math.round(dailyBudget * 100);
    }
    if (lifetimeBudget != null) {
      body.lifetime_budget = Math.round(lifetimeBudget * 100);
    }

    await this.request(`/${campaignId}`, { method: "POST", body });
    console.log(`Updated campaign ${campaignId} budget`);
  }

  async updateAdSetBudget(
    adsetId: string,
    dailyBudget: number,
  ): Promise<void> {
    await this.request(`/${adsetId}`, {
      method: "POST",
      body: { daily_budget: Math.round(dailyBudget * 100) },
    });
    console.log(`Updated ad set ${adsetId} budget to ${dailyBudget}`);
  }

  async updateAdStatus(adId: string, status: string): Promise<void> {
    await this.request(`/${adId}`, {
      method: "POST",
      body: { status },
    });
  }

  async updateAdCopy(
    adId: string,
    fields: {
      headline?: string;
      primaryText?: string;
      description?: string;
      cta?: string;
    },
  ): Promise<void> {
    // To update ad copy we need to fetch the current creative, create a new one with changes, then update the ad
    const adData = await this.request<{
      creative: { id: string };
    }>(`/${adId}`, { params: { fields: "creative{id}" } });

    const creativeId = adData.creative?.id;
    if (!creativeId) {
      throw new Error("Ad has no creative associated");
    }

    // Fetch current creative details
    const creativeData = await this.request<{
      object_story_spec: Record<string, unknown>;
      url_tags?: string;
      name: string;
    }>(`/${creativeId}`, {
      params: { fields: "name,object_story_spec,url_tags" },
    });

    const storySpec = creativeData.object_story_spec as Record<
      string,
      Record<string, unknown>
    >;

    // Update the link_data or video_data with new copy
    if (storySpec?.link_data) {
      if (fields.headline !== undefined) {
        storySpec.link_data.name = fields.headline;
      }
      if (fields.primaryText !== undefined) {
        storySpec.link_data.message = fields.primaryText;
      }
      if (fields.description !== undefined) {
        storySpec.link_data.description = fields.description;
      }
      if (fields.cta !== undefined) {
        (storySpec.link_data.call_to_action as Record<string, unknown>).type =
          fields.cta;
      }
    } else if (storySpec?.video_data) {
      if (fields.headline !== undefined) {
        storySpec.video_data.title = fields.headline;
      }
      if (fields.primaryText !== undefined) {
        storySpec.video_data.message = fields.primaryText;
      }
      if (fields.description !== undefined) {
        storySpec.video_data.link_description = fields.description;
      }
      if (fields.cta !== undefined) {
        (storySpec.video_data.call_to_action as Record<string, unknown>).type =
          fields.cta;
      }
    }

    // Update the creative in-place
    await this.request(`/${creativeId}`, {
      method: "POST",
      body: { object_story_spec: storySpec },
    });
  }

  async deleteEntity(entityType: string, entityId: string): Promise<void> {
    // All Meta entities share the same DELETE endpoint pattern
    const validTypes = ["campaign", "adset", "ad", "ad_creative"];
    if (!validTypes.includes(entityType)) {
      throw new Error(`Unknown entity type: ${entityType}`);
    }

    await this.request(`/${entityId}`, { method: "DELETE" });
    console.log(`Deleted ${entityType} ${entityId}`);
  }
}
