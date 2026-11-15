package app.kanha.core

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Where the app talks to. Production is the same backend as the website, so the web and the
 * apps share one API, one database and one set of rules.
 *
 * Only https is allowed, except for local development hosts (an emulator reaches the
 * developer's machine at 10.0.2.2).
 */
class KanhaConfig private constructor(val baseUrl: HttpUrl, val clientId: String) {
    companion object {
        const val PRODUCTION_URL = "https://kanhacall.vercel.app"
        private val DEV_HOSTS = setOf("localhost", "127.0.0.1", "10.0.2.2")

        /**
         * @param clientId sent as `X-Kanha-Client` (e.g. `android/0.1.0`), so the server can tell
         *   app versions apart and ask very old ones to update.
         */
        fun of(baseUrl: String = PRODUCTION_URL, clientId: String): KanhaConfig {
            val url = baseUrl.trimEnd('/').toHttpUrlOrNull()
                ?: throw IllegalArgumentException("Not a valid URL")
            require(url.isHttps || url.host in DEV_HOSTS) { "Kanha only talks to https servers" }
            require(url.encodedPath == "/") { "Give the server root, without a path" }
            require(Regex("^(android|ios)/\\d+\\.\\d+\\.\\d+$").matches(clientId)) { "clientId must look like android/1.2.3" }
            return KanhaConfig(url, clientId)
        }
    }
}
