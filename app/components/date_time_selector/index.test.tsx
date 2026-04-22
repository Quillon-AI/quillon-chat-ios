// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {fireEvent} from '@testing-library/react-native';
import moment from 'moment-timezone';
import React from 'react';

import Preferences from '@constants/preferences';
import DatabaseManager from '@database/manager';
import {renderWithEverything} from '@test/intl-test-helper';
import TestHelper from '@test/test_helper';

import DateTimeSelector, {parseTimeString} from './index';

import type Database from '@nozbe/watermelondb/Database';

describe('DateTimeSelector', () => {
    let database: Database;
    const serverUrl = 'https://test.server.com';
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
        const server = await TestHelper.setupServerDatabase(serverUrl);
        database = server.database;
    });

    afterAll(async () => {
        await DatabaseManager.destroyServerDatabase(serverUrl);
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

    it('hides the Select Time button when dateOnly is true', () => {
        const {queryByText, getByText} = renderWithEverything(
            <DateTimeSelector
                {...baseProps}
                dateOnly={true}
            />,
            {database},
        );

        expect(getByText('Select Date')).toBeTruthy();
        expect(queryByText('Select Time')).toBeNull();
    });

    it('toggles the manual time input when allowManualTimeEntry is enabled', () => {
        const testID = 'dt';
        const {getByTestId, queryByTestId} = renderWithEverything(
            <DateTimeSelector
                {...baseProps}
                allowManualTimeEntry={true}
                testID={testID}
            />,
            {database},
        );

        // Not visible by default
        expect(queryByTestId(`${testID}.manual_time.input`)).toBeNull();

        // Pressing time button reveals the manual input
        fireEvent.press(getByTestId(`${testID}.time.button`));
        expect(getByTestId(`${testID}.manual_time.input`)).toBeTruthy();

        // Pressing again hides it
        fireEvent.press(getByTestId(`${testID}.time.button`));
        expect(queryByTestId(`${testID}.manual_time.input`)).toBeNull();
    });

    it('submits a manual time entry by calling handleChange with the parsed time', () => {
        const initialDate = moment.tz('2026-04-20 09:00', timezone);
        const testID = 'dt';
        const {getByTestId} = renderWithEverything(
            <DateTimeSelector
                {...baseProps}
                allowManualTimeEntry={true}
                initialDate={initialDate}
                testID={testID}
            />,
            {database},
        );

        // Open the manual entry input
        fireEvent.press(getByTestId(`${testID}.time.button`));
        const input = getByTestId(`${testID}.manual_time.input`);

        fireEvent.changeText(input, '14:30');
        fireEvent(input, 'submitEditing');

        expect(mockHandleChange).toHaveBeenCalledTimes(1);
        const picked = mockHandleChange.mock.calls[0][0] as moment.Moment;
        expect(picked.hour()).toBe(14);
        expect(picked.minute()).toBe(30);
        expect(picked.second()).toBe(0);

        // Date portion preserved from initialDate
        expect(picked.year()).toBe(initialDate.year());
        expect(picked.month()).toBe(initialDate.month());
        expect(picked.date()).toBe(initialDate.date());
    });

    it('does not call handleChange when manual time entry is invalid', () => {
        const testID = 'dt';
        const {getByTestId} = renderWithEverything(
            <DateTimeSelector
                {...baseProps}
                allowManualTimeEntry={true}
                testID={testID}
            />,
            {database},
        );

        fireEvent.press(getByTestId(`${testID}.time.button`));
        const input = getByTestId(`${testID}.manual_time.input`);

        fireEvent.changeText(input, 'not a time');
        fireEvent(input, 'submitEditing');

        expect(mockHandleChange).not.toHaveBeenCalled();
    });
});

describe('parseTimeString', () => {
    it('parses 24-hour "HH:MM" time', () => {
        expect(parseTimeString('13:40')).toEqual({hours: 13, minutes: 40});
    });

    it('parses 24-hour "H:MM" time', () => {
        expect(parseTimeString('9:05')).toEqual({hours: 9, minutes: 5});
    });

    it('parses 12-hour time with pm suffix', () => {
        expect(parseTimeString('1:30pm')).toEqual({hours: 13, minutes: 30});
    });

    it('parses 12-hour time with space before suffix and uppercase', () => {
        expect(parseTimeString('1:30 PM')).toEqual({hours: 13, minutes: 30});
    });

    it('parses short-form pm like "2pm"', () => {
        expect(parseTimeString('2pm')).toEqual({hours: 14, minutes: 0});
    });

    it('parses "12am" as midnight (00:00)', () => {
        expect(parseTimeString('12am')).toEqual({hours: 0, minutes: 0});
    });

    it('parses "12pm" as noon (12:00)', () => {
        expect(parseTimeString('12pm')).toEqual({hours: 12, minutes: 0});
    });

    it('parses "12:30am" as 00:30', () => {
        expect(parseTimeString('12:30am')).toEqual({hours: 0, minutes: 30});
    });

    it('rejects "13:00pm" (24-hour value with pm suffix)', () => {
        expect(parseTimeString('13:00pm')).toBeNull();
    });

    it('rejects "0am" (0 with am suffix)', () => {
        expect(parseTimeString('0am')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(parseTimeString('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(parseTimeString('   ')).toBeNull();
    });

    it('returns null for garbage input', () => {
        expect(parseTimeString('not a time')).toBeNull();
    });

    it('returns null when hours are out of range', () => {
        expect(parseTimeString('25:00')).toBeNull();
    });

    it('returns null when minutes are out of range', () => {
        expect(parseTimeString('10:60')).toBeNull();
    });

    it('trims surrounding whitespace', () => {
        expect(parseTimeString('  14:30  ')).toEqual({hours: 14, minutes: 30});
    });

    it('is case-insensitive for the am/pm suffix', () => {
        expect(parseTimeString('2:15AM')).toEqual({hours: 2, minutes: 15});
        expect(parseTimeString('2:15Pm')).toEqual({hours: 14, minutes: 15});
    });

    it('accepts midnight as 00:00 in 24-hour format', () => {
        expect(parseTimeString('00:00')).toEqual({hours: 0, minutes: 0});
    });

    it('accepts 23:59 in 24-hour format', () => {
        expect(parseTimeString('23:59')).toEqual({hours: 23, minutes: 59});
    });

    it('returns null for missing minutes in colon form (e.g. "14:")', () => {
        expect(parseTimeString('14:')).toBeNull();
    });

    it('returns null for partial minutes (single-digit)', () => {
        expect(parseTimeString('14:3')).toBeNull();
    });
});
