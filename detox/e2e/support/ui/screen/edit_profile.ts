// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {ProfilePicture} from '@support/ui/component';
import {AccountScreen} from '@support/ui/screen';
import {timeouts} from '@support/utils';
import {expect} from 'detox';

class EditProfileScreen {
    testID = {
        editProfileScreenPrefix: 'edit_profile.',
        editProfileScreen: 'edit_profile.screen',
        closeButton: 'close.edit_profile.button',
        saveButton: 'edit_profile.save.button',
        scrollView: 'edit_profile.scroll_view',
        firstNameInput: 'edit_profile_form.firstName.input',
        firstNameInputDisabled: 'edit_profile_form.firstName.input.disabled',
        lastNameInput: 'edit_profile_form.lastName.input',
        lastNameInputDisabled: 'edit_profile_form.lastName.input.disabled',
        usernameInput: 'edit_profile_form.username.input',
        usernameInputDisabled: 'edit_profile_form.username.input.disabled',
        usernameInputError: 'edit_profile_form.username.input.error',
        emailInput: 'edit_profile_form.email.input',
        emailInputDisabled: 'edit_profile_form.email.input.disabled',
        emailInputDescription: 'edit_profile_form.email.input.description',
        nicknameInput: 'edit_profile_form.nickname.input',
        nicknameInputDisabled: 'edit_profile_form.nickname.input.disabled',
        positionInput: 'edit_profile_form.position.input',
        positionInputDisabled: 'edit_profile_form.position.input.disabled',
    };

    editProfileScreen = element(by.id(this.testID.editProfileScreen));
    closeButton = element(by.id(this.testID.closeButton));
    saveButton = element(by.id(this.testID.saveButton));
    scrollView = element(by.id(this.testID.scrollView));

    // FloatingTextInput places testID on both outer container View (index 0) and TextInput (index 1).
    // atIndex(1) targets the actual TextInput for interactions and text assertions.
    firstNameInput = element(by.id(this.testID.firstNameInput)).atIndex(1);
    firstNameInputDisabled = element(by.id(this.testID.firstNameInputDisabled)).atIndex(1);
    lastNameInput = element(by.id(this.testID.lastNameInput)).atIndex(1);
    lastNameInputDisabled = element(by.id(this.testID.lastNameInputDisabled)).atIndex(1);
    usernameInput = element(by.id(this.testID.usernameInput)).atIndex(1);
    usernameInputDisabled = element(by.id(this.testID.usernameInputDisabled)).atIndex(1);
    usernameInputError = element(by.id(this.testID.usernameInputError));
    emailInput = element(by.id(this.testID.emailInput)).atIndex(1);
    emailInputDisabled = element(by.id(this.testID.emailInputDisabled)).atIndex(1);
    emailInputDescription = element(by.id(this.testID.emailInputDescription));
    nicknameInput = element(by.id(this.testID.nicknameInput)).atIndex(1);
    nicknameInputDisabled = element(by.id(this.testID.nicknameInputDisabled)).atIndex(1);
    positionInput = element(by.id(this.testID.positionInput)).atIndex(1);
    positionInputDisabled = element(by.id(this.testID.positionInputDisabled)).atIndex(1);

    getEditProfilePicture = (userId: string) => {
        return element(ProfilePicture.getProfilePictureItemMatcher(this.testID.editProfileScreenPrefix, userId));
    };

    toBeVisible = async () => {
        await waitFor(this.editProfileScreen).toExist().withTimeout(timeouts.TEN_SEC);

        return this.editProfileScreen;
    };

    open = async () => {
        // # Open edit profile screen
        await AccountScreen.yourProfileOption.tap();

        return this.toBeVisible();
    };

    close = async () => {
        await this.closeButton.tap();
        await expect(this.editProfileScreen).not.toBeVisible();
    };
}

const editProfileScreen = new EditProfileScreen();
export default editProfileScreen;
