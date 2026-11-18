package com.ruben.miradio;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://ruben79zgz.github.io/Mi-Radio/?android=1";
    private WebView webView;
    private boolean receiverRegistered = false;

    private final BroadcastReceiver radioStateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!PlaybackService.ACTION_STATE.equals(intent.getAction())) return;
            String json = intent.getStringExtra(PlaybackService.EXTRA_STATE);
            if (json != null) sendStateToWeb(json);
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
        });

        registerStateReceiver();
        requestNotificationPermission();
        webView.loadUrl(APP_URL);
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
        if (webView == null || json == null || json.isEmpty()) return;
        webView.post(() -> webView.evaluateJavascript(
            "window.onNativeRadioState && window.onNativeRadioState(" + json + ");",
            null
        ));
    }

    private void sendCommand(String action, String payload) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(action);
        if (payload != null) intent.putExtra(PlaybackService.EXTRA_PAYLOAD, payload);
        startService(intent);
    }

    public class RadioBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return true;
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
        if (webView != null) {
            webView.removeJavascriptInterface("NativeRadio");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
