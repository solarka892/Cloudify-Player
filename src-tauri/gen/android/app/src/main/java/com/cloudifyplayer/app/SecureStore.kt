package com.cloudifyplayer.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The OAuth token's home on Android.
 *
 * CLAUDE.md forbids keeping the token in a plain file, and the `keyring` crate
 * has no Android backend — so this is the platform equivalent: AES-GCM under a
 * key generated inside the Android Keystore. That key is not extractable, and on
 * a device with a secure element it never leaves it, which makes the ciphertext
 * sitting in SharedPreferences useless on its own.
 *
 * `EncryptedSharedPreferences` does the same job, but pulling in
 * androidx.security-crypto for it costs more than these two Cipher calls.
 */
internal object SecureStore {
    private const val PREFS = "cloudify_secure_store"
    private const val KEY_ALIAS = "cloudify_secret_key"
    private const val KEYSTORE = "AndroidKeyStore"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    /** GCM's standard IV length, and its default tag length. */
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128

    fun set(context: Context, key: String, value: String) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ciphertext = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        // IV first, so `get` can split the two apart again. GCM's IV is not a
        // secret; reusing one with the same key would be the problem, and
        // `Cipher` generates a fresh one per `init`.
        val blob = cipher.iv + ciphertext
        prefs(context).edit()
            .putString(key, Base64.encodeToString(blob, Base64.NO_WRAP))
            .apply()
    }

    fun get(context: Context, key: String): String? {
        val stored = prefs(context).getString(key, null) ?: return null
        return try {
            val blob = Base64.decode(stored, Base64.NO_WRAP)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(TAG_BITS, blob, 0, IV_BYTES),
            )
            String(cipher.doFinal(blob, IV_BYTES, blob.size - IV_BYTES), Charsets.UTF_8)
        } catch (e: Exception) {
            // The Keystore can lose a key without the ciphertext going anywhere:
            // a restore onto a new device, or the user changing their lock
            // screen. Dropping the unreadable blob turns that into a single
            // "please sign in again" instead of an error on every call forever.
            delete(context, key)
            null
        }
    }

    fun delete(context: Context, key: String) {
        prefs(context).edit().remove(key).apply()
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let {
            return it.secretKey
        }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                // Deliberately no `setUserAuthenticationRequired`: the app has to
                // be able to restore its own session on launch, and in a
                // background service, without a fingerprint prompt.
                .build(),
        )
        return generator.generateKey()
    }
}
