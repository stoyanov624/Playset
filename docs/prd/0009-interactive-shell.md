# PRD 0009 — Interactive shell: many runs in one `playset` session

Status: Approved
Slice: 9
Depends on: 0007, 0008
Module: src/cli (the shell is part of the command-line front-end; it reuses PRD 0007's run in src/core/run unchanged)

## Problem

PRD 0007 gives one run per command: `playset <setlist.fm link | Artist name…>` makes one **Setlist Playlist** and exits. A concert-goer who wants playlists for several **Artists** (for example every act on a festival bill), or who first tries a dry run and then the real run, has to type `playset` again each time. Typing `playset` alone today is a usage error (exit code 2), even though the user is clearly at a terminal and ready to type.

The user wants Playset to be "launchable in its own terminal, executing commands there": open it once, then type one link or Artist name after another, with the same questions, preview, **Misses** and share link as PRD 0007, without restarting.

## Goal

`playset` with no arguments, in a terminal, opens an interactive session. Each line typed at the `playset › ` prompt is either a built-in command (`help`, `clear`, `exit`, `quit`) or a run, written exactly as the arguments of PRD 0007's command. Each run behaves exactly like PRD 0007's run. Errors and Ctrl-C end only that run, never the session. Within one session, the Spotify login is reused and the setlist.fm request spacing is kept across runs.

## Non-goals

- **No change to the run itself.** Artist choice, **Tape** questions, Spotify login, matching, preview, confirmation, creation, Misses, share link, messages and hints are exactly as PRD 0007 (and PRDs 0001–0006, 0008) describe. The shell only reads lines, starts runs and keeps the session going.
- **No medley logic here.** PRD 0008 changes which **Performances** a **Setlist** has; the shell passes that through untouched.
- **No desktop launcher**, app icon, `.command`/`.desktop` file, or new terminal window. The user opens their own terminal and types `playset`.
- **No change to installation.** No global install step, no new binary name; `playset` stays the only command.
- **No persistent history.** Up/down history lasts for one session only. Nothing is written to `~/.config/playset/` by the shell.
- **No tab completion**, no suggestions, no spelling correction of Artist names.
- **No colours** or other output styling.
- **No session-wide options.** Flags apply to the one line they are on. `playset --yes` (flags but no input) is still a usage error, as in PRD 0007 AC-4; it does not open a session with `--yes` preset.
- **No extra built-ins.** There is no `version`, `login`, `logout`, `history`, `set` or `again` command. `--version` on a line prints the version (AC-8).
- **No shell-style escapes.** Only double quotes group words. No backslash escapes, no single-quote quoting (an apostrophe is an ordinary character, so `Guns N' Roses` works unquoted), no variables, no pipes.
- **No scripting mode.** Piped (non-terminal) input does not open a session and is not read line by line; `playset` with no arguments and no terminal is a usage error as before.
- **No concurrent runs and no type-ahead queue.** One run at a time; the prompt returns only when the run has ended.
- **No per-run exit code.** Inside a session a run's result is shown by its messages only. The session's own exit code is 0.

## User stories

- As a concert-goer, I want to type `playset` and get a prompt, so that I can make playlists for several Artists without retyping the command.
- As a concert-goer, I want to try `Arctic Monkeys --dry-run` and then `Arctic Monkeys --yes` in the same session, so that I check the preview first and only log in to Spotify once.
- As a concert-goer, I want a typo or an unknown Artist to print the usual message and give me the prompt back, so that one mistake doesn't throw me out.
- As a concert-goer, I want Ctrl-C to cancel only the run I'm in, so that I can stop a wrong run and type a new one.
- As a concert-goer, I want up/down arrows to bring back what I typed earlier, so that I can repeat a run with a different flag.
- As a concert-goer, I want `help` to remind me of the options, and `exit` to leave.
- As a front-end developer, I want the session loop to take its lines and output from the caller, so that it can be tested without a real terminal.

## Acceptance criteria

Words used below:

- **Session**: the interactive mode opened by `playset` with no arguments. It lasts until the user ends it (AC-10, AC-18, AC-19).
- **Prompt**: the text `playset › ` (with a trailing space) shown when the session waits for a line.
- **Line**: one line of text the user enters at the prompt.
- **Run line**: a line that is not a built-in command (AC-12). It is turned into arguments (AC-5) and handled like PRD 0007's command arguments.
- **Run**: everything PRD 0007 does for one set of arguments, from reading them to its last line of output.
- **Shell hint**: the line `Type help to see the options.`
- **Banner**: two lines: `Playset <version>` (version `0.1.0` for this release), then `Type a setlist.fm link or an Artist name. Type help for commands, exit to leave.`

PRD 0007's words ("input", "kept Performances", "exit code", "usage line", "message") keep their meaning. As in PRD 0007, wording and layout may differ from the Examples, but every fact an AC names must be present.

### Starting a session

- **AC-1** — Given `playset` is started with no arguments at all, and both its standard input and standard output are terminals, when it starts, then it prints the banner, then shows the prompt and waits for a line. No network request is made, no Spotify login starts, and no setting (setlist.fm API key, Spotify client id) is required at this point: a missing setting does not stop the banner or the prompt.
- **AC-2** — Given `playset` is started with no arguments while its standard input or its standard output is not a terminal (for example `echo "Radiohead" | playset`, or `playset > out.txt`), when it starts, then no session opens: PRD 0007 AC-4's message and usage line are printed and the exit code is 2, as before. Given `playset` is started with any argument (input, flags, `--help`, `--version`, or only whitespace such as `playset "   "`), then no session opens and PRD 0007 behaves exactly as before.
- **AC-3** — Given `playset --help`, when it runs, then the help text of PRD 0007 AC-6 is printed with one added line saying that `playset` with no arguments opens an interactive session. Everything else about `--help` is unchanged.

### Lines

- **AC-4** — Given the session shows the prompt, when the user enters an empty line or a line of only spaces, then nothing is printed, no request is made, and the prompt is shown again.
- **AC-5** — Given a run line, when it is turned into arguments, then it is split into words at spaces; text inside a pair of double quotes is one word, with the quotes removed; every other character, including an apostrophe, is part of a word. The words are then handled exactly as PRD 0007's command-line arguments: flags anywhere on the line are recognised (PRD 0007 AC-7), a setlist.fm link is fetched by id (PRD 0007 AC-2), and the other words joined with single spaces are the Artist name (PRD 0007 AC-1). The whole PRD 0007 flow follows: Artist choice, Show line, Tape questions, Spotify login, matching with progress, preview, confirmation (unless `--yes` or `--dry-run`), creation, Misses and share link. When the run ends, the prompt is shown again.
- **AC-6** — Given a run line with flags, when the next line is entered, then none of those flags apply to it. Each run line uses only its own flags (`--tapes`, `--no-tapes`, `--yes`, `--public`, `--dry-run`); without `--public` the playlist is private, without `--yes` the confirmation is asked, and so on.
- **AC-7** — Given a run line that PRD 0007 would reject as a usage error (AC-3, AC-4, AC-5 there: a rejected setlist.fm link, flags with no input, a link plus other words, `--tapes` with `--no-tapes`, an unknown option), or a line with an opening double quote that is never closed, when it is entered, then PRD 0007's message for that problem (for the unclosed quote: `A double quote is not closed.`) is printed on standard error, followed by the shell hint instead of PRD 0007's usage line. No question is asked, no network request is made, the session does not end, and the prompt is shown again.
- **AC-8** — Given a run line that contains `--help`, when it is entered, then the session help (AC-9) is printed and nothing is run, whatever else is on the line. Given a run line that contains `--version` and not `--help`, then only the version number (`0.1.0`) is printed and nothing is run. In both cases no network request is made and the prompt is shown again.

### Built-in commands

- **AC-9** — Given the line `help`, when it is entered, then a help text is printed that: says a line can be a setlist.fm Setlist link, or an Artist name to use their **Latest Setlist**; lists `--tapes`, `--no-tapes`, `--yes`, `--public`, `--dry-run`, `--version` and `--help`, each with the same one-line description as PRD 0007 AC-6, and says they apply to that line only; lists the commands `help`, `clear`, and `exit` / `quit`, each with a one-line description; and says how to look up an Artist whose name is a command word (AC-12). No network request is made and the prompt is shown again.
- **AC-10** — Given the line `exit` or `quit`, when it is entered, then the session ends and `playset` exits with exit code 0. Nothing else is run.
- **AC-11** — Given the line `clear`, when it is entered, then the terminal screen is cleared and the prompt is shown again at the top. No network request is made and the session's history (AC-24) is kept.
- **AC-12** — Given a line, when it is checked for a built-in command, then it is a built-in only if, after removing leading and trailing spaces, the whole line is one of the words `help`, `exit`, `quit` or `clear`, in any mix of upper and lower case, with no quotes. Every other line is a run line. So `"help"` or `"Exit"` (in double quotes) looks up the Artist named `help` or `Exit`; `exit now`, `Help --dry-run` and `clear --no-tapes` are run lines with the Artist names `exit now`, `Help` and `clear`.

### Results of a run

- **AC-13** — Given a run ends with any error PRD 0007 reports (the typed errors of PRD 0007 AC-38, a Spotify search failure, nothing to add, a Setlist with no Performances, description too long, every kept Performance a Miss, a partly created playlist, or an unexpected error), when it is reported, then the same message, hint lines and (for a partly created playlist) share link are printed as PRD 0007 prints them, `PLAYSET_DEBUG=1` adds the same details as PRD 0007 AC-40, and no secret is printed (PRD 0007 AC-43). Then the session does not end and the prompt is shown again.
- **AC-14** — Given a run ends normally (playlist created, dry run, confirmation declined), when it ends, then its output is exactly what PRD 0007 prints for that outcome, ending with the share link when a playlist was created, and then the prompt is shown again. The session never exits because of a run's outcome, and the exit code of `playset` when the session ends is 0, whatever the runs in it did.

### Ctrl-C and ending the session

- **AC-15** — Given a run is waiting at a question (Artist choice, a Tape question, the confirmation) or waiting for the Spotify login, when the user presses Ctrl-C, then that run ends with one line `Cancelled.`, no stack trace, no create request, and the prompt is shown again. The session does not end.
- **AC-16** — Given a run is finding Matches, or checking for playlists with the same name, and no create request has been sent yet, when the user presses Ctrl-C, then that run ends with `Cancelled.`: no new Spotify search starts after the one in progress, no create request is sent, and the prompt is shown again.
- **AC-17** — Given a run has sent its create request, when the user presses Ctrl-C, then the run is not stopped: it finishes and prints its result as PRD 0007 does (including the Misses and the share link, or the partly created message and share link), and then the prompt is shown again.
- **AC-18** — Given the prompt is shown with nothing typed, when the user presses Ctrl-C, then the line `(To leave, type exit or press Ctrl-C again.)` is printed and the prompt is shown again. Given the user then presses Ctrl-C again, with no line entered in between, then the session ends with exit code 0. Given text has been typed at the prompt, when the user presses Ctrl-C, then that text is discarded, an empty prompt is shown, and this Ctrl-C does not count toward the two. A Ctrl-C that cancelled a run (AC-15, AC-16) does not count toward the two either.
- **AC-19** — Given the prompt is shown with nothing typed, when the user presses Ctrl-D, or standard input reaches its end, then the session ends with exit code 0.

### Sharing across runs in a session

- **AC-20** — Given a run in the session has finished a Spotify login (full login or cached token), when a later run in the same session needs a Spotify access token, then the token is obtained as PRD 0004 describes (cached token, or refresh if it expires within 60 seconds), so no browser is opened and no authorize URL is printed while the cached or refreshed token is valid. Runs that end before the Spotify login step (PRD 0007 AC-18: usage errors, Artist not found, no Performances, nothing to add, Ctrl-C at a Tape question) make no Spotify request and do not log in.
- **AC-21** — Given a run was cancelled while waiting for the Spotify login (AC-15), when a later run in the same session needs a full login, then the login starts normally on the same port: the authorize URL is printed again, and no "port already in use" error is shown.
- **AC-22** — Given several runs in one session send setlist.fm requests, when the requests are sent, then PRD 0005 AC-6's spacing applies across runs: each setlist.fm request starts at least 500 ms after the previous setlist.fm request of the session started, even if that request belonged to an earlier run. Only the first setlist.fm request of the session is not delayed.
- **AC-23** — Given a run ended because the setlist.fm API key or the Spotify client id was missing (PRD 0007 AC-38), when the user adds it to `~/.config/playset/config.json` and enters another run line in the same session, then that run reads the setting again and continues without restarting `playset`. Once a setting has been found in a session, it is used for the rest of the session.

### History

- **AC-24** — Given lines were entered earlier in the session, when the user presses the up arrow at the prompt, then the previous non-empty line (run line or built-in) is shown for editing, older lines with further presses, and the down arrow moves back toward the newest. Left/right arrows move within the line for editing. Answers given to a run's questions are not part of this history. History is kept only in memory: a new session starts with an empty history and nothing is written to disk.

### Testing without a terminal

- **AC-25** — Given a scripted list of lines (including Ctrl-C and end-of-input events), the fake services and fake answers of PRD 0007 AC-44, and a captured output, when a session is carried out, then it completes with no real terminal and no real network access. The captured output shows the banner, each prompt, each run's output and messages in order, and the session's exit code is reported to the caller.

## Examples

Unless stated otherwise, the set-up is PRD 0007's: `SETLISTFM_API_KEY=sfm-test-key-0f3c9a`, `SPOTIFY_CLIENT_ID=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b`, `PLAYSET_DEBUG` unset, Spotify access token `BQD-test-token`, Fixture A (Arctic Monkeys, Ziggo Dome, Amsterdam, 2025-08-23, setlist id `63a5e2b7`) and Fixture R search outcomes. setlist.fm's search for "Arctic Monkeys" has one exact match (PRD 0005), so no Artist question is asked.

In the transcripts, `$` lines are typed in the user's terminal, `playset › ` lines show the prompt with what the user typed after it, `?` lines are questions with the answer after them, `[stderr]` marks standard error, and `^C` / `^D` are Ctrl-C / Ctrl-D. Layout may differ, but every fact shown must be present.

### S1 — Full session (AC-1, AC-5, AC-6, AC-7, AC-9, AC-10, AC-12, AC-13, AC-14, AC-20, AC-22)

Set-up:

- No Spotify token cache at the start, so the first run needs a full login.
- `GET /v1/me/playlists?limit=50` returns only `Today's Top Hits` (no playlist with the same name).
- setlist.fm `GET /search/artists?artistName=Xyzzq%20Nonexistent&sort=relevance&p=1` returns 404.
- Create returns id `7GhIjKlMnOpQrStUvWxYzA`; adding items returns 201.

```
$ playset
Playset 0.1.0
Type a setlist.fm link or an Artist name. Type help for commands, exit to leave.

playset › Arctic Monkeys --dry-run --no-tapes

Arctic Monkeys – 2025-08-23 – Ziggo Dome, Amsterdam
https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html
11 Performances, 2 Tapes

Log in to Spotify in your browser. If it did not open, open this link:
https://accounts.spotify.com/authorize?client_id=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback&scope=playlist-modify-private+playlist-modify-public+playlist-read-private&state=q8Zr1xV0bT3kLmN9pQ2s&code_challenge_method=S256&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
Waiting for the Spotify login (Ctrl-C to cancel)...
Logged in to Spotify.

Finding Matches 1/9: Sculptures of Anything Goes
...
Finding Matches 9/9: R U Mine?

main
   1. Sculptures of Anything Goes
      → Sculptures Of Anything Goes — Arctic Monkeys · The Car
   ...
Encore 2
   9. R U Mine?
      → R U Mine? — Arctic Monkeys · AM

Not added:
  I Want It All (Tape, left out)
  Hey Jude (snippet)
  ...
  Mr. Blue Sky (Tape, left out)

Playlist: Arctic Monkeys – 2025-08-23 – Amsterdam (private)
8 tracks, 1 Miss

1 Miss (not in the playlist):
  Baby, I'm Yours — Arctic Monkeys (Cover of Barbara Lewis)

Dry run: no playlist created.

playset › --tapes --no-tapes Radiohead
[stderr] --tapes and --no-tapes can't be used together.
[stderr] Type help to see the options.

playset › Xyzzq Nonexistent
[stderr] setlist.fm has no Artist named "Xyzzq Nonexistent".

playset › Arctic Monkeys --yes

Arctic Monkeys – 2025-08-23 – Ziggo Dome, Amsterdam
https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html
11 Performances, 2 Tapes

? Add the Tape "I Want It All" (Queen) to the playlist? (y/N) y
? Add the Tape "Mr. Blue Sky" (Electric Light Orchestra) to the playlist? (y/N) n

Finding Matches 1/10: I Want It All
...
Finding Matches 10/10: R U Mine?

main
   1. I Want It All [Tape, Cover of Queen]
      → I Want It All - Remastered 2011 — Queen · The Miracle (2011 Remaster)
   ...
Encore 2
  10. R U Mine?
      → R U Mine? — Arctic Monkeys · AM

Not added:
  Hey Jude (snippet)
  ...
  Mr. Blue Sky (Tape, left out)

Playlist: Arctic Monkeys – 2025-08-23 – Amsterdam (private)
9 tracks, 1 Miss

Created "Arctic Monkeys – 2025-08-23 – Amsterdam" with 9 tracks.

1 Miss (not in the playlist):
  Baby, I'm Yours — Arctic Monkeys (Cover of Barbara Lewis)

https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA

playset › help
A line is a setlist.fm Setlist link, or an Artist name to use their Latest Setlist,
followed by any options. Options apply to that line only.

Options:
  --tapes      add every Tape without asking
  --no-tapes   leave out every Tape without asking
  --yes        create the playlist without asking for confirmation
  --public     make the playlist public (default: private)
  --dry-run    show the preview with Matches, but don't create anything
  --version    print the version number
  --help       show this help

Commands:
  help         show this help
  clear        clear the screen
  exit, quit   leave Playset

To look up an Artist named like a command, put the name in double quotes: "Help"

playset › exit
$
```

Exit code 0. What this shows:

- The banner and the first prompt appear before any request (AC-1).
- The full login happens once, in the first run. The fourth line's run prints no login lines and opens no browser, because the cached token from the first run is still valid (AC-20).
- The second line is a usage error: message, shell hint, no request, prompt again (AC-7). The third line's Artist-not-found error is printed as PRD 0007 E14 prints it, then the prompt returns (AC-13). Neither makes a Spotify request (AC-20).
- The fourth line has no `--dry-run`, `--no-tapes` or `--public` from the first line: the Tape questions are asked and the playlist is private (AC-6). `--yes` skips only the confirmation, as in PRD 0007 AC-16.
- `exit` ends the session with exit code 0 even though one run failed (AC-10, AC-14).

Recorded setlist.fm requests, with a fake clock (AC-22): the first run's search at t = 0 ms and setlists page at t = 500 ms; the third line's search at t ≥ 1000 ms; the fourth line's search, typed 200 ms after the third line's request started, is held until 500 ms after it.

### S2 — Starting without a session (AC-2, AC-3)

| Command | Standard input / output | Result |
|---|---|---|
| `playset` | terminal / terminal | banner and prompt (AC-1) |
| `echo "Radiohead" \| playset` | pipe / terminal | `[stderr] Please give a setlist.fm link or an Artist name.` then the usage line; exit code 2; no request |
| `playset > out.txt` | terminal / file | same message and usage line; exit code 2; no request |
| `playset "   "` | terminal / terminal | same message and usage line; exit code 2; no session |
| `playset --yes` | terminal / terminal | same message and usage line; exit code 2; no session |
| `playset Radiohead` | terminal / terminal | one PRD 0007 run, then `playset` exits with that run's exit code; no banner |
| `playset --version` | terminal / terminal | `0.1.0`, exit code 0, no session |

`playset --help` prints PRD 0007 T4's help text plus a line such as:

```
Run playset with no arguments to open an interactive session.
```

### S3 — Empty lines, quoting and words that look like commands (AC-4, AC-5, AC-12)

| Line typed | Treated as | Arguments / Artist name |
|---|---|---|
| (empty) or `     ` | nothing; prompt again, no request | — |
| `arctic monkeys` | run line | Artist name `arctic monkeys` |
| `"Arctic Monkeys" --dry-run` | run line | Artist name `Arctic Monkeys`, `--dry-run` |
| `Guns N' Roses` | run line | Artist name `Guns N' Roses` (apostrophe is ordinary) |
| `Sinéad O'Connor --public` | run line | Artist name `Sinéad O'Connor`, `--public` |
| `--dry-run https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html` | run line | fetch by id `63a5e2b7`, no Artist search |
| `help` / `  HELP  ` / `Help` | built-in help | — |
| `"help"` | run line | Artist name `help` (setlist.fm `artistName=help`) |
| `help --dry-run` | run line | Artist name `help`, `--dry-run` |
| `"Exit"` | run line | Artist name `Exit` |
| `exit now` | run line | Artist name `exit now` |
| `Quit` | built-in exit | — |
| `clear --no-tapes` | run line | Artist name `clear`, `--no-tapes` |

### S4 — Usage errors inside the session (AC-7)

Each line prints the message on standard error, then `Type help to see the options.`; there is no question, no request, and the prompt is shown again. The usage line `Usage: playset [options] …` is not printed.

| Line | Message |
|---|---|
| `--dry-run` | Please give a setlist.fm link or an Artist name. |
| `--publik Radiohead` | Unknown option `--publik`. |
| `https://www.setlist.fm/setlist/arctic-monkeys/2025/ziggo-dome-amsterdam-netherlands-63a5e2b7.html Radiohead` | Give either one setlist.fm link or an Artist name, not both. |
| `https://www.setlist.fm/setlists/arctic-monkeys-63d6a6b7.html` | That setlist.fm page is not a Setlist. Open the Setlist of the Show on setlist.fm and copy its link. |
| `https://www.setlist.fm/setlist/radiohead/2025/o2-arena-london-england.html` | That setlist.fm link has no setlist id at the end. It may have been cut off; copy the full link again. |
| `"Arctic Monkeys --yes` | A double quote is not closed. |

### S5 — `--help` and `--version` on a line (AC-8)

```
playset › Radiohead --help
(the session help from S1)
playset › --version
0.1.0
playset › Radiohead --version --dry-run
0.1.0
playset › Radiohead --help --version
(the session help from S1)
playset ›
```

No request is recorded for any of these lines.

### S6 — `clear` (AC-11)

```
playset › Arctic Monkeys --dry-run
... (dry-run output)
playset › clear
```

The screen is cleared and only `playset › ` is visible at the top. Pressing the up arrow then shows `clear`, and pressing it again shows `Arctic Monkeys --dry-run` (history kept). No request is recorded for `clear`.

### S7 — Errors from a run return to the prompt (AC-13)

Each row is one run line in a session. After the output shown, the prompt is shown again, the session is still open, and a following `exit` gives exit code 0.

| Line and situation | Output |
|---|---|
| `https://www.setlist.fm/setlist/x/2025/y-deadbeef.html`, setlist.fm 404 | `[stderr] setlist.fm has no Setlist with id deadbeef.` |
| `Arctic Monkeys`, setlist.fm 429 four times | `[stderr] setlist.fm is busy (too many requests). Try again in a minute.` |
| `Arctic Monkeys --yes`, Spotify search 500 for #4 (PRD 0007 E8) | progress up to 4/10, then `[stderr] Spotify search failed (HTTP 500). Try again in a moment.`; no `POST` |
| PRD 0007 E9's Muse Setlist by link | the 2 Misses, then `[stderr] No Match was found for any Performance, so no playlist was created.` |
| PRD 0007 E16's 250-track Setlist with `--yes` | `[stderr] The playlist was only partly created: 100 of 250 tracks were added.` / `[stderr] Spotify error (HTTP 400): Invalid base62 id` / `https://open.spotify.com/playlist/8HiJkLmNoPqRsTuVwXyZaB` |
| `Arctic Monkeys`, fake duplicate check throws `TypeError: Cannot read properties of undefined (reading 'items')` | `[stderr] Something went wrong: Cannot read properties of undefined (reading 'items')` / `[stderr] Set PLAYSET_DEBUG=1 to see the details.` |
| Same TypeError with `PLAYSET_DEBUG=1` | the same two lines, then the error's details and stack trace on standard error; none of `sfm-test-key-0f3c9a`, `BQD-test-token` or `AQCr7Yh1...refresh` appear |

### S8 — Normal outcomes return to the prompt (AC-14)

```
playset › Arctic Monkeys
...
? Add the Tape "I Want It All" (Queen) to the playlist? (y/N)
? Add the Tape "Mr. Blue Sky" (Electric Light Orchestra) to the playlist? (y/N)
...
? Create this playlist? (y/N) n
No playlist created.

playset › ^D
$
```

Exit code 0. No `POST` recorded. The same session with E5's Tape-only Setlist and `--no-tapes` prints `[stderr] Nothing to add: every Performance is a Tape that was left out.`, then the prompt; the session's exit code is still 0.

### S9 — Ctrl-C during a run (AC-15, AC-16, AC-17)

| When Ctrl-C is pressed | Output | Requests | Afterwards |
|---|---|---|---|
| At `? Which Artist do you mean?` (line `arctic monkey`) | `Cancelled.` | artist search only; no setlists request | prompt |
| At the second Tape question | `Cancelled.` | no Spotify request | prompt |
| While "Waiting for the Spotify login" | `Cancelled.` | no search | prompt |
| During `Finding Matches 4/10` | `Cancelled.` | searches for #1–#4 only; no `GET /v1/me/playlists`; no `POST` | prompt |
| During the duplicate check (`--yes`) | `Cancelled.` | no `POST` | prompt |
| At `? Create this playlist?` | `Cancelled.` | no `POST` | prompt |
| After `POST /v1/me/playlists` was sent (`--yes`), while items are being added | no `Cancelled.`; the run prints `Created "Arctic Monkeys – 2025-08-23 – Amsterdam" with 9 tracks.`, the Miss and `https://open.spotify.com/playlist/7GhIjKlMnOpQrStUvWxYzA` | create and add-items both recorded | prompt |

No stack trace is printed in any row, and the session does not end.

### S10 — Ctrl-C and Ctrl-D at the prompt (AC-18, AC-19)

```
playset › ^C
(To leave, type exit or press Ctrl-C again.)
playset › ^C
$
```

Exit code 0.

```
playset › Arctic Mon^C
playset › ^C
(To leave, type exit or press Ctrl-C again.)
playset › Radiohead --dry-run
... (Radiohead run)
playset › ^C
(To leave, type exit or press Ctrl-C again.)
playset › ^D
$
```

Exit code 0. The Ctrl-C with `Arctic Mon` typed discards that text and does not count. Entering `Radiohead --dry-run` resets the count, so the next Ctrl-C prints the hint again. Ctrl-D ends the session.

```
playset › Arctic Monkeys
? Add the Tape "I Want It All" (Queen) to the playlist? (y/N) ^C
Cancelled.
playset › ^C
(To leave, type exit or press Ctrl-C again.)
playset ›
```

The Ctrl-C that cancelled the run does not count, so the first Ctrl-C at the prompt only prints the hint.

With scripted input `["Radiohead --dry-run"]` followed by end of input (AC-19, AC-25), the session runs the dry run and then ends with exit code 0.

### S11 — Login once, and after a cancelled login (AC-20, AC-21)

Session with no token cache at the start:

1. `Arctic Monkeys --dry-run --no-tapes` → full login (authorize URL printed once, browser opened once), token cached with expiry 3600 s later.
2. `Radiohead --dry-run` 10 minutes later → no authorize URL, no browser, no token request (PRD 0004 AC-18).
3. `Arctic Monkeys --yes --no-tapes` 59 minutes and 30 seconds after the login → one refresh `POST` to the token endpoint, no authorize URL, no browser (PRD 0004 AC-19).

Session where login is cancelled:

```
playset › Arctic Monkeys --no-tapes
...
Waiting for the Spotify login (Ctrl-C to cancel)...
^C
Cancelled.
playset › Arctic Monkeys --no-tapes
...
Log in to Spotify in your browser. If it did not open, open this link:
https://accounts.spotify.com/authorize?client_id=3f9a0c2e7b4d4e1f8a6b5c4d3e2f1a0b&...redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback...
Waiting for the Spotify login (Ctrl-C to cancel)...
Logged in to Spotify.
```

The second run receives its callback on port 8888; no `Port 8888 is already in use` message is printed.

### S12 — A setting added during the session (AC-23)

`SETLISTFM_API_KEY` unset and no config file at the start:

```
playset › Arctic Monkeys
[stderr] setlist.fm API key not found.
[stderr] Get a free key at https://www.setlist.fm/settings/api, then set SETLISTFM_API_KEY,
[stderr] or add {"setlistfmApiKey": "<your key>"} to ~/.config/playset/config.json.
playset ›
```

The user writes `{"setlistfmApiKey": "sfm-test-key-0f3c9a"}` to the config file in another window, then enters `Arctic Monkeys --dry-run` in the same session. The run sends its search with `x-api-key: sfm-test-key-0f3c9a` and continues to the Show line. No restart is needed.

### S13 — History (AC-24)

Session lines: `Arctic Monkeys --dry-run`, then `help`, then a run of `Arctic Monkeys` whose Tape questions are answered `y` and `n`. At the next prompt:

- up once → `Arctic Monkeys`
- up twice → `help`
- up three times → `Arctic Monkeys --dry-run`
- then down once → `help`

`y` and `n` never appear in the history. Empty lines are not added. After `exit` and a new `playset`, pressing up at the first prompt shows nothing, and no history file exists in `~/.config/playset/`.

### S14 — Session with fakes (AC-25)

Scripted lines `["Arctic Monkeys --dry-run --no-tapes", "--tapes --no-tapes Radiohead", "Xyzzq Nonexistent", "Arctic Monkeys --yes", "help", "exit"]`, fake Tape answers `y`, `n` for the fourth line, PRD 0007 E18's fake services with S1's data, and a captured output. The session completes without a terminal or network. The captured output matches S1 in order (banner; prompt; dry-run output; prompt; usage message and shell hint; prompt; Artist-not-found message; prompt; created output ending with the share link; prompt; help; prompt), the fake token getter is called by the first and fourth runs only, and the reported exit code is 0.

### AC coverage

| AC | Examples |
|---|---|
| AC-1 | S1, S2 |
| AC-2 | S2 |
| AC-3 | S2 |
| AC-4 | S3 |
| AC-5 | S1, S3 |
| AC-6 | S1 |
| AC-7 | S1, S4 |
| AC-8 | S5 |
| AC-9 | S1 |
| AC-10 | S1, S3 (`Quit`) |
| AC-11 | S6 |
| AC-12 | S3 |
| AC-13 | S1, S7 |
| AC-14 | S1, S8 |
| AC-15 | S9, S10 |
| AC-16 | S9 |
| AC-17 | S9 |
| AC-18 | S10 |
| AC-19 | S8, S10 |
| AC-20 | S1, S11 |
| AC-21 | S11 |
| AC-22 | S1 |
| AC-23 | S12 |
| AC-24 | S6, S13 |
| AC-25 | S10, S14 |

## Superseded behaviour

- **PRD 0007 AC-4, the "no arguments" case only:** `playset` with no arguments at all, when standard input and standard output are both terminals, now opens a session (AC-1) instead of printing the message and usage line with exit code 2. PRD 0007 T3's first table row (`playset` → exit 2) is superseded for that case only. With no terminal (AC-2), and for every other AC-4 case (only whitespace, a link plus other words) and flags with no input, PRD 0007 AC-4 is unchanged.
- **PRD 0007 AC-6 (additive):** the `--help` text gains one line about the session (AC-3). Every fact AC-6 requires is still present.

## Glossary terms used

- **Setlist** — as defined in GLOSSARY.md.
- **Show** — as defined in GLOSSARY.md.
- **Artist** — as defined in GLOSSARY.md.
- **Performance** — as defined in GLOSSARY.md.
- **Tape** — as defined in GLOSSARY.md.
- **Cover** — as defined in GLOSSARY.md.
- **Original Artist** — as defined in GLOSSARY.md.
- **Latest Setlist** — as defined in GLOSSARY.md.
- **Setlist Playlist** — as defined in GLOSSARY.md.
- **Match** — as defined in GLOSSARY.md.
- **Miss** — as defined in GLOSSARY.md.

"Session", "prompt", "line", "run line", "run", "shell hint" and "banner" are PRD-local words defined above, not glossary terms. PRD 0007's local words keep their meaning. Ctrl-C, Ctrl-D, terminal, standard input/output and history are ordinary terminal words.

## Shared-file requests

For the orchestrator (this Slice does not edit shared files):

- **CLAUDE.md** — under "Product rules", add one line: `playset` with no arguments in a terminal opens an interactive shell (prompt `playset › `). Each line is a run with the same arguments and flags as the command (flags per line only), or a built-in: `help`, `clear`, `exit`/`quit` (only when the whole line is that word; quote it, e.g. `"help"`, to look up such an Artist). Errors and Ctrl-C end only the current run; Ctrl-C twice at an empty prompt, Ctrl-D or `exit` leave with exit 0. Spotify login and setlist.fm throttling are shared across runs. History is in-memory only. Without a terminal, no arguments is still a usage error (exit 2).
- **src/core/index.ts** — no change; the shell uses the run API PRD 0007 already exports.
- **package.json** — no change; Node's built-in line reading is enough and the version stays `0.1.0`.

## Open questions

(none)
