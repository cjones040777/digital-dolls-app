package com.senojmediax.digitaldolls;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Floating Digital Doll overlay — displays a draggable doll avatar
 * on top of any app, like a chat head. Tap to open the full app.
 */
public class DollOverlayService extends Service {
    private static final String CHANNEL_ID = "doll_overlay_channel";
    private static final int NOTIFICATION_ID = 1001;

    private WindowManager windowManager;
    private WebView dollView;
    private WindowManager.LayoutParams params;
    private boolean isRunning = false;

    public static boolean isActive = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!isRunning) {
            showFloatingDoll();
            isRunning = true;
            isActive = true;
        }
        return START_STICKY;
    }

    private void showFloatingDoll() {
        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);

        dollView = new WebView(this);
        WebSettings s = dollView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        dollView.setWebViewClient(new WebViewClient());
        dollView.setBackgroundColor(0x00000000); // transparent
        // Load the doll avatar view (overlay mode)
        dollView.loadUrl("file:///android_asset/index.html#overlay");

        int overlayType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            overlayType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            overlayType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        int size = dpToPx(96); // 96dp floating doll
        params = new WindowManager.LayoutParams(
            size, size,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.END;
        params.x = dpToPx(16);
        params.y = dpToPx(100);

        // Make it draggable, tap to open full app
        dollView.setOnTouchListener(new View.OnTouchListener() {
            private int lastX, lastY;
            private float downX, downY;
            private boolean isDragging = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        lastX = params.x;
                        lastY = params.y;
                        downX = event.getRawX();
                        downY = event.getRawY();
                        isDragging = false;
                        return true;
                    case MotionEvent.ACTION_MOVE:
                        int dx = (int) (event.getRawX() - downX);
                        int dy = (int) (event.getRawY() - downY);
                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                            isDragging = true;
                        }
                        params.x = lastX - dx;
                        params.y = lastY + dy;
                        windowManager.updateViewLayout(dollView, params);
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!isDragging) {
                            // Tap — open the full app
                            Intent openApp = new Intent(DollOverlayService.this, MainActivity.class);
                            openApp.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(openApp);
                        }
                        return true;
                }
                return false;
            }
        });

        windowManager.addView(dollView, params);
    }

    private int dpToPx(int dp) {
        float density = getResources().getDisplayMetrics().density;
        return Math.round(dp * density);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Digital Doll Overlay",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps your Digital Doll visible on screen");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setContentTitle("Digital Dolls")
            .setContentText("Your doll is floating on screen")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pi)
            .build();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (dollView != null && windowManager != null) {
            try { windowManager.removeView(dollView); } catch (Exception ignored) {}
            dollView.destroy();
            dollView = null;
        }
        isRunning = false;
        isActive = false;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
