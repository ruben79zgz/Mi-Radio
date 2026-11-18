package com.ruben.miradio;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class PlaybackService extends MediaSessionService {
    public static final String ACTION_PLAY = "com.ruben.miradio.PLAY";
    public static final String ACTION_PAUSE = "com.ruben.miradio.PAUSE";
    public static final String ACTION_RESUME = "com.ruben.miradio.RESUME";
    public static final String ACTION_STOP = "com.ruben.miradio.STOP";
    public static final String ACTION_STATE = "com.ruben.miradio.STATE";

    public static final String EXTRA_PAYLOAD = "payload";
    public static final String EXTRA_STATE = "state";

    public static final String PREFS_NAME = "native_radio";
    public static final String PREF_STATE = "state_json";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<String> streams = new ArrayList<>();

    private ExoPlayer player;
    private MediaSession mediaSession;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;

    private String stationId = "";
    private String stationName = "";
    private String stationSubtitle = "";
    private String stationLogo = "";
    private String currentStream = "";
    private int currentIndex = 0;
    private int retryAttempt = 0;
    private boolean wantsPlay = false;
    private Runnable retryRunnable;

    @Override
    public void onCreate() {
        super.onCreate();

        player = new ExoPlayer.Builder(this).build();
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (!wantsPlay) return;
                if (playbackState == Player.STATE_BUFFERING) {
                    broadcastState("buffering", "Cargando…");
                } else if (playbackState == Player.STATE_READY && player.getPlayWhenReady()) {
                    retryAttempt = 0;
                    broadcastState("playing", "Reproduciendo");
                } else if (playbackState == Player.STATE_ENDED) {
                    scheduleRetry("stream finalizado");
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                if (isPlaying) {
                    retryAttempt = 0;
                    broadcastState("playing", "Reproduciendo");
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                if (!wantsPlay) return;
                scheduleRetry(error.getErrorCodeName());
            }

            @Override
            public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                if (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST) {
                    wantsPlay = playWhenReady;
                    if (!playWhenReady) {
                        cancelRetry();
                        broadcastState("paused", "Pausado");
                    }
                }
            }
        });

        mediaSession = new MediaSession.Builder(this, player).build();
        registerNetworkCallback();
        restoreState(false);
    }

    @Nullable
    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        super.onStartCommand(intent, flags, startId);

        if (intent == null) {
            restoreState(true);
            return START_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_PLAY.equals(action)) {
            playPayload(intent.getStringExtra(EXTRA_PAYLOAD));
        } else if (ACTION_PAUSE.equals(action)) {
            wantsPlay = false;
            cancelRetry();
            player.pause();
            broadcastState("paused", "Pausado");
        } else if (ACTION_RESUME.equals(action)) {
            if (streams.isEmpty()) restoreState(false);
            wantsPlay = true;
            if (player.getMediaItemCount() > 0 && player.getPlaybackState() != Player.STATE_IDLE) {
                player.play();
                broadcastState("buffering", "Reanudando…");
            } else {
                startCurrentStream("reanudar");
            }
        } else if (ACTION_STOP.equals(action)) {
            wantsPlay = false;
            cancelRetry();
            player.stop();
            player.clearMediaItems();
            currentStream = "";
            broadcastState("stopped", "Detenido");
            stopSelf();
        }

        return START_STICKY;
    }

    private void playPayload(String raw) {
        if (raw == null || raw.isEmpty()) return;

        try {
            JSONObject json = new JSONObject(raw);
            stationId = json.optString("id", "");
            stationName = json.optString("name", "Radio");
            stationSubtitle = json.optString("subtitle", "");
            stationLogo = json.optString("logo", "");

            streams.clear();
            JSONArray array = json.optJSONArray("streams");
            if (array != null) {
                for (int i = 0; i < array.length(); i++) {
                    String url = array.optString(i, "");
                    if (!url.isEmpty() && !streams.contains(url)) streams.add(url);
                }
            }

            currentIndex = 0;
            retryAttempt = 0;
            wantsPlay = true;
            cancelRetry();

            if (streams.isEmpty()) {
                broadcastState("error", "La emisora no tiene enlace reproducible");
                return;
            }

            startCurrentStream("selección");
        } catch (Exception error) {
            broadcastState("error", "No se pudo preparar la emisora");
        }
    }

    private void startCurrentStream(String reason) {
        if (!wantsPlay || streams.isEmpty()) return;

        if (!isOnline()) {
            broadcastState("waiting-network", "Sin conexión · esperando Internet…");
            return;
        }

        currentIndex = Math.max(0, Math.min(currentIndex, streams.size() - 1));
        currentStream = streams.get(currentIndex);

        MediaMetadata.Builder metadata = new MediaMetadata.Builder()
            .setTitle(stationName)
            .setArtist(stationSubtitle)
            .setAlbumTitle("Mi Radio");

        if (!stationLogo.isEmpty()) {
            try { metadata.setArtworkUri(Uri.parse(stationLogo)); } catch (Exception ignored) {}
        }

        MediaItem.Builder item = new MediaItem.Builder()
            .setMediaId(stationId.isEmpty() ? stationName : stationId)
            .setUri(currentStream)
            .setMediaMetadata(metadata.build());

        if (currentStream.toLowerCase().contains(".m3u8")) {
            item.setMimeType(MimeTypes.APPLICATION_M3U8);
        }

        try {
            player.setMediaItem(item.build());
            player.prepare();
            player.play();
            broadcastState(retryAttempt > 0 ? "reconnecting" : "buffering",
                retryAttempt > 0 ? "Reconectando…" : "Conectando…");
        } catch (Exception error) {
            scheduleRetry(reason + ": " + error.getClass().getSimpleName());
        }
    }

    private void scheduleRetry(String reason) {
        if (!wantsPlay) return;
        cancelRetry();

        if (!isOnline()) {
            broadcastState("waiting-network", "Sin conexión · esperando Internet…");
            return;
        }

        int[] delays = {800, 1500, 3000, 5000, 9000, 15000, 30000};
        int delay = delays[Math.min(retryAttempt, delays.length - 1)];
        retryAttempt++;

        if (streams.size() > 1 && retryAttempt >= 2) {
            currentIndex = (currentIndex + 1) % streams.size();
        }

        broadcastState("reconnecting", "Reconectando… intento " + retryAttempt);
        retryRunnable = () -> {
            retryRunnable = null;
            if (wantsPlay) startCurrentStream(reason);
        };
        handler.postDelayed(retryRunnable, delay);
    }

    private void retryNow(String reason) {
        if (!wantsPlay) return;
        cancelRetry();
        handler.postDelayed(() -> {
            if (!wantsPlay) return;
            if (player.isPlaying()) return;
            startCurrentStream(reason);
        }, 700);
    }

    private void cancelRetry() {
        if (retryRunnable != null) {
            handler.removeCallbacks(retryRunnable);
            retryRunnable = null;
        }
    }

    private boolean isOnline() {
        if (connectivityManager == null) return true;
        Network network = connectivityManager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities caps = connectivityManager.getNetworkCapabilities(network);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                if (wantsPlay) retryNow("Internet recuperado");
            }

            @Override
            public void onLost(Network network) {
                if (wantsPlay && !isOnline()) {
                    cancelRetry();
                    broadcastState("waiting-network", "Sin conexión · esperando Internet…");
                }
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                if (wantsPlay && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && !player.isPlaying()) {
                    retryNow("cambio de red");
                }
            }
        };

        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception ignored) {}
    }

    private void restoreState(boolean resumeIfNeeded) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String raw = prefs.getString(PREF_STATE, "");
        if (raw == null || raw.isEmpty()) return;

        try {
            JSONObject json = new JSONObject(raw);
            stationId = json.optString("stationId", "");
            stationName = json.optString("stationName", "");
            stationSubtitle = json.optString("stationSubtitle", "");
            stationLogo = json.optString("stationLogo", "");
            currentStream = json.optString("stream", "");
            currentIndex = json.optInt("streamIndex", 0);
            wantsPlay = json.optBoolean("wantsPlay", false);

            streams.clear();
            JSONArray list = json.optJSONArray("streams");
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    String url = list.optString(i, "");
                    if (!url.isEmpty()) streams.add(url);
                }
            }

            if (resumeIfNeeded && wantsPlay && !streams.isEmpty()) {
                retryNow("servicio restaurado");
            }
        } catch (Exception ignored) {}
    }

    private void broadcastState(String status, String message) {
        try {
            JSONObject json = new JSONObject();
            json.put("status", status);
            json.put("message", message);
            json.put("wantsPlay", wantsPlay);
            json.put("stationId", stationId);
            json.put("stationName", stationName);
            json.put("stationSubtitle", stationSubtitle);
            json.put("stationLogo", stationLogo);
            json.put("stream", currentStream);
            json.put("streamIndex", currentIndex);
            json.put("attempt", retryAttempt);

            JSONArray list = new JSONArray();
            for (String url : streams) list.put(url);
            json.put("streams", list);

            String raw = json.toString();
            getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit()
                .putString(PREF_STATE, raw)
                .apply();

            Intent intent = new Intent(ACTION_STATE);
            intent.setPackage(getPackageName());
            intent.putExtra(EXTRA_STATE, raw);
            sendBroadcast(intent);
        } catch (Exception ignored) {}
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // No detenemos la radio al cerrar la interfaz. El servicio sigue controlado
        // por la sesión multimedia y la notificación de Android.
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        cancelRetry();
        if (connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
