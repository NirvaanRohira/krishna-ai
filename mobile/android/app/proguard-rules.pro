# kotlinx.serialization and OkHttp ship their own consumer rules. Add app-specific keeps here.

# Credential Manager finds its Google Play services provider by reflection.
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** {
  *;
}
