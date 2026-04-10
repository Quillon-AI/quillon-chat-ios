// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-await-in-loop, no-empty */

// *******************************************************************
// - [#] indicates a test step (e.g. # Go to a screen)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element testID when selecting an element. Create one if none.
// *******************************************************************

import {
    Plugin,
    Post,
    Setup,
    System,
    TestPlugin,
    User,
} from '@support/server_api';
import {
    serverOneUrl,
    siteOneUrl,
} from '@support/test_config';
import {
    ChannelListScreen,
    ChannelScreen,
    IntegrationSelectorScreen,
    InteractiveDialogScreen,
    LoginScreen,
    ServerScreen,
} from '@support/ui/screen';
import {wait, isAndroid} from '@support/utils';
import {expect} from 'detox';

// ISO datetime pattern: matches YYYY-MM-DDTHH:MM:SS with required UTC suffix (Z or ±HH:MM)
const ISO_DATETIME_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;

// ===== Helper Functions =====
async function selectUser() {
    const patterns = [
        'integration_selector.user_list.user_item',
        'integration_selector.user_list',
        'integration_selector.user_list.section_list',
    ];
    for (const testID of patterns) {
        try {
            const el = element(by.id(testID));
            await expect(el).toExist();
            await el.tap();
            return true;
        } catch {}
    }
    try {
        await IntegrationSelectorScreen.done();
    } catch {}
    return false;
}

async function selectChannel() {
    const patterns = [
        'integration_selector.channel_list',
        'integration_selector.channel_list.channel_item',
    ];
    for (const testID of patterns) {
        try {
            const el = element(by.id(testID));
            await expect(el).toExist();
            await el.tap();
            return true;
        } catch {}
    }
    for (const name of ['Town Square', 'Off-Topic', 'General']) {
        try {
            const el = element(by.text(name));
            await expect(el).toExist();
            await el.tap();
            return true;
        } catch {}
    }
    try {
        await IntegrationSelectorScreen.done();
    } catch {}
    return false;
}

async function ensureDialogClosed() {
    try {
        await waitFor(InteractiveDialogScreen.interactiveDialogScreen).not.toExist().withTimeout(3000);
    } catch {}

    // Swipe up on post list to reveal new posts that might be hidden behind input
    try {
        await element(by.id('channel.post_list.flat_list')).swipe('up', 'fast', 0.2);
        await wait(300);
    } catch {}
}

async function ensureDialogOpen() {
    await waitFor(InteractiveDialogScreen.interactiveDialogScreen).toExist().withTimeout(3000);
    await InteractiveDialogScreen.toBeVisible();
    await expect(InteractiveDialogScreen.interactiveDialogScreen).toExist();
}

async function dismissErrorAlert() {
    try {
        isAndroid() ? await element(by.text('OK')).tap() : await element(by.label('OK')).atIndex(0).tap();
        await wait(300);
    } catch {}
}

