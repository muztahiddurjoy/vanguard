package expo.modules.sosgesture

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log

/**
 * Keeps SOS armed: a lasting notification that says so (with "Call now" and "Turn
 * off"), a process Android keeps alive after the app is closed and after a restart,
 * and, on Android 12 and older, the volume buttons while the screen is off.
 *
 * With the screen off Android sends the volume keys only to a media session, not
 * to apps or accessibility services. Up to Android 12 this service holds a silent,
 * remotely controlled session while the screen is off and reads each volume step
 * from it (music playing behind a dark screen still gets its volume changed).
 * Android 13 and newer ignore such a session, and any session not really playing
 * audio (checked on an Android 15 emulator), so there the screen must be on, the
 * lock screen included: one press of the power button, then the volume buttons.
 * While the screen is on, SosAccessibilityService listens.
 */
class SosForegroundService : Service() {
  private var session: MediaSession? = null

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_OFF -> listenWhileScreenOff(true)
        Intent.ACTION_SCREEN_ON -> listenWhileScreenOff(false)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    createChannel()
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      registerReceiver(screenReceiver, filter, RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(screenReceiver, filter)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Android requires startForeground soon after every start, whatever the action.
    startInForeground()
    when (intent?.action) {
      ACTION_STOP -> {
        SosSettings(this).enabled = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        return START_NOT_STICKY
      }
      ACTION_CALL_NOW -> SosEngine.trigger(this, SOURCE_NOTIFICATION)
    }
    running = true
    val power = getSystemService(PowerManager::class.java)
    listenWhileScreenOff(!power.isInteractive)
    return START_STICKY
  }

  override fun onDestroy() {
    running = false
    listenWhileScreenOff(false)
    unregisterReceiver(screenReceiver)
    super.onDestroy()
  }

  private fun listenWhileScreenOff(on: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
    if (!on) {
      session?.release()
      session = null
      return
    }
    if (session != null) return
    val audio = getSystemService(AudioManager::class.java)
    val provider = object : VolumeProvider(VOLUME_CONTROL_RELATIVE, 100, 50) {
      override fun onAdjustVolume(direction: Int) {
        val key = when {
          direction > 0 -> ChordDetector.Key.UP
          direction < 0 -> ChordDetector.Key.DOWN
          else -> return
        }
        if (audio.isMusicActive) audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, 0)
        SosEngine.tap(this@SosForegroundService, key, SystemClock.uptimeMillis(), SOURCE_SCREEN_OFF)
      }
    }
    session = MediaSession(this, "SosVolumeButtons").apply {
      setPlaybackToRemote(provider)
      setPlaybackState(
        PlaybackState.Builder().setState(PlaybackState.STATE_PLAYING, 0L, 0f).build(),
      )
      isActive = true
    }
    Log.d(TAG, "Listening for the volume buttons while the screen is off")
  }

  private fun startInForeground() {
    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun buildNotification(): Notification {
    val number = SosSettings(this).number
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = Notification.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.sos_gesture_notification)
      .setContentTitle(getString(R.string.sos_gesture_notification_title))
      .setContentText(getString(R.string.sos_gesture_notification_text, number))
      .setStyle(Notification.BigTextStyle().bigText(getString(R.string.sos_gesture_notification_text, number)))
      .setOngoing(true)
      .setShowWhen(false)
      .setCategory(Notification.CATEGORY_SERVICE)
      .setContentIntent(open)
      .addAction(
        Notification.Action.Builder(
          null,
          getString(R.string.sos_gesture_action_call),
          servicePendingIntent(ACTION_CALL_NOW, 1),
        ).build(),
      )
      .addAction(
        Notification.Action.Builder(
          null,
          getString(R.string.sos_gesture_action_stop),
          servicePendingIntent(ACTION_STOP, 2),
        ).build(),
      )
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
    }
    return builder.build()
  }

  private fun servicePendingIntent(action: String, requestCode: Int): PendingIntent =
    PendingIntent.getService(
      this,
      requestCode,
      Intent(this, SosForegroundService::class.java).setAction(action),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  private fun createChannel() {
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.sos_gesture_channel_name),
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = getString(R.string.sos_gesture_channel_description)
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  companion object {
    private const val TAG = "SosGesture"
    private const val CHANNEL_ID = "sos_gesture"
    private const val NOTIFICATION_ID = 7307
    const val ACTION_START = "expo.modules.sosgesture.action.START"
    const val ACTION_CALL_NOW = "expo.modules.sosgesture.action.CALL_NOW"
    const val ACTION_STOP = "expo.modules.sosgesture.action.STOP"
    const val SOURCE_SCREEN_OFF = "volumeButtonsScreenOff"
    const val SOURCE_NOTIFICATION = "notification"

    @Volatile
    var running = false
      private set

    fun start(context: Context) {
      val intent = Intent(context, SosForegroundService::class.java).setAction(ACTION_START)
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, SosForegroundService::class.java))
    }
  }
}
