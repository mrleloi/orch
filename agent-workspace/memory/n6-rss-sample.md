# N6 — Memory-Leak Verification (RSS Delta < 50 MB)

Charter criterion N6 requires a 72h continuous run of the Orch daemon with RSS delta
below 50 MB to confirm no memory leak exists. SC-14 marks this as PARTIAL until the
full 72h run is completed and attached to release notes prior to v2.0 GA.

Script: `scripts/utilities/measure-rss.sh`

---

## 72h Protocol

The following steps constitute the official 72h memory-leak verification procedure.

### Prerequisites

- A Linux or macOS host running the Orch daemon in production-like conditions
  (queue enabled, at least one managed project active, Telegram bot connected).
- The `measure-rss.sh` script must be executable:
  ```bash
  chmod +x scripts/utilities/measure-rss.sh
  ```
- `ps` must be available (standard on Linux/macOS).

### Steps

1. **Start the Orch daemon** in its normal operating mode:
   ```bash
   pnpm --filter @orch/core start:prod
   ```

2. **Capture the daemon PID**:
   ```bash
   ORCH_PID=$(pgrep -f "orch/core" | head -1)
   echo "Daemon PID: $ORCH_PID"
   ```

3. **Start the 72h sampler** (259200 s = 72 h, sampling every 60 s):
   ```bash
   bash scripts/utilities/measure-rss.sh \
     --pid "$ORCH_PID" \
     --duration-sec 259200 \
     --interval-sec 60 \
     --output-csv /tmp/n6-rss-$(date +%Y%m%d).csv \
     --threshold-mb 50 \
     | tee /tmp/n6-rss-summary.txt
   ```

4. **Monitor progress** — the script prints warnings to stderr if the process is
   unreachable. The CSV grows at ~1 row/min (~1440 rows/24h, ~4320 rows/72h).

5. **Collect results** after 72h:
   - `summary line`: printed to stdout, e.g. `RSS delta: 12.3 MB (PASS)`
   - `CSV file`: `/tmp/n6-rss-<date>.csv` (timestamp_iso,rss_kb)
   - Exit code 0 = PASS (delta < 50 MB), exit code 1 = FAIL (delta >= 50 MB)

6. **Attach to release notes**: copy `n6-rss-summary.txt` and the CSV into the
   v2.0 GA release notes as evidence for N6.

### Pass criteria

| Metric | Requirement |
|---|---|
| RSS delta (max - min) | < 50 MB |
| Sampling duration | >= 72h (259200 s) |
| Sample count | >= 4000 (no major gaps) |
| Exit code | 0 |

---

## 4h Sample Result

**Status: NOT_RUN**

The 4h sample was not executed in the implementer environment (CI-like context without
a live Orch daemon instance).

Per master plan section 10, open question 8: SC-14 PARTIAL is acceptable. The 72h
run is a user-action TODO required before v2.0 GA. The script is authored and
syntax-verified; the protocol is fully documented above.

When a live daemon is available, the 4h sample command is:

```bash
bash scripts/utilities/measure-rss.sh \
  --pid "$ORCH_PID" \
  --duration-sec 14400 \
  --interval-sec 60 \
  --threshold-mb 50
```

Expected output format:
```
RSS delta: X.X MB (PASS|FAIL)  [min=N KB  max=N KB  samples=240  csv=/tmp/rss-<pid>-<ts>.csv]
```

---

## Windows Note

On Windows, `ps` is not available. Use PowerShell to sample RSS:

```powershell
$pid = <ORCH_PID>
$rss = (Get-Process -Id $pid).WorkingSet64 / 1KB
Write-Output "$(Get-Date -Format 'o'),$([int]$rss)"
```

For a full Windows sampling loop, adapt `measure-rss.sh` logic into a `.ps1` script
or use the WSL2 environment where `ps` is available.

---

## User-action TODO (before v2.0 GA)

- [ ] Ensure Orch daemon runs continuously for >= 72h under realistic load
- [ ] Run `measure-rss.sh` with `--duration-sec 259200 --interval-sec 60`
- [ ] Confirm exit code 0 (PASS, delta < 50 MB)
- [ ] Save the CSV and summary line
- [ ] Attach CSV + summary to v2.0 GA release notes as N6 evidence
- [ ] Update SC-14 scorecard from PARTIAL to PASS in `agent-workspace/memory/project.md`
- [ ] If FAIL (delta >= 50 MB): open a memory-leak investigation task before GA
