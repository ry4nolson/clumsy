package com.ry4nolson.clumsy

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class PickArgs {
  var mimes: Array<String> = arrayOf()
  var multiple: Boolean = false
}

@InvokeArg
class CreateArgs {
  lateinit var name: String
  lateinit var mime: String
}

@InvokeArg
class DocumentArgs {
  lateinit var uri: String
  var mode: String = "r"
}

@TauriPlugin
class DocumentsPlugin(private val activity: Activity) : Plugin(activity) {
  private val access = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION

  @Command
  fun pick(invoke: Invoke) {
    val args = invoke.parseArgs(PickArgs::class.java)
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = if (args.mimes.size == 1) args.mimes[0] else "*/*"
      putExtra(Intent.EXTRA_MIME_TYPES, args.mimes)
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, args.multiple)
      addFlags(access or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    startActivityForResult(invoke, intent, "chosen")
  }

  @Command
  fun create(invoke: Invoke) {
    val args = invoke.parseArgs(CreateArgs::class.java)
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = args.mime
      putExtra(Intent.EXTRA_TITLE, args.name)
      addFlags(access or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
    }
    startActivityForResult(invoke, intent, "chosen")
  }

  @ActivityCallback
  fun chosen(invoke: Invoke, result: ActivityResult) {
    val documents = JSArray()
    val data = result.data
    if (result.resultCode == Activity.RESULT_OK && data != null) {
      val clip = data.clipData
      val uris = if (clip != null) (0 until clip.itemCount).map { clip.getItemAt(it).uri } else listOfNotNull(data.data)
      for (uri in uris) {
        keep(uri)
        documents.put(describe(uri))
      }
    }
    invoke.resolve(JSObject().put("documents", documents))
  }

  @Command
  fun describe(invoke: Invoke) {
    val args = invoke.parseArgs(DocumentArgs::class.java)
    invoke.resolve(describe(Uri.parse(args.uri)))
  }

  @Command
  fun open(invoke: Invoke) {
    val args = invoke.parseArgs(DocumentArgs::class.java)
    try {
      val descriptor = activity.contentResolver.openFileDescriptor(Uri.parse(args.uri), args.mode)
      if (descriptor == null) {
        invoke.reject("The document could not be opened")
      } else {
        invoke.resolve(JSObject().put("fd", descriptor.detachFd()))
      }
    } catch (error: Exception) {
      invoke.reject(error.message ?: "The document could not be opened")
    }
  }

  private fun keep(uri: Uri) {
    val resolver = activity.contentResolver
    try {
      resolver.takePersistableUriPermission(uri, access)
    } catch (_: SecurityException) {
      try {
        resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
      } catch (_: SecurityException) {
      }
    }
  }

  private fun describe(uri: Uri): JSObject {
    val resolver = activity.contentResolver
    var name: String? = null
    var size = -1L
    var modified = 0L
    try {
      resolver.query(uri, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE)
          val modifiedColumn = cursor.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
          if (nameColumn >= 0 && !cursor.isNull(nameColumn)) name = cursor.getString(nameColumn)
          if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) size = cursor.getLong(sizeColumn)
          if (modifiedColumn >= 0 && !cursor.isNull(modifiedColumn)) modified = cursor.getLong(modifiedColumn)
        }
      }
    } catch (_: Exception) {
    }
    val writable = activity.checkCallingOrSelfUriPermission(uri, Intent.FLAG_GRANT_WRITE_URI_PERMISSION) == PackageManager.PERMISSION_GRANTED
    return JSObject()
      .put("uri", uri.toString())
      .put("name", named(name ?: uri.lastPathSegment ?: "Document", resolver.getType(uri)))
      .put("size", size)
      .put("modified", modified)
      .put("writable", writable)
  }

  private fun named(name: String, mime: String?): String {
    if (name.contains('.') || mime == null) {
      return name
    }
    val extension = if (mime == "text/markdown") "md" else MimeTypeMap.getSingleton().getExtensionFromMimeType(mime)
    return if (extension == null) name else "$name.$extension"
  }
}
