// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {device, waitFor} from 'detox';
import {timeouts} from '@support/utils';

/**
 * Simulator management utilities for handling app launch failures
 */

/**
 * Reset simulator to clean state
 */
export async function resetSimulator(deviceType: string, osVersion: string): Promise<void> {
    try {
        console.log(`🔄 Resetting simulator: ${deviceType} ${osVersion}`);
        
        // Get simulator UDID
        const udid = await device.getSimulatorUDID();
        
        // Erase simulator
        await device.executeCommand(`/usr/bin/xcrun simctl erase ${udid}`);
        
        // Wait for simulator to shut down
        await waitFor(element(by.id('simulator-shutdown')))
            .toExist()
            .withTimeout(timeouts.TEN_SEC);
            
        console.log('✅ Simulator reset complete');
    } catch (error) {
        console.error('❌ Failed to reset simulator:', error);
        throw error;
    }
}

/**
 * Clean app from simulator
 */
export async function cleanAppFromSimulator(appBundleId: string): Promise<void> {
    try {
        console.log(`🧹 Cleaning app from simulator: ${appBundleId}`);
        
        // Terminate app if running
        await device.executeCommand(`/usr/bin/xcrun simctl terminate ${await device.getSimulatorUDID()} ${appBundleId}`);
        
        // Remove app from simulator
        await device.executeCommand(`/usr/bin/xcrun simctl uninstall ${await device.getSimulatorUDID()} ${appBundleId}`);
        
        console.log('✅ App cleaned from simulator');
    } catch (error) {
        console.error('❌ Failed to clean app from simulator:', error);
        throw error;
    }
}

/**
 * Launch app with retry logic
 */
export async function launchAppWithRetry(appBundleId: string, maxRetries: number = 3): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🚀 Launching app (attempt ${attempt}/${maxRetries})...`);
            
            await device.executeCommand(
                `/usr/bin/xcrun simctl launch ${await device.getSimulatorUDID()} ${appBundleId}`
            );
            
            // Wait for app to launch
            await waitFor(element(by.id('app-launch-complete')))
                .toExist()
                .withTimeout(timeouts.TEN_SEC);
            
            console.log('✅ App launched successfully');
            return;
        } catch (error) {
            console.error(`❌ App launch failed on attempt ${attempt}:`, error);
            
            if (attempt < maxRetries) {
                // Wait before retry
                await device.wait(timeouts.FIVE_SEC);
            }
        }
    }
    
    throw new Error(`Failed to launch app after ${maxRetries} attempts`);
}

/**
 * Check if app is running on simulator
 */
export async function isAppRunning(appBundleId: string): Promise<boolean> {
    try {
        const udid = await device.getSimulatorUDID();
        const result = await device.executeCommand(
            `/usr/bin/xcrun simctl list apps | grep -q ${appBundleId}`
        );
        
        return result === 0;
    } catch (error) {
        console.error('❌ Failed to check app status:', error);
        return false;
    }
}

/**
 * Set app permissions on simulator
 */
export async function setAppPermissions(appBundleId: string, permissions: string[]): Promise<void> {
    try {
        console.log(`🔐 Setting permissions for app: ${appBundleId}`);
        
        const udid = await device.getSimulatorUDID();
        
        for (const permission of permissions) {
            await device.executeCommand(
                `/usr/bin/xcrun simctl set app ${udid} ${appBundleId} permission ${permission} YES`
            );
        }
        
        console.log('✅ Permissions set successfully');
    } catch (error) {
        console.error('❌ Failed to set permissions:', error);
        throw error;
    }
}

/**
 * Get simulator UDID
 */
export async function getSimulatorUDID(): Promise<string> {
    try {
        const result = await device.executeCommand(
            `/usr/bin/xcrun applesimutils --list --fields udid`
        );
        
        // Extract UDID from output
        const udid = result.split('\n').find(line => line.trim().length > 0);
        
        if (!udid) {
            throw new Error('No simulator UDID found');
        }
        
        return udid.trim();
    } catch (error) {
        console.error('❌ Failed to get simulator UDID:', error);
        throw error;
    }
}

/**
 * Full reset and relaunch workflow
 */
export async function fullResetAndRelaunch(appBundleId: string, deviceType: string, osVersion: string): Promise<void> {
    try {
        console.log('🔄 Starting full reset and relaunch workflow...');
        
        // Reset simulator
        await resetSimulator(deviceType, osVersion);
        
        // Clean app
        await cleanAppFromSimulator(appBundleId);
        
        // Launch app
        await launchAppWithRetry(appBundleId);
        
        // Set permissions
        await setAppPermissions(appBundleId, ['notifications', 'photos', 'microphone']);
        
        console.log('✅ Full reset and relaunch complete');
    } catch (error) {
        console.error('❌ Full reset and relaunch failed:', error);
        throw error;
    }
}
