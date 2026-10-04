# Android app — build, sign and ship

The Android app is the web game wrapped by Capacitor 8 (`android/`, app id `com.numbersnake.game`).
Commands are for PowerShell 5 (chain with `;`, never `&&`).

## Java: use JDK 21, not Android Studio's bundled JDK 25

Gradle 8.14 cannot run on Java 25 (`Unsupported class file major version 69`), and Android
Studio's own `jbr` is Java 25. Use JDK 21:

- **Android Studio:** Settings → Build, Execution, Deployment → Build Tools → Gradle → *Gradle JDK* →
  pick your JDK 21 (e.g. `%USERPROFILE%\.jdks\jdk-21.0.12+8`; if there is none, *Download JDK…* → version 21).
- **Command line:** set `JAVA_HOME` to your JDK 21 path, e.g.
  `$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21.0.12+8"`

SDK Platform 36 is needed (compileSdk/targetSdk 36). Gradle accepted its licence and installed it
automatically on the first build; if it ever doesn't, install it from Android Studio → Settings →
Languages & Frameworks → Android SDK → SDK Platforms → Android 16.0 (API 36).

## First release

1. **Redeploy the analytics Worker** (it now accepts the app's origin and the `text/plain` beacon):
   ```powershell
   cd analytics; npm run deploy; cd ..
   ```
2. **Build the web bundle** (from the repo root; copies the game into `www/` and runs `npx cap sync android`):
   ```powershell
   npm run app
   ```
3. **Open `android/` in Android Studio** (File → Open → the `android` folder). Let Gradle sync.
4. **Build → Generate Signed App Bundle or APK → Android App Bundle → Create new…** keystore:
   - store it **outside the repo**, e.g. `Documents\keys\numbersnake-upload.jks`;
   - a strong password; key alias `upload`;
   - save the file and both passwords in a password manager. Losing them means asking Google for an
     upload-key reset.
5. Choose build variant **release** → the bundle lands in `android/app/release/app-release.aab`.
6. **Play Console** (later, phase D): enable **Play App Signing** with the first upload.

## Every new release

1. In `android/app/build.gradle` bump `versionCode` by 1 and set the new `versionName`.
2. `npm run app`
3. Rebuild the signed AAB (step 4–5 above, choosing the existing keystore).

## Trying a debug build on a phone

Enable *Developer options → USB debugging* on the phone, plug it in, then from the repo root
(set `JAVA_HOME` to your JDK 21 path; the one below is an example). Each step runs only if the
previous one succeeded, so a failed build never installs a stale APK, and the shell ends back in
the repo root:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jdk-21.0.12+8"
$ok = $false
npm run app
if ($?) { Push-Location android; .\gradlew.bat assembleDebug; $ok = $?; Pop-Location }
if ($ok) { & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r android\app\build\outputs\apk\debug\app-debug.apk }
```

## What was verified on the emulator

Debug build on a Pixel 7 AVD (1080×2400, Android 15 / API 35, system WebView 124):

- The splash is navy with the snake icon, then the map (Campaign) opens; no white flash. The launcher
  icon in the app drawer and on the home screen is ours (label shows as "Number Sna…").
- The HUD and the map sit below the status bar; nothing is drawn under the status bar or the gesture
  bar. On this WebView (< 140) Capacitor pads the view natively and the bands are dark; on newer
  WebViews it goes edge-to-edge and the CSS `--safe-area-inset-*` values do the spacing.
- *Endless* + a swipe starts the run and the snake moves.
- Home, then relaunch: the "Paused · Swipe to continue" card shows with the snake where it was; a swipe resumes.
- Back during a run → paused card; back again → the map; back on the map → the app goes to the
  background (activity stopped, not finished; same process).
- Audio: an AAudio output stream opens without errors on the first swipe.
- No JavaScript errors from the game in logcat. Capacitor itself logs, once at start-up on old
  WebViews, `Error injecting safe area CSS: TypeError: Cannot read properties of null` — it fires
  before the page exists and did not affect the layout.

## Before the closed test

Try the debug build on a real phone (or an emulator whose *Android System WebView* is 140 or newer).
WebView 140+ takes the edge-to-edge path that the emulator above (WebView 124) did not exercise:
check that the HUD and the map clear the status bar and that the board is not cut off at the bottom.
