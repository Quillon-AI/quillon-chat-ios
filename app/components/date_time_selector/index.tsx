// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import DateTimePicker, {type DateTimePickerEvent} from '@react-native-community/datetimepicker';
import moment, {type Moment} from 'moment-timezone';
import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {View, Button, Platform, Text, TextInput} from 'react-native';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import {Preferences} from '@constants';
import {getDisplayNamePreferenceAsBool} from '@helpers/api/preference';
import {queryDisplayNamePreferences} from '@queries/servers/preference';
import {parseDateInTimezone} from '@utils/date_utils';
import {getCurrentMomentForTimezone, getRoundedTime} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {WithDatabaseArgs} from '@typings/database/database';

type Props = {
    timezone: string;
    isMilitaryTime: boolean;
    theme: Theme;
    handleChange: (currentDate: Moment) => void;
    showInitially?: AndroidMode;
    initialDate?: Moment;
    minuteInterval?: number; // Default: 60 (matching webapp). iOS clamps to: 1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30
    dateOnly?: boolean;
    testID?: string;
    allowPastDates?: boolean;
    minDate?: string;
    maxDate?: string;
    allowManualTimeEntry?: boolean;
}

type AndroidMode = 'date' | 'time';
type ValidMinuteInterval = 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;

const IOS_VALID_INTERVALS = new Set<number>([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30]);

function toValidMinuteInterval(interval?: number): ValidMinuteInterval {
    if (Platform.OS !== 'ios') {
        // Android doesn't use minuteInterval — return 30 as a no-op default
        return 30;
    }
    if (interval && IOS_VALID_INTERVALS.has(interval)) {
        return interval as ValidMinuteInterval;
    }

    // iOS doesn't support 60+ — clamp to 30
    return 30;
}

/**
 * Parses flexible time string input into hours and minutes.
 * Supports: "13:40", "1:30pm", "1:30 PM", "2pm", "14:00", etc.
 */
export function parseTimeString(input: string): {hours: number; minutes: number} | null {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }

    // Match "HH:MM" with optional am/pm
    const colonMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (colonMatch) {
        let hours = parseInt(colonMatch[1], 10);
        const minutes = parseInt(colonMatch[2], 10);
        const period = colonMatch[3];

        // Reject am/pm with 24-hour values (e.g., "13:00pm" is invalid)
        if (period && (hours < 1 || hours > 12)) {
            return null;
        }

        if (period === 'pm' && hours < 12) {
            hours += 12;
        } else if (period === 'am' && hours === 12) {
            hours = 0;
        }

        if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
            return {hours, minutes};
        }
        return null;
    }

    // Match "Ham" or "Hpm" (e.g., "2pm", "12am")
    const shortMatch = trimmed.match(/^(\d{1,2})\s*(am|pm)$/);
    if (shortMatch) {
        let hours = parseInt(shortMatch[1], 10);
        const period = shortMatch[2];

        // Reject am/pm with 24-hour values
        if (hours < 1 || hours > 12) {
            return null;
        }

        if (period === 'pm' && hours < 12) {
            hours += 12;
        } else if (period === 'am' && hours === 12) {
            hours = 0;
        }

        if (hours >= 0 && hours < 24) {
            return {hours, minutes: 0};
        }
    }

    return null;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        paddingTop: 10,
        backgroundColor: theme.centerChannelBg,
    },
    buttonContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-evenly',
        marginBottom: 10,
    },
    manualTimeInput: {
        borderWidth: 1,
        borderColor: theme.centerChannelColor,
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginHorizontal: 15,
        marginBottom: 10,
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },
    manualTimeHint: {
        color: theme.centerChannelColor,
        opacity: 0.64,
        marginHorizontal: 15,
        marginBottom: 8,
        ...typography('Body', 75, 'Regular'),
    },
}));

