$ui.register((ctx) => {

const USERS = [
    "rriyawai",
    "Dharion",
    "PrincessAris"
];

const STATUS_LABELS = {
    CURRENT: "Watching",
    PLANNING: "Plan to Watch",
    COMPLETED: "Completed",
    DROPPED: "Dropped",
    PAUSED: "Paused",
    REPEATING: "Rewatching"
};

function getAnimeMediaId(event) {

    const params = event?.searchParams || {};

    const raw =
        params.id ??
        params.mediaId ??
        params.animeId ??
        params.aid ??
        params.anime;

    if (!raw) return null;

    const id = Number(raw);

    return Number.isFinite(id) && id > 0
        ? id
        : null;
}

function getStatusLabel(status) {

    return STATUS_LABELS[status] || status || "Unknown";

}

function getTooltipStatus(entry) {

    if (!entry)
        return "Not Listed";

    const progress = entry.progress || 0;

    const total = entry.media?.episodes;

    if (total)
        return `${getStatusLabel(entry.status)} (${progress}/${total})`;

    return `${getStatusLabel(entry.status)} (${progress})`;

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

function buildCompareQuery(users){

    const defs = [];
    const vars = {};
    const queries = [];

    users.forEach((user,index)=>{

        const key = `u${index}`;

        defs.push(`$${key}: String!`);

        vars[key] = user;

        queries.push(`
${key}: MediaListCollection(
    userName: $${key}
    type: ANIME
){
    lists{
        entries{

            status
            progress
            score
            repeat

            media{
                id
                episodes

                title{
                    userPreferred
                }
            }

        }
    }
}
`);

    });

    return {

        query: `
query Compare(
${defs.join(",\n")}
){

${queries.join("\n")}

}
`,

        variables: vars

    };

}
async function queryAniList() {

    const payload = buildCompareQuery(USERS);

    const result = await $anilist.customQuery(payload, "");

    console.log("FULL RESULT");
    console.log(result);

    return result;
}
function findEntry(collection, mediaId) {

    if (!collection)
        return null;

    const lists = collection.lists || [];

    for (const list of lists) {

        const entries = list.entries || [];

        for (const entry of entries) {

            if (entry.media?.id === mediaId) {

                return entry;

            }

        }

    }

    return null;

}

function formatComparison(compareData, mediaId) {

    const lines = [];

    for (let i = 0; i < USERS.length; i++) {

        const collection = compareData[`u${i}`];

        const entry = findEntry(
            collection,
            mediaId
        );

        if (!entry) {

            lines.push(
                `${USERS[i]} : Not Listed`
            );

            continue;

        }

        const progress =
            entry.media?.episodes
            ? `${entry.progress}/${entry.media.episodes}`
            : `${entry.progress}`;

        let line =
`${USERS[i]}
${getStatusLabel(entry.status)}
${progress}`;

        if (
            entry.score &&
            Number(entry.score) > 0
        ) {

            line += ` | ★ ${entry.score}`;

        }

        if (
            entry.repeat &&
            entry.repeat > 0
        ) {

            line += ` | 🔁 ${entry.repeat}`;

        }

        lines.push(line);

    }

    return lines.join("\n");

}

async function getCurrentEntry(mediaId){

    const entry =
        await ctx.anime.getAnimeEntry(
            mediaId
        );

    if(!entry)
        return null;

    if(!entry.listData)
        return null;

    return entry;

}

async function getMalTitle(entry){

    try{

        const malId =
            entry.media?.idMal;

        if(!malId)
            return null;

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

    }
    catch(e){

        console.warn(e);

    }

    return null;

}
async function updateStatus(event) {

    try {

        const current =
            event ||
            ctx.screen.state().get();

        const pathname =
            current?.pathname || "";

        if (
            !pathname.startsWith("/entry") &&
            pathname !== "/offline/entry/anime"
        ) {

            action.setLabel("AniList");
            action.setTooltipText("Not on an anime page");
            return;

        }

        const mediaId =
            getAnimeMediaId(current);

        if (!mediaId) {

            action.setLabel("AniList");
            action.setTooltipText("No anime selected");
            return;

        }

        action.setLabel("Loading...");
        action.setTooltipText("Comparing users...");

        // Logged in user's entry
        const myEntry =
            await getCurrentEntry(mediaId);

        if (!myEntry) {

            action.setLabel("Not Tracked");
            action.setTooltipText(
                "Anime is not in your AniList."
            );

            return;

        }

        // Fetch every compare user in ONE GraphQL request
        const compareData =
            await queryAniList();
        console.log(compareData);
        const comparison =
            formatComparison(
                compareData,
                mediaId
            );

        const progress =
            myEntry.media?.episodes
                ? `${myEntry.listData.progress}/${myEntry.media.episodes}`
                : `${myEntry.listData.progress}`;

        const malTitle =
            await getMalTitle(myEntry);

        let tooltip =
`${getStatusLabel(myEntry.listData.status)}
Progress : ${progress}`;

        if (malTitle) {

            tooltip +=
`\nMAL : ${malTitle}`;

        }

        tooltip +=
`\n\n━━━━━━━━━━━━━━━━━━
Compare
━━━━━━━━━━━━━━━━━━
${comparison}`;

        action.setLabel(
            getStatusLabel(
                myEntry.listData.status
            )
        );

        action.setTooltipText(
            tooltip
        );

        action.setStyle({

            background: "#7c3aed",
            color: "#ffffff"

        });

    }
    catch (err) {

        console.error(err);

        action.setLabel("Error");

        action.setTooltipText(

            err?.message ||
            "Unknown Error"

        );

        action.setStyle({

            background: "#dc2626",
            color: "#ffffff"

        });

    }

}
ctx.screen.onNavigate(updateStatus);

ctx.screen.loadCurrent();

});