package expo.modules.voicechecklistfilesave

import android.app.Activity
import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.io.OutputStreamWriter
import java.io.Serializable
import java.util.concurrent.atomic.AtomicBoolean

class VoiceChecklistFileSaveModule : Module() {
  private val saveInProgress = AtomicBoolean(false)

  private val contentResolver: ContentResolver
    get() {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      return context.contentResolver
    }

  private lateinit var saveLauncher:
    AppContextActivityResultLauncher<CreateDocumentOptions, CreateDocumentResult>

  override fun definition() = ModuleDefinition {
    Name("VoiceChecklistFileSave")

    RegisterActivityContracts {
      saveLauncher = registerForActivityResult(CreateDocumentContract())
    }

    AsyncFunction("save") Coroutine { fileName: String, mimeType: String, contents: String ->
      if (!saveInProgress.compareAndSet(false, true)) {
        throw SaveAlreadyInProgressException()
      }

      try {
        val result = saveLauncher.launch(CreateDocumentOptions(fileName, mimeType))
        when (result) {
          is CreateDocumentResult.Cancelled -> false
          is CreateDocumentResult.Success -> {
            writeText(result.uri, contents)
            true
          }
        }
      } finally {
        saveInProgress.set(false)
      }
    }
  }

  private fun writeText(uri: Uri, contents: String) {
    try {
      val outputStream =
        contentResolver.openOutputStream(uri, "wt")
          ?: throw UnableToSaveFileException("Could not open the selected file for writing.")

      OutputStreamWriter(outputStream, Charsets.UTF_8).use { writer ->
        writer.write(contents)
      }
    } catch (error: IOException) {
      throw UnableToSaveFileException("Could not write the selected file.", error)
    } catch (error: SecurityException) {
      throw UnableToSaveFileException("Could not write the selected file.", error)
    }
  }
}

private class CreateDocumentContract :
  AppContextActivityResultContract<CreateDocumentOptions, CreateDocumentResult> {
  override fun createIntent(context: Context, input: CreateDocumentOptions): Intent =
    Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
      type = input.mimeType
      putExtra(Intent.EXTRA_TITLE, input.fileName)
    }

  override fun parseResult(
    input: CreateDocumentOptions,
    resultCode: Int,
    intent: Intent?
  ): CreateDocumentResult {
    if (resultCode != Activity.RESULT_OK) return CreateDocumentResult.Cancelled
    val uri = intent?.data ?: return CreateDocumentResult.Cancelled
    return CreateDocumentResult.Success(uri)
  }
}

private data class CreateDocumentOptions(
  val fileName: String,
  val mimeType: String
) : Serializable

private sealed class CreateDocumentResult {
  data class Success(val uri: Uri) : CreateDocumentResult()
  object Cancelled : CreateDocumentResult()
}

private class UnableToSaveFileException(
  reason: String,
  cause: Throwable? = null
) : CodedException("Unable to save file: $reason", cause)

private class SaveAlreadyInProgressException :
  CodedException("An Android save dialog is already open.")
