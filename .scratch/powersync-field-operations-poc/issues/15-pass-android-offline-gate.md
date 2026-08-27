# 15: Pass the physical Android offline gate

**What to build:** A real Android phone can use the installed field PWA through the private Tailscale endpoint, continue through complete network loss and a phone restart, then synchronize every operation once.

**Blocked by:** 12: Survive browser, API, and PowerSync interruptions; 13: Test the stack remotely over Tailscale.

**Status:** ready-for-agent

**Implementation:** the installable PWA and QA routine are ready; the physical Android acceptance gate has not been run.

- [ ] The evidence records device model, Android version, Chrome version, application build, PowerSync version, browser storage implementation, and timestamps.
- [ ] The phone reaches the containerized stack over tailnet-only HTTPS and installs the PWA.
- [ ] The worker downloads a team day and sees `Ready offline` before connectivity is disabled.
- [ ] The installed PWA reopens with all trucks and assignments after Chrome closes and while the phone has no network.
- [ ] Planned, short, flagged, and alternative work survives a phone restart while offline.
- [ ] Reconnection uploads every operation once, empties the queue, and delivers resulting exceptions to the phone.
- [ ] Any browser-storage loss, manual recovery, or platform-specific failure is recorded as POC evidence.
