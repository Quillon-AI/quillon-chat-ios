# Mobile DateTime Implementation TODO

**Branch:** `feature/datetime-manual-entry`
**Status:** Core + manual time entry complete, a few callers need updates
**Last updated:** March 5, 2026

---

## IMPORTANT DISCOVERY

**Active Implementation:** `app/screens/apps_form/apps_form_field.tsx`
**Deprecated:** `app/screens/interactive_dialog/` (feature-flagged, being phased out)

All datetime work should be in **apps_form**, NOT interactive_dialog.

---

## ✅ Completed

### DateTimeSelector Component (`app/components/date_time_selector/index.tsx`)
- Minute interval support (iOS-supported values: 1,2,3,4,5,6,10,12,15,20,30, default 30)
- `allowPastDates` prop (default `false`)
- `minDate` / `maxDate` string props
- `allowManualTimeEntry` prop — shows `ManualTimeInput` instead of "Select Time" button
- Timezone conversion fix for `initialDate`
- When `allowManualTimeEntry` + no initialDate: `date` state starts `null` (empty input)
- On first date selection with manual entry: defaults time to current time (no rounding)

### ManualTimeInput Component (`app/components/manual_time_input/index.tsx`)
- Text input for time entry (faster for power users)
- Syncs display with picker via `useEffect` on `time` prop
- Validates on blur via `parseTimeString()`
- Shows inline error with format hint (e.g. "14:30" or "2:30 PM")
- Clears error as user types

### parseTimeString Utility (`app/utils/time_utils.ts` + tests)
- Parses: `9am`, `9a`, `2:30pm`, `14:30`, `9`, `12am`→midnight, `12pm`→noon
- Returns `{hours, minutes}` or `null` for invalid
- Case-insensitive, handles whitespace

### Date Utilities (`app/utils/date_utils.ts` + tests)
- `resolveRelativeDate()` — resolves "today", "tomorrow", "yesterday", "+5d", "-2w", "+1m"
- `parseDateInTimezone()` — date-only strings parse without UTC offset issues
- `isRelativeDate()` — helper to detect relative expressions

### AppsFormDateTimeField Component (`app/screens/apps_form/apps_form_date_time_field.tsx`)
- Extracted from `apps_form_field.tsx` for clarity
- Handles both `date` and `datetime` field types
- Resolves relative `min_date` / `max_date` before passing to DateTimeSelector
- `location_timezone` support — shows timezone indicator if set
- `allow_manual_time_entry` config support
- `time_interval` config support (falls back to 30)
- Label + selected value display (date or date+time)
- Help text + error text display

### AppsFormField (`app/screens/apps_form/apps_form_field.tsx`)
- User timezone from database observable (`observeCurrentUser` → `getTimezone`)
- Military time from database observable
- Date/datetime fields use `AppsFormDateTimeField`
- Auto-default bug fixed (fields start empty)

### Scheduled Post Caller
- `app/screens/scheduled_post_options/core_options/core_options.tsx`
- Has `allowPastDates={false}` ✅

---

## ❌ Remaining Work

### Step 7: Update Remaining Callers (~30 min)
Add `allowPastDates={false}` to these future-only screens (currently missing it):

- `app/screens/reschedule_draft/reschedule_draft.tsx`
- `app/screens/custom_status_clear_after/components/clear_after_menu_item.tsx`
- `app/products/playbooks/screens/select_date/select_date.tsx`

### Step 8: Location Timezone Display (~2 hrs) — Low priority
Show timezone indicator UI for `location_timezone` config (already stored in field, just needs UI polish).

### Step 10: Range Support (~6 hrs) — Low priority
Two DateTimeSelector instances for start/end; array value `["2026-01-15", "2026-01-20"]`; validate end >= start.

---

## Known Limitations vs Webapp

| Feature | Webapp | Mobile |
|---------|--------|--------|
| Basic date/datetime | ✅ | ✅ |
| `min_date` / `max_date` | ✅ | ✅ |
| `time_interval` | ✅ any value | ✅ iOS-supported only |
| User timezone | ✅ | ✅ |
| Military time | ✅ | ✅ |
| Empty by default | ⚠️ datetime defaults to now | ✅ |
| `allowPastDates` | ✅ | ✅ |
| Relative dates | ✅ | ✅ |
| `location_timezone` | ❌ | ✅ (stored, indicator shown) |
| Manual time entry | ❌ | ✅ |
| Range selection | ❌ | ❌ |

---

## Files Changed (committed on this branch)

- `app/components/date_time_selector/index.tsx`
- `app/components/manual_time_input/index.tsx` *(new)*
- `app/screens/apps_form/apps_form_field.tsx`
- `app/screens/apps_form/apps_form_date_time_field.tsx` *(new)*
- `app/utils/time_utils.ts` *(new)*
- `app/utils/time_utils.test.ts` *(new)*
- `app/utils/date_utils.ts` *(new, committed in prior commit)*
- `app/utils/date_utils.test.ts` *(new, committed in prior commit)*
- `app/screens/scheduled_post_options/core_options/core_options.tsx`

## Next Session: Pick Up Here

1. **Step 7** — Add `allowPastDates={false}` to the 3 remaining callers above (~30 min)
2. Run `npm run tsc` and `npm run fix` to verify clean
3. Test with mobile MCP using a demo plugin with date/datetime fields
4. Decide on Steps 8 and 10 (advanced, low priority)
