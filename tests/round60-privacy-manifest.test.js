import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { AD_CONFIG } from '../src/config/ads.js';

// Round 60, item 10: the iOS app carries its own privacy manifest, wired into
// the App target so it lands in the bundle, and it stays true to the game.

const path = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(path(p), 'utf8');

const MANIFEST = 'ios/App/App/PrivacyInfo.xcprivacy';
const PBX = 'ios/App/App.xcodeproj/project.pbxproj';

const withoutComments = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '');

// Reads the top level <dict> of a plist into { key: rawValueXml }.
function topLevelKeys(xml) {
    const body = withoutComments(xml).match(/<plist[^>]*>\s*<dict>([\s\S]*)<\/dict>\s*<\/plist>/);
    if (!body) return null;
    const out = {};
    const re = /<key>([^<]+)<\/key>\s*(<true\/>|<false\/>|<array\/>|<array>[\s\S]*?<\/array>|<string>[^<]*<\/string>)/g;
    let m;
    while ((m = re.exec(body[1]))) out[m[1]] = m[2];
    return out;
}

describe('iOS privacy manifest (round 60)', () => {
    it('exists as a well formed plist with the four keys Apple reads', () => {
        expect(existsSync(path(MANIFEST))).toBe(true);
        const xml = read(MANIFEST);
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(xml).toContain('<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"');
        const keys = topLevelKeys(xml);
        expect(keys).not.toBeNull();
        expect(Object.keys(keys).sort()).toEqual([
            'NSPrivacyAccessedAPITypes',
            'NSPrivacyCollectedDataTypes',
            'NSPrivacyTracking',
            'NSPrivacyTrackingDomains',
        ]);
    });

    it('says the game tracks nobody, matching the ad settings and the privacy answers', () => {
        const keys = topLevelKeys(read(MANIFEST));
        expect(AD_CONFIG.requestTracking).toBe(false);
        expect(keys.NSPrivacyTracking).toBe('<false/>');
        expect(keys.NSPrivacyTrackingDomains).toBe('<array/>');
        expect(read('store/app-privacy.md')).toMatch(/requestTracking: false/);
    });

    it('says the game itself collects nothing, as store/app-privacy.md section 1 does', () => {
        const keys = topLevelKeys(read(MANIFEST));
        expect(keys.NSPrivacyCollectedDataTypes).toBe('<array/>');
        expect(read('store/app-privacy.md')).toMatch(/## 1\. What the game itself collects\s+Nothing\./);
    });

    it('declares no required reason API, and the app Swift code really uses none', () => {
        const keys = topLevelKeys(read(MANIFEST));
        expect(keys.NSPrivacyAccessedAPITypes).toBe('<array/>');
        // Apple's required reason API families. If the app's own Swift starts
        // using one, it must be declared in the manifest with its reason code.
        const risky = /UserDefaults|creationDate|modificationDate|contentModificationDate|systemUptime|mach_absolute_time|volumeAvailableCapacity|statfs|activeInputModes/;
        const dir = 'ios/App/App';
        const swift = readdirSync(path(dir)).filter((f) => f.endsWith('.swift'));
        expect(swift.length).toBeGreaterThan(0);
        for (const f of swift) expect(read(`${dir}/${f}`)).not.toMatch(risky);
    });

    it('is part of the App target: one file reference, in the App group and the Resources phase', () => {
        const pbx = read(PBX);
        const ref = pbx.match(/(\w{24}) \/\* PrivacyInfo\.xcprivacy \*\/ = \{isa = PBXFileReference;[^}]*path = PrivacyInfo\.xcprivacy;[^}]*\}/);
        expect(ref).not.toBeNull();
        const refId = ref[1];
        const build = pbx.match(new RegExp(`(\\w{24}) /\\* PrivacyInfo\\.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${refId} `));
        expect(build).not.toBeNull();
        const buildId = build[1];
        expect(buildId).not.toBe(refId);

        const group = pbx.match(/504EC3061FED79650016851F \/\* App \*\/ = \{[\s\S]*?children = \(([\s\S]*?)\);/);
        expect(group[1]).toContain(`${refId} /* PrivacyInfo.xcprivacy */`);
        const resources = pbx.match(/\/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/);
        expect(resources[1]).toContain(`${buildId} /* PrivacyInfo.xcprivacy in Resources */`);

        // Every object id in the project stays unique.
        const defs = [...pbx.matchAll(/^\t\t(\w{24}) \/\*[^*]*\*\/ = \{/gm)].map((m) => m[1]);
        expect(new Set(defs).size).toBe(defs.length);
    });

    it('is not hidden by the iOS .gitignore', () => {
        const ignore = read('ios/.gitignore');
        expect(ignore).not.toMatch(/xcprivacy/);
    });
});
