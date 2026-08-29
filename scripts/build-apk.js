const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const webDir=path.resolve(process.argv[2]),jobDir=path.resolve(process.argv[3]),iconInput=process.argv[4]?path.resolve(process.argv[4]):null;
const appName=(process.env.APP_NAME||'Lanzy App').replace(/[<>"&]/g,'').trim().slice(0,40)||'Lanzy App';
const fileName=appName.replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')+'.apk';
const androidDir=path.join(jobDir,'android'),assetsDir=path.join(androidDir,'app/src/main/assets'),resDir=path.join(androidDir,'app/src/main/res');
fs.mkdirSync(assetsDir,{recursive:true});
function findIndex(d){const x=path.join(d,'index.html');if(fs.existsSync(x))return x;for(const n of fs.readdirSync(d)){const f=path.join(d,n);if(fs.statSync(f).isDirectory()){const r=findIndex(f);if(r)return r}}return null}
function write(f,c){fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,c)}
const index=findIndex(webDir);if(!index)throw Error('ZIP harus berisi index.html.');const www=path.join(assetsDir,'www');fs.rmSync(www,{recursive:true,force:true});fs.cpSync(path.dirname(index),www,{recursive:true});
if(!iconInput||!fs.existsSync(iconInput))throw Error('Icon tidak ditemukan.');
const iconDir=path.join(resDir,'drawable-nodpi');fs.mkdirSync(iconDir,{recursive:true});
const output=path.join(iconDir,'launcher_icon.png');
const raw=fs.readFileSync(iconInput);const text=raw.toString('utf8').trim();
let iconType='png';
if(/^<svg[\s>]/i.test(text)){
  try{
    execFileSync('convert',[iconInput,'-background','white','-resize','448x448','-gravity','center','-extent','512x512',output],{stdio:'inherit'});
  }catch(e){
    throw Error('Icon SVG tidak bisa dirasterisasi di runner. Gunakan PNG/JPG/WebP atau pastikan ImageMagick tersedia.');
  }
  iconType='svg-rasterized';
}else{
  execFileSync(process.env.PYTHON||'python3',['-c',`from PIL import Image,ImageOps
im=Image.open(r'''${iconInput.replace(/'/g,"\\'")}''').convert('RGBA')
im=ImageOps.fit(im,(512,512),method=Image.Resampling.LANCZOS,centering=(0.5,0.5))
im.save(r'''${output.replace(/'/g,"\\'")}''','PNG')`],{stdio:'inherit'});
}
console.log('ICON_OUTPUT='+iconType);
write(path.join(androidDir,'settings.gradle'),`pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }\ndependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS); repositories { google(); mavenCentral() } }\nrootProject.name="ZipToApk"\ninclude ":app"\n`);
write(path.join(androidDir,'build.gradle'),`plugins { id "com.android.application" version "8.7.3" apply false }\n`);
write(path.join(androidDir,'app/build.gradle'),`plugins { id "com.android.application" }\nandroid { namespace "com.lanzy.ziptoapk"; compileSdk 35; defaultConfig { applicationId "com.lanzy.ziptoapk"; minSdk 23; targetSdk 35; versionCode 1; versionName "1.0" } }\n`);
write(path.join(androidDir,'app/src/main/res/values/colors.xml'),`<resources><color name="splash_bg">#090A10</color></resources>`);
write(path.join(androidDir,'app/src/main/res/drawable/splash_background.xml'),`<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@color/splash_bg"/><item android:gravity="center" android:width="128dp" android:height="128dp"><bitmap android:src="@drawable/launcher_icon" android:gravity="fill"/></item></layer-list>`);
write(path.join(androidDir,'app/src/main/res/values/styles.xml'),`<resources><style name="AppTheme" parent="android:style/Theme.Material.Light.NoActionBar"><item name="android:windowBackground">@drawable/splash_background</item><item name="android:statusBarColor">@color/splash_bg</item><item name="android:navigationBarColor">@color/splash_bg</item><item name="android:windowLightStatusBar">false</item></style></resources>`);
write(path.join(androidDir,'app/src/main/AndroidManifest.xml'),`<?xml version="1.0" encoding="utf-8"?><manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:theme="@style/AppTheme" android:label="${appName.replace(/"/g,'&quot;')}" android:icon="@drawable/launcher_icon" android:roundIcon="@drawable/launcher_icon" android:usesCleartextTraffic="true"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>`);
write(path.join(androidDir,'app/src/main/java/com/lanzy/ziptoapk/MainActivity.java'),`package com.lanzy.ziptoapk;import android.app.Activity;import android.os.Bundle;import android.webkit.WebView;import android.webkit.WebViewClient;public class MainActivity extends Activity{public void onCreate(Bundle b){super.onCreate(b);WebView w=new WebView(this);w.setBackgroundColor(0xFF090A10);w.setWebViewClient(new WebViewClient());w.getSettings().setJavaScriptEnabled(true);w.getSettings().setDomStorageEnabled(true);w.getSettings().setAllowFileAccess(true);w.getSettings().setAllowContentAccess(true);w.loadUrl("file:///android_asset/www/index.html");setContentView(w);}}`);
execFileSync(process.env.GRADLE||'gradle',['-p',androidDir,'assembleDebug'],{stdio:'inherit'});
const apk=path.join(androidDir,'app/build/outputs/apk/debug/app-debug.apk');if(!fs.existsSync(apk))throw Error('APK berhasil di-build tetapi file output tidak ditemukan.');
fs.copyFileSync(apk,path.join(jobDir,fileName));fs.copyFileSync(apk,path.join(jobDir,'app-release.apk'));console.log(`APK_OUTPUT=${fileName}`);
