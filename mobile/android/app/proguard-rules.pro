# Release shrinking is disabled. Keep serialization metadata if it is enabled later.
-keepattributes *Annotation*, InnerClasses, EnclosingMethod
-keep,includedescriptorclasses class de.ixacg.animestream.core.model.**$$serializer { *; }
