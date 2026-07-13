$ui.register((ctx) => {

const STORAGE_KEY = "anilistCompare.users";
const MAX_USERS = 8;
const DEFAULT_USERS = [
    "rriyaw",
    "Dara_",
    "PrincessAris"
];

const STATUS = {
    CURRENT: "Watching",
    COMPLETED: "Completed",
    PLANNING: "Planning",
    PAUSED: "Paused",
    DROPPED: "Dropped",
    REPEATING: "Rewatching"
};

function getMediaId(event) {
    const p = event?.searchParams || {};

    const raw =
        p.id ??
        p.mediaId ??
        p.animeId ??
        p.aid ??
        p.anime;

    if (!raw) return null;

    const id = Number(raw);

    return Number.isFinite(id) ? id : null;
}

function statusName(status) {
    return STATUS[status] || status || "Unknown";
}

function normalizeUsers(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    if (typeof value === "string") {
        return value
            .split(/[\n,]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function loadUsers() {
    const stored = $storage.get(STORAGE_KEY);
    const users = normalizeUsers(stored);
    return users.length > 0 ? users.slice(0, MAX_USERS) : DEFAULT_USERS;
}

function saveUsers(users) {
    const normalized = normalizeUsers(users).slice(0, MAX_USERS);
    $storage.set(STORAGE_KEY, normalized);
    return normalized;
}

function statusEmoji(status) {

    switch (status) {

        case "CURRENT":
            return "▶";

        case "COMPLETED":
            return "✓";

        case "PLANNING":
            return "📋";

        case "PAUSED":
            return "⏸";

        case "DROPPED":
            return "✕";

        case "REPEATING":
            return "↻";

        default:
            return "?";
    }

}

const action = ctx.action.newAnimePageButton({

    label: "AniList",

    tooltipText: "Loading...",

    style: {
        background: "#7c3aed",
        color: "#ffffff"
    }

});

action.mount();

const usersField = ctx.fieldRef(loadUsers().join(", "));
const tray = ctx.newTray({
    iconUrl: "https://anilist.co/img/icons/apple-touch-icon-256.png",
    withContent: true,
    width: "360px",
    minHeight: "150px"
});

tray.render(() => {
    const savedUsers = loadUsers();

    tray.flex({ direction: "column", gap: "12px", style: "padding: 16px;" }, () => {
        tray.text({ content: "AniList compare users", style: "font-weight: bold; font-size: 16px;" });
        tray.input({
            fieldRef: usersField,
            placeholder: "Enter usernames separated by comma or newline",
            style: "width: 100%;"
        });
        tray.flex({ gap: "8px" }, () => {
            tray.button({
                label: "Save",
                onClick: () => {
                    const value = usersField.current;
                    const saved = saveUsers(value);
                    usersField.setValue(saved.join(", "));
                    if (ctx.screen.state().get()) {
                        updateStatus(ctx.screen.state().get());
                    }
                    tray.close();
                },
                style: "flex: 1; background: #7c3aed; color: white;"
            });
            tray.button({
                label: "Reset",
                onClick: () => {
                    const saved = saveUsers(DEFAULT_USERS);
                    usersField.setValue(saved.join(", "));
                    if (ctx.screen.state().get()) {
                        updateStatus(ctx.screen.state().get());
                    }
                    tray.close();
                },
                style: "flex: 1;"
            });
        });
        tray.text({ content: `Saved users: ${savedUsers.join(", ")}`, style: "font-size: 12px; opacity: 0.75;" });
    });
});

action.onClick(() => {
    usersField.setValue(loadUsers().join(", "));
    tray.open();
});

function buildGraphQL(users){

    const vars = {
        mediaId:0
    };

    const defs = [
        "$mediaId:Int!"
    ];

    const body = [];

    users.forEach((user,index)=>{

        const key = `u${index}`;

        defs.push(`$${key}:String!`);

        vars[key]=user;

        body.push(`
${key}: MediaList(
userName:$${key},
mediaId:$mediaId
){
status
progress
score
repeat

media{
episodes
}
}
`);

    });

    return{

        query:`
query Compare(${defs.join(",")}){

${body.join("\n")}

}
`,

        variables:vars

    };

}
async function queryAniList(mediaId, users) {
    const payload = buildGraphQL(users);
    payload.variables.mediaId = mediaId;

    const res = await ctx.fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        throw new Error(`AniList GraphQL request failed: ${res.status}`);
    }

    const json = await res.json();

    if (json.errors?.length) {
        throw new Error(json.errors.map((e) => e.message).join("; "));
    }

    return json.data || {};
}

function formatComparison(data, users) {

    const rows = [];

    users.forEach((user, index) => {

        const entry = data[`u${index}`];

        if (!entry) {
            rows.push(`${user.padEnd(12)} Not Listed`);
            return;
        }

        const status = statusName(entry.status);

        const icon = statusEmoji(entry.status);

        const progress = entry.progress || 0;

        const total = entry.media?.episodes;

        const progressText =
            total && total > 0
                ? `${progress}/${total}`
                : `${progress}`;

        rows.push(
            `${icon} ${user.padEnd(12)} ${status.padEnd(12)} ${progressText}`
        );

    });

    return rows.join("\n");

}

async function getCurrentUserEntry(mediaId){

    const entry = await ctx.anime.getAnimeEntry(mediaId);

    if(!entry)
        return null;

    if(!entry.listData)
        return null;

    return {

        status:
            entry.listData.status,

        progress:
            entry.listData.progress || 0,

        episodes:
            entry.media?.episodes ||

            entry.media?.episodeCount ||

            null,

        malId:
            entry.media?.idMal ||

            mediaId

    };

}

async function getMalTitle(malId){

    try{

        const metadata =
            await ctx.anime.getAnimeMetadata(
                "mal",
                malId
            );

        if(metadata?.titles){

            return Object.values(
                metadata.titles
            )[0];

        }

    }catch(e){

        console.warn(e);

    }

    return null;

}
async function updateStatus(event){

    try{

        const current =
            event ||
            ctx.screen.state().get();

        const pathname =
            current?.pathname || "";

        if(
            !pathname.startsWith("/entry") &&
            pathname !== "/offline/entry/anime"
        ){

            action.setLabel("AniList");

            action.setTooltipText(
                "Not on an anime page"
            );

            return;

        }

        const mediaId =
            getMediaId(current);

        if(!mediaId){

            action.setLabel("AniList");

            action.setTooltipText(
                "No anime selected"
            );

            return;

        }

        const me =
            await getCurrentUserEntry(
                mediaId
            );

        if(!me){

            action.setLabel(
                "Not Tracked"
            );

            action.setTooltipText(
                "Anime isn't in your AniList."
            );

            return;

        }

        const users = loadUsers();
        const compare =
            await queryAniList(
                mediaId,
                users
            );

        const comparison =
            formatComparison(
                compare,
                users
            );

        const malTitle =
            await getMalTitle(
                me.malId
            );

        const progress =
            me.episodes
            ? `${me.progress}/${me.episodes}`
            : `${me.progress}`;

        let tooltip =
`${statusName(me.status)}
Progress: ${progress}`;

        if(malTitle){

            tooltip +=
`\nMAL: ${malTitle}`;

        }

        tooltip +=
`\n\nCompare
────────────────
${comparison}`;

        action.setLabel(
            statusName(me.status)
        );

        action.setTooltipText(
            tooltip
        );

        action.setStyle({

            background:"#7c3aed",

            color:"#ffffff"

        });

    }
    catch(err){

        console.error(err);

        action.setLabel(
            "Error"
        );

        action.setTooltipText(
            err.message ||
            "Unknown Error"
        );

        action.setStyle({

            background:"#dc2626",

            color:"#ffffff"

        });

    }

}

ctx.screen.onNavigate(
    updateStatus
);

ctx.screen.loadCurrent();

});