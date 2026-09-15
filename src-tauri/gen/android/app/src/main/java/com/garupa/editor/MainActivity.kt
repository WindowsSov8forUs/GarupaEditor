package com.garupa.editor

import android.os.Bundle
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback

class MainActivity : TauriActivity() {
  override val handleBackNavigation: Boolean = false
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(SimulatorHostBridge(), "GarupaSimulatorHost")
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        if (webView.url?.contains("#simulator") == true) {
          webView.evaluateJavascript(
            "window.dispatchEvent(new KeyboardEvent('keydown',{key:'BrowserBack'}))",
            null,
          )
        } else if (webView.canGoBack()) {
          webView.goBack()
        } else {
          finish()
        }
      }
    })
  }

  private inner class SimulatorHostBridge {
    @JavascriptInterface
    fun setImmersive(enabled: Boolean) {
      runOnUiThread {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = if (enabled) {
          View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
            View.SYSTEM_UI_FLAG_FULLSCREEN or
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        } else {
          View.SYSTEM_UI_FLAG_VISIBLE
        }
      }
    }
  }
}
