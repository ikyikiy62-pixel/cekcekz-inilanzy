const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const webDir = path.resolve(process.argv[2]);
const jobDir = path.resolve(process.argv[3]);
const androidDir = path.join(jobDir, 'android');
const assetsDir = path.join(androidDir, 'app', 'src', 'main', 'assets');

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
fs.rmSync(path.join(assetsDir, 'www'), { recursive: true, force: true });
fs.cpSync(websiteRoot, path.join(assetsDir, 'www'), { recursive: true });

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
  <application android:theme="@style/AppTheme" android:label="ZIP to APK" android:usesCleartextTraffic="true">
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

execFileSync(process.env.GRADLE || 'gradle', ['-p', androidDir, 'assembleRelease'], { stdio: 'inherit' });
fs.copyFileSync(
  path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  path.join(jobDir, 'app-release.apk')
);