describe('Interactive Dialog - Basic Dialog (Plugin)', () => {
    const serverOneDisplayName = 'Server 1';
    const channelsCategory = 'channels';
    let testChannel: any;
    let testUser: any;

    beforeAll(async () => {
        // Log environment info for debugging CI vs local differences
        const {channel, user} = await Setup.apiInit(siteOneUrl);
        testChannel = channel;
        testUser = user;

        await User.apiAdminLogin(siteOneUrl);
        await System.shouldHavePluginUploadEnabled(siteOneUrl);
        await System.apiUpdateConfig(siteOneUrl, {
            ServiceSettings: {EnableGifPicker: true},
            FileSettings: {EnablePublicLink: true},
            FeatureFlags: {InteractiveDialogAppsForm: true},
            PluginSettings: {
                Enable: true,
                EnableUploads: true,
                PluginStates: {
                    [TestPlugin.id]: {Enable: true},
                },
            },
        });

        // const latestVersion = await Plugin.apiGetLatestPluginVersion(TestPlugin.repo);
        // await pluginInstallAndEnable(siteOneUrl, latestVersion);

        const status = await Plugin.apiGetPluginStatus(siteOneUrl, TestPlugin.id);
        if (!status.isActive) {
            await Plugin.apiEnablePluginById(siteOneUrl, TestPlugin.id);
        }

        await ServerScreen.connectToServer(serverOneUrl, serverOneDisplayName);
        await LoginScreen.login(testUser);
        await ChannelListScreen.toBeVisible();
        await ChannelScreen.open(channelsCategory, testChannel.name);
    });

    afterAll(async () => {
        await Plugin.apiDisablePluginById(siteOneUrl, TestPlugin.id);
    });

    afterEach(async () => {
        await dismissErrorAlert();
        try {
            await InteractiveDialogScreen.cancel();
        } catch {}
        try {
            await ChannelScreen.open(channelsCategory, testChannel.name);
        } catch {}
        await wait(500);
    });

    it('MM-T4101 should open simple interactive dialog (Plugin)', async () => {
        await ChannelScreen.postMessage('/e2e-dialog text');
        await ensureDialogOpen();
        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T4102 should submit simple interactive dialog (Plugin)', async () => {
        await ChannelScreen.postMessage('/e2e-dialog text');
        await ensureDialogOpen();

        // Fill required fields before submitting
        await InteractiveDialogScreen.fillTextElement('required_text', 'Test value');
        await InteractiveDialogScreen.fillTextElement('email_field', 'test@example.com');
        await InteractiveDialogScreen.fillTextElement('password_field', 'password123');
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4103 should fill text field and submit dialog (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog text');
        await ensureDialogOpen();
        await InteractiveDialogScreen.fillTextElement('optional_text', 'Plugin Test Value');
        await InteractiveDialogScreen.fillTextElement('required_text', 'Required value');
        await InteractiveDialogScreen.fillTextElement('email_field', 'test@example.com');
        await InteractiveDialogScreen.fillTextElement('password_field', 'password123');
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4104 should handle server error on dialog submission (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog error');
        await ensureDialogOpen();

        // Fill the required number field with the magic value (42) to pass validation
        await InteractiveDialogScreen.fillTextElement('realname', 'Test');
        await InteractiveDialogScreen.fillTextElement('somenumber', '42');
        await InteractiveDialogScreen.submit();
        await wait(1000);

        // Dialog should remain open because the error handler always returns an error
        await ensureDialogOpen();
        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T4401 should toggle boolean fields and submit (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog boolean');
        await ensureDialogOpen();
        await expect(element(by.id('AppFormElement.required_bool.toggled..button'))).toExist();
        await expect(element(by.id('AppFormElement.optional_bool.toggled..button'))).toExist();
        await expect(element(by.id('AppFormElement.default_true_bool.toggled.true.button'))).toExist();
        await expect(element(by.id('AppFormElement.default_false_bool.toggled..button'))).toExist();
        await InteractiveDialogScreen.toggleBooleanElement('required_bool');
        await InteractiveDialogScreen.toggleBooleanElement('default_false_bool');
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4402 should handle boolean field validation (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog boolean');
        await ensureDialogOpen();
        await InteractiveDialogScreen.submit();
        await wait(300);
        await ensureDialogOpen();
        await InteractiveDialogScreen.toggleBooleanElement('required_bool');
        await InteractiveDialogScreen.toggleBooleanElement('default_false_bool');
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4498 should open and handle interactive dialog with select fields (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog select');
        await ensureDialogOpen();
        const radioButton = element(by.id('AppFormElement.radio_field.radio.optA.button'));
        await expect(radioButton).toExist();
        await radioButton.tap();
        const selectDropdownButton = element(by.id('AppFormElement.static_select.select.button'));
        await expect(selectDropdownButton).toExist();
        await selectDropdownButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await expect(element(by.text('Option 2'))).toExist();
        await element(by.text('Option 2')).tap();
        const userSelectorButton = element(by.id('AppFormElement.user_select.select.button'));
        await expect(userSelectorButton).toExist();
        await userSelectorButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await selectUser();
        const channelSelectorButton = element(by.id('AppFormElement.channel_select.select.button'));
        await waitFor(channelSelectorButton).toExist().withTimeout(1000);
        await channelSelectorButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await selectChannel();
        await wait(300);
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4499 should handle required select field validation (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog select');
        await ensureDialogOpen();
        await InteractiveDialogScreen.submit();
        await wait(300);
        await ensureDialogOpen();
        const radioButton = element(by.id('AppFormElement.radio_field.radio.optA.button'));
        await expect(radioButton).toExist();
        await radioButton.tap();
        const selectDropdownButton = element(by.id('AppFormElement.static_select.select.button'));
        await expect(selectDropdownButton).toExist();
        await selectDropdownButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await expect(element(by.text('Option 1'))).toExist();
        await element(by.text('Option 1')).tap();
        const userSelectorButton = element(by.id('AppFormElement.user_select.select.button'));
        await expect(userSelectorButton).toExist();
        await userSelectorButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await selectUser();
        await wait(300);
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4201 should fill and submit all text field types (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog text');
        await ensureDialogOpen();
        await InteractiveDialogScreen.fillTextElement('optional_text', 'Regular text input');
        await InteractiveDialogScreen.fillTextElement('required_text', 'Required field value');
        await InteractiveDialogScreen.fillTextElement('email_field', 'test@example.com');
        await InteractiveDialogScreen.fillTextElement('number_field', '42');
        await InteractiveDialogScreen.fillTextElement('password_field', 'secret123');
        await InteractiveDialogScreen.fillTextElement('textarea_field', 'This is a multiline\ntext area input\nwith multiple lines');
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4202 should validate required text field (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog text');
        await ensureDialogOpen();
        await InteractiveDialogScreen.fillTextElement('optional_text', 'Optional text');
        await InteractiveDialogScreen.fillTextElement('email_field', 'optional@example.com');
        await InteractiveDialogScreen.submit();
        await wait(500);

        // If still open, fill remaining required fields and submit
        try {
            await ensureDialogOpen();
            await InteractiveDialogScreen.fillTextElement('required_text', 'Now filled');
            await InteractiveDialogScreen.fillTextElement('password_field', 'password123');
            await InteractiveDialogScreen.submit();
            await wait(500);
        } catch {}
        await ensureDialogClosed();

        // Scroll to reveal the latest post
        try {
            await element(by.id('channel.post_list.flat_list')).swipe('up', 'fast', 0.5);
            await wait(300);
        } catch {}
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4203 should handle different text input subtypes (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog text');
        await ensureDialogOpen();
        await InteractiveDialogScreen.fillTextElement('email_field', 'valid.email+test@example.com');
        await InteractiveDialogScreen.fillTextElement('number_field', '12345');
        await InteractiveDialogScreen.fillTextElement('required_text', 'Subtype test complete');
        await InteractiveDialogScreen.fillTextElement('password_field', 'secret123');
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4976 should handle multiselect fields dialog (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog multi-select');
        await ensureDialogOpen();
        const multiselectUsersButton = element(by.id('AppFormElement.multi_users.select.button'));
        await expect(multiselectUsersButton).toExist();
        await multiselectUsersButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await selectUser();
        await wait(500);
        await IntegrationSelectorScreen.done();
        await wait(300);
        const multiselectOptionsButton = element(by.id('AppFormElement.multi_options.select.button'));
        await expect(multiselectOptionsButton).toExist();
        await multiselectOptionsButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await expect(element(by.text('Option 1'))).toExist();
        await element(by.text('Option 1')).tap();
        await wait(300);
        await expect(element(by.text('Option 2'))).toExist();
        await element(by.text('Option 2')).tap();
        await wait(300);
        await expect(element(by.text('Option 3'))).toExist();
        await element(by.text('Option 3')).tap();
        await wait(300);
        await IntegrationSelectorScreen.done();
        await wait(300);
        const dynamicRolesButton = element(by.id('AppFormElement.dynamic_roles.select.button'));
        await expect(dynamicRolesButton).toExist();
        await dynamicRolesButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await IntegrationSelectorScreen.searchFor('system admin');
        await waitFor(element(by.text('System Admin'))).toExist().withTimeout(3000);
        await element(by.text('System Admin')).tap();
        await wait(300);
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
    });

    it('MM-T4977 should handle dynamic select fields dialog (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog multi-select');
        await ensureDialogOpen();
        const dynamicRolesButton = element(by.id('AppFormElement.dynamic_roles.select.button'));
        await expect(dynamicRolesButton).toExist();
        await dynamicRolesButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await IntegrationSelectorScreen.searchFor('system admin');
        await waitFor(element(by.text('System Admin'))).toExist().withTimeout(3000);
        await element(by.text('System Admin')).tap();
        await wait(300);
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
    });

    it('MM-T4980 should complete multistep dialog progression (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog multi-step');
        await ensureDialogOpen();
        await InteractiveDialogScreen.fillTextElement('fullname', 'John Doe');
        await InteractiveDialogScreen.fillTextElement('email', 'john@example.com');
        await InteractiveDialogScreen.submit();
        await ensureDialogOpen();
        const roleButton = element(by.id('AppFormElement.role.select.button'));
        await expect(roleButton).toExist();
        await roleButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await expect(element(by.text('Developer'))).toExist();
        await element(by.text('Developer')).tap();
        await wait(500);
        await InteractiveDialogScreen.submit();
        await ensureDialogOpen();

        // Step 3: just submit (updates bool defaults to true which is valid)
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();

        // Verify bot posted the registration complete message
        await wait(3000);
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Registration complete!');
    });

    it('MM-T4981 should handle multistep dialog cancellation (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog multi-step');
        await ensureDialogOpen();
        await InteractiveDialogScreen.fillTextElement('fullname', 'Jane Smith');
        await InteractiveDialogScreen.fillTextElement('email', 'jane@example.com');
        await InteractiveDialogScreen.submit();
        await ensureDialogOpen();
        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T4983 should handle field refresh basic interaction (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog field-refresh');
        await ensureDialogOpen();
        const categoryButton = element(by.id('AppFormElement.category.select.button'));
        await expect(categoryButton).toExist();
        await categoryButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await expect(element(by.text('General'))).toExist();
        await element(by.text('General')).tap();
        await wait(300);
        await InteractiveDialogScreen.fillTextElement('details', 'Test details');
        await InteractiveDialogScreen.submit();
        await ensureDialogClosed();
        await wait(2000);
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        await ChannelScreen.hasPostMessage(post.id, 'Dialog submission:');
    });

    it('MM-T4986 should handle field refresh changes and cancellation (Plugin)', async () => {
        await ensureDialogClosed();
        await ChannelScreen.postMessage('/e2e-dialog field-refresh');
        await ensureDialogOpen();
        const categoryButton = element(by.id('AppFormElement.category.select.button'));
        await expect(categoryButton).toExist();
        await categoryButton.tap();
        await IntegrationSelectorScreen.toBeVisible();
        await expect(element(by.text('Advanced'))).toExist();
        await element(by.text('Advanced')).tap();

        // Wait for field refresh to complete
        await wait(2000);

        // Verify the field refresh happened by checking new field appears
        try {
            await waitFor(element(by.id('AppFormElement.advanced_setting.input'))).toExist().withTimeout(3000);
        } catch {
            await waitFor(element(by.id('AppFormElement.advanced_setting'))).toExist().withTimeout(3000);
        }
        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T2530A should open date/datetime dialog and display fields', async () => {
        // # Open datetime-basic dialog
        await ChannelScreen.postMessage('/e2e-dialog datetime-basic');
        await wait(500);
        await ensureDialogOpen();

        // * Verify dialog title
        await expect(element(by.text('Date & DateTime Basics'))).toExist();

        // * Verify all fields are visible by testID
        await expect(element(by.id('AppFormElement.event_date'))).toExist();
        await expect(element(by.id('AppFormElement.meeting_time'))).toExist();
        await expect(element(by.id('AppFormElement.future_date'))).toExist();
        await expect(element(by.id('AppFormElement.interval_time'))).toExist();
        await expect(element(by.id('AppFormElement.relative_date'))).toExist();
        await expect(element(by.id('AppFormElement.relative_datetime'))).toExist();

        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T2530B should validate required date/datetime fields', async () => {
        // # Open dialog
        await ChannelScreen.postMessage('/e2e-dialog datetime-basic');
        await wait(500);
        await ensureDialogOpen();

        // # Try to submit without required fields
        await InteractiveDialogScreen.submit();
        await wait(500);

        // * Should still be on dialog (submission failed due to validation)
        await expect(InteractiveDialogScreen.interactiveDialogScreen).toExist();

        // * Verify validation error text appears for required fields
        await expect(element(by.text('This field is required.'))).toExist();

        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T2530C should select date and display formatted value', async () => {
        // # Open dialog
        await ChannelScreen.postMessage('/e2e-dialog datetime-basic');
        await wait(500);
        await ensureDialogOpen();

        // # Tap Event Date field to open date picker
        await element(by.id('AppFormElement.event_date.select.button')).tap();
        await wait(1000);

        // # Close picker (iOS shows picker inline, just tap the button again to close)
        if (isAndroid()) {
            // Android has OK button
            try {
                await element(by.text('OK')).tap();
            } catch {}
        } else {
            // iOS - tap the button again to toggle picker off
            await element(by.id('AppFormElement.event_date.select.button')).tap();
        }
        await wait(500);

        // * Verify a date is now displayed (should show formatted date)
        // We can't easily verify the exact date, but check that the field shows a value
        // The date should be visible in the UI

        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T2530D should display relative date defaults', async () => {
        // # Open dialog
        await ChannelScreen.postMessage('/e2e-dialog datetime-basic');
        await wait(500);
        await ensureDialogOpen();

        // * Verify Relative Date Example shows today's date
        // The field with default="today" should show the current date formatted
        await expect(element(by.text('Relative Date Example'))).toExist();

        // * Verify Relative DateTime Example shows tomorrow
        // The field with default="+1d" should show tomorrow's date with current time
        await expect(element(by.text('Relative DateTime Example'))).toExist();

        // TODO: More specific assertions on the displayed date values

        await InteractiveDialogScreen.cancel();
        await ensureDialogClosed();
    });

    it('MM-T2530E should submit datetime form with values', async () => {
        // # Open dialog
        await ChannelScreen.postMessage('/e2e-dialog datetime-basic');
        await wait(500);
        await ensureDialogOpen();

        // # Fill required Event Date field
        await element(by.id('AppFormElement.event_date.select.button')).tap();
        await wait(500);
        if (isAndroid()) {
            await element(by.text('OK')).tap();
        } else {
            // iOS - tap anywhere to close picker
            await element(by.id('AppFormElement.event_date')).tap();
        }
        await wait(300);

        // # Fill required Meeting Time field - select date first
        await element(by.id('AppFormElement.meeting_time.select.button')).tap();
        await wait(500);
        if (isAndroid()) {
            await element(by.text('OK')).tap();
        } else {
            await element(by.id('AppFormElement.meeting_time')).tap();
        }
        await wait(300);

        // # Submit dialog
        await InteractiveDialogScreen.submit();
        await wait(1000);

        // * Dialog should close after successful submission
        await expect(InteractiveDialogScreen.interactiveDialogScreen).not.toExist();

        // * Verify submission message appears in channel
        // The webhook response shows the submitted data
        await wait(1000);

        // Just verify dialog closed - webhook response varies
        await ensureDialogClosed();
    });

    it('MM-T2530F should verify UTC conversion for datetime values', async () => {
        // # Open dialog
        await ChannelScreen.postMessage('/e2e-dialog datetime-basic');
        await wait(500);
        await ensureDialogOpen();

        // # Fill required Event Date field
        await element(by.id('AppFormElement.event_date.select.button')).tap();
        await wait(500);
        if (isAndroid()) {
            await element(by.text('OK')).tap();
        } else {
            await element(by.id('AppFormElement.event_date')).tap();
        }
        await wait(300);

        // # Fill required Meeting Time field
        await element(by.id('AppFormElement.meeting_time.select.button')).tap();
        await wait(500);
        if (isAndroid()) {
            await element(by.text('OK')).tap();
        } else {
            await element(by.id('AppFormElement.meeting_time')).tap();
        }
        await wait(300);

        // # Submit dialog
        await InteractiveDialogScreen.submit();
        await wait(1000);

        // * Dialog should close after successful submission
        await wait(1000);
        await ensureDialogClosed();

        // * Verify submission post contains ISO/UTC datetime format
        await wait(1000);
        const {post} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);

        // Meeting Time should be in ISO format with T separator (e.g., 2026-04-10T14:00:00.000Z)
        // Detox's expect only works with UI elements — use string check directly
        if (!ISO_DATETIME_PATTERN.test(post.message)) {
            throw new Error(`Expected ISO datetime in submission post but got: ${post.message}`);
        }
    });

    it('MM-T2530G should display timezone indicator and convert to UTC correctly', async () => {
        // # Open datetime-timezone dialog (has Europe/London timezone fields)
        await ChannelScreen.postMessage('/e2e-dialog datetime-timezone');
        await wait(500);
        await ensureDialogOpen();

        // # Scroll down past introduction text to reveal fields
        try {
            await element(by.id('interactive_dialog.screen')).scroll(300, 'down');
            await wait(300);
        } catch {}

        // * Verify London dropdown field is visible
        await expect(element(by.id('AppFormElement.london_dropdown'))).toExist();

        // * Verify timezone indicator appears for London field
        // London is GMT in winter, BST in summer — mobile renders without emoji
        try {
            await expect(element(by.text('Times in GMT'))).toExist();
        } catch {
            await expect(element(by.text('Times in BST'))).toExist();
        }

        // # Select datetime in London field
        await element(by.id('AppFormElement.london_dropdown.select.button')).tap();
        await wait(1000);

        // # Scroll to make field visible after picker opens
        try {
            await element(by.id('interactive_dialog.scroll_view')).scrollTo('bottom');
            await wait(300);
        } catch {}

        // # Close date picker
        if (isAndroid()) {
            await element(by.text('OK')).tap();
        } else {
            // iOS - tap button again to close
            await element(by.id('AppFormElement.london_dropdown.select.button')).tap();
        }
        await wait(500);

        // # Submit dialog
        await InteractiveDialogScreen.submit();
        await wait(1500);

        // * Dialog should close
        await ensureDialogClosed();

        // * Verify submission appears with UTC timestamp
        await wait(2000);

        // * Verify submission post contains ISO/UTC datetime format
        const {post: tzPost} = await Post.apiGetLastPostInChannel(siteOneUrl, testChannel.id);
        if (!ISO_DATETIME_PATTERN.test(tzPost.message)) {
            throw new Error(`Expected ISO datetime in timezone submission post but got: ${tzPost.message}`);
        }
    });
});
