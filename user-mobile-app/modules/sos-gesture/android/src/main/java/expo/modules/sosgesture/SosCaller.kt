package expo.modules.sosgesture

import android.Manifest
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.telecom.TelecomManager
import android.util.Log

/** Places the SOS call. */
object SosCaller {
  private const val TAG = "SosGesture"

  enum class Result(val value: String) {
    /** The call is being placed. */
    CALLED("called"),

    /** No phone permission: the dialer opened with the number filled in, one tap from calling. */
    DIALER("dialer"),

    /** No SOS number was configured. */
    NO_NUMBER("noNumber"),

    FAILED("failed"),
  }

  fun call(context: Context, number: String): Result {
    if (number.isBlank()) return Result.NO_NUMBER
    val uri = Uri.fromParts("tel", number, null)
    if (context.checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED) {
      // Telecom places the call itself, so it works from the background and over the
      // lock screen, where starting an activity would be blocked.
      try {
        context.getSystemService(TelecomManager::class.java).placeCall(uri, Bundle())
        return Result.CALLED
      } catch (e: RuntimeException) {
        Log.w(TAG, "Telecom could not place the SOS call; trying the call intent", e)
      }
      try {
        context.startActivity(Intent(Intent.ACTION_CALL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return Result.CALLED
      } catch (e: RuntimeException) {
        Log.w(TAG, "The call intent failed; opening the dialer", e)
      }
    }
    return try {
      context.startActivity(Intent(Intent.ACTION_DIAL, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      Result.DIALER
    } catch (e: ActivityNotFoundException) {
      Log.e(TAG, "No dialer on this device", e)
      Result.FAILED
    } catch (e: RuntimeException) {
      Log.e(TAG, "Could not open the dialer", e)
      Result.FAILED
    }
  }
}
