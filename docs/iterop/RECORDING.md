# Recording the Hall B video (live, engineering audience)

Goal: a 6–8 minute screen recording of the Hall B change ([DEMO-CHANGE-SCENARIO.md](DEMO-CHANGE-SCENARIO.md)), run live on the sandbox, for engineers. It shows the tool calls, the signed model receipt, the space check and the baseline compare.

The clip-by-clip script, with every prompt and the voice-over, is in [RECORDING-SCRIPT.md](RECORDING-SCRIPT.md).

Label the video **"Live sandbox · synthetic data · illustrative room dimensions"**. The 3D step has only been tested in simulation so far, so this recording is also its first live run. Rehearse it once before you record.

## 1. The day before: rehearsal (about 30 min, not recorded)

Run the whole story once, end to end, with the steps in sections 3 and 4. Then you know the timing, where Claude pauses, and what can go wrong. Keep the rehearsal runs; the baseline from the rehearsal can serve as the baseline for the recording.

## 2. Before you press record

**Systems**

- [ ] CATIA Magic is open with _NOVA Lab – Cooling (synthetic)_ and the Cameo MCP Bridge plugin loaded. In Claude, `cameo_connection` reports `ready: true`.
- [ ] `iterop_connection` reports `SANDBOX (live ITEROP)`, `ready: true`, review mode `step`.
- [ ] ITEROP Play is signed in, in a browser window on its own.
- [ ] The baseline run exists and is approved (section 3). Its run reference is written down.

**Screen**

