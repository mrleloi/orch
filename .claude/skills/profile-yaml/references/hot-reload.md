# Hot Reload

`ProjectRegistryService` watcher pattern.

## Pattern

```typescript
@Injectable()
export class ProjectRegistryService implements OnModuleInit, OnModuleDestroy {
  private projects = new Map<string, Profile>();
  private watchers = new Map<string, FSWatcher>();

  async onModuleInit() {
    await this.loadAll();
    this.startWatching();
  }

  async reload(projectPath: string) {
    try {
      const newProfile = loadProfile(path.join(projectPath, '.orch/profile.yaml'));
      const old = this.projects.get(newProfile.name);
      this.projects.set(newProfile.name, newProfile);
      this.events.emit('project.updated', { old, newProfile });
      this.logger.log({ msg: 'Profile reloaded', name: newProfile.name });
    } catch (err) {
      // Keep old, log, notify
      this.logger.warn({ err, projectPath }, 'Profile reload failed, keeping previous');
      this.events.emit('project.validation_failed', { path: projectPath, error: err });
    }
  }

  private startWatching() {
    for (const [_, profile] of this.projects) {
      const yamlPath = path.join(profile.path, '.orch/profile.yaml');
      const watcher = chokidar.watch(yamlPath, { awaitWriteFinish: { stabilityThreshold: 300 } });
      watcher.on('change', () => this.reload(profile.path));
      this.watchers.set(profile.name, watcher);
    }
  }

  async onModuleDestroy() {
    for (const w of this.watchers.values()) await w.close();
  }
}
```

## Tests

- Hot reload with bad profile (keeps old)
- Hot reload happy path

## Anti-Patterns

- Storing hot-reloaded profile in mutable module-level state (use service)
