package app.kanha.android.ui

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import app.kanha.android.BuildConfig
import app.kanha.core.GoogleNonce
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/** What the phone's Google account picker gave back. */
sealed interface GoogleResult {
    data class Token(val idToken: String, val rawNonce: String) : GoogleResult
    data object Cancelled : GoogleResult
    data object NoAccount : GoogleResult
    data object Unavailable : GoogleResult
}

/**
 * Google's own account sheet (Credential Manager): no browser, no password. Returns an ID token
 * for the website's Google client, bound to a fresh nonce, for Supabase to verify.
 */
suspend fun pickGoogleAccount(activity: Activity): GoogleResult {
    val nonce = GoogleNonce.generate()
    val option = GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID).setNonce(nonce.hashed).build()
    val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
    return try {
        val credential = CredentialManager.create(activity).getCredential(activity, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            GoogleResult.Token(GoogleIdTokenCredential.createFrom(credential.data).idToken, nonce.raw)
        } else {
            GoogleResult.Unavailable
        }
    } catch (e: GetCredentialCancellationException) {
        GoogleResult.Cancelled
    } catch (e: NoCredentialException) {
        GoogleResult.NoAccount
    } catch (e: GetCredentialException) {
        GoogleResult.Unavailable
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        // e.g. a malformed credential bundle; never crash sign-in.
        GoogleResult.Unavailable
    }
}
