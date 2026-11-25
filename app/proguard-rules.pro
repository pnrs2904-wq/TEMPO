# Tempo Production R8 / ProGuard Configuration

# Preserve line numbers and source file names for crash analysis
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Room Database Entities and DAOs
-keep class com.tempo.focus.data.db.** { *; }
-keep interface com.tempo.focus.data.db.** { *; }

# Data Models
-keep class com.tempo.focus.data.model.** { *; }
-keepclassmembers enum com.tempo.focus.data.model.** { *; }

# DataStore and Preferences
-keep class androidx.datastore.** { *; }
-keep class com.tempo.focus.data.preferences.** { *; }

# OkHttp and Retrofit
-dontwarn okhttp3.**
-dontwarn okio.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# Coroutines
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
