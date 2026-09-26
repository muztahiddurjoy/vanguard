package expo.modules.sosgesture

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The app's view of SOS: turn it on or off, check what it still needs, call now. */
class SosGestureModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SosGesture")

    Events("onTrigger")

    OnCreate {
      SosEngine.listener = { payload -> sendEvent("onTrigger", payload) }
    }

    OnDestroy {
      SosEngine.listener = null
    }

    Function("getStatus") {
      status()
    }

    AsyncFunction("start") {
      SosSettings(context).enabled = true
      SosForegroundService.start(context)
      status()
    }

    AsyncFunction("stop") {
      SosSettings(context).enabled = false
      SosForegroundService.stop(context)
      status()
    }

    AsyncFunction("callNow") {
      SosEngine.trigger(context, SOURCE_APP).value
    }

    Function("openAccessibilitySettings") {
      open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    Function("openAppSettings") {
      open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
    }
  }

  private fun status(): Map<String, Any?> {
    val ctx = context
    val settings = SosSettings(ctx)
    return mapOf(
      "enabled" to settings.enabled,
      "serviceRunning" to SosForegroundService.running,
      "accessibilityEnabled" to SosAccessibilityService.isEnabled(ctx),
      "callPermission" to granted(ctx, Manifest.permission.CALL_PHONE),
      "notificationPermission" to (
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          granted(ctx, Manifest.permission.POST_NOTIFICATIONS)
        ),
      "number" to settings.number,
      "lastTrigger" to settings.lastTrigger?.toMap(),
    )
  }

  private fun granted(ctx: Context, permission: String) =
    ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun open(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  private companion object {
    const val SOURCE_APP = "app"
  }
}
