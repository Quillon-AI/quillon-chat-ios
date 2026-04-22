// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment-timezone';

import {getDateValue, isTimeOffset} from './apps_form_field';

describe('apps_form_field helpers', () => {
    describe('isTimeOffset', () => {
        it.each([
            ['+2H', true],
            ['-5H', true],
            ['+30M', true],
            ['-45M', true],
            ['+90S', true],
            ['+1234H', true],
        ])('returns true for time offset %s', (input, expected) => {
            expect(isTimeOffset(input)).toBe(expected);
        });

        it.each([
            ['+2h', false], // lowercase h is not a time unit (lowercase are date units)
            ['+5d', false], // day offset is not a time offset
            ['+2w', false],
            ['+1m', false], // lowercase m means month
            ['today', false],
            ['tomorrow', false],
            ['2026-01-15', false],
            ['2026-01-15T14:30:00Z', false],
            ['', false],
            ['+', false],
            ['H', false],
            ['+12345H', false], // 5 digits exceeds the 1,4 quantifier
        ])('returns false for non-time-offset %s', (input, expected) => {
            expect(isTimeOffset(input)).toBe(expected);
        });
    });

    describe('getDateValue', () => {
        const timezone = 'America/New_York';

        it('returns undefined for empty string', () => {
            expect(getDateValue('', timezone)).toBeUndefined();
        });

        it('returns undefined for null', () => {
            expect(getDateValue(null as any, timezone)).toBeUndefined();
        });

        it('returns undefined for undefined', () => {
            expect(getDateValue(undefined as any, timezone)).toBeUndefined();
        });

        it('returns undefined for non-string values (e.g. boolean)', () => {
            expect(getDateValue(true as any, timezone)).toBeUndefined();
        });

        it('parses an absolute date-only string in the supplied timezone', () => {
            const result = getDateValue('2026-04-20', timezone);
            expect(result).toBeDefined();
            expect(result!.isValid()).toBe(true);
            expect(result!.format('YYYY-MM-DD')).toBe('2026-04-20');

            // Midnight in the target timezone
            expect(result!.hour()).toBe(0);
            expect(result!.minute()).toBe(0);
        });

        it('parses an absolute ISO datetime string', () => {
            const iso = '2026-04-20T14:30:00Z';
            const result = getDateValue(iso, timezone);
            expect(result).toBeDefined();
            expect(result!.toISOString()).toBe(moment.utc(iso).toISOString());
        });

        it('returns undefined when the parsed date is invalid', () => {
            // moment emits a deprecation warning on garbage input — intentional for this test
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            try {
                expect(getDateValue('not-a-date', timezone)).toBeUndefined();
            } finally {
                warnSpy.mockRestore();
            }
        });

        describe('relative dates on date fields (isDateTime=false)', () => {
            it('resolves "today" to the current date at midnight in the timezone', () => {
                const result = getDateValue('today', timezone, false);
                const expectedDate = moment.tz(timezone).format('YYYY-MM-DD');
                expect(result).toBeDefined();
                expect(result!.format('YYYY-MM-DD')).toBe(expectedDate);
                expect(result!.hour()).toBe(0);
                expect(result!.minute()).toBe(0);
            });

            it('resolves "+5d" to today+5 at midnight in the timezone', () => {
                const result = getDateValue('+5d', timezone, false);
                const expected = moment.tz(timezone).add(5, 'days').format('YYYY-MM-DD');
                expect(result).toBeDefined();
                expect(result!.format('YYYY-MM-DD')).toBe(expected);
                expect(result!.hour()).toBe(0);
            });
        });

        describe('relative dates on datetime fields (isDateTime=true)', () => {
            it('resolves "today" and replaces midnight with the current wall-clock hour/minute', () => {
                const now = moment.tz(timezone);
                const result = getDateValue('today', timezone, true);
                expect(result).toBeDefined();
                expect(result!.format('YYYY-MM-DD')).toBe(now.format('YYYY-MM-DD'));
                expect(result!.hour()).toBe(now.hour());
                expect(result!.minute()).toBe(now.minute());
                expect(result!.second()).toBe(0);
            });

            it('resolves "+1d" on a datetime field to tomorrow with current wall-clock time', () => {
                const now = moment.tz(timezone);
                const result = getDateValue('+1d', timezone, true);
                expect(result).toBeDefined();
                expect(result!.format('YYYY-MM-DD')).toBe(now.clone().add(1, 'day').format('YYYY-MM-DD'));
                expect(result!.hour()).toBe(now.hour());
                expect(result!.minute()).toBe(now.minute());
            });

            it('preserves the time offset for "+2H" without overriding with current time', () => {
                const before = moment.tz(timezone);
                const result = getDateValue('+2H', timezone, true);
                const after = moment.tz(timezone);
                expect(result).toBeDefined();

                // result should be ~now+2h, NOT today at current wall clock
                const diffFromBefore = result!.diff(before.clone().add(2, 'hours'), 'minutes');
                const diffFromAfter = result!.diff(after.clone().add(2, 'hours'), 'minutes');
                expect(Math.abs(diffFromBefore)).toBeLessThanOrEqual(1);
                expect(Math.abs(diffFromAfter)).toBeLessThanOrEqual(1);
            });

            it('preserves the time offset for "+30M"', () => {
                const before = moment.tz(timezone);
                const result = getDateValue('+30M', timezone, true);
                expect(result).toBeDefined();
                const expectedApprox = before.clone().add(30, 'minutes');
                expect(Math.abs(result!.diff(expectedApprox, 'seconds'))).toBeLessThan(60);
            });
        });
    });
});
