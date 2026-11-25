import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const path = (p) => new URL(`../${p}`, import.meta.url);
const read = (p) => readFileSync(path(p), 'utf8');
const json = (p) => JSON.parse(read(p));

const cap = json('capacitor.config.json');
const pkg = json('package.json');
const NAVY = '#0b1838';

describe('Capacitor config (App Store pass)', () => {
    it('names the app, the bundle id and the web folder', () => {
        expect(cap.appName).toBe('Galactic Outbreak');
        expect(cap.appId).toBe('com.adamtroy.galacticoutbreak');
        expect(cap.appId).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/);
        expect(cap.webDir).toBe('dist');
    });

    it('fills the screen edge to edge on the game navy, with no native scroll bounce', () => {
        expect(cap.backgroundColor).toBe(NAVY);
        expect(cap.ios.backgroundColor).toBe(NAVY);
        expect(cap.ios.contentInset).toBe('never');
        expect(cap.ios.scrollEnabled).toBe(false);
        expect(read('src/ui/theme-ai-gold.css')).toContain(`--ai-900: ${NAVY};`);
    });

    it('loads no remote site into the app and allows no extra hosts', () => {
        expect(cap.server?.url).toBeUndefined();
        expect(cap.server?.allowNavigation).toBeUndefined();
    });

    it('has the Capacitor packages on one major version and the build script', () => {
        const all = { ...pkg.dependencies, ...pkg.devDependencies };
        const major = (name) => all[name].match(/\d+/)[0];
        expect(pkg.dependencies['@capacitor/core']).toBeTruthy();
        expect(pkg.dependencies['@capacitor/ios']).toBeTruthy();
        expect(all['@capacitor/cli']).toBeTruthy();
        expect(new Set(['@capacitor/core', '@capacitor/ios', '@capacitor/cli'].map(major)).size).toBe(1);
        expect(pkg.scripts['build:ios']).toBe('vite build --base=./ && cap sync ios');
        expect(pkg.scripts.icons).toContain('make-app-icons.mjs');
        expect(pkg.scripts['store:screenshots']).toContain('store-screenshots.mjs');
    });

    it('never ships an ad or purchase plugin that has not been tested on a device', () => {
        const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        expect(all.filter((n) => /admob|purchases|revenuecat/i.test(n))).toEqual([]);
    });
});

