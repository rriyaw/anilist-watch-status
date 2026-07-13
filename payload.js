$ui.register((ctx) => {

const USERS = [
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

action.onClick(() => {

    action.setTooltipText("Refreshing...");

    ctx.screen.loadCurrent();

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
async function queryAniList(mediaId) {
    const token = await $database.getAniListToken();

    const payload = buildGraphQL(USERS);

    payload.variables.mediaId = mediaId;

    const result = await $anilist.customQuery(
    payload,
    token );

    return result.data;
}

function formatComparison(data) {

    const rows = [];

    USERS.forEach((user, index) => {

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

        const compare =
            await queryAniList(
                mediaId
            );

        const comparison =
            formatComparison(
                compare
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