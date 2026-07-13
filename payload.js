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
    action.setTooltipText("Refreshing...");
    ctx.screen.loadCurrent();
  });

  const STORAGE_KEY = "anilistCompare.users";
  const MAX_USERS = 8;

  const compareState = ctx.state({
    users: [],
    input: "",
    lastSaved: null,
    status: "idle",
    error: null,
  });

  const webview = ctx.newWebview({
    slot: "after-media-entry-details",
    autoHeight: true,
    fullWidth: true,
    className: "anilist-compare-webview",
  });

  webview.channel.sync("compareState", compareState);

  function normalizeUsers(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    if (typeof value === "string") {
      return value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderWebviewContent(state) {
    const renderUsers = () => {
      if (!state.users || state.users.length === 0) {
        return "<div class=\"empty\">No AniList usernames saved yet.</div>";
      }
      return state.users
        .map(
          (user, index) =>
            `<div class=\"user-row\"><span>${escapeHtml(user)}</span><button data-remove=\"${index}\">Remove</button></div>`
        )
        .join("");
    };

    const statusLine = state.status === "error" ? `<div class=\"error\">${escapeHtml(state.error)}</div>` : "";
    const savedLine = state.lastSaved ? `<div class=\"saved\">Last saved: ${escapeHtml(new Date(state.lastSaved).toLocaleString())}</div>` : "";

    return (
      "<!DOCTYPE html>" +
      "<html><head><meta charset=\"utf-8\"><style>" +
      "body{font-family:system-ui,Arial,sans-serif;margin:0;padding:12px;color:#111;background:#f7f7fb;}" +
      ".header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}" +
      ".header h2{margin:0;font-size:1rem;}" +
      ".input-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}" +
      ".input-row input{flex:1 1 240px;padding:8px;border:1px solid #d1d5db;border-radius:6px;background:#fff;}" +
      ".input-row button{padding:8px 12px;border:none;border-radius:6px;background:#7c3aed;color:#fff;cursor:pointer;}" +
      ".user-list{display:grid;gap:6px;margin-bottom:10px;}" +
      ".user-row{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;}" +
      ".user-row button{border:none;background:#ef4444;color:#fff;padding:4px 9px;border-radius:6px;cursor:pointer;}" +
      ".info{font-size:0.85rem;color:#374151;}" +
      ".saved{margin-top:4px;color:#047857;}" +
      ".error{margin-top:4px;color:#b91c1c;}" +
      "</style></head><body>" +
      `<div class=\"header\"><h2>AniList Compare</h2><div class=\"info\">Save up to ${MAX_USERS} users</div></div>` +
      `<div class=\"input-row\"><input id=\"usernameInput\" placeholder=\"Add username or comma-separated list\" value=\"${escapeHtml(state.input || "")}\" /><button id=\"addBtn\">Add</button></div>` +
      `<div class=\"user-list\">${renderUsers()}</div>${savedLine}${statusLine}` +
      "<script>const channel=window.webview.channel;const input=document.getElementById('usernameInput');const addBtn=document.getElementById('addBtn');addBtn.addEventListener('click',()=>{channel.send('addUsers',input.value)});input.addEventListener('keydown',(e)=>{if(e.key==='Enter'){e.preventDefault();channel.send('addUsers',input.value);}});document.body.addEventListener('click',(event)=>{const remove=event.target.getAttribute('data-remove');if(remove!==null){channel.send('removeUser',Number(remove));}});</script>" +
      "</body></html>"
    );
  }

  function saveUsers(users) {
    const normalized = normalizeUsers(users).slice(0, MAX_USERS);
    compareState.set({
      ...compareState.get(),
      users: normalized,
      input: "",
      lastSaved: new Date().toISOString(),
      status: "saved",
      error: null,
    });
    $storage.set(STORAGE_KEY, normalized);
    webview.setContent(() => renderWebviewContent(compareState.get()));
  }

  function loadUsers() {
    const stored = $storage.get(STORAGE_KEY);
    const users = normalizeUsers(stored).slice(0, MAX_USERS);
    compareState.set({
      ...compareState.get(),
      users,
      input: "",
      status: "idle",
      error: null,
    });
    webview.setContent(() => renderWebviewContent(compareState.get()));
  }

  webview.channel.on("addUsers", (payload) => {
    const added = normalizeUsers(payload);
    if (added.length === 0) {
      compareState.set({ ...compareState.get(), status: "error", error: "Enter at least one username." });
      return;
    }
    saveUsers([...compareState.get().users, ...added]);
  });

  webview.channel.on("removeUser", (index) => {
    const users = [...compareState.get().users];
    if (index >= 0 && index < users.length) {
      users.splice(index, 1);
      saveUsers(users);
    }
  });

  function renderState(state) {
    webview.setContent(() => renderWebviewContent(state));
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
      return json?.data?.MediaList || null;
    } catch (error) {
      console.warn("anilist-watch-status: fetchAniListEntryForUser error", error);
      return null;
    }
  }

  async function updateStatus(event) {
    try {
      const currentEvent = event || ctx.screen.state().get();
      const pathname = currentEvent?.pathname || "";
      if (!pathname.startsWith("/entry") && pathname !== "/offline/entry/anime") {
        action.setLabel("AniList status");
        action.setTooltipText("Not on an anime page");
        return;
      }

      const mediaId = getAnimeMediaId(currentEvent);
      if (!mediaId) {
        action.setLabel("AniList status");
        action.setTooltipText("No anime selected");
        return;
      }

      const entry = await ctx.anime.getAnimeEntry(mediaId);
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
      const otherUsers = normalizeUsers($storage.get(STORAGE_KEY)).slice(0, MAX_USERS);
      const compareParts = [];

      if (otherUsers.length > 0) {
        const results = await Promise.all(
          otherUsers.map(async (user) => {
            const result = await fetchAniListEntryForUser(user, mediaId);
            return { user, result };
          })
        );

        for (const { user, result } of results) {
          if (!result) {
            compareParts.push(`${user}: Not Listed`);
            continue;
          }
          const status = result.status || "UNKNOWN";
          const progress = result.progress || 0;
          const episodes = result.media?.episodes || null;
          compareParts.push(
            episodes
              ? `${user}: ${status} (${progress}/${episodes})`
              : `${user}: ${status} (${progress})`
          );
        }
      }

      let malInfo = null;
      try {
        const malId = entry?.media?.idMal || mediaId;
        const malMetadata = await ctx.anime.getAnimeMetadata("mal", malId);
        malInfo = malMetadata?.titles ? Object.values(malMetadata.titles)[0] || `MAL #${malId}` : `MAL #${malId}`;
      } catch (malError) {
        console.warn("anilist-watch-status:mal metadata failed", malError);
      }

      const compareSuffix = compareParts.length ? ` — ${compareParts.join(" • ")}` : "";
      const tooltip = malInfo
        ? `${anilistTooltip} — MAL: ${malInfo}${compareSuffix}`
        : `${anilistTooltip}${compareSuffix}`;

      action.setLabel(anilistLabel);
      action.setTooltipText(tooltip);
      action.setStyle({ background: "#7c3aed", color: "#ffffff" });
    } catch (error) {
      action.setLabel("Error");
      action.setTooltipText(`Error: ${error?.message || "Unknown error"}`);
      action.setStyle({ background: "#7c3aed", color: "#ffffff" });
      console.error("anilist-watch-status:updateStatus error:", error);
    }
  }

  ctx.screen.onNavigate(updateStatus);
  loadUsers();
  ctx.screen.loadCurrent();
});
