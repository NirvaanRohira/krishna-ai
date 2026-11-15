package app.kanha.core

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * PKCE (RFC 7636, S256) for signing in through the website: the app keeps [verifier] on the
 * phone and sends only [challenge]. The one-time code the website hands back is worthless
 * without the verifier.
 */
class Pkce private constructor(val verifier: String, val challenge: String) {
    companion object {
        private val b64 = Base64.getUrlEncoder().withoutPadding()

        fun generate(random: SecureRandom = SecureRandom()): Pkce {
            val bytes = ByteArray(32).also(random::nextBytes) // 256 bits from a CSPRNG
            return fromVerifier(b64.encodeToString(bytes))
        }

        fun fromVerifier(verifier: String): Pkce {
            require(Regex("^[A-Za-z0-9._~-]{43,128}$").matches(verifier)) { "Not a PKCE verifier" }
            val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
            return Pkce(verifier, b64.encodeToString(digest))
        }
    }
}
