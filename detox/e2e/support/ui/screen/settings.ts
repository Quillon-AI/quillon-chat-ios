// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AccountScreen} from '@support/ui/screen';
import {timeouts} from '@support/utils';
import {expect} from 'detox';

class SettingsScreen {
    testID = {
        settingsScreen: 'settings.screen',
        closeButton: 'close.settings.button',
        scrollView: 'settings.scroll_view',
        notificationsOption: 'settings.notifications.option',
        displayOption: 'settings.display.option',
        advancedSettingsOption: 'settings.advanced_settings.option',
        aboutOption: 'settings.about.option',
        helpOption: 'settings.help.option',
        reportProblemOption: 'settings.report_problem.option',
    };

    settingsScreen = element(by.id(this.testID.settingsScreen));
    closeButton = element(by.id(this.testID.closeButton));
    scrollView = element(by.id(this.testID.scrollView));
    notificationsOption = element(by.id(this.testID.notificationsOption));
    displayOption = element(by.id(this.testID.displayOption));
    advancedSettingsOption = element(by.id(this.testID.advancedSettingsOption));
    aboutOption = element(by.id(this.testID.aboutOption));
    helpOption = element(by.id(this.testID.helpOption));
    reportProblemOption = element(by.id(this.testID.reportProblemOption));

    toBeVisible = async () => {
        await waitFor(this.settingsScreen).toExist().withTimeout(timeouts.TEN_SEC);

        return this.settingsScreen;
    };

    open = async () => {
        // # Open settings screen
        await AccountScreen.settingsOption.tap();

        return this.toBeVisible();
    };

    close = async () => {
        try {
            await waitFor(this.closeButton).toExist().withTimeout(timeouts.TEN_SEC);
            await this.closeButton.tap();
            await expect(this.settingsScreen).not.toBeVisible();
        } catch (error) {
            // Close button may not exist if the app is in an unexpected state after a prior test failure
            console.warn('[SettingsScreen.close] Close button not found, settings screen may already be dismissed:', error); // eslint-disable-line no-console
        }
    };
}

const settingsScreen = new SettingsScreen();
export default settingsScreen;
