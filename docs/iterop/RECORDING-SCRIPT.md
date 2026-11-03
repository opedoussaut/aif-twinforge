# Hall B video: the full script

Live sandbox, engineering audience, 6–8 minutes once edited. Keep this page open on a second screen.

How to read it: each **clip** is recorded separately (OBS hotkey on, then off). **DO** is what you do on screen. **TYPE** is what you paste. **SHOW** is what to linger on for 2–3 seconds so it can be zoomed in the edit. **VO** is the voice-over, recorded after the cut. **OFF CAMERA** happens with the recorder stopped.

Placeholders: `<BASE>` is the baseline run reference (for example `COOL-261103-0912…`), `<CHG>` is the change run reference. Write them down as soon as they appear.

Viewer commands run in a terminal **off camera**, from the `3dx-mcp-gateway` folder (where the connectors write their scenes). Or tell Claude Code "switch the viewer to …" and press F5 in Chrome.

---

## Before the first clip (off camera, about 15 min)

1. **CATIA Magic:** open _NOVA Lab – Cooling (synthetic)_ with the Cameo MCP Bridge plugin and an empty **NOVA Lab** package.
2. **Claude Desktop, new chat.** Check both connectors:

   > Check the ITEROP and CATIA Magic connections.

   Expect: ITEROP `SANDBOX (live ITEROP)`, ready, review mode `step`; CATIA Magic ready.

3. **Create the baseline**, same chat:

   > Configure the liquid cooling chain for Hall B: 1.2 MW, 32 °C facility water, 16 racks, N+1, PG25. Run all the steps in ITEROP, including the SysML model and the 3D view.

   Confirm each step. **Write down `<BASE>`.**

4. **ITEROP Play:** open the _Engineering sign-off_ task of `<BASE>` and approve it.
5. **Viewer on the baseline:**

   ```bash
   npm run twin:view -- .private/twin/<BASE>.usda
   ```

   Chrome on <http://127.0.0.1:8765>, F5. Expect 1.2 MW, 4 CDUs, **space check PASS**, nothing red.

6. **Claude Desktop: start a new, empty chat** for the recording. Zoom Claude and Chrome so text reads at 1080p.
7. **Arrange the windows:** CATIA Magic on the _Cooling System_ diagram, Chrome on the viewer, Play on the run list. Do Not Disturb on.

---

## Clip 0: title and architecture (0:00–0:40)

**DO:** full-screen the title slide, then `docs/screenshots/architecture-direct.png`.

**VO:**

> This is Hall B, an AI factory hall with liquid cooling.
> Three views describe the same engineering decision. ITEROP holds the process and the decisions. CATIA Magic holds the SysML system model. An OpenUSD scene shows the installation in 3D.
> Claude moves information between them through two small connectors on my own computer. Every view is produced from values checked and recorded in ITEROP. None is edited on its own.
> Everything you'll see runs live on a sandbox, with synthetic data.

---

## Clip 1: the approved baseline (0:40–1:00)

**DO:** CATIA Magic, _Cooling System_ diagram (3 s). Alt+Tab to the viewer, slowly orbit the hall once.

**SHOW:** the viewer's panel: 1.2 MW · 16 racks · 4 × CDU-500 · _Space check PASS: 3.5 of 4.2 m_.

**VO:**

> The starting point is approved: 1.2 megawatts, 16 racks, four 500-kilowatt CDUs, N+1.
> It exists in ITEROP, in the system model, and in 3D. The four CDUs use 3.5 of the 4.2 metres of the CDU gallery.

---

## Clip 2: the change request (1:00–2:00)

**DO:** Claude Desktop, the empty chat.

**TYPE:**

> Hall B is expanding to 24 racks and 1.8 MW, same coolant and redundancy. The approved baseline is `<BASE>`. Prepare the change and run it through ITEROP.

**SHOW:** Claude's impact statement (+8 racks, +50 % flow, more CDU capacity, larger headers) and its proposal of **6 × CDU-500**. Expand the `cooling_check` call: **PASS**.

> If Claude proposes 5 × CDU-500, reply before anything is written: _Use 6 × CDU-500 units._ (5 units also fail the space check, at 4.4 m, but the numbers would no longer match this script.)

**VO:**

> I ask for a change, in plain language. Hall B grows to 24 racks and 1.8 megawatts.
> Claude states the impact first: eight more racks, fifty percent more flow, more cooling capacity, larger headers. It proposes six CDU-500 units.
> Before anything is written, an independent engineering check verifies the physics. It passes. The numbers are fine.

---

## Clip 3: the process runs (2:00–2:40)

**DO:** Claude starts the run. **Write down `<CHG>`.** At each write, Claude shows the stage's values and waits. Confirm with:

> Confirmed.

Do this for _Select coolant_, _Size CDUs_, _Configure the loop_, _Check system limits_. Record all of them; the edit keeps the first one in full and cuts the rest.

**DO:** Alt+Tab to Play, open `<CHG>`: its completed steps.

**VO:**

