# AGENTS.md

## Cursor Cloud specific instructions

### Environment Overview

This is the **Mattermost Mobile** React Native app (v2.39.0). The Cloud VM runs on Linux (no macOS/iOS support), so only **Android** builds and the **JS/TS toolchain** are available.

### Key Commands (see CLAUDE.md for full list)

| Task | Command |
|---|---|
| Lint | `npm run lint` |
| TypeScript check | `npm run tsc` |
| Auto-fix lint | `npm run fix` |
| Unit tests | `npm run test` |
| Metro bundler | `npm start` |
| Android build | `cd android && ./gradlew installDebug -PreactNativeArchitectures=x86_64 --no-daemon` |

### Android SDK

- Installed at `/opt/android-sdk` with env vars in `~/.bashrc` (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, `JAVA_HOME`, `PATH`).
- SDK components: platform-tools, platforms;android-35, build-tools;35.0.0, ndk;27.1.12297006, emulator, system-images;android-28;default;x86_64.
- **API 28 (default) or API 34** emulators are available. API 28 boots in ~70s and app starts in ~2min. API 34 boots in ~290s and app starts in ~5min. API 35 causes ANR crashes during startup due to strict process-start timeouts. Use API 28 for speed or API 34 for modern Android look.

### Starting the Android Emulator (no KVM)

The Cloud VM lacks KVM, so the emulator runs in **software emulation** (`-accel off`). This is very slow — expect ~90s boot time and ~2min app startup.

```bash
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
export DISPLAY=:1

emulator -avd Pixel_API_28 -no-audio -gpu swiftshader_indirect \
  -no-boot-anim -no-snapshot -memory 2048 -partition-size 4096 \
  -accel off -no-metrics &
```

After boot, set up ADB reverse proxy:
```bash
adb reverse tcp:8081 tcp:8081  # Metro bundler
adb reverse tcp:8065 tcp:8065  # Mattermost server
```

### Installing the APK (fast method)

Do NOT use `adb install` directly — it's extremely slow on software emulation. Instead:
```bash
adb push /workspace/android/app/build/outputs/apk/debug/app-debug.apk /data/local/tmp/app-debug.apk
adb shell pm install -t /data/local/tmp/app-debug.apk
adb shell cmd package compile -m speed -f com.mattermost.rnbeta  # dex optimization — takes ~5min but critical for startup speed
```

### Mattermost Server (Docker)

A local Mattermost Enterprise server runs via Docker for the mobile app to connect to:

```bash
# Ensure Docker daemon is running (sudo dockerd via tmux)
docker network create mattermost

# PostgreSQL
docker run -d --name mattermost-postgres --network mattermost \
  -e POSTGRES_USER=mmuser -e POSTGRES_PASSWORD=mostest -e POSTGRES_DB=mattermost \
  -p 5432:5432 postgres:15

# Mattermost Server (requires MM_TEST_LICENSE env secret)
docker run -d --name mattermost-server --network mattermost \
  -e MM_SQLSETTINGS_DRIVERNAME=postgres \
  -e "MM_SQLSETTINGS_DATASOURCE=postgres://mmuser:mostest@mattermost-postgres:5432/mattermost?sslmode=disable&connect_timeout=10" \
  -e MM_SERVICESETTINGS_SITEURL=http://localhost:8065 \
  -e MM_TEAMSETTINGS_ENABLEOPENSERVER=true \
  -e MM_SERVICESETTINGS_ENABLELOCALMODE=true \
  -e MM_SERVICESETTINGS_ENABLETESTING=true \
  -e MM_SERVICESETTINGS_ENABLEDEVELOPER=true \
  -e MM_SERVICEENVIRONMENT=test \
  -e "MM_LICENSE=$MM_TEST_LICENSE" \
  -p 8065:8065 \
  mattermost/mattermost-enterprise-edition:master
```

**Critical:** `MM_SERVICEENVIRONMENT=test` is required for the test license to be accepted.

Test user: `admin` / `Admin1234!` (team: `test-team`, channel: `town-square`).

### npm install Gotchas

- The `preinstall` script runs `solidarity` checks that expect Android SDK env vars and iOS tooling. On the Cloud VM, use `npm install --ignore-scripts` followed by manual `npx patch-package && bash ./scripts/postinstall.sh`.
- The `postinstall` script copies Compass Icons font and sound assets — must run after install.

### Test Notes

- Jest tests: 551/552 suites pass. 2 snapshot failures in `app/components/formatted_date/index.test.tsx` for the `ko` locale are a pre-existing Node.js `Intl` formatting difference (Korean meridiem `오전` vs `AM`), not a code issue.
- Build for Android with `-PreactNativeArchitectures=x86_64` to speed up builds (only targets the emulator arch).

### Interacting with the Emulator

- Standard `adb shell input text` does NOT work with React Native TextInput components.
- Use the `mattermost://` deep link scheme to populate the server URL: `adb shell am start -a android.intent.action.VIEW -d "mattermost://localhost:8065" com.mattermost.rnbeta`.
- For full app interaction, use the `computerUse` subagent with the emulator window visible on `DISPLAY=:1`, or use the mobile-mcp MCP server from `@mobilenext/mobile-mcp` if configured.
