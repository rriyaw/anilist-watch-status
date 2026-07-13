$ui.register((ctx) => {
  const STATUS_LABELS = {
    CURRENT: "Watching",
    PLANNING: "Plan to Watch",
    COMPLETED: "Completed",
    DROPPED: "Dropped",
    PAUSED: "Paused",
    REPEATING: "Rewatching",
  };

  function getAnimeMediaId(event) {
    const params = event?.searchParams || {};
    const idRaw = params.id || params.mediaId || params.animeId || params.aid || params.anime;
    if (!idRaw) {
      return null;
    }

    const mediaId = Number(idRaw);
    return Number.isFinite(mediaId) && mediaId > 0 ? mediaId : null;
  }

  function getStatusLabel(entry) {
    const status = entry?.listData?.status || "UNKNOWN";
    return STATUS_LABELS[status] || status;
  }

  function getTooltipText(entry) {
    const text = getStatusLabel(entry);
    const progress = entry?.listData?.progress || 0;
    return progress ? `${text} — ${progress} ep(s)` : text;
  }

  const action = ctx.action.newAnimePageButton({
    label: "AniList status",
    tooltipText: "Loading AniList status...",
    style: { background: "#7c3aed", color: "#ffffff" },
  });

  action.mount();

  action.onClick(() => {
    console.log("AniList status button clicked");
    action.setTooltipText("Refreshing...");
    ctx.screen.loadCurrent();
  });

  async function updateStatus(event) {
    try {
      const currentEvent = event || ctx.screen.state().get();
      console.log("anilist-watch-status:updateStatus event:", currentEvent);
      
      const pathname = currentEvent?.pathname || "";
      console.log("anilist-watch-status:pathname", pathname);
      
      if (!pathname.startsWith("/entry") && pathname !== "/offline/entry/anime") {
        action.setLabel("AniList status");
        action.setTooltipText("Not on an anime page");
        return;
      }

      const mediaId = getAnimeMediaId(currentEvent);
      console.log("anilist-watch-status:mediaId", mediaId);
      
      if (!mediaId) {
        action.setLabel("AniList status");
        action.setTooltipText("No anime selected");
        return;
      }

      console.log("anilist-watch-status:calling getAnimeEntry with mediaId:", mediaId);
      const entry = await ctx.anime.getAnimeEntry(mediaId);
      console.log("anilist-watch-status:entry", entry);

      if (!entry) {
        action.setLabel("AniList status");
        action.setTooltipText("Entry not found");
        return;
      }

      if (!entry.listData) {
        action.setLabel("AniList status");
        action.setTooltipText("Not tracked on AniList");
        return;
      }

      const anilistLabel = getStatusLabel(entry);
      const anilistTooltip = getTooltipText(entry);
      // Multi-user compare: read additional usernames from storage
      function normalizeUsers(val) {
        if (!val) return [];
        if (Array.isArray(val)) return val.map(String).filter(Boolean);
        if (typeof val === "string") {
          return val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        }
        return [];
      }

      async function fetchAniListEntryForUser(userName, mediaId) {
        const QUERY = `query ($userName: String!, $mediaId: Int!) { MediaList(userName: $userName, mediaId: $mediaId) { status progress score repeat media { episodes title { romaji english native } id idMal } user { name } } }`;
        try {
          const res = await ctx.fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: QUERY, variables: { userName, mediaId } }),
          });
          const json = await res.json();
          if (json && json.data && json.data.MediaList) return json.data.MediaList;
          return null;
        } catch (err) {
          console.warn("anilist-watch-status: fetchAniListEntryForUser error", err);
          return null;
        }
      }

      const stored = $storage.get("anilistCompare.users");
      const otherUsers = normalizeUsers(stored).filter((u) => u && u !== "");
      let compareParts = [];
      if (otherUsers.length > 0) {
        // fetch all users concurrently (limit to reasonable number)
        const limited = otherUsers.slice(0, 8);
        const results = await Promise.all(
          limited.map((u) => fetchAniListEntryForUser(u, mediaId).then((r) => ({ user: u, entry: r })))
        );

        for (const r of results) {
          if (!r.entry) {
            compareParts.push(`${r.user}: Not Listed`);
            continue;
          }
          const s = r.entry.status || "UNKNOWN";
          const prog = r.entry.progress || 0;
          const eps = r.entry.media?.episodes || null;
          const title = r.entry.user?.name || r.user;
          const part = eps ? `${title}: ${s} (${prog}/${eps})` : `${title}: ${s} (${prog})`;
          compareParts.push(part);
        }
      }
      let malInfo = null;

      try {
        const malId = entry?.media?.idMal || mediaId;
        console.log("anilist-watch-status:malId", malId);
        const malMetadata = await ctx.anime.getAnimeMetadata("mal", malId);
        console.log("anilist-watch-status:malMetadata", malMetadata);
        if (malMetadata?.titles) {
          malInfo = Object.values(malMetadata.titles)[0] || `MAL #${malId}`;
        } else {
          malInfo = `MAL #${malId}`;
        }
      } catch (malError) {
        console.warn("anilist-watch-status:mal metadata failed", malError);
      }

      const label = malInfo ? `${anilistLabel} / MAL` : anilistLabel;
      const compareSuffix = compareParts.length ? ` — ${compareParts.join(" • ")}` : "";
      const tooltip = malInfo
        ? `${anilistTooltip} — MAL: ${malInfo}${compareSuffix}`
        : `${anilistTooltip}${compareSuffix}`;

      console.log("anilist-watch-status:final label", label);
      console.log("anilist-watch-status:final tooltip", tooltip);
      
      action.setLabel(label);
      action.setTooltipText(tooltip);
      action.setStyle({ background: "#7c3aed", color: "#ffffff" });
    } catch (error) {
      console.error("anilist-watch-status:updateStatus error:", error);
      console.error("anilist-watch-status:error stack:", error?.stack);
      action.setLabel("Error");
      action.setTooltipText(`Error: ${error?.message || 'Unknown error'}`);
      action.setStyle({ background: "#7c3aed", color: "#ffffff" });
    }
  }

  ctx.screen.onNavigate(updateStatus);
  ctx.screen.loadCurrent();
});
