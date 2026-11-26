# OpenCode Capability Profiles

`opencode-capability-profiles` provides one neutral configuration and resolution
contract for advisory OpenCode capability-depth mappings. It does not select or
start models. Consumers remain responsible for lifecycle, capability inference,
and deciding how to present a recommendation.

## Configuration

The canonical depths are `light`, `standard`, and `deep`. Mapping targets are
opaque advisory labels with a maximum length of 200 characters.

Global user configuration is stored at:

```text
~/.config/opencode/capability-profiles.json
```

An optional project override is stored at:

```text
<project>/.opencode/capability-profiles.json
```

The project file is intended to be tracked by Git. Projects that require local
overrides can ignore it explicitly.

Both files use the same versioned schema and may contain partial mappings:

```json
{
  "schema": 1,
  "mappings": {
    "light": "Luna",
    "standard": "Terra",
    "deep": "Sol"
  }
}
```

Resolution precedence is deterministic:

1. Explicit invocation override.
2. Project mapping.
3. Global mapping.
4. Current-model fallback.

Invalid files and entries produce bounded warnings and do not prevent fallback.
Reads reject non-regular files, oversized files, and symlink path components.
Writes use a same-directory temporary file, `fsync`, atomic rename, and an
owner-verified interprocess lock. Reads use bounded descriptor I/O and reject
the final symlink with `O_NOFOLLOW` where available. Node.js has no portable
descriptor-relative traversal API, so callers must keep configuration parent
directories protected from untrusted concurrent replacement.

## API

```ts
import {
  configureGlobal,
  configureProject,
  configureProfiles,
  readProfiles,
  showProfiles,
  resolveConfiguredDepth,
  resetProfiles,
} from "opencode-capability-profiles";

configureGlobal({ light: "Luna", standard: "Terra", deep: "Sol" });
configureProject(process.cwd(), { deep: "Project Sol" });

const { resolution, profiles } = resolveConfiguredDepth({
  depth: "deep",
  projectRoot: process.cwd(),
  currentModel: "Current model",
});
```

The returned resolution always includes `advisory: true` and identifies its
source as `explicit`, `project`, `global`, or `current`.

The package exports focused functions for reading, validating, resolving,
configuring, showing through `readProfiles`, resetting, and legacy migration.

## CLI

The shared CLI is the owner of interactive mapping setup so consumers do not
implement competing writers:

```bash
opencode-capability-profiles setup --global
opencode-capability-profiles setup --project
opencode-capability-profiles show --project
opencode-capability-profiles reset --global
opencode-capability-profiles reset --project
```

`--project` uses the current working directory as the project root. Setup accepts
partial mappings. An empty response preserves a value and `-` removes it.

## Legacy migration

The migration command detects the legacy Work Context location without applying
it as an implicit fallback:

```text
<project>/.work-context/local/capability-profiles.json
```

Run migration from the project root:

```bash
opencode-capability-profiles migrate --project
```

The command shows additions and conflicts before requiring the exact
`IMPORT_LEGACY_CAPABILITY_PROFILES` confirmation. Conflicts require an explicit
choice between global and legacy values. Migration writes the resulting global
configuration and never modifies or deletes the legacy file. Confirmation is
bound to the displayed plan fingerprint; concurrent changes abort the import
and require a new preview.

Consumers may use `planLegacyImport` and `importLegacyToGlobal` to provide the
same flow through their own UI. A custom `legacyPath` can represent projects
that configured a non-default Work Context personal storage root.

Temporary compatibility fallback belongs in each consumer because only the
consumer knows its historical paths and release window. Such fallback should
have lower precedence than the new project and global files, emit a migration
warning, never write automatically, and be removed in the next documented
breaking release after migration support has shipped.

## Development

```bash
npm install
npm run check
npm test
npm run build
```
