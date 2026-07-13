AniList Compare Status

A Seanime plugin that lets you compare your current anime with multiple AniList users directly from the anime page.

The plugin displays each configured user's watch status for the currently selected anime, making it easy to see who is watching, has completed, or plans to watch the same series.

## Features

- Compare multiple AniList users at once
- View watch status directly from the anime page
- Shows:
  - Watching
  - Completed
  - Planning
  - Paused
  - Dropped
  - Rewatching
- Displays episode progress for each user
- Uses AniList GraphQL

## Installation

1. Copy the **raw URL** of the `manifest.json` file from this repository.
2. Open **Seanime**.
3. Go to **Extensions → Plugins**.
4. Paste the raw `manifest.json` URL into the plugin search/install field.
5. Install the plugin.

## How to Use

Edit the `USERS` array inside the plugin source and replace the example usernames with the AniList usernames you want to compare.

Example:

```javascript
const USERS = [
    "User1",
    "User2",
    "User3"
];
```

Save the file and reload the plugin (or restart Seanime).

Open any anime page to see the comparison.

## Requirements

- Seanime
- AniList account
- Public AniList profiles for the users being compared

## Notes

- The plugin compares the currently opened anime only.
- Users who do not have the anime in their AniList will be shown as **Not Listed**.
- The plugin uses AniList's public GraphQL API through Seanime.

