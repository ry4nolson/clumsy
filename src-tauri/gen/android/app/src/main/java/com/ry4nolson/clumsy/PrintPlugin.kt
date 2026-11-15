package com.ry4nolson.clumsy

import android.app.Activity
import android.content.Context
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import kotlin.concurrent.thread

@InvokeArg
class PrintArgs {
  lateinit var name: String
  var path: String? = null
}

private fun outcome(value: String) = JSObject().put("outcome", value)

private class FileAdapter(private val file: File, private val name: String, private val pages: Int) : PrintDocumentAdapter() {
  override fun onLayout(old: PrintAttributes?, new: PrintAttributes, signal: CancellationSignal, callback: LayoutResultCallback, extras: Bundle?) {
    if (signal.isCanceled) {
      callback.onLayoutCancelled()
      return
    }
    val info = PrintDocumentInfo.Builder(name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).setPageCount(pages).build()
    callback.onLayoutFinished(info, new != old)
  }

  override fun onWrite(ranges: Array<PageRange>, destination: ParcelFileDescriptor, signal: CancellationSignal, callback: WriteResultCallback) {
    thread {
      try {
        FileInputStream(file).use { input -> FileOutputStream(destination.fileDescriptor).use { output -> input.copyTo(output) } }
        if (signal.isCanceled) callback.onWriteCancelled() else callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
      } catch (error: Exception) {
        callback.onWriteFailed(error.message)
      }
    }
  }

  override fun onFinish() {
    file.delete()
  }
}

private class WatchedAdapter(private val inner: PrintDocumentAdapter, private val finished: () -> Unit) : PrintDocumentAdapter() {
  override fun onStart() = inner.onStart()

  override fun onLayout(old: PrintAttributes?, new: PrintAttributes, signal: CancellationSignal, callback: LayoutResultCallback, extras: Bundle?) =
    inner.onLayout(old, new, signal, callback, extras)

  override fun onWrite(ranges: Array<PageRange>, destination: ParcelFileDescriptor, signal: CancellationSignal, callback: WriteResultCallback) =
    inner.onWrite(ranges, destination, signal, callback)

  override fun onFinish() {
    inner.onFinish()
    finished()
  }
}

@TauriPlugin
class PrintPlugin(private val activity: Activity) : Plugin(activity) {
  private var webView: WebView? = null

  override fun load(webView: WebView) {
    this.webView = webView
  }

  private fun show(name: String, adapter: PrintDocumentAdapter) {
    (activity.getSystemService(Context.PRINT_SERVICE) as PrintManager).print(name, adapter, null)
  }

  private fun pageCount(file: File) =
    PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { it.pageCount }

  @Command
  fun document(invoke: Invoke) {
    val args = invoke.parseArgs(PrintArgs::class.java)
    val file = File(args.path ?: return invoke.reject("Nothing to print"))
    val pages = try {
      pageCount(file)
    } catch (_: Exception) {
      file.delete()
      return invoke.resolve(outcome("unreadable"))
    }
    activity.runOnUiThread {
      try {
        show(args.name, FileAdapter(file, args.name, pages))
        invoke.resolve(outcome("shown"))
      } catch (error: Exception) {
        file.delete()
        invoke.reject(error.message ?: "The print screen didn't open")
      }
    }
  }

  @Command
  fun webview(invoke: Invoke) {
    val args = invoke.parseArgs(PrintArgs::class.java)
    val view = webView ?: return invoke.reject("The print screen didn't open")
    activity.runOnUiThread {
      try {
        show(args.name, WatchedAdapter(view.createPrintDocumentAdapter(args.name)) { invoke.resolve(outcome("shown")) })
      } catch (error: Exception) {
        invoke.reject(error.message ?: "The print screen didn't open")
      }
    }
  }
}
