// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Custom Jest globalSetup that wraps Detox's own globalSetup.
 *
 * Problem: Detox creates an "iPhone XX-Detox" simulator clone per run. When a
 * run ends normally, `shutdownDevice: true` shuts the clone down. But when a
 * run is killed (Ctrl+C, CI timeout, OOM), cleanup never fires — the clone
 * stays Booted, consuming RAM/CPU. The next run's allocation logic either
 * reuses it (if the registry was cleaned) or creates a new clone (if not),
 * causing accumulation over repeated aborted runs.
 *
 * Fix: before Detox allocates any device, read Detox's own device registry
 * (~/Library/Detox/device.registry.json) to find devices owned by dead PIDs
 * ("zombie" ownership), then shut down those simulators. Detox's own
 * `unregisterZombieDevices()` already removes them from the registry; this
 * closes the gap by also stopping the dangling simulator process.
 *
 * Parallel safety: only simulators whose owning PID is dead are shut down.
 * A simulator owned by a live PID belongs to a concurrent `detox test`
 * invocation on the same machine and is left completely untouched.
 *
 * Android / non-macOS: no-op — emulators are not cloned per-run.
 */

const {execSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEVICE_REGISTRY_PATH = path.join(
    os.homedir(),
    'Library', 'Detox', 'device.registry.json',
);

/**
 * Returns true if a process with the given PID is currently running.
 * Uses kill -0 which checks existence without sending a signal.
 */
function isPidAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false; // ESRCH = no such process
    }
}

/**
 * Read Detox's device registry and return UDIDs of zombie-owned entries
 * (i.e. registered devices whose owner PID is no longer running).
 */
function getZombieDeviceUdids() {
    try {
        const raw = fs.readFileSync(DEVICE_REGISTRY_PATH, 'utf8');
        const entries = JSON.parse(raw);
        return entries.
            filter((entry) => entry.pid && !isPidAlive(entry.pid)).
            map((entry) => entry.id);
    } catch {
        return []; // registry missing or malformed — nothing to clean
    }
}

/**
 * Shut down any iOS simulator clones that belong to dead Detox processes.
 * Only runs on macOS; silently skips on other platforms.
 */
function shutdownZombieSimulators() {
    if (process.platform !== 'darwin') {
        return;
    }

    const zombieIds = getZombieDeviceUdids();
    if (zombieIds.length === 0) {
        return;
    }

    // Parse the full simulator list once
    let simsByUdid;
    try {
        const json = execSync('xcrun simctl list devices -j', {stdio: 'pipe'}).toString();
        const {devices} = JSON.parse(json);
        simsByUdid = {};
        for (const sims of Object.values(devices)) {
            for (const sim of sims) {
                simsByUdid[sim.udid] = sim;
            }
        }
    } catch {
        return; // simctl unavailable — non-fatal
    }

    for (const udid of zombieIds) {
        const sim = simsByUdid[udid];
        if (!sim) {
            continue; // not a simulator (could be an Android emulator ID)
        }
        if (sim.state !== 'Booted') {
            continue; // already Shutdown — nothing to do
        }

        try {
            execSync(`xcrun simctl shutdown ${udid}`, {stdio: 'pipe'});
            // eslint-disable-next-line no-console
            process.stdout.write(`[globalSetup] Shut down zombie Detox simulator: ${sim.name} (${udid})\n`);
        } catch {
            // eslint-disable-next-line no-console
            process.stderr.write(`[globalSetup] Could not shut down ${udid} — continuing\n`);
        }
    }
}

module.exports = async () => {
    shutdownZombieSimulators();
    return require('detox/runners/jest/globalSetup')();
};
