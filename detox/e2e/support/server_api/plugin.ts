// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'path';

import client from './client';
import {apiUploadFile, getResponseFromError} from './common';

// ****************************************************************
// Plugins
// https://api.mattermost.com/#tag/plugins
//
// Exported API function should have the following:
// - documented using JSDoc
// - meaningful description
// - match the referenced API endpoints
// - parameter/s defined by `@param`
// - return value defined by `@return`
// ****************************************************************

const prepackagedPlugins = new Set([
    'antivirus',
    'mattermost-autolink',
    'com.mattermost.aws-sns',
    'com.mattermost.plugin-channel-export',
    'com.mattermost.custom-attributes',
    'github',
    'com.github.manland.mattermost-plugin-gitlab',
    'com.mattermost.plugin-incident-management',
    'jenkins',
    'jira',
    'com.mattermost.calls',
    'com.mattermost.nps',
    'com.mattermost.welcomebot',
    'zoom',
]);

// Demo Plugin Constants
// The tarball must be pre-downloaded and placed at detox/e2e/support/fixtures/<filename>.
// Download command:
//   curl -L -o detox/e2e/support/fixtures/mattermost-plugin-demo-v0.11.1.tar.gz \
//     https://github.com/mattermost/mattermost-plugin-demo/releases/download/v0.11.1/mattermost-plugin-demo-v0.11.1.tar.gz
export const DemoPlugin = {
    id: 'com.mattermost.demo-plugin',
    version: '0.11.1',
    filename: 'mattermost-plugin-demo-v0.11.1.tar.gz',
} as const;

/**
 * Disable non-prepackaged plugins.
 * @param {string} baseUrl - the base server URL
 */
export const apiDisableNonPrepackagedPlugins = async (baseUrl: string): Promise<any> => {
    const {plugins} = await apiGetAllPlugins(baseUrl);
    if (!plugins) {
        return;
    }
    plugins.active.forEach(async (plugin: any) => {
        if (plugin.id !== DemoPlugin.id && !prepackagedPlugins.has(plugin.id)) {
            await apiDisablePluginById(baseUrl, plugin.id);
        }
    });
};

/**
 * Disable plugin.
 * See https://api.mattermost.com/#operation/DisablePlugin
 * @param {string} baseUrl - the base server URL
 * @param {string} pluginId - the plugin ID
 * @return {Object} returns response on success or {error, status} on error
 */
export const apiDisablePluginById = async (baseUrl: string, pluginId: string): Promise<any> => {
    try {
        return await client.post(`${baseUrl}/api/v4/plugins/${encodeURIComponent(pluginId)}/disable`);
    } catch (err) {
        return getResponseFromError(err);
    }
};

/**
 * Enable plugin.
 * See https://api.mattermost.com/#operation/EnablePlugin
 * @param {string} baseUrl - the base server URL
 * @param {string} pluginId - the plugin ID
 * @return {Object} returns response on success or {error, status} on error
 */
export const apiEnablePluginById = async (baseUrl: string, pluginId: string): Promise<any> => {
    try {
        return await client.post(`${baseUrl}/api/v4/plugins/${encodeURIComponent(pluginId)}/enable`);
    } catch (err) {
        return getResponseFromError(err);
    }
};

/**
 * Get plugins.
 * See https://api.mattermost.com/#operation/GetPlugins
 * @param {string} baseUrl - the base server URL
 * @return {Object} returns {plugins} on success or {error, status} on error
 */
export const apiGetAllPlugins = async (baseUrl: string): Promise<any> => {
    try {
        const response = await client.get(`${baseUrl}/api/v4/plugins`);

        return {plugins: response.data};
    } catch (err) {
        return getResponseFromError(err);
    }
};

/**
 * Install plugin from URL.
 * See https://api.mattermost.com/#operation/InstallPluginFromUrl
 * @param {string} baseUrl - the base server URL
 * @param {string} pluginDownloadUrl - URL used to download the plugin
 * @param {string} force - Set to 'true' to overwrite a previously installed plugin with the same ID, if any
 * @return {Object} returns {plugin} on success or {error, status} on error
 */
export const apiInstallPluginFromUrl = async (baseUrl: string, pluginDownloadUrl: string, force = false): Promise<any> => {
    try {
        const response = await client.post(`${baseUrl}/api/v4/plugins/install_from_url?plugin_download_url=${encodeURIComponent(pluginDownloadUrl)}&force=${force}`);

        return {plugin: response.data};
    } catch (err) {
        return getResponseFromError(err);
    }
};

