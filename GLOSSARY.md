# Playset

Turns a concert's published setlist on setlist.fm into a Spotify playlist, so you can learn the songs before you see the artist live.

## Language

### Concert side (setlist.fm)

**Setlist**:
The published, ordered list of what an **Artist** played at one **Show**, as recorded on setlist.fm.
_Avoid_: Tracklist, set (when meaning the whole show)

**Show**:
One performance by an **Artist** on a specific date at a specific venue.
_Avoid_: Gig, event, concert (in code/docs)

**Artist**:
The performer the **Setlist** belongs to.
_Avoid_: Band, act, performer

**Set**:
One labelled section of a **Setlist**, such as the main set, an acoustic set or an **Encore**.

**Encore**:
A **Set** played after the main set. It stays in the **Setlist Playlist** in its played position.

**Performance**:
A single slot in a **Setlist** where a song was played. When the same song is played twice it counts as two **Performances**, and both appear in the **Setlist Playlist**.
_Avoid_: Entry, item

**Tape**:
A **Performance** played as pre-recorded audio, such as an intro or outro, rather than performed live. A Tape goes into the **Setlist Playlist** only when the user opts in.
_Avoid_: Intro, outro, backing track

**Cover**:
A **Performance** of a song written or first released by a different artist, the **Original Artist**.

**Original Artist**:
The artist whose song a **Cover** performs.

**Latest Setlist**:
The most recent **Setlist** for an **Artist** that contains at least one **Performance**. Placeholder setlists with no songs are ignored.

**Unknown Song**:
A **Performance** slot where a song was played but its title is not known. setlist.fm stores it as a song with an empty name and shows it as "(Unknown)". It cannot be matched, so it is never added to the **Setlist Playlist**; it is reported with its played position.
_Avoid_: Missing song, blank song

**Incomplete Setlist**:
A **Setlist** that does not show the whole **Show**: it contains at least one **Unknown Song**, or its setlist.fm note says it is incomplete (e.g. "incomplete", "partial", "rest unknown", "cut short"). A Setlist that simply stops early without saying so cannot be detected.
_Avoid_: Partial setlist, broken setlist

### Playlist side (Spotify)

**Setlist Playlist**:
A Spotify playlist that mirrors one **Setlist** in played order. The CLI makes a new one on every run; the web app keeps one per **Setlist** in the **Host Account** and updates it when the **Setlist** changes.
_Avoid_: Mix, concert playlist

**Host Account**:
The single Spotify account in which the web app creates every **Setlist Playlist**, publicly. Visitors never log in to Spotify; whoever logs in as the Host Account is the web app's admin.
_Avoid_: Owner account, admin account, my account

**Visitor**:
A person using the web app. A Visitor never logs in to Spotify; every **Setlist Playlist** they ask for is made in the **Host Account**.
_Avoid_: User (in the web app), guest

**Match**:
The Spotify track chosen to represent a **Performance**. The studio version is preferred, the **Artist**'s own recording is tried first, and for a **Cover** the **Original Artist**'s recording is tried next.

**Miss**:
A **Performance** with no **Match**. It is left out of the **Setlist Playlist** and reported to the user.
_Avoid_: Unmatched, not found, failure