const DateTimeSelector = ({
    timezone,
    handleChange,
    isMilitaryTime,
    theme,
    showInitially,
    initialDate,
    dateOnly = false,
    testID,
    minuteInterval = 60,
    allowPastDates = false,
    minDate,
    maxDate,
    allowManualTimeEntry = false,
}: Props) => {
    const intl = useIntl();
    const styles = getStyleSheet(theme);
    const currentTime = getCurrentMomentForTimezone(timezone);

    // Use the effective interval (after iOS clamping) for rounding so that
    // minDate and defaultDate align with what the picker actually displays.
    const effectiveInterval = toValidMinuteInterval(minuteInterval);

    // Calculate minimum date based on allowPastDates and explicit minDate
    // Use parseDateInTimezone to respect the picker's timezone for date-only strings
    let calculatedMinDate: moment.Moment | undefined;
    if (minDate) {
        calculatedMinDate = parseDateInTimezone(minDate, timezone) || undefined;
    } else if (!allowPastDates) {
        calculatedMinDate = getRoundedTime(currentTime, effectiveInterval);
    }
    const calculatedMaxDate = maxDate ? (parseDateInTimezone(maxDate, timezone) || undefined) : undefined;

    // Use initialDate if provided and valid, otherwise use rounded current time
    let defaultDate: moment.Moment;
    if (initialDate?.isValid()) {
        defaultDate = initialDate;
    } else if (dateOnly) {
        defaultDate = currentTime.clone().startOf('day');
    } else {
        defaultDate = getRoundedTime(currentTime, effectiveInterval);
    }
    const [date, setDate] = useState<Moment>(defaultDate);
    const [mode, setMode] = useState<AndroidMode>(showInitially || 'date');
    const [show, setShow] = useState<boolean>(Boolean(showInitially));
    const [manualTimeText, setManualTimeText] = useState<string>('');
    const [useManualEntry, setUseManualEntry] = useState<boolean>(false);

    const onChange = useCallback((event: DateTimePickerEvent, selectedDate?: Date) => {
        // On Android, dismiss (back/cancel) fires onChange with type 'dismissed'
        if (event.type === 'dismissed') {
            setShow(false);
            return;
        }

        const currentDate = selectedDate || date;
        setShow(Platform.OS === 'ios');

        const momentDate = moment.tz(currentDate, timezone);
        setDate(momentDate);
        handleChange(momentDate);
    }, [date, timezone, handleChange]);

    const showDatepicker = useCallback(() => {
        if (show && mode === 'date') {
            setShow(false);
        } else {
            setShow(true);
            setMode('date');
        }
    }, [show, mode]);

    const showTimepicker = useCallback(() => {
        if (allowManualTimeEntry) {
            const entering = !useManualEntry;
            setUseManualEntry(entering);
            setShow(false);
            if (entering) {
                // Sync text to current date so the field isn't stale
                setManualTimeText(date.format(isMilitaryTime ? 'HH:mm' : 'h:mm A'));
            }
        } else if (show && mode === 'time') {
            setShow(false);
        } else {
            setShow(true);
            setMode('time');
        }
    }, [allowManualTimeEntry, useManualEntry, date, isMilitaryTime, show, mode]);

    const handleManualTimeSubmit = useCallback(() => {
        const parsed = parseTimeString(manualTimeText);
        if (parsed) {
            const newDate = date.clone().hour(parsed.hours).minute(parsed.minutes).second(0);
            setDate(newDate);
            handleChange(newDate);
        } else if (manualTimeText.trim()) {
            // Invalid input — reset to current date value
            setManualTimeText(date.format(isMilitaryTime ? 'HH:mm' : 'h:mm A'));
        }
    }, [manualTimeText, date, handleChange, isMilitaryTime]);

    const timeHint = isMilitaryTime ? '14:30' : '2:30 PM';

    return (
        <View
            style={styles.container}
            testID={testID || 'custom_date_time_picker'}
        >
            <View style={styles.buttonContainer}>
                <Button
                    testID={testID ? `${testID}.select.button` : 'custom_status_clear_after.menu_item.date_and_time.button.date'}
                    onPress={showDatepicker}
                    title={intl.formatMessage({id: 'date_time_selector.select_date', defaultMessage: 'Select Date'})}
                    color={theme.buttonBg}
                />
                {!dateOnly && (
                    <Button
                        testID={testID ? `${testID}.time.button` : 'custom_status_clear_after.menu_item.date_and_time.button.time'}
                        onPress={showTimepicker}
                        title={intl.formatMessage({id: 'date_time_selector.select_time', defaultMessage: 'Select Time'})}
                        color={theme.buttonBg}
                    />
                )}
            </View>
            {!dateOnly && allowManualTimeEntry && useManualEntry && (
                <View>
                    <TextInput
                        testID={testID ? `${testID}.manual_time.input` : 'custom_date_time_picker.manual_time.input'}
                        style={styles.manualTimeInput}
                        value={manualTimeText}
                        onChangeText={setManualTimeText}
                        onSubmitEditing={handleManualTimeSubmit}
                        onBlur={handleManualTimeSubmit}
                        placeholder={timeHint}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.5)}
                        keyboardType='default'
                        returnKeyType='done'
                        autoCapitalize='none'
                    />
                    <Text style={styles.manualTimeHint}>
                        {intl.formatMessage(
                            {id: 'date_time_selector.manual_time_hint', defaultMessage: 'Enter time (e.g. {example})'},
                            {example: timeHint},
                        )}
                    </Text>
                </View>
            )}
            {show && (
                <DateTimePicker
                    testID='custom_status_clear_after.date_time_picker'
                    value={date.toDate()}
                    mode={mode}
                    is24Hour={isMilitaryTime}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onChange}
                    textColor={theme.centerChannelColor}
                    minimumDate={calculatedMinDate?.toDate()}
                    maximumDate={calculatedMaxDate?.toDate()}
                    minuteInterval={effectiveInterval}
                    timeZoneName={timezone}
                />
            )}
        </View>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    isMilitaryTime: queryDisplayNamePreferences(database).
        observeWithColumns(['value']).pipe(
            switchMap(
                (preferences) => of$(getDisplayNamePreferenceAsBool(preferences, Preferences.USE_MILITARY_TIME, false)),
            ),
        ),
}));

export default withDatabase(enhanced(DateTimeSelector));