describe('iOS project matches the config', () => {
    const plist = read('ios/App/App/Info.plist');
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    const value = (key) => plist.match(new RegExp(`<key>${key}</key>\\s*<(?:string>([^<]*)</string|(true|false)/)>`));
    const array = (key) => {
        const m = plist.match(new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`));
        return [...m[1].matchAll(/<string>([^<]*)<\/string>/g)].map((x) => x[1]);
    };

    it('uses the same bundle id, name and version everywhere', () => {
        const ids = [...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
        expect(ids.length).toBe(2);
        expect(new Set(ids)).toEqual(new Set([cap.appId]));
        expect(value('CFBundleDisplayName')[1]).toBe(cap.appName);
        const versions = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
        expect(versions.length).toBe(2);
        expect(new Set(versions)).toEqual(new Set([pkg.version]));
        expect(pkg.version).toBe('1.0.0');
        const builds = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]);
        expect(new Set(builds)).toEqual(new Set(['1']));
        expect(value('CFBundleShortVersionString')[1]).toBe('$(MARKETING_VERSION)');
        expect(value('CFBundleVersion')[1]).toBe('$(CURRENT_PROJECT_VERSION)');
    });

    it('is an iPhone app, portrait only, with light status bar text', () => {
        expect([...pbx.matchAll(/TARGETED_DEVICE_FAMILY = ([^;]+);/g)].map((m) => m[1])).toEqual(['1', '1']);
        expect(array('UISupportedInterfaceOrientations')).toEqual(['UIInterfaceOrientationPortrait']);
        expect(value('UIStatusBarStyle')[1]).toBe('UIStatusBarStyleLightContent');
        expect(value('UIRequiresFullScreen')[2]).toBe('true');
    });

    it('answers the export question and words the tracking prompt honestly', () => {
        expect(value('ITSAppUsesNonExemptEncryption')[2]).toBe('false');
        const prompt = value('NSUserTrackingUsageDescription')[1];
        expect(prompt.length).toBeGreaterThan(40);
        expect(prompt).toMatch(/ads/);
        expect(prompt).toMatch(/between levels/);
        expect(plist).toContain('<key>SKAdNetworkItems</key>');
        expect(plist).toContain('GADApplicationIdentifier'); // named in the note for the day AdMob goes in
    });

    it('launches on navy with the icon and splash in the asset catalog', () => {
        const story = read('ios/App/App/Base.lproj/LaunchScreen.storyboard');
        expect(story).toContain('red="0.043137" green="0.094118" blue="0.219608"');
        expect(story).not.toContain('systemBackgroundColor');
        const icons = json('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json');
        for (const img of icons.images) expect(existsSync(path(`ios/App/App/Assets.xcassets/AppIcon.appiconset/${img.filename}`))).toBe(true);
        const splash = json('ios/App/App/Assets.xcassets/Splash.imageset/Contents.json');
        for (const img of splash.images) expect(existsSync(path(`ios/App/App/Assets.xcassets/Splash.imageset/${img.filename}`))).toBe(true);
    });

    it('keeps build output, the copied web app and generated config out of git', () => {
        const ignore = read('ios/.gitignore');
        for (const line of ['App/build', 'App/Pods', 'App/App/public', 'DerivedData', 'xcuserdata', 'App/App/capacitor.config.json']) {
            expect(ignore).toContain(line);
        }
        expect(read('.gitignore')).toContain('node_modules');
    });

    it('links the haptics plugin the game already calls, and nothing else', () => {
        const swift = read('ios/App/CapApp-SPM/Package.swift');
        expect(swift).toContain('CapacitorHaptics');
        expect(swift).not.toMatch(/admob|purchases/i);
    });
});

describe('web manifest and page head', () => {
    const manifest = json('public/manifest.webmanifest');
    const html = read('index.html');

    it('describes a standalone portrait app with the same name and colours', () => {
        expect(manifest.name).toBe(cap.appName);
        expect(manifest.short_name.length).toBeLessThanOrEqual(12);
        expect(manifest.id).toBe(cap.appId);
        expect(manifest.display).toBe('standalone');
        expect(manifest.orientation).toBe('portrait');
        expect(manifest.background_color).toBe(NAVY);
        expect(manifest.theme_color).toBe(NAVY);
        expect(manifest.start_url).toBe('./index.html');
    });

    it('lists icons that exist, with a 192, a 512 and a maskable one', () => {
        const sizes = manifest.icons.map((i) => `${i.sizes}/${i.purpose}`);
        expect(sizes).toEqual(expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']));
        for (const icon of manifest.icons) {
            expect(icon.type).toBe('image/png');
            expect(existsSync(path(`public/${icon.src.replace('./', '')}`))).toBe(true);
        }
    });

    it('has the native meta tags, the manifest link and a touch icon', () => {
        expect(html).toContain(`<meta name="theme-color" content="${NAVY}">`);
        expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/);
        expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
        expect(html).toContain('<meta name="mobile-web-app-capable" content="yes">');
        expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">');
        expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${cap.appName}">`);
        expect(html).toContain('<meta name="format-detection" content="telephone=no">');
        expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest">');
        expect(html).toContain('<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">');
        expect(existsSync(path('public/icons/apple-touch-icon.png'))).toBe(true);
    });
});

describe('TestFlight workflow', () => {
    const yml = read('.github/workflows/ios-testflight.yml');
    const release = read('store/RELEASE.md');
    const SECRETS = ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_API_KEY_P8', 'APPLE_TEAM_ID'];

    it('only ever runs by hand', () => {
        const on = yml.slice(yml.indexOf('\non:'), yml.indexOf('\npermissions:'));
        expect(on).toContain('workflow_dispatch:');
        expect(on).not.toMatch(/\b(push|pull_request|schedule|release):/);
    });

    it('uses exactly the secrets the checklist tells Adam to create', () => {
        const used = [...new Set([...yml.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]))].sort();
        expect(used).toEqual([...SECRETS].sort());
        for (const s of SECRETS) expect(release).toContain(`\`${s}\``);
    });

    it('tests, builds, signs with the API key and uploads', () => {
        expect(yml).toMatch(/runs-on: macos-/);
        const order = ['npm ci', 'npm test', 'npm run build:ios', 'xcodebuild archive', 'xcodebuild -exportArchive'].map((s) => yml.indexOf(s));
        expect(order.every((i) => i > 0)).toBe(true);
        expect([...order].sort((a, b) => a - b)).toEqual(order);
        expect(yml).toContain('-authenticationKeyID "$ASC_KEY_ID"');
        expect(yml).toContain('-project ios/App/App.xcodeproj');
        const opts = read('ios/App/ExportOptions.plist');
        expect(opts).toContain('<string>app-store-connect</string>');
        expect(opts).toContain('<string>upload</string>');
        expect(opts).toContain('__TEAM_ID__');
        expect(yml).toContain('s/__TEAM_ID__/$APPLE_TEAM_ID/');
    });

    it('never prints the key', () => {
        expect(yml).not.toMatch(/echo[^\n]*ASC_API_KEY_P8/);
        expect(yml).toContain('rm -rf "$RUNNER_TEMP/keys"');
    });
});
