package com.ruben.miradio;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://ruben79zgz.github.io/Mi-Radio/?android=1";
    private static final String UPDATE_URL = "https://ruben79zgz.github.io/Mi-Radio/downloads/android-version.json";
    private static final String UPDATE_FILE = "Mi-Radio-update.apk";

    private WebView webView;
    private boolean receiverRegistered = false;
    private boolean downloadReceiverRegistered = false;
    private long updateDownloadId = -1L;
    private File pendingUpdateFile;

    private final BroadcastReceiver radioStateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!PlaybackService.ACTION_STATE.equals(intent.getAction())) return;
            String json = intent.getStringExtra(PlaybackService.EXTRA_STATE);
            if (json != null) sendStateToWeb(json);
        }
    };

    private final BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
            long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
            if (id != updateDownloadId) return;
            installPendingUpdate();
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setupWebView();
        registerStateReceiver();
        registerDownloadReceiver();
        requestNotificationPermission();
        webView.loadUrl(APP_URL);
        checkForUpdates(false);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 16, 32));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccess(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new RadioBridge(), "NativeRadio");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isMiRadioUrl(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isMiRadioUrl(uri)) return false;
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                syncSavedState();
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                try {
                    view.removeJavascriptInterface("NativeRadio");
                    view.destroy();
                } catch (Throwable ignored) {}
                webView = null;
                runOnUiThread(() -> {
                    setupWebView();
                    webView.loadUrl(APP_URL);
                });
                return true;
            }
        });
    }

    private boolean isMiRadioUrl(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        String path = uri.getPath();
        return "ruben79zgz.github.io".equalsIgnoreCase(host)
            && path != null
            && (path.equals("/Mi-Radio") || path.startsWith("/Mi-Radio/"));
    }

    private void openExternal(Uri uri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (Exception ignored) {}
    }

    private void registerStateReceiver() {
        IntentFilter filter = new IntentFilter(PlaybackService.ACTION_STATE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(radioStateReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(radioStateReceiver, filter);
        }
        receiverRegistered = true;
    }

    private void registerDownloadReceiver() {
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(downloadReceiver, filter);
        }
        downloadReceiverRegistered = true;
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
        }
    }

    private void syncSavedState() {
        String json = getSharedPreferences(PlaybackService.PREFS_NAME, MODE_PRIVATE)
            .getString(PlaybackService.PREF_STATE, "{}");
        sendStateToWeb(json);
    }

    private void sendStateToWeb(String json) {
        WebView target = webView;
        if (target == null || json == null || json.isEmpty()) return;
        target.post(() -> {
            if (webView == null) return;
            try {
                webView.evaluateJavascript(
                    "window.onNativeRadioState && window.onNativeRadioState(" + json + ");",
                    null
                );
            } catch (Throwable ignored) {}
        });
    }

    private void sendCommand(String action, String payload) {
        try {
            Intent intent = new Intent(this, PlaybackService.class);
            intent.setAction(action);
            if (payload != null) intent.putExtra(PlaybackService.EXTRA_PAYLOAD, payload);
            startService(intent);
        } catch (Throwable ignored) {}
    }

    private long currentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= 28) return info.getLongVersionCode();
            return info.versionCode;
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private void checkForUpdates(boolean manual) {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(UPDATE_URL + "?t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(7000);
                connection.setReadTimeout(7000);
                connection.setUseCaches(false);

                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream()))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }

                JSONObject json = new JSONObject(body.toString());
                long remoteCode = json.optLong("versionCode", 0L);
                String remoteName = json.optString("versionName", "");
                String apkUrl = json.optString("apkUrl", "");
                String notes = json.optString("notes", "Mejoras y correcciones.");

                if (remoteCode > currentVersionCode() && !apkUrl.isEmpty()) {
                    runOnUiThread(() -> showUpdateDialog(remoteName, notes, apkUrl));
                } else if (manual) {
                    runOnUiThread(() -> new AlertDialog.Builder(this)
                        .setTitle("Mi Radio")
                        .setMessage("Ya tienes la última versión.")
                        .setPositiveButton("OK", null)
                        .show());
                }
            } catch (Throwable ignored) {
                if (manual) {
                    runOnUiThread(() -> new AlertDialog.Builder(this)
                        .setTitle("Mi Radio")
                        .setMessage("No he podido comprobar las actualizaciones ahora mismo.")
                        .setPositiveButton("OK", null)
                        .show());
                }
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private void showUpdateDialog(String versionName, String notes, String apkUrl) {
        new AlertDialog.Builder(this)
            .setTitle("Nueva versión " + versionName)
            .setMessage(notes)
            .setNegativeButton("Más tarde", null)
            .setPositiveButton("Actualizar", (dialog, which) -> downloadUpdate(apkUrl))
            .show();
    }

    private void downloadUpdate(String apkUrl) {
        try {
            File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) throw new IllegalStateException("Sin carpeta de descargas");
            pendingUpdateFile = new File(dir, UPDATE_FILE);
            if (pendingUpdateFile.exists()) pendingUpdateFile.delete();

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(apkUrl));
            request.setTitle("Actualizando Mi Radio");
            request.setDescription("Descargando la nueva versión");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, UPDATE_FILE);

            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            updateDownloadId = manager.enqueue(request);
        } catch (Throwable error) {
            new AlertDialog.Builder(this)
                .setTitle("Actualización")
                .setMessage("No se ha podido iniciar la descarga.")
                .setPositiveButton("OK", null)
                .show();
        }
    }

    private void installPendingUpdate() {
        try {
            if (pendingUpdateFile == null) {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir != null) pendingUpdateFile = new File(dir, UPDATE_FILE);
            }
            if (pendingUpdateFile == null || !pendingUpdateFile.exists()) return;

            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName())
                );
                startActivity(settingsIntent);
                return;
            }

            Uri apkUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".files",
                pendingUpdateFile
            );

            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
        } catch (Throwable error) {
            new AlertDialog.Builder(this)
                .setTitle("Actualización")
                .setMessage("La descarga ha terminado, pero Android no ha podido abrir el instalador.")
                .setPositiveButton("OK", null)
                .show();
        }
    }

    public class RadioBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
        }

        @JavascriptInterface
        public long getVersionCode() {
            return currentVersionCode();
        }

        @JavascriptInterface
        public void checkForUpdates() {
            runOnUiThread(() -> MainActivity.this.checkForUpdates(true));
        }

        @JavascriptInterface
        public void play(String stationJson) {
            runOnUiThread(() -> sendCommand(PlaybackService.ACTION_PLAY, stationJson));
        }

        @JavascriptInterface
        public void pause() {
            runOnUiThread(() -> sendCommand(PlaybackService.ACTION_PAUSE, null));
        }

        @JavascriptInterface
        public void resume() {
            runOnUiThread(() -> sendCommand(PlaybackService.ACTION_RESUME, null));
        }

        @JavascriptInterface
        public void stop() {
            runOnUiThread(() -> sendCommand(PlaybackService.ACTION_STOP, null));
        }

        @JavascriptInterface
        public String getState() {
            return getSharedPreferences(PlaybackService.PREFS_NAME, MODE_PRIVATE)
                .getString(PlaybackService.PREF_STATE, "{}");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        syncSavedState();
        if (pendingUpdateFile != null && pendingUpdateFile.exists()) {
            installPendingUpdate();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (receiverRegistered) {
            try { unregisterReceiver(radioStateReceiver); } catch (Exception ignored) {}
            receiverRegistered = false;
        }
        if (downloadReceiverRegistered) {
            try { unregisterReceiver(downloadReceiver); } catch (Exception ignored) {}
            downloadReceiverRegistered = false;
        }
        if (webView != null) {
            try {
                webView.removeJavascriptInterface("NativeRadio");
                webView.destroy();
            } catch (Throwable ignored) {}
            webView = null;
        }
        super.onDestroy();
    }
}
