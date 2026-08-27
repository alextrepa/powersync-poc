# QA-011: Android offline persistence

Routine state: executable

Covers: [Ticket 15](../../../.scratch/powersync-field-operations-poc/issues/15-pass-android-offline-gate.md)

## Outcome

An installed Android PWA keeps a downloaded day and queued work through complete network loss, Chrome closure, and a phone restart, then synchronizes each operation once.

## Preconditions

- QA-010 passes from the Android phone.
- Record the phone model, Android version, Chrome version, build, PowerSync version, and browser storage implementation.
- A published team day contains four controlled assignments for a planned pickup, flagged short pickup, alternative pickup, and confirmed over-pick.

## Procedure

1. Open the private HTTPS address in Android Chrome and install the PWA.
   Expected: The installed app opens independently and can select a team.
2. Download the assigned day and wait for `Ready offline`.
   Expected: Every truck, assignment, and required candidate lot is visible.
3. Disable Wi-Fi, mobile data, and Tailscale connectivity.
   Expected: The app reports offline state and retains the complete day.
4. Use Android App info to force-stop Chrome, then reopen the installed PWA.
   Expected: The browser process starts again and the downloaded day remains available without connectivity.
5. Record the controlled planned pickup, flagged short pickup, alternative pickup, and confirmed over-pick.
   Expected: Each action appears locally, increases the queued count, and the over-pick is ready to create a known exception after upload.
6. Restart the phone while it remains offline, then reopen the PWA.
   Expected: The day and queued actions remain unchanged.
7. Restore connectivity and Tailscale, then wait for synchronization.
   Expected: The queue empties, SQL Server contains every action once, and the controlled over-pick exception appears on the phone.

## Pass criteria

- The installed PWA cold-starts offline after Chrome closure and phone restart.
- All downloaded business data and queued operations survive.
- The queue and network indicators match observed state.
- Reconnection uploads each operation exactly once and converges within 30 seconds after services are healthy.
- No manual browser-storage or queue repair is required.

## Evidence

- Device and version record.
- Screen recording covering readiness, Android force-stop, offline phone restart, queued work, and reconnect.
- Authoritative operation identifiers and final queue state.
- Notes for any Android permission, battery, storage, or lifecycle behavior encountered.

## Execution log

| Date | Build | Environment | Tester | Result | Evidence | Notes |
|---|---|---|---|---|---|---|
