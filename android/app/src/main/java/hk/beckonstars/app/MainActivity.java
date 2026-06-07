package hk.beckonstars.app;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaPlayer;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import androidx.core.content.FileProvider;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final String TAG = "BeckonStars";
    private static final String CHANNEL_ID = "beckon_stars_default";
    private static final int REQUEST_POST_NOTIFICATIONS = 1001;
    private static final int REQUEST_RECORD_AUDIO = 1002;
    private static final int REQUEST_FILE_CHOOSER = 1003;
    private static final String SPEECH_LANGUAGE = "zh-HK";
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri pendingCameraImageUri;
    private SpeechRecognizer speechRecognizer;
    private MediaRecorder mediaRecorder;
    private MediaPlayer transcriptionPlayer;
    private File currentAudioFile;
    private File currentTranscriptionFile;
    private long recordingStartedAt;
    private String latestTranscript = "";
    private String activeTranscriptionMessageId = "";
    private boolean pendingVoiceRecordingStart = false;
    private String pendingTranscriptionMessageId = "";
    private String pendingTranscriptionAudioDataUrl = "";
    private String mediaApiBase = "";
    private String mediaAuthToken = "";
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            settings.setForceDark(WebSettings.FORCE_DARK_OFF);
        }

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                if (fileChooserParams.isCaptureEnabled() && acceptsImage(fileChooserParams)) {
                    return startCameraFileChooser();
                }

                Intent intent = fileChooserParams.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(intent, REQUEST_FILE_CHOOSER);
                } catch (Exception error) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.setBackgroundColor(Color.rgb(255, 248, 240));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.addJavascriptInterface(new AndroidBridge(), "BeckonStarsAndroid");
        webView.loadUrl("file:///android_asset/index.html");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (webView == null) return;

        if (requestCode == REQUEST_RECORD_AUDIO) {
            if (hasAudioPermission()) {
                if (pendingVoiceRecordingStart) {
                    pendingVoiceRecordingStart = false;
                    startVoiceRecordingInternal();
                } else if (!pendingTranscriptionMessageId.isEmpty() && !pendingTranscriptionAudioDataUrl.isEmpty()) {
                    String messageId = pendingTranscriptionMessageId;
                    String audioDataUrl = pendingTranscriptionAudioDataUrl;
                    pendingTranscriptionMessageId = "";
                    pendingTranscriptionAudioDataUrl = "";
                    startReceivedVoiceTranscriptionInternal(messageId, audioDataUrl);
                }
            } else {
                postVoiceError("請在 Android 設定中允許麥克風權限。");
            }
            return;
        }

        if (requestCode != REQUEST_POST_NOTIFICATIONS) return;

        String permission = hasNotificationPermission() ? "granted" : "denied";
        webView.post(() -> webView.evaluateJavascript(
            "window.setAndroidNotificationPermission && window.setAndroidNotificationPermission('" + permission + "')",
            null
        ));
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != REQUEST_FILE_CHOOSER || filePathCallback == null) return;

        Uri[] results = null;
        if (resultCode == RESULT_OK) {
            if (pendingCameraImageUri != null) {
                results = new Uri[] { pendingCameraImageUri };
            } else {
                results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
        pendingCameraImageUri = null;
    }

    private boolean acceptsImage(WebChromeClient.FileChooserParams fileChooserParams) {
        String[] acceptTypes = fileChooserParams.getAcceptTypes();
        if (acceptTypes == null || acceptTypes.length == 0) return true;
        for (String acceptType : acceptTypes) {
            if (acceptType == null || acceptType.isEmpty() || acceptType.startsWith("image/")) return true;
        }
        return false;
    }

    private boolean startCameraFileChooser() {
        try {
            File imageFile = File.createTempFile("memory-camera-", ".jpg", getCacheDir());
            pendingCameraImageUri = FileProvider.getUriForFile(
                this,
                getPackageName() + ".fileprovider",
                imageFile
            );

            Intent cameraIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            cameraIntent.putExtra(MediaStore.EXTRA_OUTPUT, pendingCameraImageUri);
            cameraIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            cameraIntent.setClipData(ClipData.newUri(getContentResolver(), "memory-camera", pendingCameraImageUri));
            startActivityForResult(cameraIntent, REQUEST_FILE_CHOOSER);
            return true;
        } catch (Exception error) {
            Log.e(TAG, "Unable to start camera file chooser", error);
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
            pendingCameraImageUri = null;
            return false;
        }
    }

    @Override
    protected void onDestroy() {
        stopVoiceRecordingInternal(true);
        stopReceivedVoiceTranscriptionInternal();
        if (speechRecognizer != null) {
            speechRecognizer.destroy();
            speechRecognizer = null;
        }
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.app_name),
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("星喚 App 通知");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private boolean hasNotificationPermission() {
        return Build.VERSION.SDK_INT < 33
            || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasAudioPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void showNotification(String title, String body) {
        if (!hasNotificationPermission()) return;

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);

        builder
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true);

        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.notify((int) System.currentTimeMillis(), builder.build());
    }

    private void startSpeechRecognitionInternal() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            return;
        }

        if (speechRecognizer != null) {
            speechRecognizer.destroy();
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                if (!activeTranscriptionMessageId.isEmpty()) {
                    playReceivedAudioForTranscription();
                }
            }
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) latestTranscript = matches.get(0);
            }
            @Override public void onEvent(int eventType, Bundle params) {}

            @Override
            public void onError(int error) {
                Log.w(TAG, "Speech recognition error: " + error);
                if (!activeTranscriptionMessageId.isEmpty()) {
                    finishReceivedVoiceTranscription(latestTranscript, error);
                }
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String transcript = matches != null && !matches.isEmpty() ? matches.get(0) : "";
                if (!transcript.trim().isEmpty()) latestTranscript = transcript;
                Log.i(TAG, "Speech recognition transcript: " + latestTranscript);
                if (!activeTranscriptionMessageId.isEmpty()) {
                    finishReceivedVoiceTranscription(latestTranscript, 0);
                }
            }
        });

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, SPEECH_LANGUAGE);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, SPEECH_LANGUAGE);
        intent.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, SPEECH_LANGUAGE);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "請用粵語講出要傳送給家人的訊息");
        speechRecognizer.startListening(intent);
    }

    private void startVoiceRecordingInternal() {
        if (!hasAudioPermission()) {
            pendingVoiceRecordingStart = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQUEST_RECORD_AUDIO);
            }
            return;
        }

        stopReceivedVoiceTranscriptionInternal();
        stopVoiceRecordingInternal(true);
        latestTranscript = "";
        activeTranscriptionMessageId = "";
        try {
            currentAudioFile = File.createTempFile("beckon-stars-", ".m4a", getCacheDir());
            mediaRecorder = new MediaRecorder();
            mediaRecorder.setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION);
            mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            mediaRecorder.setAudioEncodingBitRate(64000);
            mediaRecorder.setAudioSamplingRate(44100);
            mediaRecorder.setOutputFile(currentAudioFile.getAbsolutePath());
            mediaRecorder.prepare();
            mediaRecorder.start();
            recordingStartedAt = System.currentTimeMillis();
            startSpeechRecognitionInternal();
        } catch (Exception error) {
            stopVoiceRecordingInternal(true);
            postVoiceError("錄音啟動失敗，請確認麥克風權限。");
        }
    }

    private void stopVoiceRecordingInternal(boolean cancelled) {
        if (speechRecognizer != null) {
            try {
                speechRecognizer.stopListening();
            } catch (Exception ignored) {}
        }

        if (mediaRecorder == null) return;

        File finishedFile = currentAudioFile;
        long durationMs = Math.max(0, System.currentTimeMillis() - recordingStartedAt);
        try {
            mediaRecorder.stop();
        } catch (Exception ignored) {
            cancelled = true;
        }
        try {
            mediaRecorder.release();
        } catch (Exception ignored) {}
        mediaRecorder = null;
        currentAudioFile = null;

        if (cancelled) {
            if (finishedFile != null) finishedFile.delete();
            return;
        }

        if (finishedFile == null || !finishedFile.exists() || finishedFile.length() <= 0) {
            postVoiceError("錄音失敗，請再試一次。");
            return;
        }

        mainHandler.postDelayed(() -> postFinishedVoiceRecording(finishedFile, durationMs), 1200);
    }

    private void startReceivedVoiceTranscriptionInternal(String messageId, String audioDataUrl) {
        if (!hasAudioPermission()) {
            pendingTranscriptionMessageId = messageId == null ? "" : messageId;
            pendingTranscriptionAudioDataUrl = audioDataUrl == null ? "" : audioDataUrl;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQUEST_RECORD_AUDIO);
            }
            return;
        }

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            postVoiceTranscript(messageId, "", "speech-unavailable");
            return;
        }

        stopVoiceRecordingInternal(true);
        stopReceivedVoiceTranscriptionInternal();
        latestTranscript = "";
        activeTranscriptionMessageId = messageId == null ? "" : messageId;

        try {
            currentTranscriptionFile = writeDataUrlToTempFile(audioDataUrl);
            startSpeechRecognitionInternal();
        } catch (Exception error) {
            Log.w(TAG, "Received voice transcription failed to start", error);
            finishReceivedVoiceTranscription("", -1);
        }
    }

    private void playReceivedAudioForTranscription() {
        if (currentTranscriptionFile == null || !currentTranscriptionFile.exists()) return;

        try {
            if (transcriptionPlayer != null) {
                transcriptionPlayer.release();
            }
            transcriptionPlayer = new MediaPlayer();
            transcriptionPlayer.setDataSource(currentTranscriptionFile.getAbsolutePath());
            transcriptionPlayer.setVolume(1.0f, 1.0f);
            transcriptionPlayer.setOnCompletionListener(player -> mainHandler.postDelayed(() -> {
                if (speechRecognizer != null && !activeTranscriptionMessageId.isEmpty()) {
                    try {
                        speechRecognizer.stopListening();
                    } catch (Exception ignored) {}
                }
            }, 900));
            transcriptionPlayer.prepare();
            transcriptionPlayer.start();
        } catch (Exception error) {
            Log.w(TAG, "Received voice playback failed for transcription", error);
            finishReceivedVoiceTranscription(latestTranscript, -2);
        }
    }

    private void finishReceivedVoiceTranscription(String transcript, int errorCode) {
        String messageId = activeTranscriptionMessageId;
        if (messageId == null || messageId.isEmpty()) return;

        activeTranscriptionMessageId = "";
        String finalTranscript = transcript == null ? "" : transcript.trim();

        try {
            if (transcriptionPlayer != null) {
                transcriptionPlayer.stop();
            }
        } catch (Exception ignored) {}
        try {
            if (transcriptionPlayer != null) {
                transcriptionPlayer.release();
            }
        } catch (Exception ignored) {}
        transcriptionPlayer = null;

        if (speechRecognizer != null) {
            try {
                speechRecognizer.cancel();
            } catch (Exception ignored) {}
            try {
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }

        if (currentTranscriptionFile != null) {
            currentTranscriptionFile.delete();
            currentTranscriptionFile = null;
        }

        postVoiceTranscript(messageId, finalTranscript, errorCode == 0 ? "" : String.valueOf(errorCode));
    }

    private void stopReceivedVoiceTranscriptionInternal() {
        activeTranscriptionMessageId = "";
        try {
            if (transcriptionPlayer != null) {
                transcriptionPlayer.stop();
            }
        } catch (Exception ignored) {}
        try {
            if (transcriptionPlayer != null) {
                transcriptionPlayer.release();
            }
        } catch (Exception ignored) {}
        transcriptionPlayer = null;

        if (currentTranscriptionFile != null) {
            currentTranscriptionFile.delete();
            currentTranscriptionFile = null;
        }
    }

    private File writeDataUrlToTempFile(String dataUrl) throws Exception {
        if (dataUrl == null || dataUrl.trim().isEmpty()) {
            throw new IllegalArgumentException("empty-audio");
        }

        int commaIndex = dataUrl.indexOf(',');
        String encodedAudio = commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
        byte[] audioBytes = Base64.decode(encodedAudio, Base64.DEFAULT);
        File file = File.createTempFile("beckon-stars-received-", ".m4a", getCacheDir());
        java.io.FileOutputStream output = new java.io.FileOutputStream(file);
        output.write(audioBytes);
        output.close();
        return file;
    }

    private void postFinishedVoiceRecording(File finishedFile, long durationMs) {
        if (finishedFile == null || !finishedFile.exists() || finishedFile.length() <= 0) {
            postVoiceError("錄音失敗，請再試一次。");
            return;
        }

        if (mediaApiBase.isEmpty()) {
            // 回退：没有配置 API，仍用 base64
            postFinishedVoiceRecordingLegacy(finishedFile, durationMs);
            return;
        }

        new Thread(() -> {
            try {
                String audioUrl = uploadAudioToMediaApi(finishedFile);
                JSONObject payload = new JSONObject();
                payload.put("audioUrl", audioUrl);
                payload.put("audioMime", "audio/mp4");
                payload.put("durationMs", durationMs);
                payload.put("transcript", latestTranscript == null ? "" : latestTranscript.trim());
                postVoiceRecording(payload.toString());
            } catch (Exception error) {
                Log.e(TAG, "Audio upload failed", error);
                postVoiceError("錄音上傳失敗：" + error.getMessage());
            } finally {
                finishedFile.delete();
            }
        }).start();
    }

    private void postFinishedVoiceRecordingLegacy(File finishedFile, long durationMs) {
        try {
            String dataUrl = "data:audio/mp4;base64," + Base64.encodeToString(readAllBytes(finishedFile), Base64.NO_WRAP);
            JSONObject payload = new JSONObject();
            payload.put("audio", dataUrl);
            payload.put("audioMime", "audio/mp4");
            payload.put("durationMs", durationMs);
            payload.put("transcript", latestTranscript == null ? "" : latestTranscript.trim());
            postVoiceRecording(payload.toString());
        } catch (Exception error) {
            postVoiceError("錄音讀取失敗，請再試一次。");
        } finally {
            finishedFile.delete();
        }
    }

    private String uploadAudioToMediaApi(File audioFile) throws Exception {
        URL url = new URL(mediaApiBase + "/api/media/upload");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);

        String boundary = "----BeckonStarsBoundary" + System.currentTimeMillis();
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        if (!mediaAuthToken.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + mediaAuthToken);
        }

        OutputStream out = conn.getOutputStream();
        PrintWriter writer = new PrintWriter(new OutputStreamWriter(out, "UTF-8"), true);

        writer.append("--").append(boundary).append("\r\n");
        writer.append("Content-Disposition: form-data; name=\"file\"; filename=\"recording.m4a\"\r\n");
        writer.append("Content-Type: audio/mp4\r\n\r\n");
        writer.flush();

        FileInputStream fileInput = new FileInputStream(audioFile);
        byte[] buffer = new byte[4096];
        int bytesRead;
        while ((bytesRead = fileInput.read(buffer)) != -1) {
            out.write(buffer, 0, bytesRead);
        }
        out.flush();
        fileInput.close();

        writer.append("\r\n--").append(boundary).append("--\r\n");
        writer.close();

        int responseCode = conn.getResponseCode();
        if (responseCode != 201) {
            throw new IOException("Upload failed: HTTP " + responseCode);
        }

        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder response = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            response.append(line);
        }
        reader.close();

        JSONObject json = new JSONObject(response.toString());
        return json.getString("mediaUrl");
    }

    private byte[] readAllBytes(File file) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        FileInputStream input = new FileInputStream(file);
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
        }
        input.close();
        return output.toByteArray();
    }

    private void postVoiceRecording(String payloadJson) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
            "window.handleAndroidVoiceRecording && window.handleAndroidVoiceRecording(" + JSONObject.quote(payloadJson) + ")",
            null
        ));
    }

    private void postVoiceError(String message) {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
            "window.handleAndroidVoiceError && window.handleAndroidVoiceError(" + JSONObject.quote(message) + ")",
            null
        ));
    }

    private void postVoiceTranscript(String messageId, String transcript, String error) {
        if (webView == null) return;

        try {
            JSONObject payload = new JSONObject();
            payload.put("messageId", messageId == null ? "" : messageId);
            payload.put("transcript", transcript == null ? "" : transcript.trim());
            payload.put("error", error == null ? "" : error);
            webView.post(() -> webView.evaluateJavascript(
                "window.handleAndroidVoiceTranscript && window.handleAndroidVoiceTranscript(" + JSONObject.quote(payload.toString()) + ")",
                null
            ));
        } catch (Exception ignored) {}
    }

    public class AndroidBridge {
        @JavascriptInterface
        public String getNotificationPermission() {
            return hasNotificationPermission() ? "granted" : "default";
        }

        @JavascriptInterface
        public boolean requestNotificationPermission() {
            if (hasNotificationPermission()) return true;
            if (Build.VERSION.SDK_INT >= 33) {
                runOnUiThread(() -> requestPermissions(
                    new String[] { Manifest.permission.POST_NOTIFICATIONS },
                    REQUEST_POST_NOTIFICATIONS
                ));
            }
            return false;
        }

        @JavascriptInterface
        public void showLocalNotification(String title, String body) {
            runOnUiThread(() -> showNotification(title, body));
        }

        @JavascriptInterface
        public void startVoiceRecording() {
            runOnUiThread(() -> {
                if (!hasAudioPermission()) {
                    pendingVoiceRecordingStart = true;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQUEST_RECORD_AUDIO);
                    } else {
                        postVoiceError("請先允許麥克風權限。");
                    }
                    return;
                }
                startVoiceRecordingInternal();
            });
        }

        @JavascriptInterface
        public void finishVoiceRecording(boolean cancelled) {
            runOnUiThread(() -> stopVoiceRecordingInternal(cancelled));
        }

        @JavascriptInterface
        public void transcribeReceivedVoice(String messageId, String audioDataUrl) {
            runOnUiThread(() -> startReceivedVoiceTranscriptionInternal(messageId, audioDataUrl));
        }

        @JavascriptInterface
        public void setMediaApiConfig(String apiBase, String authToken) {
            mediaApiBase = apiBase == null ? "" : apiBase;
            mediaAuthToken = authToken == null ? "" : authToken;
        }
    }
}
