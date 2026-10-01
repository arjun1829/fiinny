# Flutter deferred components are unused in this app; silence the R8 warnings
# they raise so a release build does not fail on missing Play Core classes.
-dontwarn com.google.android.play.core.**
