// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent} from '@testing-library/react-native';
import moment from 'moment-timezone';
import React from 'react';

import Preferences from '@constants/preferences';
import {renderWithEverything} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import DateTimeSelector from './index';

import type Database from '@nozbe/watermelondb/Database';

describe('DateTimeSelector', () => {
    let database: Database;
    const mockHandleChange = jest.fn();
    const timezone = 'America/New_York';
    const theme = Preferences.THEMES.denim;

    const baseProps = {
        timezone,
        theme,
        handleChange: mockHandleChange,
        showInitially: 'date' as const,
    };

    beforeAll(async () => {
        const server = await TestHelper.setupServerDatabase();
        database = server.database;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders the date picker container', () => {
        const {getByTestId} = renderWithEverything(
            <DateTimeSelector
                {...baseProps}
            />,
            {database},
        );

        expect(getByTestId('custom_date_time_picker')).toBeTruthy();
    });

    it('does not call handleChange when pressing Select Date to open picker', () => {
        const initialDate = moment().add(2, 'days').hour(14).minute(30);
        const {getByText} = renderWithEverything(
            <DateTimeSelector
                {...baseProps}
                initialDate={initialDate}
            />,
            {database},
        );

        const selectDateButton = getByText('Select Date');
        fireEvent.press(selectDateButton);

        expect(mockHandleChange).not.toHaveBeenCalled();
    });
});
