// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment-timezone';

import {resolveRelativeDate, isRelativeDate, parseDateInTimezone} from './date_utils';

describe('resolveRelativeDate', () => {
    const originalMomentUtc = moment.utc;
    const mockDate = '2026-01-15T12:00:00Z';

    beforeEach(() => {
        // Mock moment.utc to return a fresh clone of our fixed date
        (moment as any).utc = jest.fn(() => originalMomentUtc(mockDate).clone());
    });

    afterEach(() => {
        (moment as any).utc = originalMomentUtc;
    });

    it('should resolve "today" to current date', () => {
        expect(resolveRelativeDate('today')).toBe('2026-01-15');
        expect(resolveRelativeDate('TODAY')).toBe('2026-01-15');
    });

    it('should resolve "tomorrow" to next day', () => {
        expect(resolveRelativeDate('tomorrow')).toBe('2026-01-16');
        expect(resolveRelativeDate('TOMORROW')).toBe('2026-01-16');
    });

    it('should resolve "yesterday" to previous day', () => {
        expect(resolveRelativeDate('yesterday')).toBe('2026-01-14');
        expect(resolveRelativeDate('YESTERDAY')).toBe('2026-01-14');
    });

    it('should resolve positive day offsets', () => {
        expect(resolveRelativeDate('+1d')).toBe('2026-01-16');
        expect(resolveRelativeDate('+5d')).toBe('2026-01-20');
        expect(resolveRelativeDate('+100d')).toBe('2026-04-25');
    });

    it('should resolve negative day offsets', () => {
        expect(resolveRelativeDate('-1d')).toBe('2026-01-14');
        expect(resolveRelativeDate('-5d')).toBe('2026-01-10');
    });

    it('should resolve week offsets', () => {
        expect(resolveRelativeDate('+1w')).toBe('2026-01-22');
        expect(resolveRelativeDate('+2w')).toBe('2026-01-29');
        expect(resolveRelativeDate('-1w')).toBe('2026-01-08');
    });

    it('should resolve month offsets', () => {
        expect(resolveRelativeDate('+1m')).toBe('2026-02-15');
        expect(resolveRelativeDate('+6m')).toBe('2026-07-15');
        expect(resolveRelativeDate('-1m')).toBe('2025-12-15');
    });

    it('should distinguish date units (lowercase) from time units (uppercase)', () => {
        // Lowercase: date offsets (d=day, w=week, m=month)
        expect(resolveRelativeDate('+5d')).toBe('2026-01-20');
        expect(resolveRelativeDate('+2w')).toBe('2026-01-29');
        expect(resolveRelativeDate('+1m')).toBe('2026-02-15');

        // Uppercase D and W are not valid units — returned unchanged
        expect(resolveRelativeDate('+5D')).toBe('+5D');
        expect(resolveRelativeDate('+2W')).toBe('+2W');

        // Uppercase M = minutes (time offset), not months
        const result = resolveRelativeDate('+1M');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO datetime string
    });

    it('should resolve hour offsets to ISO datetime', () => {
        const result = resolveRelativeDate('+2H');
        expect(result).toBe('2026-01-15T14:00:00.000Z');

        const negResult = resolveRelativeDate('-3H');
        expect(negResult).toBe('2026-01-15T09:00:00.000Z');
    });

    it('should resolve minute offsets to ISO datetime', () => {
        const result = resolveRelativeDate('+30M');
        expect(result).toBe('2026-01-15T12:30:00.000Z');

        const result90 = resolveRelativeDate('+90M');
        expect(result90).toBe('2026-01-15T13:30:00.000Z');
    });

    it('should resolve second offsets to ISO datetime', () => {
        const result = resolveRelativeDate('+90S');
        expect(result).toBe('2026-01-15T12:01:30.000Z');
    });

    it('should return absolute dates unchanged', () => {
        expect(resolveRelativeDate('2026-01-20')).toBe('2026-01-20');
        expect(resolveRelativeDate('2025-12-31')).toBe('2025-12-31');
    });

    it('should return empty string for empty input', () => {
        expect(resolveRelativeDate('')).toBe('');
    });

    it('should return invalid patterns unchanged', () => {
        expect(resolveRelativeDate('next week')).toBe('next week');
        expect(resolveRelativeDate('+5')).toBe('+5');
        expect(resolveRelativeDate('5d')).toBe('5d');
    });
});

describe('isRelativeDate', () => {
    it('should identify named date references', () => {
        expect(isRelativeDate('today')).toBe(true);
        expect(isRelativeDate('tomorrow')).toBe(true);
        expect(isRelativeDate('yesterday')).toBe(true);
        expect(isRelativeDate('TODAY')).toBe(true);
    });

    it('should identify date offsets', () => {
        expect(isRelativeDate('+5d')).toBe(true);
        expect(isRelativeDate('-3d')).toBe(true);
        expect(isRelativeDate('+2w')).toBe(true);
        expect(isRelativeDate('+1m')).toBe(true);
    });

    it('should identify time offsets', () => {
        expect(isRelativeDate('+2H')).toBe(true);
        expect(isRelativeDate('+30M')).toBe(true);
        expect(isRelativeDate('+90S')).toBe(true);
        expect(isRelativeDate('-1H')).toBe(true);
    });

    it('should reject absolute dates', () => {
        expect(isRelativeDate('2026-01-15')).toBe(false);
    });

    it('should reject invalid patterns', () => {
        expect(isRelativeDate('next week')).toBe(false);
        expect(isRelativeDate('5d')).toBe(false);
        expect(isRelativeDate('')).toBe(false);
    });
});

describe('parseDateInTimezone', () => {
    it('should parse date-only strings in the specified timezone', () => {
        const result = parseDateInTimezone('2026-01-15', 'America/New_York');
        expect(result).not.toBeNull();
        expect(result?.format('YYYY-MM-DD')).toBe('2026-01-15');

        // Should be midnight in New York timezone
        expect(result?.format('HH:mm')).toBe('00:00');
    });

    it('should parse datetime strings with UTC indicator', () => {
        const result = parseDateInTimezone('2026-01-15T14:30:00Z', 'America/New_York');
        expect(result).not.toBeNull();
        expect(result?.utc().format('YYYY-MM-DDTHH:mm:ss')).toBe('2026-01-15T14:30:00');
    });

    it('should handle date-only strings without timezone', () => {
        const result = parseDateInTimezone('2026-01-15');
        expect(result).not.toBeNull();
        expect(result?.format('YYYY-MM-DD')).toBe('2026-01-15');
    });

    it('should return null for empty or invalid input', () => {
        expect(parseDateInTimezone('')).toBeNull();
        expect(parseDateInTimezone(null)).toBeNull();
        expect(parseDateInTimezone(undefined)).toBeNull();
        expect(parseDateInTimezone('invalid')).toBeNull();
    });

    it('should handle different timezones correctly', () => {
        const nyResult = parseDateInTimezone('2026-01-15', 'America/New_York');
        const tokyoResult = parseDateInTimezone('2026-01-15', 'Asia/Tokyo');

        expect(nyResult?.format('YYYY-MM-DD')).toBe('2026-01-15');
        expect(tokyoResult?.format('YYYY-MM-DD')).toBe('2026-01-15');

        // Both should be midnight in their respective timezones
        expect(nyResult?.format('HH:mm')).toBe('00:00');
        expect(tokyoResult?.format('HH:mm')).toBe('00:00');
    });

    it('should preserve time information in datetime strings', () => {
        const result = parseDateInTimezone('2026-01-15T14:30:00', 'America/New_York');
        expect(result).not.toBeNull();
        expect(result?.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-01-15 14:30:00');
    });
});
