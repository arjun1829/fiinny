package com.fiinny.calllogreader

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.CallLog
import android.telephony.SubscriptionManager
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * Reads CallLog.Calls and places calls. Registered as a plugin (not a
 * MainActivity channel) so the WorkManager background engine gets it too.
 */
class CallLogReaderPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {
    private lateinit var channel: MethodChannel
    private lateinit var context: Context

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, "com.fiinny.calllogreader")
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "hasCallLogPermission" -> result.success(granted(Manifest.permission.READ_CALL_LOG))
                "query" -> {
                    val since = (call.argument<Number>("since") ?: 0).toLong()
                    result.success(query(since))
                }
                "call" -> {
                    placeCall(call.argument<String>("number") ?: "")
                    result.success(true)
                }
                "openUrl" -> {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(call.argument<String>("url")))
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                    result.success(true)
                }
                "deviceModel" -> result.success("${Build.MANUFACTURER} ${Build.MODEL}")
                else -> result.notImplemented()
            }
        } catch (e: Exception) {
            result.error("CALL_LOG_ERROR", e.message, null)
        }
    }

    private fun granted(permission: String) =
        context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun query(since: Long): List<Map<String, Any?>> {
        if (!granted(Manifest.permission.READ_CALL_LOG)) {
            throw SecurityException("READ_CALL_LOG not granted")
        }
        val sims = simLabels()
        val projection = arrayOf(
            CallLog.Calls._ID,
            CallLog.Calls.NUMBER,
            CallLog.Calls.CACHED_NAME,
            CallLog.Calls.TYPE,
            CallLog.Calls.DATE,
            CallLog.Calls.DURATION,
            CallLog.Calls.PHONE_ACCOUNT_ID,
        )
        val out = ArrayList<Map<String, Any?>>()
        context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            projection,
            "${CallLog.Calls.DATE} > ?",
            arrayOf(since.toString()),
            "${CallLog.Calls.DATE} ASC",
        )?.use { c ->
            val iId = c.getColumnIndexOrThrow(CallLog.Calls._ID)
            val iNumber = c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)
            val iName = c.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)
            val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
            val iDate = c.getColumnIndexOrThrow(CallLog.Calls.DATE)
            val iDuration = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
            val iAccount = c.getColumnIndexOrThrow(CallLog.Calls.PHONE_ACCOUNT_ID)
            while (c.moveToNext()) {
                val account = c.getString(iAccount)
                out.add(
                    mapOf(
                        "id" to c.getLong(iId),
                        "number" to (c.getString(iNumber) ?: ""),
                        "name" to c.getString(iName),
                        "type" to c.getInt(iType),
                        "date" to c.getLong(iDate),
                        "duration" to c.getLong(iDuration),
                        "sim" to (account?.let { sims[it] } ?: account),
                    )
                )
            }
        }
        return out
    }

    /** PHONE_ACCOUNT_ID is the subscription id on most phones, the ICCID on some. */
    @SuppressLint("MissingPermission")
    private fun simLabels(): Map<String, String> {
        if (!granted(Manifest.permission.READ_PHONE_STATE)) return emptyMap()
        return try {
            val sm = context.getSystemService(SubscriptionManager::class.java)
            val labels = HashMap<String, String>()
            sm?.activeSubscriptionInfoList?.forEach { info ->
                val label = "SIM ${info.simSlotIndex + 1}"
                labels[info.subscriptionId.toString()] = label
                try {
                    info.iccId?.takeIf { it.isNotEmpty() }?.let { labels[it] = label }
                } catch (_: Exception) {
                }
            }
            labels
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun placeCall(number: String) {
        val uri = Uri.fromParts("tel", number, null)
        val action = if (granted(Manifest.permission.CALL_PHONE)) Intent.ACTION_CALL else Intent.ACTION_DIAL
        val intent = Intent(action, uri)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}
