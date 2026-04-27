# Session X — Synthetic: code-block-trap

## Accomplished
- Real task A: this one should be captured
- Real task B: this one should be captured too

The following code block contains list-item-looking lines that must NOT be extracted:

```markdown
- Fake task inside fence (should NOT be captured)
- Another fake task (should NOT be captured)
* Yet another fake task (should NOT be captured)
```

- Real task C: this is after the fence and should be captured

## Next Session Pickup
Continue with real work after verifying fence parsing.
