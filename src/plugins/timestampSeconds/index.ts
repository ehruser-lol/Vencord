/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { moment } from "@webpack/common";

type LongDateFormats = Record<string, string>;

const settings = definePluginSettings({
    tooltips: {
        description: "Also show seconds in the full date tooltip shown when hovering a timestamp",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: true
    }
});

// locale name -> original long date formats, so stop() can put them back
const originals = new Map<string, LongDateFormats>();

function getFormats(locale: string): LongDateFormats | undefined {
    return (moment.localeData(locale) as any)?._longDateFormat;
}

function patchLocale(locale: string) {
    if (originals.has(locale)) return;

    const formats = getFormats(locale);
    if (!formats?.LT || !formats.LTS) return;

    originals.set(locale, { ...formats });

    const { LT, LTS } = formats;
    // Discord renders message header and hover timestamps with "LT", so point it at the seconds variant
    formats.LT = LTS;

    if (!settings.store.tooltips) return;
    for (const key of ["LLL", "LLLL", "lll", "llll"]) {
        if (formats[key]?.includes(LT))
            formats[key] = formats[key].replace(LT, LTS);
    }
}

function patchAllLocales() {
    for (const locale of moment.locales())
        patchLocale(locale);
}

let originalLocaleFn: typeof moment.locale | undefined;

export default definePlugin({
    name: "TimestampSeconds",
    description: "Shows seconds in message timestamps, e.g. 11:04:37 AM instead of 11:04 AM",
    tags: ["Chat", "Appearance"],
    authors: [{ name: "Klaus", id: 0n }],
    settings,

    start() {
        patchAllLocales();

        // Discord loads locales lazily when the language changes, so patch those too
        originalLocaleFn = moment.locale;
        moment.locale = function (this: typeof moment, ...args: any[]) {
            const result = (originalLocaleFn as any).apply(this, args);
            patchAllLocales();
            return result;
        } as typeof moment.locale;
    },

    stop() {
        if (originalLocaleFn) {
            moment.locale = originalLocaleFn;
            originalLocaleFn = undefined;
        }

        for (const [locale, formats] of originals) {
            const current = getFormats(locale);
            if (current) Object.assign(current, formats);
        }
        originals.clear();
    }
});