/**
 * Remove plugin.
 * See https://api.mattermost.com/#operation/RemovePlugin
 * @param {string} baseUrl - the base server URL
 * @param {string} pluginId - the plugin ID
 * @return {Object} returns response on success or {error, status} on error
 */
export const apiRemovePluginById = async (baseUrl: string, pluginId: string): Promise<any> => {
    try {
        return await client.delete(`${baseUrl}/api/v4/plugins/${encodeURIComponent(pluginId)}`);
    } catch (err) {
        return getResponseFromError(err);
    }
};

/**
 * Upload plugin.
 * See https://api.mattermost.com/#operation/UploadPlugin
 * @param {string} baseUrl - the base server URL
 * @param {string} filename - the filename of plugin to be uploaded
 * @return {Object} returns response on success or {error, status} on error
 */
export const apiUploadPlugin = async (baseUrl: string, filename: string): Promise<any> => {
    try {
        const absFilePath = path.resolve(__dirname, `../../support/fixtures/${filename}`);
        return await apiUploadFile('plugin', absFilePath, {url: `${baseUrl}/api/v4/plugins`, method: 'POST'});
    } catch (err) {
        return getResponseFromError(err);
    }
};

/**
 * Get plugin status - whether it's installed and/or active.
 * @param {string} baseUrl - the base server URL
 * @param {string} pluginId - the plugin ID
 * @param {string} version - the expected plugin version
 * @return {Object} returns {isInstalled, isActive, plugin} on success or {error, status} on error
 */
export const apiGetPluginStatus = async (baseUrl: string, pluginId: string, version?: string): Promise<any> => {
    try {
        const {plugins} = await apiGetAllPlugins(baseUrl);
        if (!plugins) {
            return {isInstalled: false, isActive: false};
        }

        // Check if plugin is installed (in either active or inactive list)
        let plugin = plugins.active?.find((p: any) => p.id === pluginId);
        if (plugin) {
            const isVersionMatch = !version || plugin.version === version;
            return {
                isInstalled: true,
                isActive: true,
                plugin,
                isVersionMatch,
            };
        }

        plugin = plugins.inactive?.find((p: any) => p.id === pluginId);
        if (plugin) {
            const isVersionMatch = !version || plugin.version === version;
            return {
                isInstalled: true,
                isActive: false,
                plugin,
                isVersionMatch,
            };
        }

        return {isInstalled: false, isActive: false};
    } catch (err) {
        return getResponseFromError(err);
    }
};

/**
 * Install and enable a plugin from a pre-downloaded tarball in fixtures.
 * Webapp-style state machine: no-op if active at matching version,
 * enable if installed but inactive (and version matches), otherwise
 * remove any stale copy, upload fresh bytes, and enable.
 * @param {string} baseUrl - the base server URL
 * @param {string} filename - tarball filename in detox/e2e/support/fixtures/
 * @param {string} pluginId - the plugin ID
 * @param {string} version - expected plugin version
 * @return {Object} returns {plugin} on success or {error, status} on error
 */
export const installAndEnablePlugin = async (
    baseUrl: string,
    filename: string,
    pluginId: string,
    version: string,
): Promise<any> => {
    try {
        const status = await apiGetPluginStatus(baseUrl, pluginId, version);
        if (status.error) {
            return status;
        }

        if (status.isActive && status.isVersionMatch) {
            return {plugin: status.plugin};
        }

        if (status.isInstalled && status.isVersionMatch && !status.isActive) {
            const enableResult = await apiEnablePluginById(baseUrl, pluginId);
            if (enableResult.error) {
                return enableResult;
            }
            return {plugin: status.plugin};
        }

        // Version mismatch or not installed — remove any existing copy, upload, enable.
        if (status.isInstalled) {
            await apiRemovePluginById(baseUrl, pluginId);
        }

        const uploadResult = await apiUploadPlugin(baseUrl, filename);
        if (uploadResult.error) {
            return uploadResult;
        }

        const enableResult = await apiEnablePluginById(baseUrl, pluginId);
        if (enableResult.error) {
            return enableResult;
        }

        return uploadResult;
    } catch (err) {
        return getResponseFromError(err);
    }
};

export const Plugin = {
    apiDisableNonPrepackagedPlugins,
    apiDisablePluginById,
    apiEnablePluginById,
    apiGetAllPlugins,
    apiGetPluginStatus,
    apiInstallPluginFromUrl,
    apiRemovePluginById,
    apiUploadPlugin,
    installAndEnablePlugin,
};

export default Plugin;