- [ ] 1920 × 1080. Close everything that isn't in the story: mail, Teams, notifications (turn on Do Not Disturb).
- [ ] Four windows, one per app: Claude Desktop, ITEROP Play, CATIA Magic, the 3D viewer (<http://127.0.0.1:8765>). Switch between them with Alt+Tab, each one full screen.
- [ ] Zoom in on Claude Desktop (Ctrl + =, once or twice) and on the browser (110–125 %) so text is readable in a 1080p video.
- [ ] Never open `.env`, `.private/` or a terminal that prints configuration. Credentials must never appear on screen.
- [ ] If the video will be shared outside the team, plan to blur the tenant name in the Play address bar while editing.

**Recorder (OBS Studio)**

- [ ] Source: _Display Capture_ of the main screen. Output 1920 × 1080, 30 fps, recording format _mkv_ (it survives a crash), then _File → Remux Recordings_ to mp4.
- [ ] Microphone: record the voice-over separately, after the cut, rather than talking while you drive. It's easier to fix and to time.
- [ ] Start/stop hotkey (for example Ctrl+F9) so you never have to show the OBS window.
- [ ] Record **one clip per act**. A failed act is retaken on its own: the state is in ITEROP, so the next act continues from where the last one ended.

**Clipboard: the prompts, ready to paste**

```text
Act 1:
Hall B is expanding to 24 racks and 1.8 MW, same coolant and redundancy. The approved baseline is <BASELINE-RUN>. Prepare the change and run it through ITEROP.

Act 3, rejection comment in Play:
The CDUs don't fit the CDU gallery. Use fewer, larger units.

Act 4:
The engineer rejected <CHANGE-RUN>. Check my tasks and handle the rework.

Act 4, when Claude asks for the reviewer's comment:
The CDUs don't fit the CDU gallery. Use fewer, larger units.

Act 5, approval comment in Play:
OK: 4 × CDU-800 fits the gallery.
```

## 3. Baseline (off camera)

Follow _Before the demo: create the baseline_ in [DEMO-CHANGE-SCENARIO.md](DEMO-CHANGE-SCENARIO.md): 1.2 MW, 32 °C facility water, 16 racks, N+1, PG25, all seven steps, approved in Play. Leave CATIA Magic open on the _Cooling System_ diagram and the viewer on the baseline scene for the opening shot.

## 4. Shot list

Timings are for the edited video. Long tool calls are sped up in the edit.

| #   | Time      | Window         | What happens                                                                                                                                                                                            | What to show (engineering audience)                                                                                                                            |
| --- | --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | 0:00–0:40 | Slide          | Title, then the architecture: Claude ↔ two local connectors ↔ ITEROP (API Gateway) and CATIA Magic; OpenUSD view                                                                                        | `docs/screenshots/architecture-direct.png`. One sentence: "Each view is produced from values recorded in ITEROP, never edited independently."                  |
| 1   | 0:40–1:00 | CATIA, viewer  | The approved baseline: 1.2 MW, 16 racks, 4 × CDU-500                                                                                                                                                    | The _Cooling System_ diagram; the viewer's _Proposed_ view of the hall                                                                                         |
| 2   | 1:00–2:00 | Claude         | Act 1 prompt. Claude states the impact and proposes 6 × CDU-500. `cooling_check` **PASS**                                                                                                               | Expand the `cooling_check` call: the independent check, its values and PASS                                                                                    |
| 3   | 2:00–2:40 | Claude, Play   | Claude starts the run and writes the first stages; you confirm each write (step mode)                                                                                                                   | One confirmation in full, then cut the others. In Play, the new run and its completed steps                                                                    |
| 4   | 2:40–3:30 | CATIA, Claude  | Claude updates the existing model in place; the connector signs a receipt; _Update system model_ accepts it                                                                                             | CATIA: the changed counts and values. Claude: the receipt (reference, revision, signature). Mention that a made-up reference would be refused                  |
| 5   | 3:30–4:20 | Claude, viewer | `view3d_build` with the baseline: **space check FAIL, 5.3 m in a 4.2 m gallery**, recorded in _Update 3D view_                                                                                          | Expand the call: the gallery length, the units, the content hash. Viewer: _Proposed_ (red units), then _Compare_ (green/amber/faded)                           |
| 6   | 4:20–5:00 | Play           | Act 3: the engineer opens sign-off, reads the finding, rejects with the comment                                                                                                                         | The sign-off task with the model and 3D references and the failed space check                                                                                  |
| 7   | 5:00–6:10 | Claude         | Act 4: Claude finds the rework, shows the rejected design, asks for the comment (the API doesn't expose it); redesigns with 4 × CDU-800, 75 % utilisation; `cooling_check` PASS; updates the same model | The question Claude asks instead of guessing. The new design and its PASS                                                                                      |
| 8   | 6:10–6:40 | Viewer         | Rebuilt 3D view: **space check PASS, 4.1 m of 4.2 m**                                                                                                                                                   | Refresh. _Compare_: the larger units replace the baseline CDUs, nothing red                                                                                    |
| 9   | 6:40–7:10 | Play           | Act 5: approved. The run is complete; the history shows both passes                                                                                                                                     | The run history: the rejected pass with its finding, then the approved one                                                                                     |
| 10  | 7:10–7:40 | Slide          | What each part does                                                                                                                                                                                     | Claude designs and explains · the check verifies the physics · 3D catches what numbers can't · CATIA Magic holds the structure · ITEROP records, people decide |

## 5. If something goes wrong

- **Claude goes off script** (different numbers, skips a step): stop the clip and correct it in the same chat ("Use CDU-500 units only" or "Run the 3D view against the baseline"), then retake from the start of that act. If the chat is too messy, open a new chat. The run is in ITEROP, so ask Claude to pick up the run by its reference.
- **A write is refused:** that's the guard working. Read the reason. If it's a missing receipt or a value mismatch, ask Claude to redo the previous step.
- **CATIA Magic stops responding:** restart it with the plugin, check `cameo_connection`, and retake act 2.
- **Claude proposes 5 × CDU-500 instead of 6:** the space check still fails, but at 4.4 m instead of 5.3 m. Either keep it and say 4.4 m in the voice-over, or ask for 6 × CDU-500 before the run starts so the numbers match the slides.

## 6. Editing

- Cut waits and repeated confirmations. Speed long tool runs up to 2–4× with a small "×2" mark.
- Zoom in (crop 150–200 %) on each value you name: PASS, 5.3 m / 4.2 m, the signature, 4.1 m / 4.2 m.
- Keep the label "Live sandbox · synthetic data · illustrative room dimensions" visible in one corner for the whole video.
- Voice-over: short sentences, one idea per shot, said after the action is on screen.
