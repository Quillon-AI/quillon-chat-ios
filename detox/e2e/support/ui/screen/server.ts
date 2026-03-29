// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Alert} from '@support/ui/component';
import {isAndroid, isIos, timeouts, wait} from '@support/utils';
import {expect, waitFor} from 'detox';

class ServerScreen {
    testID = {
        serverScreen: 'server.screen',
        closeButton: 'close.server.button',
        headerTitleAddServer: 'server_header.title.add_server',
        headerTitleConnectToServer: 'server_header.title.connect_to_server',
        headerWelcome: 'server_header.welcome',
        headerDescription: 'server_header.description',
        serverUrlInput: 'server_form.server_url.input',
        serverUrlInputError: 'server_form.server_url.input.error',
        serverDisplayNameInput: 'server_form.server_display_name.input',
        serverDisplayNameInputError: 'server_form.server_display_name.input.error',
        displayHelp: 'server_form.display_help',
        connectButton: 'server_form.connect.button',
        connectButtonDisabled: 'server_form.connect.button.disabled',
        advancedOptionsToggle: 'server_form.advanced_options.toggle',
        preauthSecretInput: 'server_form.preauth_secret.input',
        preauthSecretHelp: 'server_form.preauth_secret_help',
        usernameInput: 'login_form.username.input',
        usernameInputError: 'login_form.username.input.error',
    };

    serverScreen = element(by.id(this.testID.serverScreen));
    closeButton = element(by.id(this.testID.closeButton));
    headerTitleAddServer = element(by.id(this.testID.headerTitleAddServer));
    headerTitleConnectToServer = element(by.id(this.testID.headerTitleConnectToServer));
    headerWelcome = element(by.id(this.testID.headerWelcome));
    headerDescription = element(by.id(this.testID.headerDescription));

    serverUrlInput = element(by.id(this.testID.serverUrlInput));
    serverUrlInputError = element(by.id(this.testID.serverUrlInputError));
    serverDisplayNameInput = element(by.id(this.testID.serverDisplayNameInput));
    serverDisplayNameInputError = element(by.id(this.testID.serverDisplayNameInputError));
    displayHelp = element(by.id(this.testID.displayHelp));
    connectButton = element(by.id(this.testID.connectButton));
    connectButtonDisabled = element(by.id(this.testID.connectButtonDisabled));
    advancedOptionsToggle = element(by.id(this.testID.advancedOptionsToggle));
    preauthSecretInput = element(by.id(this.testID.preauthSecretInput));
    preauthSecretHelp = element(by.id(this.testID.preauthSecretHelp));
    usernameInput = element(by.id(this.testID.usernameInput));

    toBeVisible = async () => {
        // iOS 26.2 on macos-15 CI runners takes longer than 10s to present the
        // server screen after cold launch. Use HALF_MIN for both platforms so the
        // first-launch case never races with OS-level app registration delays.
        const timeout = timeouts.HALF_MIN;
        await waitFor(this.serverScreen).toExist().withTimeout(timeout);
        await waitFor(this.serverUrlInput).toExist().withTimeout(timeout);

        return this.serverScreen;
    };

    connectToServer = async (serverUrl: string, serverDisplayName: string) => {
        await this.toBeVisible();
        await this.serverUrlInput.replaceText(serverUrl);
        await this.serverDisplayNameInput.replaceText(serverDisplayName);
        if (isAndroid()) {
            await this.tapConnectButton();

            // Dismiss "Notifications cannot be received from this server" dialog if it appears.
            // This Android-only dialog blocks the login form and must be dismissed before proceeding.
            try {
                await waitFor(Alert.notificationsCannotBeReceivedTitle).toExist().withTimeout(timeouts.TEN_SEC);
                await element(by.text('OKAY')).tap();
            } catch {
                // Dialog did not appear — proceed normally
            }
        }

        if (isIos()) {
            await this.tapConnectButton();
            if (serverUrl.includes('127.0.0.1') || !process.env.CI) {
                try {

                    // # Tap alert okay button
                    await waitFor(Alert.okayButton).toExist().withTimeout(timeouts.TEN_SEC);
                    await Alert.okayButton.tap();
                } catch (error) {
                    /* eslint-disable no-console */
                    console.log('Alert button did not appear!');
                }
            }
        }

        // Wait for the login form to appear after server connection.
        // Use toExist() rather than toBeVisible() because the 50% visibility
        // threshold can fail on Android edge-to-edge rendering even when the
        // element is present and usable.
        const timeout = isAndroid() ? timeouts.ONE_MIN : timeouts.HALF_MIN;
        await waitFor(this.usernameInput).toExist().withTimeout(timeout);
    };

    close = async () => {
        await this.closeButton.tap();
        await expect(this.serverScreen).not.toBeVisible();
    };

    tapConnectButton = async () => {
        await this.connectButton.tap();
        await wait(timeouts.ONE_SEC);
    };

    toggleAdvancedOptions = async () => {
        await this.advancedOptionsToggle.tap();
        await wait(timeouts.ONE_SEC);
    };

    enterPreauthSecret = async (secret: string) => {
        await waitFor(this.preauthSecretInput).toExist().withTimeout(timeouts.TEN_SEC);
        await this.preauthSecretInput.replaceText(secret);
    };

    connectToServerWithPreauthSecret = async (serverUrl: string, serverDisplayName: string, preauthSecret: string) => {
        await this.toBeVisible();
        await this.serverUrlInput.replaceText(serverUrl);
        await this.serverDisplayNameInput.replaceText(serverDisplayName);

        // Toggle advanced options to show preauth secret field
        await this.toggleAdvancedOptions();

        // Enter preauth secret
        await this.enterPreauthSecret(preauthSecret);

        // Connect
        if (isAndroid()) {
            await this.tapConnectButton();

            // Dismiss "Notifications cannot be received from this server" dialog if it appears.
            try {
                await waitFor(Alert.notificationsCannotBeReceivedTitle).toExist().withTimeout(timeouts.TEN_SEC);
                await element(by.text('OKAY')).tap();
            } catch {
                // Dialog did not appear — proceed normally
            }
        }
        if (isIos()) {
            await this.tapConnectButton();
            if (serverUrl.includes('127.0.0.1') || !process.env.CI) {
                try {
                    // # Tap alert okay button
                    await waitFor(Alert.okayButton).toExist().withTimeout(timeouts.TEN_SEC);
                    await Alert.okayButton.tap();
                } catch (error) {
                    /* eslint-disable no-console */
                    console.log('Alert button did not appear!');
                }
            }
        }

        // Wait for the login form to appear after server connection with preauth.
        const timeout = isAndroid() ? timeouts.ONE_MIN : timeouts.HALF_MIN;
        await waitFor(this.usernameInput).toExist().withTimeout(timeout);
    };
}

const serverScreen = new ServerScreen();
export default serverScreen;
