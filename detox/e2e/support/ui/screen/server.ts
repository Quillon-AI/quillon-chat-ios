// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Alert} from '@support/ui/component';
import {isAndroid, isIos, timeouts, wait, waitForElementToBeVisible} from '@support/utils';
import {expect} from 'detox';

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

    // FloatingTextInput renders the same testID on both the outer container View (index 0)
    // and the actual TextInput (index 1). atIndex(1) targets the TextInput for interactions.
    serverUrlInput = element(by.id(this.testID.serverUrlInput)).atIndex(1);
    serverUrlInputError = element(by.id(this.testID.serverUrlInputError));
    serverDisplayNameInput = element(by.id(this.testID.serverDisplayNameInput)).atIndex(1);
    serverDisplayNameInputError = element(by.id(this.testID.serverDisplayNameInputError));
    displayHelp = element(by.id(this.testID.displayHelp));
    connectButton = element(by.id(this.testID.connectButton));
    connectButtonDisabled = element(by.id(this.testID.connectButtonDisabled));
    advancedOptionsToggle = element(by.id(this.testID.advancedOptionsToggle));
    preauthSecretInput = element(by.id(this.testID.preauthSecretInput)).atIndex(1);
    preauthSecretHelp = element(by.id(this.testID.preauthSecretHelp));
    usernameInput = element(by.id(this.testID.usernameInput)).atIndex(1);

    toBeVisible = async () => {
        await waitFor(this.serverScreen).toExist().withTimeout(timeouts.TEN_SEC);

        // FloatingInputContainer places testID on an outer View wrapper (index 0) whose
        // bounds fail Detox's 75% visibility threshold; use toExist() to confirm the form
        // is loaded without triggering the visibility calculation issue.
        await waitFor(this.serverUrlInput).toExist().withTimeout(timeouts.TEN_SEC);

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

        // The bridge can be busy during login transition, use waitFor without idle check
        const timeout = isAndroid() ? timeouts.ONE_MIN : timeouts.HALF_MIN;
        await waitForElementToBeVisible(this.usernameInput, timeout, timeouts.ONE_SEC);
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

        // The bridge can be busy during login transition, so poll for the element without waiting for idle
        const timeout = isAndroid() ? timeouts.ONE_MIN : timeouts.HALF_MIN;
        await waitForElementToBeVisible(this.usernameInput, timeout, timeouts.ONE_SEC);
    };
}

const serverScreen = new ServerScreen();
export default serverScreen;
