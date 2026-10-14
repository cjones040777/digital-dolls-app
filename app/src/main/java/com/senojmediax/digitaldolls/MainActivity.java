package com.senojmediax.digitaldolls;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String HOME_URL = "file:///android_asset/index.html";
    private static final int OVERLAY_PERMISSION_CODE = 1001;
    private Button overlayToggle;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout layout = new FrameLayout(this);
        webView = new WebView(this);
        layout.addView(webView);

        // Floating doll toggle button
        overlayToggle = new Button(this);
        updateToggleText();
        overlayToggle.setOnClickListener(v -> toggleOverlay());
        FrameLayout.LayoutParams btnParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        );
        btnParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        btnParams.bottomMargin = 48;
        // Semi-transparent gold style
        overlayToggle.setBackgroundColor(0xCCc9a227);
        overlayToggle.setTextColor(0xFF0a0a0f);
        layout.addView(overlayToggle, btnParams);

        setContentView(layout);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(true);
        webView.setWebViewClient(new WebViewClient());
        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME_URL);
        }
    }

    private void updateToggleText() {
        if (overlayToggle == null) return;
        overlayToggle.setText(DollOverlayService.isActive
            ? "Hide Floating Doll"
            : "Show Floating Doll");
    }

    private void toggleOverlay() {
        if (DollOverlayService.isActive) {
            stopService(new Intent(this, DollOverlayService.class));
            updateToggleText();
        } else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && !Settings.canDrawOverlays(this)) {
                Toast.makeText(this,
                    "Please allow 'Display over other apps' for Digital Dolls",
                    Toast.LENGTH_LONG).show();
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName()));
                startActivityForResult(intent, OVERLAY_PERMISSION_CODE);
            } else {
                startOverlayService();
            }
        }
    }

    private void startOverlayService() {
        Intent svc = new Intent(this, DollOverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(svc);
        } else {
            startService(svc);
        }
        updateToggleText();
        Toast.makeText(this, "Your doll is now floating on screen",
            Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == OVERLAY_PERMISSION_CODE) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && Settings.canDrawOverlays(this)) {
                startOverlayService();
            } else {
                Toast.makeText(this,
                    "Overlay permission denied — floating doll unavailable",
                    Toast.LENGTH_LONG).show();
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateToggleText();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
