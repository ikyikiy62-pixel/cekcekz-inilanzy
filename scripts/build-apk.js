const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const webDir = path.resolve(process.argv[2]);
const jobDir = path.resolve(process.argv[3]);
const iconInput = process.argv[4] ? path.resolve(process.argv[4]) : null;
const androidDir = path.join(jobDir, 'android');
const assetsDir = path.join(androidDir, 'app', 'src', 'main', 'assets');
const resDir = path.join(androidDir, 'app', 'src', 'main', 'res');

fs.mkdirSync(assetsDir, { recursive: true });

function findIndex(dir) {
  const direct = path.join(dir, 'index.html');
  if (fs.existsSync(direct)) return direct;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      const found = findIndex(full);
      if (found) return found;
    }
  }
  return null;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const index = findIndex(webDir);
if (!index) throw new Error('ZIP harus berisi index.html.');

const websiteRoot = path.dirname(index);
const wwwDir = path.join(assetsDir, 'www');
fs.rmSync(wwwDir, { recursive: true, force: true });
fs.cpSync(websiteRoot, wwwDir, { recursive: true });

if (iconInput) {
  if (!fs.existsSync(iconInput)) throw new Error('File icon tidak ditemukan.');
  const iconDir = path.join(resDir, 'drawable-nodpi');
  fs.mkdirSync(iconDir, { recursive: true });
  const output = path.join(iconDir, 'launcher_icon.png');
  const python = process.env.PYTHON || 'python3';
  execFileSync(python, ['-c', `from PIL import Image
im=Image.open(r'''${iconInput.replace(/'/g, "\\'")}''').convert('RGBA')
max_side=max(im.size)
scale=min(512/max_side,1)
if scale < 1: im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
im.save(r'''${output.replace(/'/g, "\\'")}''',format='PNG')`], { stdio: 'inherit' });
}

const iconAttr = iconInput ? ' android:icon="@drawable/launcher_icon"' : '';

write(path.join(androidDir, 'settings.gradle'), `pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }
dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }
rootProject.name="ZipToApk"
include ":app"
`);

write(path.join(androidDir, 'build.gradle'), `plugins { id "com.android.application" version "8.7.3" apply false }
`);

write(path.join(androidDir, 'app', 'build.gradle'), `plugins { id "com.android.application" }

android {
  namespace "com.lanzy.ziptoapk"
  compileSdk 35
  defaultConfig {
    applicationId "com.lanzy.ziptoapk"
    minSdk 23
    targetSdk 35
    versionCode 1
    versionName "1.0"
  }
}
`);

write(path.join(androidDir, 'app', 'src', 'main', 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:theme="@style/AppTheme" android:label="ZIP to APK"${iconAttr} android:usesCleartextTraffic="true">
    <activity android:name=".MainActivity" android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`);

write(path.join(androidDir, 'app', 'src', 'main', 'res', 'values', 'styles.xml'), `<resources>
  <style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar" />
</resources>
`);

write(path.join(androidDir, 'app', 'src', 'main', 'java', 'com', 'lanzy', 'ziptoapk', 'MainActivity.java'), `package com.lanzy.ziptoapk;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
  @Override public void onCreate(Bundle b) {
    super.onCreate(b);
    WebView w = new WebView(this);
    w.setWebViewClient(new WebViewClient());
    w.getSettings().setJavaScriptEnabled(true);
    w.getSettings().setDomStorageEnabled(true);
    w.loadUrl("file:///android_asset/www/index.html");
    setContentView(w);
  }
}
`);

// Build a debug APK: Android Gradle Plugin signs it automatically with the runner's debug key,
// making the downloaded APK directly installable on Android devices.
execFileSync(process.env.GRADLE || 'gradle', ['-p', androidDir, 'assembleDebug'], { stdio: 'inherit' });

const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (!fs.existsSync(apk)) throw new Error('APK berhasil di-build tetapi file output tidak ditemukan.');
fs.copyFileSync(apk, path.join(jobDir, 'app-release.apk'));