> The change runs through the ITEROP process. Before each write, Claude shows the values and waits for my confirmation. Claude can't sign, approve or delete anything.
> In ITEROP, every step is recorded as it happens.

---

## Clip 4: the system model (2:40–3:30)

**DO:** confirm when Claude reaches the system model. Then Alt+Tab to CATIA Magic: the _Cooling System_ model now shows 24 racks and 6 CDUs, updated in place.

**DO:** back in Claude, expand the _Update system model_ write.

**SHOW:** the model receipt: reference, revision, signature.

**VO:**

> Claude modifies the existing system model in CATIA Magic, in place. It can only work inside one lab package of one named project. It can't delete, run scripts or commit to a shared repository.
> When the model is ready, the connector signs a receipt. ITEROP accepts the _Update system model_ step only with that receipt, so Claude can't record a model reference it invented.

---

## Clip 5: the 3D view finds the problem (3:30–4:20)

**DO:** confirm the 3D step. In Claude, expand the `view3d_build` call.

**SHOW:** **Space check FAIL: 6 CDUs need 5.3 m but the CDU gallery is 4.2 m.** Then the _Update 3D view_ write that records it.

**OFF CAMERA:** switch the viewer to the change:

```bash
npm run twin:view -- .private/twin/<CHG>.usda --baseline .private/twin/<BASE>.usda
```

**DO:** Chrome, F5. _Proposed_: orbit to the red units. Click _Compare_: added parts green, changed amber, unchanged faded.

**VO:**

> The 3D view is generated by the connector from the values recorded in ITEROP, and linked to the SysML model.
> It runs a check the numbers can't: do the units fit the room? Six CDUs need 5.3 metres. The gallery is 4.2. The finding is recorded in ITEROP, and the units that don't fit are shown in red.
> Compared with the baseline: the new racks in green, the changed loop in amber.

---

## Clip 6: the engineer rejects (4:20–5:00)

**DO:** Play, open the _Engineering sign-off_ task of `<CHG>`.

**SHOW:** the system model and 3D view references, and the failed space check.

**DO:** reject. **TYPE** the comment:

> The CDUs don't fit the CDU gallery. Use fewer, larger units.

**VO:**

> At sign-off, the engineer sees the finding. The numbers passed, but the installation doesn't fit. Rejected, with a comment. The run goes back to rework.

---

## Clip 7: the rework (5:00–6:10)

**DO:** Claude Desktop, same chat.

**TYPE:**

> The engineer rejected `<CHG>`. Check my tasks and handle the rework.

**SHOW:** Claude finds the rework task, shows the rejected design, and **asks for the reviewer's comment**. Paste it:

> The CDUs don't fit the CDU gallery. Use fewer, larger units.

**SHOW:** the new design, **4 × CDU-800, N+1, 75 % utilisation**; `cooling_check` **PASS**. Confirm each write, including the system model update (CATIA Magic: 4 CDUs now, 3 s).

**VO:**

> Back in Claude. It picks up the rework from the run's history: the inputs, every earlier step, and the rejected design.
> The reviewer's comment isn't available through the API, so Claude asks for it instead of guessing.
> It redesigns with four larger CDU-800 units: same redundancy, 75 percent utilisation. The check passes, and Claude updates the same system model.

---

## Clip 8: the 3D view passes (6:10–6:40)

**SHOW:** in Claude, the `view3d_build` result: **Space check PASS: 4.1 of 4.2 m.**

**DO:** Chrome, F5 (the scene file has been rebuilt; same viewer command). _Proposed_: nothing red. _Compare_: the larger units replace the baseline CDUs.

> If the viewer still shows the old scene, restart it with the same command as in clip 5 (off camera), then F5.

**VO:**

> The rebuilt 3D view passes: 4.1 of 4.2 metres. The comparison with the baseline shows exactly what changes.

---

## Clip 9: approval and history (6:40–7:10)

**DO:** Play, the new _Engineering sign-off_ task of `<CHG>`. Approve. **TYPE:**

> OK: 4 × CDU-800 fits the gallery.

**DO:** open the run's history.

**SHOW:** both passes: the rejected change with its space finding, then the approved one.

**VO:**

> The engineer approves. The run is complete, and ITEROP keeps both passes: the rejected change with its finding, and the approved one.
> The new configuration becomes the baseline for the next change.

---

## Clip 10: closing (7:10–7:40)

**DO:** closing slide with five lines.

**VO:**

> Each part does what it's good at.
> Claude understands, designs, explains and modifies.
> The independent check verifies the physics.
> The 3D view catches what the numbers can't.
> CATIA Magic holds the system structure.
> And ITEROP records every step, while people make the decisions.

---

## After recording

- OBS: _File → Remux Recordings_, mkv → mp4.
- Edit: cut waits and repeated confirmations, speed up tool runs (×2–4, marked), zoom on each SHOW value, keep the corner label **"Live sandbox · synthetic data · illustrative room dimensions"**, blur the tenant name in Play's address bar if the video leaves the team.
- Record the VO lines above against the cut, one shot at a time.
