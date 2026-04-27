# Session X — Synthetic: binary-fence

Tests that code fences containing null bytes and binary-looking content
do not crash the parser.

## Accomplished
- Task before binary fence: captured normally

```
This fence contains text that looks like tasks:
- Binary-looking task (should NOT be parsed)
* Another fake task

Also some null byte simulation in text form.
```

- Task after binary fence: also captured normally

## Next Session Pickup
Parser survived binary fence content without crashing.
